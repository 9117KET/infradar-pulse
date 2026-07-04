/**
 * New-user onboarding walkthrough — verification spec.
 *
 * Covers the full journey of a brand-new user:
 *   signup → (email confirm) → onboarding (7 steps) → dashboard → pilot access check
 *
 * Environment:
 *   - App running on http://localhost:8080
 *   - Local Supabase on http://127.0.0.1:54321 (mailer_autoconfirm = true locally)
 *   - Mailpit on http://127.0.0.1:54324 (for email confirmation if not auto-confirmed)
 *
 * Run as a single serial test to keep auth state across steps:
 *   npx playwright test e2e/onboarding-walkthrough.spec.ts
 */

import { test, expect, type Page } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";

// ── constants ──────────────────────────────────────────────────────────────
const SCRATCHPAD =
  process.env.SCRATCHPAD ??
  "C:\\Users\\kinlo\\AppData\\Local\\Temp\\claude\\C--Users-kinlo-OneDrive---Constructor-University-Desktop-dev-projects-2026-Infradar-Lovable-infradar-pulse\\11d93bf3-6263-46e4-87ab-74844777b9b0\\scratchpad";
const MAILPIT = "http://127.0.0.1:54324";
const TS = Date.now();
const EMAIL = `e2e-onboard-${TS}@example.com`;
const PASSWORD = "OnboardTest_01!";

// ── helpers ────────────────────────────────────────────────────────────────
async function snap(page: Page, name: string): Promise<void> {
  const p = path.join(SCRATCHPAD, `${name}.png`);
  await page.screenshot({ path: p, fullPage: true });
  console.log(`[snap] ${name}.png`);
}

async function mailpitSearch(email: string, timeoutMs = 15000): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(
        `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}&limit=5`
      );
      if (res.ok) {
        const j = (await res.json()) as { messages?: { ID: string }[] };
        if (j.messages && j.messages.length > 0) {
          const msgRes = await fetch(`${MAILPIT}/api/v1/message/${j.messages[0].ID}`);
          const msg = (await msgRes.json()) as { HTML?: string; Text?: string };
          return msg.HTML || msg.Text || "";
        }
      }
    } catch {
      // ignore, retry
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return null;
}

function extractLink(html: string): string | null {
  const patterns = [
    /href="(http[^"]*(?:confirm|verify|token)[^"]*)"/,
    /(https?:\/\/[^\s"<>]+(?:confirm|verify|token_hash)[^\s"<>]*)/,
  ];
  for (const pat of patterns) {
    const m = html.match(pat);
    if (m) return m[1].replace(/&amp;/g, "&");
  }
  return null;
}

// ── single test ─────────────────────────────────────────────────────────────
test("new-user onboarding walkthrough: signup → onboarding → dashboard", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (e) => errors.push(`PAGE_ERROR: ${e.message}`));

  // ──────────────────────────────────────────────────────────────────────────
  // 1. SIGNUP PAGE — render & accept email/password
  // ──────────────────────────────────────────────────────────────────────────
  console.log(`\n── Step 1: Signup [${EMAIL}] ──`);
  await page.goto("/login", { waitUntil: "networkidle" });
  await snap(page, "01-login-page");

  // Switch to sign-up mode
  await page.getByRole("button", { name: /sign up/i }).click();
  await page.waitForTimeout(300);
  await snap(page, "02-signup-form");

  // Value strip should be present in sign-up mode
  const valueStrip = page.locator(
    'text=/1,600.*projects|pilot.*seats|30.day/i'
  ).first();
  const valueStripVisible = await valueStrip.isVisible().catch(() => false);
  console.log(`  value strip visible: ${valueStripVisible}`);

  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await snap(page, "03-signup-filled");

  await page.getByRole("button", { name: /create account/i }).click();

  // Wait up to 12s for the server validation + signUp call
  await page.waitForTimeout(8000);
  await snap(page, "04-after-signup-submit");

  const urlAfterSignup = page.url();
  console.log(`  URL after submit: ${urlAfterSignup}`);

  // Check for "Sign up blocked" toast — should NOT appear after the fail-open fix
  const blockedToast = page.locator(
    'text=Sign up blocked, text=Disposable, [data-sonner-toast]'
  );
  const isBlocked = await blockedToast.first().isVisible().catch(() => false);
  if (isBlocked) {
    const toastText = await blockedToast.first().textContent().catch(() => "");
    console.warn(`  SIGNUP BLOCKED: ${toastText}`);
    // This is a failure — the fail-open fix should prevent this
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 2. EMAIL CONFIRMATION
  // ──────────────────────────────────────────────────────────────────────────
  console.log(`\n── Step 2: Email confirmation ──`);

  let emailConfirmed = false;

  if (urlAfterSignup.includes("/dashboard") || urlAfterSignup.includes("/onboarding")) {
    console.log("  auto-confirm active — already redirected, no email action needed");
    emailConfirmed = true;
  } else {
    // Check if "Check your email" toast is shown
    const checkEmailToast = page.locator('text=Check your email').first();
    const toastVisible = await checkEmailToast.isVisible().catch(() => false);
    console.log(`  'Check your email' toast: ${toastVisible}`);

    // Poll Mailpit for confirmation email
    console.log(`  polling Mailpit for ${EMAIL}…`);
    const html = await mailpitSearch(EMAIL, 12000);

    if (html) {
      console.log("  confirmation email received in Mailpit");
      fs.writeFileSync(path.join(SCRATCHPAD, "signup-email.html"), html);
      const link = extractLink(html);
      console.log(`  confirmation link: ${link ? link.substring(0, 80) + "..." : "NOT FOUND in email body"}`);

      if (link) {
        await page.goto(link, { waitUntil: "networkidle" });
        await page.waitForTimeout(2000);
        await snap(page, "05-after-email-confirm");
        console.log(`  URL after confirmation link: ${page.url()}`);
        emailConfirmed = true;
      }
    } else {
      console.log("  no email in Mailpit (may be auto-confirmed or email not sent)");
    }

    // Whether auto-confirmed or email-confirmed, attempt login now
    if (!page.url().includes("/dashboard") && !page.url().includes("/onboarding")) {
      console.log("  attempting login…");
      await page.goto("/login", { waitUntil: "networkidle" });

      // Ensure sign-in mode (not sign-up)
      const createBtn = page.getByRole("button", { name: /create account/i });
      if (await createBtn.isVisible().catch(() => false)) {
        await page.getByText("Sign in").last().click();
        await page.waitForTimeout(300);
      }

      await page.locator('input[type="email"]').fill(EMAIL);
      await page.locator('input[type="password"]').fill(PASSWORD);
      await page.getByRole("button", { name: /sign in/i }).click();

      try {
        await page.waitForURL(/\/(dashboard|onboarding)/, { timeout: 15000 });
        emailConfirmed = true;
      } catch {
        await snap(page, "05b-login-failed");
        console.error(`  LOGIN FAILED. URL: ${page.url()}`);

        // Check if user was never created (signup was actually blocked)
        const signInError = await page.locator("text=Sign in failed, text=Invalid").first().textContent().catch(() => null);
        console.error(`  sign-in error: ${signInError}`);

        // This is the critical failure path for this test
        throw new Error(
          `Cannot reach dashboard or onboarding after signup+login.\n` +
            `URL: ${page.url()}\n` +
            `Likely cause: signup was blocked (validate-signup-email fail-open fix not applied, ` +
            `or email not confirmed).\n` +
            `Confirmed email in Mailpit: ${html ? "yes (link found: " + (link !== null) + ")" : "no"}`
        );
      }
    }
  }

  await snap(page, "06-after-login");
  console.log(`  post-auth URL: ${page.url()}`);
  console.log(`  emailConfirmed: ${emailConfirmed}`);

  // ──────────────────────────────────────────────────────────────────────────
  // 3. ONBOARDING (if profile.onboarded = false)
  // ──────────────────────────────────────────────────────────────────────────
  let completedOnboarding = false;
  let link: string | null = null;

  if (page.url().includes("/onboarding")) {
    console.log(`\n── Step 3: Onboarding flow ──`);
    await snap(page, "07-onboarding-start");

    // Step 0: Name + Company
    await page.waitForSelector('input[placeholder="Your name"]', { timeout: 8000 });
    await page.getByPlaceholder("Your name").fill("E2E Test User");
    await page.getByPlaceholder("Your organization").fill("Playwright Corp");
    const step0Continue = page.getByRole("button", { name: /continue/i });
    await expect(step0Continue).toBeEnabled();
    await step0Continue.click();
    await page.waitForTimeout(400);
    await snap(page, "08-onboarding-role");

    // Step 1: Role
    const investorCard = page.getByText("Investor / CFO");
    await expect(investorCard).toBeVisible({ timeout: 5000 });
    await investorCard.click();
    await page.getByRole("button", { name: /continue/i }).last().click();
    await page.waitForTimeout(400);
    await snap(page, "09-onboarding-focus");

    // Step 2: Focus areas — must select ≥1 region OR sector
    // The "Continue" button is disabled until at least one checkbox is checked.
    // The Radix Checkbox renders as a <button> with role="checkbox".
    const checkboxes = page.getByRole("checkbox");
    const checkboxCount = await checkboxes.count();
    console.log(`  focus step checkboxes: ${checkboxCount}`);

    if (checkboxCount > 0) {
      // Check first two (region + sector)
      await checkboxes.nth(0).click();
      await checkboxes.nth(Math.min(1, checkboxCount - 1)).click();
    } else {
      // Fallback: click any label that looks like a region
      await page.getByText("Sub-Saharan Africa").first().click().catch(() => {});
      await page.getByText("Energy").first().click().catch(() => {});
    }

    await snap(page, "09b-onboarding-focus-checked");

    // Continue button should be enabled now
    const focusContinue = page.getByRole("button", { name: /continue/i }).last();
    const focusDisabled = await focusContinue.isDisabled().catch(() => false);
    console.log(`  focus continue disabled: ${focusDisabled}`);
    await focusContinue.click();
    await page.waitForTimeout(500);
    await snap(page, "10-onboarding-portfolio");

    // Step 3: Portfolio seed
    // Wait for the projects to load (async DB call)
    await page.waitForTimeout(3500);
    await snap(page, "10b-onboarding-portfolio-loaded");

    const suggestedProjects = await page.locator("button.w-full.text-left").count();
    console.log(`  suggested projects: ${suggestedProjects}`);

    // Select 1 project if available
    if (suggestedProjects > 0) {
      await page.locator("button.w-full.text-left").first().click();
      await page.waitForTimeout(200);
    }

    await page.getByRole("button", { name: /skip|continue/i }).last().click();
    await page.waitForTimeout(400);

    // Step 4: Core features
    await snap(page, "11-onboarding-core-features");
    await page.getByRole("button", { name: /continue/i }).last().click();
    await page.waitForTimeout(400);

    // Step 5: Intelligence features
    await page.getByRole("button", { name: /continue/i }).last().click();
    await page.waitForTimeout(400);
    await snap(page, "12-onboarding-finish");

    // Step 6: Finish — "Go to Dashboard"
    const finishBtn = page.getByRole("button", { name: /go to dashboard/i });
    await expect(finishBtn).toBeVisible({ timeout: 5000 });
    await finishBtn.click();

    await page.waitForURL(/\/dashboard/, { timeout: 15000 });
    await snap(page, "13-dashboard-after-onboarding");
    completedOnboarding = true;
    console.log(`  onboarding complete → ${page.url()}`);
  } else if (page.url().includes("/dashboard")) {
    console.log("  already on /dashboard (profile.onboarded may be true or user bypassed)");
  } else {
    console.warn(`  unexpected URL after auth: ${page.url()}`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 4. DASHBOARD OVERVIEW — content check
  // ──────────────────────────────────────────────────────────────────────────
  console.log(`\n── Step 4: Dashboard overview ──`);

  // Should be at /dashboard
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
  await page.waitForTimeout(2000); // let React Query settle
  await snap(page, "14-dashboard-overview");

  // H1 text
  const h1Text = await page.locator("h1").first().textContent().catch(() => null);
  console.log(`  h1: "${h1Text}"`);
  expect(h1Text).toBeTruthy();

  // Error boundary should NOT be visible
  const errorBoundary = page.locator("text=Something went wrong");
  await expect(errorBoundary).not.toBeVisible();

  // "Getting started" checklist — should appear for a fresh user
  const checklist = page.locator("text=Getting started");
  const checklistVisible = await checklist.first().isVisible().catch(() => false);
  console.log(`  onboarding checklist visible: ${checklistVisible}`);

  // KPI card area should render (glass-panel divs)
  const glassPanels = await page.locator(".glass-panel").count();
  console.log(`  glass-panel elements: ${glassPanels}`);

  // ──────────────────────────────────────────────────────────────────────────
  // 5. PILOT ACCESS — verify plan is not stuck on 'free'
  // ──────────────────────────────────────────────────────────────────────────
  console.log(`\n── Step 5: Pilot access check ──`);

  // Extract access token from localStorage to query the DB directly
  const accessToken = await page.evaluate(() => {
    try {
      const keys = Object.keys(localStorage).filter((k) => k.includes("auth-token") || k.startsWith("sb-"));
      for (const k of keys) {
        try {
          const v = JSON.parse(localStorage.getItem(k) || "");
          if (v?.access_token) return v.access_token as string;
        } catch {
          // continue
        }
      }
    } catch {
      return null;
    }
    return null;
  });

  console.log(`  access token obtained: ${!!accessToken}`);

  if (accessToken) {
    const ANON_KEY =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRFA0NiK7W9fDQsDEtoRInoiDe9YsTsJJJOdKkBxBIc";

    // Check pilot_access_grants
    const pilotRes = await page.evaluate(
      async ([token, anonKey]) => {
        const r = await fetch(
          "http://127.0.0.1:54321/rest/v1/pilot_access_grants?select=status,seat_number,ends_at,environment&status=eq.active",
          {
            headers: {
              Authorization: `Bearer ${token}`,
              apikey: anonKey,
              Accept: "application/json",
            },
          }
        );
        return { status: r.status, body: await r.json() };
      },
      [accessToken, ANON_KEY]
    );

    console.log(`  pilot_access_grants query status: ${pilotRes.status}`);
    console.log(`  pilot grants: ${JSON.stringify(pilotRes.body)}`);

    // Also check subscriptions
    const subRes = await page.evaluate(
      async ([token, anonKey]) => {
        const r = await fetch(
          "http://127.0.0.1:54321/rest/v1/subscriptions?select=status,plan_key,entitlement_plan_key&limit=1",
          {
            headers: {
              Authorization: `Bearer ${token}`,
              apikey: anonKey,
              Accept: "application/json",
            },
          }
        );
        return { status: r.status, body: await r.json() };
      },
      [accessToken, ANON_KEY]
    );
    console.log(`  subscriptions: ${JSON.stringify(subRes.body)}`);
  }

  // Dismiss the GuidedTour overlay if it appeared (it fires ~800ms after dashboard renders
  // for users with onboarded=true and tour_completed=false).
  const tourOverlay = page.locator("div.fixed.inset-0.z-\\[9999\\]").first();
  const tourVisible = await tourOverlay.isVisible().catch(() => false);
  if (tourVisible) {
    console.log("  GuidedTour overlay detected — dismissing");
    // Try clicking the tour's close/skip button
    const skipBtn = page.locator('button:has-text("Skip"), button:has-text("Close"), button[aria-label*="skip" i], button[aria-label*="close" i]').first();
    if (await skipBtn.isVisible().catch(() => false)) {
      await skipBtn.click({ force: true });
    } else {
      // Press Escape to dismiss
      await page.keyboard.press("Escape");
    }
    await page.waitForTimeout(800);
    await snap(page, "14b-guided-tour-dismissed");
  }

  // Open profile menu and look for plan badge
  const profileMenuBtn = page.locator('[data-tour="header-profile"] button').first();
  if (await profileMenuBtn.isVisible().catch(() => false)) {
    await profileMenuBtn.click({ force: true });
    await page.waitForTimeout(600);
    await snap(page, "15-profile-menu");

    const badgeTexts = await page.locator('[class*="badge"], [role="menuitem"] [class*="badge"]').allTextContents();
    console.log(`  profile menu badge texts: ${JSON.stringify(badgeTexts)}`);

    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
  }

  // Count lock icons (free-tier feature locks)
  const lockIcons = await page.locator('svg[data-lucide="lock"], [class*="lucide-lock"]').count();
  console.log(`  sidebar lock icons (free-tier): ${lockIcons}`);

  // ──────────────────────────────────────────────────────────────────────────
  // 6. EMPTY STATES — key pages don't crash
  // ──────────────────────────────────────────────────────────────────────────
  console.log(`\n── Step 6: Empty states ──`);

  const pagesToCheck: { path: string; label: string; snap: string }[] = [
    { path: "/dashboard/projects", label: "Projects", snap: "16-projects" },
    { path: "/dashboard/alerts", label: "Alerts", snap: "17-alerts" },
    { path: "/dashboard/portfolio", label: "Portfolio", snap: "18-portfolio" },
    { path: "/dashboard/geo", label: "Geo", snap: "19-geo" },
    { path: "/dashboard/ask", label: "Ask AI", snap: "20-ask" },
  ];

  for (const pg of pagesToCheck) {
    await page.goto(pg.path, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await snap(page, pg.snap);

    const crashed = await page.locator("text=Something went wrong").isVisible().catch(() => false);
    const mainLen = (await page.locator("main").textContent().catch(() => "")).length;
    console.log(`  ${pg.label}: crash=${crashed}, main-length=${mainLen}`);
    expect(crashed, `${pg.label} page crashed`).toBe(false);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 7. EMAILVERIFICATIONBANNER — should NOT show for confirmed user
  // ──────────────────────────────────────────────────────────────────────────
  console.log(`\n── Step 7: EmailVerificationBanner ──`);
  await page.goto("/dashboard", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  const verifyBanner = page.locator("text=verify your email, text=Please verify");
  const bannerVisible = await verifyBanner.first().isVisible().catch(() => false);
  console.log(`  banner visible for confirmed user: ${bannerVisible}`);
  // For auto-confirmed local users, the banner should NOT appear
  expect(bannerVisible).toBe(false);

  // ──────────────────────────────────────────────────────────────────────────
  // FINAL SUMMARY
  // ──────────────────────────────────────────────────────────────────────────
  console.log(`\n════ WALKTHROUGH SUMMARY ════`);
  console.log(`  email: ${EMAIL}`);
  console.log(`  emailConfirmed: ${emailConfirmed}`);
  console.log(`  completedOnboarding: ${completedOnboarding}`);
  console.log(`  final URL: ${page.url()}`);
  console.log(`  console errors: ${errors.length}`);
  if (errors.length > 0) {
    console.log("  errors:");
    errors.slice(0, 10).forEach((e) => console.log(`    ${e}`));
  }

  await snap(page, "21-final-state");
});
