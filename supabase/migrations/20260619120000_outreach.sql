-- Semi-autonomous outbound orchestration layer.
--
-- Two tables form the "draft → approve → send → track" spine on top of the
-- existing email infra (send-transactional-email, suppressed_emails, etc.):
--   * outreach_prospects — the people we sequence (named list / contact-finder /
--     gated-newsletter signups). PII lives here, admin-only.
--   * outreach_messages  — one row per (prospect, sequence step); the human
--     approval queue. outreach-draft-agent writes status='draft'; an admin
--     approves; outreach-send-agent only ever touches status='approved'.
--
-- Mirrors bd_partners.sql: admin-only RLS + touch_updated_at trigger + indexes.

-- ---------------------------------------------------------------------------
-- outreach_prospects
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.outreach_prospects (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  org             text,
  role            text,
  email           text,
  linkedin_url    text,
  persona         text NOT NULL DEFAULT 'infra_pe',
    -- 'dfi_analyst' | 'infra_pe' | 'epc_bd' | 'consultant' | 'project_finance'
    -- | 'political_risk' | 'government_ppp' | 'think_tank'
  wave            integer NOT NULL DEFAULT 1,
  region          text,
  sector          text,
  source_url      text,
  status          text NOT NULL DEFAULT 'new',
    -- 'new' | 'sequencing' | 'replied' | 'pilot' | 'paid' | 'unsubscribed' | 'bounced'
  next_step       integer NOT NULL DEFAULT 0,   -- next sequence step to draft (0-4)
  last_contacted_at timestamptz,
  bd_partner_id   uuid REFERENCES public.bd_partners(id) ON DELETE SET NULL,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- One prospect per email address (case-insensitive), but allow many email-less
-- (LinkedIn-only) prospects.
CREATE UNIQUE INDEX IF NOT EXISTS idx_outreach_prospects_email
  ON public.outreach_prospects (lower(email))
  WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_outreach_prospects_status
  ON public.outreach_prospects (status, persona, wave);

ALTER TABLE public.outreach_prospects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access on outreach_prospects" ON public.outreach_prospects
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- ---------------------------------------------------------------------------
-- outreach_messages
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.outreach_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id     uuid NOT NULL REFERENCES public.outreach_prospects(id) ON DELETE CASCADE,
  channel         text NOT NULL DEFAULT 'email',   -- 'email' | 'linkedin'
  step            integer NOT NULL DEFAULT 0,
  status          text NOT NULL DEFAULT 'draft',
    -- 'draft' | 'approved' | 'scheduled' | 'sent' | 'skipped' | 'failed'
  subject         text,
  body            text NOT NULL,
  scheduled_for   timestamptz,
  sent_at         timestamptz,
  generated_by    text,                            -- model that drafted it
  approved_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  error           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- The send agent scans for due, approved email rows; this index serves it.
CREATE INDEX IF NOT EXISTS idx_outreach_messages_send
  ON public.outreach_messages (status, channel, scheduled_for);

CREATE INDEX IF NOT EXISTS idx_outreach_messages_prospect
  ON public.outreach_messages (prospect_id, step);

ALTER TABLE public.outreach_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access on outreach_messages" ON public.outreach_messages
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- ---------------------------------------------------------------------------
-- updated_at triggers (one shared function, like touch_bd_partners_updated_at)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_outreach_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER outreach_prospects_updated_at
  BEFORE UPDATE ON public.outreach_prospects
  FOR EACH ROW EXECUTE FUNCTION public.touch_outreach_updated_at();

CREATE TRIGGER outreach_messages_updated_at
  BEFORE UPDATE ON public.outreach_messages
  FOR EACH ROW EXECUTE FUNCTION public.touch_outreach_updated_at();

-- ---------------------------------------------------------------------------
-- Register the three agents so they're pausable from AgentMonitoring.
-- ---------------------------------------------------------------------------
INSERT INTO public.agent_config (agent_type)
VALUES ('outreach_draft'), ('outreach_send'), ('weekly_signal')
ON CONFLICT (agent_type) DO NOTHING;
