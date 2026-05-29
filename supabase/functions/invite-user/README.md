# invite-user

Sends a Supabase **invite email** (magic link to set password) for new accounts.

## Deploy

```bash
supabase functions deploy invite-user --no-verify-jwt
```

(`--no-verify-jwt` is optional; the function checks admin via `has_role` inside.)

Ensure **Auth → URL configuration** includes your app’s `/auth` URL as a redirect allowlist entry.

## Secrets (hosted)

`SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_URL` are injected automatically.  
Optional: `INVITE_REDIRECT_URL` (e.g. `https://yourapp.com/auth`) if the client cannot send `redirectTo`.

## Apply database migration

Run `20260318200000_customer_invites_defaults.sql` so `customer` role, booking RLS, and invite defaults exist.
