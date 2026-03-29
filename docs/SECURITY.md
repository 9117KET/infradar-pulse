# Security notes (production)

## Dependency and supply chain

- Run `npm audit` locally and in CI; fix or document accepted risks for high/critical issues.
- Prefer pinning action versions in GitHub workflows and enabling Dependabot on this repository.

## Frontend (XSS and session)

- The app uses the Supabase JS client with sessions in `localStorage` (default for SPAs). Any XSS in your origin can access the session; mitigate with:
  - Strict `Content-Security-Policy` (script-src, connect-src to your Supabase and API hosts, frame-ancestors).
  - Avoid `dangerouslySetInnerHTML` with untrusted content; sanitize rich text if you add it later.
  - Keep dependencies updated.

Configure CSP headers on your host (e.g. Vercel `headers` in `vercel.json` or CDN edge rules). Example shape (adjust hosts to your project):

```http
Content-Security-Policy: default-src 'self'; script-src 'self'; connect-src 'self' https://<project>.supabase.co wss://<project>.supabase.co; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'self'
```

## Backend (Supabase)

- Row Level Security (RLS) policies enforce access in Postgres; never rely on React `RoleGuard` alone.
- Edge Functions that use `SUPABASE_SERVICE_ROLE_KEY` bypass RLS; they must validate JWTs and business rules (see `_shared/requireAi.ts`, `_shared/requireStaff.ts`).
- Rotate Stripe and Supabase secrets on a schedule and after any suspected leak.

## Stripe

- Webhook endpoints must verify signatures (`STRIPE_WEBHOOK_SECRET`); do not trust raw webhook bodies without verification.
