# Development Priorities and Security Enforcement Guide

This document records the next high priority work for InfraRadar AI if the platform is being developed autonomously or continued by a future developer. It focuses on the most important product, security, and billing gaps identified from the current codebase and platform behavior.

## Primary Priority

The next major work item should be robust server-side plan and permission enforcement.

Recent frontend changes introduced feature gates in the dashboard UI, but pricing and access control cannot rely only on React routes, locked navigation items, or hidden buttons. A determined user can still attempt to call backend functions, query public tables, or invoke feature APIs directly.

The platform should enforce limits in three layers:

1. Database access policies
2. Backend function authorization and entitlement checks
3. Frontend feature gates and upgrade prompts

Frontend gates are useful for customer experience, but backend and database enforcement are required for security, pricing integrity, and user trust.

## Why This Matters

The pricing page describes differentiated access by plan. Normal users should not be able to access premium workflows or unrestricted project data unless their billing state allows it.

If enforcement only exists in the UI, users may still bypass limitations by:

- Calling Edge Functions directly from the browser console or scripts
- Manipulating client-side state
- Querying publicly readable tables
- Opening dashboard URLs manually
- Reusing existing authenticated sessions after plan changes
- Invoking agent endpoints through exposed client APIs

This creates several risks:

- Free users can consume paid AI and research capabilities
- Sensitive researcher workflows may be exposed to ordinary users
- Pricing page promises become inaccurate
- Admin and researcher tools may be abused
- Data quality can be damaged through unrestricted project edits
- Usage costs can increase unexpectedly due to unrestricted AI calls

## Required Access Model

The platform should use this access model consistently across frontend, backend, and database rules.

### Staff Bypass

Users with either of these roles should bypass all plan limitations:

- `admin`
- `researcher`

Staff bypass must be verified server-side using the `user_roles` table and the existing role helper function. It must never rely on local storage, hardcoded email checks in the client, or profile fields.

### Lifetime Users

Users with an active lifetime grant should receive lifetime-level access according to the billing limits catalog.

Lifetime access should be resolved from the backend data model, not from client-controlled state.

### Paid Users

Users with active subscriptions should receive the plan level resolved from their subscription record.

The plan source of truth should remain consistent between:

- `src/lib/billing/limits.ts`
- `supabase/functions/_shared/billing.ts`

These files currently duplicate the same plan limit model and must be kept manually in sync.

### Free Users

Free users should only access the features explicitly included in the free plan.

They should not be able to access premium dashboard modules, premium AI workflows, unrestricted exports, unrestricted saved searches, unlimited alert rules, or unrestricted project datasets if those are reserved for paid tiers.

## Immediate Security Issues to Address

Several database policies are currently too permissive for a commercial intelligence platform.

### Projects Table

Current behavior allows public read access and authenticated users can insert, update, and delete projects.

This is not safe for production because ordinary authenticated users can potentially alter core project data.

Recommended direction:

- Keep public read access only for approved public project fields if required by the marketing site
- Restrict project insert, update, and delete to staff users
- Require researchers or admins for approval status changes
- Keep verification changes auditable through the verification log
- Consider separate public views or RPCs for limited public project data

### Evidence Sources

Authenticated users can currently insert, update, and delete evidence sources.

Recommended direction:

- Allow public read only where appropriate
- Restrict evidence write actions to researchers and admins
- Ensure AI agents write through service-role functions only
- Preserve evidence records used for verification and audit trails

### Project Contacts

Project contacts are publicly readable and authenticated users can write them.

Recommended direction:

- Review whether contact data should be public
- Gate full contact details behind paid or staff access if pricing requires it
- Restrict contact creation, edits, and deletion to researchers, admins, or trusted backend agents

### Project Milestones and Stakeholders

Authenticated users can currently insert, update, and delete these records.

Recommended direction:

- Restrict writes to researchers, admins, and backend agents
- Keep public reads only for fields safe to expose
- Consider plan-gated detail access if milestones and stakeholder intelligence are premium features

### Insights

Authenticated users can currently insert, update, and delete insights.

Recommended direction:

- Public users should only read published insights
- Normal authenticated users should not manage insights
- Researchers and admins should manage insights
- AI-generated insights should be created through protected backend functions

### Research Tasks

Research tasks are publicly readable and authenticated users can insert and update them.

Recommended direction:

- Restrict creation to users whose plan allows research or AI usage
- Restrict updates to backend functions and staff
- Restrict reads to task owners, staff, or safe public summaries
- Add ownership fields if user-specific research tasks are needed

### Subscribers and Waitlist

Authenticated users can read all subscribers and waitlist entries.

Recommended direction:

- Restrict reads to admins only
- Keep inserts public where needed
- Avoid exposing emails, companies, and user interest data to all logged-in users

### Alerts

Authenticated users can update all alerts.

Recommended direction:

- If alerts are global system alerts, only staff should update them
- If alerts are user-specific, add ownership and restrict updates to the owner
- Avoid a global `read` flag if alert read state should differ per user

## Backend Function Enforcement

Every user-facing backend function should validate authentication and entitlement before doing meaningful work.

Recommended pattern:

1. Handle CORS preflight
2. Create the backend client with service credentials
3. Validate the user's bearer token in code
4. Resolve user role and plan
5. Enforce required feature or quota
6. Run the business logic
7. Increment usage only after success
8. Return clear 401, 403, or 402-style upgrade responses where appropriate

Functions that consume AI, research, export, or intelligence resources should not trust the client to decide whether a user is allowed.

## Functions That Need Careful Review

The following categories should be audited first.

### AI and Research Functions

These should enforce AI quota and feature access:

- Natural language search
- Research agent
- User research
- Market intelligence
- Stakeholder intelligence
- Contact finder
- Executive briefing
- Report agent
- Generate insight
- Alert intelligence
- Sentiment analyzer
- Risk scorer

### Premium Intelligence Functions

These should enforce plan-level feature access:

- Country intelligence
- Stakeholder intelligence
- Tender monitoring
- Funding tracking
- Regulatory monitoring
- Supply chain monitoring
- ESG and social monitoring
- Security and resilience monitoring
- Corporate M&A monitoring

### Export and Reporting Functions

These should enforce export quotas and plan access:

- Account export
- Report generation
- PDF export workflows
- CSV export workflows
- Analytics reports

### Ingest and Agent Functions

Scheduled ingest agents should generally be callable only by service-role cron or staff-triggered workflows.

They should not be callable by normal authenticated users unless there is an explicit product reason.

## Feature Access Catalog

The feature access catalog should remain the central client-side map for gating UI routes and controls.

However, each catalog feature should also have a backend equivalent. A route being locked in the UI is not enough.

Recommended feature keys should cover:

- Project discovery
- Project detail depth
- Saved searches
- Alert rules
- Portfolio tracking
- Portfolio chat
- Tender access
- Tender calendar
- Country intelligence
- Stakeholder intelligence
- Pipeline tools
- Project comparison
- Export CSV
- Export PDF
- AI research
- Intelligence reports
- Admin feedback inbox
- Subscriber management
- User management

Each key should define:

- Minimum plan
- Whether staff bypass applies
- Whether lifetime users bypass or map to a specific tier
- Whether usage should be counted
- Which backend functions enforce it
- Which frontend routes or components display upgrade prompts

## Project Visibility and Data Limits

The home page project counter was fixed to avoid the default 1,000 row query cap. That fix is correct for public marketing statistics, but the authenticated app still needs plan-aware data access.

Recommended behavior:

- Public marketing pages may show aggregate counts
- Free users may see a limited number of approved projects or limited project fields
- Paid users may see broader project datasets according to plan
- Staff users may see all projects, including unapproved or AI-generated records
- Detailed fields such as contacts, funding context, risk analysis, and political context may require paid access

Avoid enforcing visibility only by limiting rows in React. If the data is sensitive or plan-gated, enforce access through database policies, secure backend functions, or controlled views.

## Admin and Researcher Access

Admin and researcher access should continue to use the `user_roles` table.

Do not store roles in profiles, user metadata, local storage, or client-only state.

The user `kinlotangiri911@gmail.com` was intended to have admin rights. Future developers should confirm the role assignment exists in the backend role table and avoid adding special-case email logic to the frontend.

Admin and researcher users should be able to:

- Access all platform features
- Bypass plan and usage limits
- Review and approve projects
- Manage AI-generated project records
- Review feedback
- Manage users according to role permissions
- Monitor agents
- View and manage subscribers where appropriate

## Testing Requirements

Regression tests should be added before or alongside enforcement changes.

### User Types to Test

At minimum, test these user states:

- Anonymous visitor
- Free authenticated user
- Starter user
- Pro user
- Lifetime user
- Researcher
- Admin

### Required Test Cases

Tests should confirm that:

- Free users cannot access premium routes by URL
- Free users cannot call premium backend functions directly
- Free users cannot create more saved searches or alert rules than their plan allows
- Free users cannot export if exports are paid-only
- Starter users receive Starter features only
- Pro users receive Pro features only
- Lifetime users receive lifetime-level access
- Admins and researchers bypass all usage and feature gates
- Normal users cannot insert, update, approve, or delete core project records
- Normal users cannot manage insights, evidence, contacts, milestones, or stakeholders
- Normal users cannot read subscriber or waitlist records
- Public users can still access approved marketing-safe content

## Suggested Implementation Order

### Phase 1: Audit and Map Access

- Inventory every dashboard route
- Inventory every backend function callable from the client
- Inventory every table with permissive write policies
- Map each route, function, and table action to a required plan or role

### Phase 2: Fix Critical Database Policies

- Lock down project writes to staff
- Lock down evidence, contacts, milestones, and stakeholders writes to staff
- Lock down insights management to staff
- Lock down subscriber and waitlist reads to admins
- Review public read policies for sensitive project-related tables

### Phase 3: Add Server-Side Feature Enforcement

- Add reusable backend entitlement helpers where missing
- Apply checks to AI, research, export, and premium intelligence functions
- Ensure every protected function validates the bearer token in code
- Return consistent forbidden or upgrade-required responses

### Phase 4: Align Frontend Gates With Backend Rules

- Ensure every locked route uses the feature gate
- Add locked states to premium tabs and actions
- Make upgrade prompts clear and non-annoying
- Ensure staff and lifetime users bypass correctly

### Phase 5: Add Regression Tests

- Add tests for plan-level access
- Add tests for role bypass
- Add tests for direct backend function access
- Add tests for database write restrictions

### Phase 6: Monitor and Iterate

- Track forbidden attempts in logs
- Review feedback submissions for confusing gates
- Monitor usage counters for abuse or unexpected spikes
- Review plan conversion impact after gates are enforced

## Documentation Rules for Future Developers

Future development should follow these rules:

- Treat the backend as the source of truth for access control
- Keep UI gates for user experience only
- Never trust client-side plan, role, or entitlement values for security decisions
- Keep staff roles in `user_roles` only
- Keep plan limits in frontend and backend billing files synchronized
- Add entitlement checks before adding new AI or premium functions
- Add RLS policies whenever creating new tables
- Implement authentication when adding user-owned data
- Avoid anonymous signups
- Require email verification unless explicitly changed by product decision
- Use Lovable Cloud for persistence, auth, backend functions, and storage
- Do not edit generated backend client or type files manually

## Current Best Next Task

If only one task is chosen next, start with database policy hardening for core project data.

The highest-risk current issue is that authenticated users can write to project-related tables that should be controlled by researchers, admins, or trusted backend agents.

Recommended first fix:

- Restrict project insert, update, and delete to staff
- Restrict evidence, contacts, milestones, and stakeholder writes to staff
- Restrict insight management to staff
- Restrict subscriber and waitlist reads to admins
- Keep safe public reads where the marketing site needs them

After that, enforce backend feature checks across premium Edge Functions.
