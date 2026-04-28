## Goal
Make the MVP feel usable and valuable for real users: Portfolio Chat should answer questions about tracked projects reliably, and the surrounding intelligence features should load consistently, show accurate states, and fail gracefully instead of feeling broken.

## What I found
- Portfolio Chat is currently wired to `user-research`, which is designed for web/project extraction tasks, not conversational portfolio Q&A. That explains weak answers like “no exact matches found” or no meaningful response.
- Portfolio Chat only sends the latest question plus a one-line portfolio summary; it does not send conversation history or structured project context.
- Portfolio Chat depends on polling `research_tasks`, adding delay and making failures less clear.
- The chat UI renders plain text only, so AI-formatted responses are not displayed as rich intelligence briefs.
- Several user-facing pages share the same root issue: they depend on entitlement/auth state and heavy project loading, so features can appear locked or empty during startup before state settles.
- Some backend functions already use Lovable AI Gateway (`nl-search`) while Portfolio Chat still uses an older research/extraction route. For MVP, Portfolio Chat should use the reliable gateway path with direct answers.

## Implementation plan

### 1. Replace Portfolio Chat backend with a purpose-built chat function
Create a dedicated backend function for portfolio Q&A, for example `portfolio-chat`.

It will:
- Require a signed-in user.
- Enforce AI quota/plan checks using the existing server-side entitlement utilities.
- Load only the user’s tracked projects from the database.
- Include project fields that matter for intelligence: name, country, region, sector, stage, status, value, risk, confidence, description, timeline, recent updates, contacts, and evidence summaries where available.
- Call Lovable AI Gateway directly for a fast conversational answer.
- Return the answer immediately instead of creating a long-running `research_tasks` job.
- Return helpful empty-state answers when the user has no tracked projects.

### 2. Upgrade Portfolio Chat UX
Refactor `src/pages/dashboard/PortfolioChat.tsx` so it behaves like an MVP-grade chat:
- Send conversation history, not just the latest message.
- Remove the polling dependency for normal chat responses.
- Show clearer states: “thinking”, “no portfolio yet”, entitlement errors, and backend errors.
- Render assistant responses with markdown so answers can include bullets, tables, risk summaries, and recommendations.
- Refresh entitlement usage after successful AI calls.
- Keep the current portfolio suggestions, but make them more intelligence-oriented, e.g. risk exposure, concentration, next actions, recent updates, stakeholder gaps.

### 3. Keep Research separate from Portfolio Chat
Leave `/dashboard/research` as the deeper researcher workflow for web discovery and project extraction.

Portfolio Chat should answer from the user’s tracked portfolio first. If later we want live web research inside chat, it can be added as an explicit “run deeper research” action rather than making every chat response slow.

### 4. Improve shared API/error handling
Update `src/lib/api/agents.ts` to add a typed `runPortfolioChat(...)` method.

Also improve frontend error parsing where needed so users see useful messages like:
- “Sign in required”
- “Confirm your email”
- “AI limit reached”
- “Track projects first”

instead of generic “something went wrong”.

### 5. Reduce first-load confusion across MVP features
Adjust the feature-gated/user-facing pages so they do not flash as locked or empty while auth, roles, profile, and entitlements are still loading.

Focus areas:
- `FeatureGate`
- `useEntitlements`
- dashboard navigation lock badges
- Portfolio / Portfolio Chat loading states

The goal is: staff and paying users should not briefly see locked/pro-only UI while their real access is still resolving.

### 6. Audit and patch the MVP value pages
Do a targeted pass over these user-facing MVP surfaces:
- Ask AI
- Projects search / filters / saved searches
- My Portfolio
- Portfolio Chat
- Alerts
- Compare Projects
- Pipeline View
- Tender Calendar
- Stakeholder Intel
- Country Intelligence

For each page, check:
- Does it load without blank states?
- Does it show a useful empty state?
- Are premium locks intentional and clear?
- Are backend errors user-readable?
- Does the feature produce value with existing project data?

### 7. Verification after implementation
After approval, I will:
- Deploy the new/changed backend function.
- Test the Portfolio Chat backend directly.
- Check recent function logs for errors.
- Run the relevant frontend tests / type checks through the normal harness.
- Verify the chat flow with representative questions:
  - “What is my highest-risk project?”
  - “Which regions am I exposed to?”
  - “Summarize my portfolio and recommended next actions.”
  - “Which projects need stakeholder follow-up?”

## Technical details
- Use the existing `requireAiEntitlementOrRespond` entitlement guard for server-side quota and email verification.
- Use the existing generated Supabase client on the frontend; do not edit generated integration files.
- Use the backend service client only inside the backend function, with strict filtering by authenticated user ID.
- Do not store roles on profiles/users; keep current role-table model.
- Use Lovable AI Gateway rather than adding another third-party AI dependency.
- No new database tables are required for the first MVP fix. Conversation persistence can be added later if you want saved chat history.