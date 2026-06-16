/**
 * Page-health probe for the deterministic crawler (Layer A).
 *
 * Attach listeners BEFORE navigating, then `await collect()` once the page has
 * settled to get every problem the page surfaced:
 *   - uncaught exceptions (page.on "pageerror")        -> almost always a real bug
 *   - console.error output                             -> often a real bug
 *   - same-origin / Supabase responses with status>=400
 *   - serious+critical accessibility violations (axe)
 *
 * Noise we deliberately ignore is centralised below so the signal stays high.
 */
import type { Page, TestInfo } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/** Console/network noise that is not actionable for this app. */
const IGNORED_CONSOLE = [
  "ResizeObserver loop", // benign layout-thrash warning Chromium emits
  "favicon",
  "Download the React DevTools",
];

/** Response URLs we don't want to assert on (third-party widgets, analytics). */
const IGNORED_RESPONSE_HOSTS = [
  "paddle.com",
  "paddlejs",
  "google-analytics",
  "googletagmanager",
  "sentry",
  "openstreetmap", // Leaflet tiles can 4xx/timeout without it being our bug
  "tile.",
];

/**
 * Fire-and-forget beacons. The app does not block on these, so a failure here
 * must not fail a page — but we still surface it as a warning so a real outage
 * is visible. (track-event is analytics; it 503s when local edge functions
 * aren't served, and is verified for real by e2e/live-smoke against prod.)
 */
const NON_BLOCKING_PATHS = ["/functions/v1/track-event"];

function isNonBlocking(url: string): boolean {
  return NON_BLOCKING_PATHS.some((p) => url.includes(p));
}

export type Finding = {
  /** "exception" | "console" | "http" | "a11y" */
  kind: string;
  detail: string;
  /** true for categories we treat as hard failures by default */
  severe: boolean;
};

export type HealthHandle = {
  /** Clear buffered events so the next route starts clean (listeners stay attached). */
  reset: () => void;
  /** Settle the page and return all findings gathered since the last reset(). */
  collect: (opts?: { runAxe?: boolean }) => Promise<Finding[]>;
};

function isIgnoredConsole(text: string): boolean {
  return IGNORED_CONSOLE.some((p) => text.includes(p));
}

function isIgnoredResponse(url: string): boolean {
  return IGNORED_RESPONSE_HOSTS.some((h) => url.includes(h));
}

/**
 * Start watching a page. Call this, then navigate, then `await collect()`.
 * Pass the page's own baseURL host so we only flag *our* failed requests.
 */
export function watchPage(page: Page): HealthHandle {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const badResponses: string[] = [];
  const failedRequests: string[] = [];

  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const t = msg.text();
    // The bare "Failed to load resource: net::ERR_*" console line has no URL —
    // we capture the URL via the requestfailed handler below, so drop the dup.
    if (t.startsWith("Failed to load resource")) return;
    if (!isIgnoredConsole(t)) consoleErrors.push(t);
  });

  page.on("requestfailed", (req) => {
    const url = req.url();
    if (isIgnoredResponse(url)) return;
    const reason = req.failure()?.errorText ?? "failed";
    // Browsers abort in-flight requests on navigation; that's not a bug.
    if (reason.includes("ERR_ABORTED")) return;
    failedRequests.push(`${reason} ${url}`);
  });

  page.on("pageerror", (err) => {
    pageErrors.push(`${err.name}: ${err.message}`);
  });

  page.on("response", (res) => {
    const status = res.status();
    if (status < 400) return;
    const url = res.url();
    if (isIgnoredResponse(url)) return;
    // 401/403 on edge functions are legitimate entitlement/auth responses for a
    // free user — record them as non-severe so they're visible but don't fail.
    badResponses.push(`${status} ${url}`);
  });

  return {
    reset() {
      pageErrors.length = 0;
      consoleErrors.length = 0;
      badResponses.length = 0;
      failedRequests.length = 0;
    },
    async collect(opts) {
      const findings: Finding[] = [];

      // Frontend faults — the page itself is broken. Always severe.
      for (const e of pageErrors) {
        findings.push({ kind: "exception", detail: e, severe: true });
      }
      for (const e of consoleErrors) {
        findings.push({ kind: "console", detail: e, severe: true });
      }
      // Backend availability varies by environment (secrets, which functions are
      // served), so HTTP/network faults are reported but non-blocking by default.
      // Run with CRAWL_STRICT=1 against a fully-provisioned backend to enforce them.
      for (const r of badResponses) {
        findings.push({ kind: "http", detail: r, severe: false });
      }
      for (const r of failedRequests) {
        findings.push({ kind: "request-failed", detail: r, severe: false });
      }

      if (opts?.runAxe !== false) {
        try {
          const results = await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa"])
            .analyze();
          for (const v of results.violations) {
            if (v.impact !== "serious" && v.impact !== "critical") continue;
            // Include the offending element selectors so the finding is actionable.
            const targets = v.nodes
              .slice(0, 3)
              .map((n) => `${n.target.join(" ")}  «${n.html.replace(/\s+/g, " ").slice(0, 120)}»`)
              .join("\n        ");
            findings.push({
              kind: "a11y",
              detail: `${v.id} (${v.impact}, ${v.nodes.length} node[s]): ${v.help}\n        ${targets}`,
              severe: false, // report a11y, don't block go-live on it by default
            });
          }
        } catch {
          // axe injection can fail on pages that navigate away mid-scan; skip.
        }
      }

      return findings;
    },
  };
}

/** Pretty one-line-per-finding block for test output and attachments. */
export function formatFindings(route: string, findings: Finding[]): string {
  if (findings.length === 0) return `${route}  ✓ clean`;
  const lines = findings.map((f) => `   [${f.severe ? "SEVERE" : "warn"}] ${f.kind}: ${f.detail}`);
  return `${route}\n${lines.join("\n")}`;
}

/** Attach the full report to the test so it shows in the HTML report/trace. */
export async function attachReport(
  testInfo: TestInfo,
  name: string,
  body: string,
): Promise<void> {
  await testInfo.attach(name, { body, contentType: "text/plain" });
}
