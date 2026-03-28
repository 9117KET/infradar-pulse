

# Replace Waitlist with Multi-Option Engagement Hub

## What Changes

Remove all "Join waitlist" references across the codebase and replace with a unified **"Stay Connected"** engagement section where visitors choose what they want:

1. **Newsletter / Intel Digest** — subscribe to weekly infrastructure intelligence briefings
2. **Get Started Free** — sign up and start using the platform immediately
3. **Custom Alert Subscription** — configure a region + sector alert from the landing page
4. **Request a Demo** — enterprise lead capture form

## Approach

### 1. Replace `ContactSection` with `EngagementSection`

Redesign the bottom-of-page section (currently "Join the waitlist") into a 4-card layout:

```text
┌─────────────────────────────────────────────────────┐
│  STAY CONNECTED — Choose how to engage              │
│                                                     │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐   │
│  │ 📧      │ │ 🚀      │ │ 🔔      │ │ 🤝      │   │
│  │Newsletter│ │Get Start│ │Custom   │ │Request  │   │
│  │Digest   │ │ed Free  │ │Alert    │ │a Demo   │   │
│  │         │ │         │ │         │ │         │   │
│  │[email]  │ │[Sign up]│ │[region] │ │[name]   │   │
│  │[Submit] │ │         │ │[sector] │ │[company]│   │
│  └─────────┘ └─────────┘ │[email]  │ │[Submit] │   │
│                          └─────────┘ └─────────┘   │
└─────────────────────────────────────────────────────┘
```

- **Newsletter**: email-only form, inserts into a new `subscribers` table with `type: 'newsletter'`
- **Get Started Free**: links to `/login` (existing signup flow)
- **Custom Alert**: region + sector dropdowns + email, inserts into `subscribers` with `type: 'alert'` and preferences
- **Request a Demo**: name, company, email, use case textarea, inserts into `subscribers` with `type: 'demo_request'`

### 2. Database: New `subscribers` table

Replace the `waitlist` table with a more versatile `subscribers` table:
- `id`, `email`, `name`, `company`, `type` (newsletter / alert / demo_request), `preferences` (JSONB for region/sector), `created_at`
- RLS: anon+authenticated can insert, authenticated can read

### 3. Update all CTAs across the codebase

| Location | Current | New |
|----------|---------|-----|
| `Navbar.tsx` — desktop + mobile buttons | "Join waitlist" → `/#contact` | "Get Started" → `/login` |
| `HeroSection.tsx` — hero CTA | "Join waitlist" → `#contact` | "Get Started Free" → `/login` |
| `Footer.tsx` — get started section | "Join waitlist" → `/#contact` | "Subscribe to Updates" → `/#connect` |
| `Pricing.tsx` — CTA button | "Join waitlist" → `/waitlist` | "Get Started" → `/login` |
| `Insights.tsx` — bottom CTA | "Join the waitlist" → `/#contact` | "Get Started Free" → `/login` |

### 4. Dashboard: Replace WaitlistSubmissions with SubscriberManagement

Rename the admin page to show all subscriber types with filtering by type (newsletter, alert, demo_request). Update nav label from "Waitlist" to "Subscribers".

### 5. Clean up

- Remove `src/pages/Waitlist.tsx` and its route
- Remove `/#contact` anchor references (new section uses `#connect`)
- Keep the `waitlist` DB table intact (existing data) but stop writing to it

## Files

| Action | File |
|--------|------|
| Create | `src/components/home/EngagementSection.tsx` — 4-card engagement hub |
| Create | `src/pages/dashboard/SubscriberManagement.tsx` — replaces WaitlistSubmissions |
| SQL | Create `subscribers` table with RLS |
| Modify | `src/pages/Index.tsx` — swap ContactSection for EngagementSection |
| Modify | `src/components/Navbar.tsx` — update CTA buttons |
| Modify | `src/components/home/HeroSection.tsx` — update hero CTA |
| Modify | `src/components/Footer.tsx` — update footer CTA |
| Modify | `src/pages/Pricing.tsx` — update CTA |
| Modify | `src/pages/Insights.tsx` — update bottom CTA |
| Modify | `src/layouts/DashboardLayout.tsx` — rename Waitlist nav to Subscribers |
| Modify | `src/App.tsx` — remove `/waitlist` route, update `/dashboard/waitlist` to `/dashboard/subscribers` |
| Delete | `src/pages/Waitlist.tsx` |

