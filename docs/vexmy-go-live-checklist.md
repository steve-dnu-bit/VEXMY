# VexMy go-live checklist (vexmy.com)

Use this after deploying to Netlify and pointing the custom domain. The live site talks to the **VexMy** Supabase project (`tkremoxfkgoiuwghtzwd`), not the old Inkaholics project.

## 1. First login (most common blocker)

- Accounts created in Supabase Admin **do not** have your old Inkaholics password.
- On https://vexmy.com/auth click **Forgot your password?**, enter your email, set a new password from the email link.
- Recovery link must land on: `https://vexmy.com/auth?mode=recovery`

## 2. Supabase → Authentication → URL Configuration

| Setting | Value |
|--------|--------|
| Site URL | `https://vexmy.com` |
| Redirect URLs | `https://vexmy.com/**`, `http://localhost:8080/**` (for local dev) |

Without these, login, signup, and password reset links can fail or redirect to the wrong host.

## 3. Netlify environment variables

In **Site settings → Environment variables** (Production scope), set:

| Variable | Source |
|----------|--------|
| `VITE_SUPABASE_URL` | `https://tkremoxfkgoiuwghtzwd.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase → Project Settings → API → **anon** `public` key (JWT) |
| `VITE_SUPABASE_PROJECT_ID` | `tkremoxfkgoiuwghtzwd` |

Trigger **Deploy → Clear cache and deploy** after changing env vars.

Optional branding (see `.env.example`): `VITE_SHOP_NAME`, `VITE_SHOP_SLUG`, etc.

## 4. What works with an empty database

After login as admin/artist with schedule permission:

- **Schedule** loads but has **no bookings** until you create them.
- **Billing / Stripe / emails** need edge function secrets (section 5).

## 5. Supabase Edge Functions secrets (VexMy project)

In Supabase Dashboard → Edge Functions → Secrets (or `supabase secrets set`):

- `CRON_SECRET` — for pg_cron HTTP calls
- `SMTP_*` / email provider — booking emails, invites
- `STRIPE_*` — payments and billing
- `SHOP_*` — branding in emails (see `_shared/branding.ts`)

Deploy functions: `npm run db:link` then `supabase functions deploy`.

## 6. Verify production bundle

After deploy, open vexmy.com → DevTools → Network → main JS chunk should reference `tkremoxfkgoiuwghtzwd.supabase.co`. If login shows a red banner about missing env vars, section 3 is incomplete.

## 7. Admin user sanity check (Supabase SQL)

```sql
select id, email, last_sign_in_at from auth.users where email = 'your@email.com';
select * from user_roles where user_id = '<uuid>';
select schedule, billing, admin from staff_permissions where user_id = '<uuid>';
```

`last_sign_in_at` should update after a successful login.

## 8. Not yet on VexMy (roadmap)

- Multi-tenant SaaS (one deployment, many shops)
- Migrating Inkaholics production data into VexMy
- Platform subscription billing
