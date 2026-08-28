-- Remove the daily MDB ingest cron jobs that the hourly backfill jobs supersede.
--
-- WHY
-- ---
-- Five sources are ingested by TWO cron jobs each:
--
--   daily  infradar-<src>-ingest     status "Active,Pipeline", limit 200
--   hourly infradar-<src>-backfill   mode "backfill", limit 500, cursor-driven
--
-- When 20260706121000 added the hourly jobs it deliberately kept the nightly
-- ones, because a cursor mid-walk is deep in the dataset and does not cover
-- the top. That reasoning expires the moment the walk finishes. From
-- _shared/ingestCursor.ts:
--
--   "Exhausted datasets restart from 0 so backfill cron doubles as refresh."
--
-- Once a source is exhausted its cursor resets to 0, so the hourly job starts
-- from the top of the dataset every hour - covering the same ground as the
-- daily job, 24x more often. The daily job is then pure duplicate load: an
-- extra edge invocation, an extra agent lock, an extra thing to page on.
--
-- WHAT THIS DOES NOT DO
-- ---------------------
-- No agent code changes and no capability is dropped. This only unschedules
-- work that another job already performs. afdb, ebrd and ted keep their daily
-- jobs - they have no hourly twin.
--
-- SAFETY
-- ------
-- Each removal is conditional and verified at apply time. A daily job is only
-- unscheduled when BOTH hold:
--   1. its hourly twin exists and is active, and
--   2. every cursor row for that agent is marked exhausted.
-- Anything else is kept and reported. Re-run this migration after the walks
-- finish to collect the stragglers - it is idempotent.

DO $$
DECLARE
  m           record;
  v_total     int;
  v_exhausted int;
  v_removed   int := 0;
  v_kept      int := 0;
BEGIN
  IF to_regclass('public.ingest_cursors') IS NULL THEN
    RAISE NOTICE 'ingest_cursors not present - skipping (local stack or pre-backfill schema)';
    RETURN;
  END IF;

  FOR m IN
    SELECT * FROM (VALUES
      ('infradar-world-bank-ingest', 'world-bank-ingest%', 'infradar-world-bank-backfill'),
      ('infradar-ifc-ingest',        'ifc-ingest%',        'infradar-ifc-backfill'),
      ('infradar-adb-ingest',        'adb-ingest%',        'infradar-adb-backfill'),
      ('infradar-iadb-ingest',       'iadb-ingest%',       'infradar-iadb-backfill'),
      ('infradar-aiib-ingest',       'aiib-ingest%',       'infradar-aiib-backfill')
    ) AS t(daily_job, cursor_prefix, backfill_job)
  LOOP
    -- Nothing to supersede the daily job with.
    IF NOT EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = m.backfill_job AND active
    ) THEN
      v_kept := v_kept + 1;
      RAISE NOTICE 'KEEP % - hourly twin % is not scheduled/active',
        m.daily_job, m.backfill_job;
      CONTINUE;
    END IF;

    SELECT count(*), count(*) FILTER (WHERE exhausted_at IS NOT NULL)
      INTO v_total, v_exhausted
    FROM public.ingest_cursors
    WHERE agent_key LIKE m.cursor_prefix;

    -- Mid-walk: the hourly job is deep in the dataset, so the daily job is
    -- still the only thing refreshing the top. Keep it.
    IF v_total = 0 OR v_exhausted < v_total THEN
      v_kept := v_kept + 1;
      RAISE NOTICE
        'KEEP % - backfill walk incomplete (%/% cursors exhausted); daily job still supplies top-of-dataset freshness',
        m.daily_job, v_exhausted, v_total;
      CONTINUE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = m.daily_job) THEN
      RAISE NOTICE 'SKIP % - already unscheduled', m.daily_job;
      CONTINUE;
    END IF;

    BEGIN
      PERFORM cron.unschedule(m.daily_job);
      v_removed := v_removed + 1;
      RAISE NOTICE 'REMOVED % - superseded by hourly % (all % cursors exhausted)',
        m.daily_job, m.backfill_job, v_total;
    EXCEPTION WHEN OTHERS THEN
      v_kept := v_kept + 1;
      RAISE WARNING 'could not unschedule % (owned by another role?): %',
        m.daily_job, SQLERRM;
    END;
  END LOOP;

  RAISE NOTICE 'redundant daily ingest crons: % removed, % kept', v_removed, v_kept;
END;
$$;
