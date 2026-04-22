

## Why Paddle rejected the domain

When Paddle's reviewer visited `infradarai.com`, they saw a "Something went wrong — Error creating WebGL context" panel instead of the homepage. The site looked broken/offline, which matches Paddle's rejection reason "your website is offline" and "couldn't verify key information from your application."

The cause: the homepage's `<DemoGlobe>` (an interactive 3D globe built on `react-globe.gl` + `three.js`) requires WebGL. Paddle's review environment couldn't initialize WebGL, the component threw, and the page-level `ErrorBoundary` replaced the **entire homepage** with the error screen. Real visitors with normal browsers don't see this — but headless reviewers, low-end devices, locked-down corporate browsers, and bots do.

Legal pages (Terms, Privacy, Refund) are already Paddle-compliant — those aren't the issue.

## The fix

Make the homepage degrade gracefully on every browser, then resubmit to Paddle.

### 1. Isolate WebGL components behind a local error boundary + WebGL detection

- Detect WebGL support before mounting the globe. If unavailable, render a static fallback (still-image globe or a simple stat card) instead of attempting to render and throwing.
- Wrap `<DemoGlobe>` and `<HeroLiveTracker>` in their own small `<ErrorBoundary>` so a failure inside them shows a tiny "Visualization unavailable in this browser" placeholder, **not** a full-page error screen.
- Keep the rest of the homepage rendering normally regardless of WebGL.

### 2. Make the global ErrorBoundary less aggressive on marketing pages

Currently any throw in any marketing page replaces the whole page. Change behavior so:
- The marketing-layout boundary renders an inline notice **above the page content** (or just logs and returns children when possible) rather than blanking the page.
- Keep the existing full-screen recovery only as a last-resort fallback at the App root.

### 3. Add a "no-JS / no-WebGL" friendly hero

So crawlers and reviewers see clear product info immediately, ensure the hero text, value proposition, and pricing CTA appear in the initial HTML/SSR-equivalent paint regardless of any JS-heavy widget. The headline, subhead, "Get Started" button, and stats must render even when `react-globe.gl` fails.

### 4. Tighten Paddle's appeal submission

After deploying, in the Paddle "Submit additional information" form, include:
- Confirmation the homepage now renders without WebGL.
- Direct links to: `/pricing`, `/terms`, `/refund`, `/privacy`, `/about`, `/contact`.
- One-line product description: *"Infradar (operated by Kinlo and Glen) is a B2B SaaS subscription providing verified infrastructure-project intelligence to DFI analysts, project finance teams, and EPC contractors. Plans: Free, Starter $29/mo, Pro $199/mo, Enterprise custom. 14-day refund guarantee. Paddle is referenced as Merchant of Record in Terms §7."*
- Note that the AI features are research/analysis tools (not generative-image/video, not deepfakes), already disclosed in Terms §10 with "no reliance" wording.

### 5. Verify before resubmitting

- Load `infradarai.com` in an incognito window and confirm the hero, value prop, pricing, and footer all render.
- Use a WebGL-disabled browser test (Chrome DevTools → Rendering → Disable WebGL) to confirm graceful degradation.
- Confirm `/pricing`, `/terms`, `/refund`, `/privacy` all load publicly without auth.

## Files to change

- `src/components/ErrorBoundary.tsx` — add a `variant` prop (`page` vs `inline`) so layouts and small wrappers behave differently; default the marketing-layout one to `inline`.
- `src/components/home/DemoGlobe.tsx` — add WebGL feature detection at top of component; render a static fallback panel when unavailable.
- `src/components/home/HeroLiveTracker.tsx` — same WebGL/feature-detection guard if it uses canvas.
- `src/components/home/DemoSection.tsx` — wrap `<DemoGlobe>` in a local `ErrorBoundary variant="inline"`.
- `src/layouts/MarketingLayout.tsx` — switch its `ErrorBoundary` to `variant="inline"` so a single component error never blanks the whole marketing page.
- (No DB, no edge function, no legal-text changes required.)

## After deploying

1. Click **Publish → Update**.
2. Hard-refresh `infradarai.com` in incognito to confirm the homepage looks correct.
3. Submit the Paddle appeal form with the wording above.
4. Open the payments dashboard to monitor the readiness/verification step:

<lov-actions>
<lov-open-payments>Open payments dashboard</lov-open-payments>
</lov-actions>

