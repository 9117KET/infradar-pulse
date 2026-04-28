## Recommended approach

Use a first-party product analytics layer in Lovable Cloud rather than sending all behavior directly to a third-party analytics tool first. This gives you ownership of the data, keeps it tied to your existing users/plans/roles, and lets you answer questions like:

- Which users sign up but never verify email?
- Which users hit a paywall and then sign out or leave?
- Which features are attempted most before upgrading?
- Where do users drop during onboarding?
- Which acquisition sources produce activated or paid users?
- Which pages/actions predict trial start, subscription, or churn?

External research points to the same principle: start with deliberate “growth events” instead of relying only on autocapture. PostHog’s product analytics guidance specifically recommends tracking business-critical events like signup, subscription, and purchase explicitly, then using funnels/retention to find friction. PostHog/Mixpanel/Amplitude can be useful later, but the first step should be a clean event taxonomy and server-backed tracking.

## What I would build

### 1. Add a `user_events` analytics table

Create a dedicated event table with fields like:

```text
user_events
- id
- user_id nullable
- anonymous_id nullable
- session_id
- event_name
- event_category
- page_path
- referrer
- properties jsonb
- plan_key nullable
- roles text[]
- created_at
```

Security model:

- Users cannot read all analytics events.
- Users can insert only their own events through a controlled backend function.
- Admins can read aggregated analytics only.
- Raw event access should be staff/admin-only, ideally mostly via aggregated RPCs.

This avoids exposing behavioral data across users.

### 2. Add a secure `track-event` backend function

Create a backend function that receives validated event payloads from the app.

It will:

- Validate event name/category/properties.
- Attach authenticated user ID from the JWT when present.
- Accept anonymous events before signup with a random anonymous/session ID.
- Add safe request metadata such as user agent and current URL path.
- Rate-limit or cap payload size to avoid abuse.
- Insert into `user_events` using service permissions so the frontend never directly writes arbitrary analytics rows.

No external API keys are required for the first-party version.

### 3. Add a client analytics utility

Add a small `src/lib/analytics.ts` wrapper with functions like:

```ts
analytics.track('paywall_viewed', { feature, minPlan })
analytics.identify(user)
analytics.page()
```

The wrapper will:

- Store `anonymous_id` and `session_id` locally.
- Capture UTM/source data already supported by the app.
- Avoid capturing sensitive data such as passwords, full free-text prompts, payment details, or raw emails in event properties.
- Fail silently if analytics insertion fails so the product never breaks because tracking failed.

### 4. Track the most important product events

Instrument the flows that matter most for understanding drop-off and conversion:

#### Acquisition and signup

- `page_viewed`
- `signup_started`
- `signup_completed`
- `email_verification_required`
- `email_verified_callback`
- `login_completed`
- `google_login_started`
- `google_login_completed`
- `logout_clicked`

#### Onboarding and activation

- `onboarding_started`
- `onboarding_step_completed`
- `onboarding_completed`
- `tour_started`
- `tour_completed`
- `first_project_viewed`
- `first_search_performed`
- `first_project_tracked`

#### Paywall and monetization

- `paywall_viewed`
- `paywall_cta_clicked`
- `trial_started`
- `checkout_started`
- `checkout_completed` if payment webhook confirms it
- `quota_request_started`
- `quota_request_submitted`
- `pricing_page_viewed`

This directly answers your example: “did they sign out after hitting the paywall?” by querying users/sessions where `paywall_viewed` is followed by `logout_clicked` or no further activity.

#### Core product usage

- `dashboard_viewed`
- `project_opened`
- `search_performed`
- `filter_applied`
- `watchlist_added`
- `ai_query_started`
- `ai_query_completed`
- `export_attempted`
- `insight_opened`

### 5. Add admin analytics views to the existing Traction dashboard

Extend `/dashboard/traction` with product behavior analytics:

- Signup funnel: landing → signup started → signup completed → email verified → onboarded → activated → trial/paid.
- Paywall funnel: paywall viewed → start trial / checkout / compare plans / sign out / inactive.
- Top paywalled features causing drop-off.
- Activation metrics: first project viewed, first saved project, first AI action, first export.
- Retention table: active again after 1 day, 7 days, 30 days.
- Recent high-intent users: users who hit paywall multiple times or viewed pricing but did not convert.

Keep this admin-only using the existing `has_role(auth.uid(), 'admin')` approach.

### 6. Add aggregated RPCs instead of exposing raw event tables to the UI

Create functions such as:

- `get_product_analytics_summary(days integer)`
- `get_signup_funnel(days integer)`
- `get_paywall_dropoff(days integer)`
- `get_activation_cohorts(days integer)`

These return counts and grouped rows for charts without exposing individual behavior unnecessarily.

### 7. Privacy and compliance safeguards

Update the privacy notice if needed to clearly state that product usage events are collected to improve the platform.

Implementation safeguards:

- Do not track passwords, payment card details, raw AI prompts, sensitive user text, or private project notes.
- Keep properties allowlisted per event where possible.
- Use a short-to-medium retention window for raw events, e.g. 180 or 365 days, while keeping aggregate metrics longer.
- Make analytics admin-only.
- Respect basic browser privacy controls where appropriate.

## Optional later upgrade: connect PostHog

After first-party tracking is in place, you can optionally forward selected events to PostHog for session replay, funnels, heatmaps, and feature flags.

I would not start with full third-party autocapture because this platform has sensitive infrastructure intelligence workflows. A better path is:

1. First-party event tracking now.
2. Clean event taxonomy.
3. Admin dashboard.
4. Optional PostHog later for visual funnels/session replay, with sensitive fields masked.

## Technical implementation plan

1. Database migration
   - Create `user_events` table.
   - Enable RLS.
   - Add safe policies.
   - Add indexes on `user_id`, `session_id`, `event_name`, `created_at`, and selected properties if needed.
   - Add admin-only aggregate RPCs.

2. Backend function
   - Add `supabase/functions/track-event/index.ts`.
   - Validate input with strict schemas.
   - Resolve authenticated user from bearer token when available.
   - Insert sanitized events.

3. Frontend analytics library
   - Add `src/lib/analytics.ts`.
   - Add route-level page tracking in `App`/router layer.
   - Track auth events in `Login.tsx`, `AuthCallback.tsx`, and `AuthContext.tsx`.

4. Paywall instrumentation
   - Track `paywall_viewed` and CTA clicks in `FeatureGate.tsx`.
   - Track trial, checkout, pricing, quota request actions in `UpgradeDialog.tsx` and billing hooks.

5. Activation instrumentation
   - Track onboarding completion, project opens, saved project actions, AI attempts, exports, and insight reads in the relevant hooks/pages.

6. Dashboard
   - Extend `Traction.tsx` with product behavior sections and charts.
   - Keep all analytics pages behind admin role guards.

7. Verification
   - Confirm anonymous page events, signup events, authenticated events, paywall events, and signout events are recorded.
   - Confirm regular users cannot read other users’ events.
   - Confirm admin summaries return the expected funnel/drop-off counts.

## Best first milestone

Start with the minimum event set that answers your paywall/drop-off question:

- `signup_completed`
- `email_verification_required`
- `login_completed`
- `onboarding_completed`
- `paywall_viewed`
- `paywall_cta_clicked`
- `trial_started`
- `checkout_started`
- `logout_clicked`
- `page_viewed`

Then add deeper product events once the foundation is working.