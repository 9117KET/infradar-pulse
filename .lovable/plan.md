

## Goal

Remove all Lovable branding and notifications from the live `infradarai.com` site so the production experience is fully Infradar-branded.

## Issues Identified

1. **"Edit with Lovable" badge** appears on the published site (bottom corner). This is injected automatically by Lovable on published deployments and can be hidden via project settings (requires Pro plan or higher).

2. **"We received your message" pop-up from Lovable** — this is the default Lovable toast/dialog text shown after the contact form submits. The site's contact form (`src/pages/Contact.tsx`) is using generic/Lovable-default messaging instead of Infradar-branded copy.

## Changes

### 1. Hide the "Edit with Lovable" badge
Use the publish settings to set badge visibility to hidden. After this, the badge will no longer appear on `infradarai.com` once you republish (Publish → Update).

> Note: hiding the badge requires a Pro plan or higher on your Lovable workspace. If your current plan doesn't support it, the toggle will fail and you'll need to upgrade.

### 2. Audit and rebrand the contact form confirmation
- Inspect `src/pages/Contact.tsx` and any related components/dialogs to find the "We received your message" text.
- Inspect the transactional email template `supabase/functions/_shared/transactional-email-templates/contact-confirmation.tsx` (already Infradar-branded — confirmed).
- Replace any default/generic toast or modal copy with Infradar-branded language, e.g.:
  - Title: "Message received"
  - Body: "Thanks for contacting Infradar — a member of our intelligence team will get back to you within one business day."
- Verify the toast/dialog uses the project's existing `useToast` / `Sonner` styling (already Infradar-themed) rather than any imported Lovable component.

### 3. Wider Lovable-branding sweep
Search the codebase for any remaining references to:
- "Lovable" in UI strings, alt text, page titles, meta tags
- The default Lovable favicon or OG image in `index.html` and `public/`
- Any leftover placeholder copy ("Your app", "Welcome to Lovable", etc.)
Replace all with Infradar equivalents (logo, name, OG image already exist at `public/infradar-mark.svg` and `public/og-image.svg`).

### 4. Republish
After the code changes, you'll need to click **Publish → Update** in the top-right to push the rebranded version live. Hard-refresh `infradarai.com` afterwards.

## Technical Details

- Files to inspect/edit:
  - `src/pages/Contact.tsx` (toast copy)
  - `index.html` (title, meta, favicon)
  - any component rendering a confirmation dialog after contact submit
- Tool calls: `publish_settings--set_badge_visibility` with `hide_badge: true`
- No database or edge function changes required for the branding fix; the contact-confirmation email template is already Infradar-branded.

