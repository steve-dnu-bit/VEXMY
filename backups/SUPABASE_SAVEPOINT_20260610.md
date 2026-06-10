# Supabase savepoint — 2026-06-10

**Project:** `tkremoxfkgoiuwghtzwd` (Velbok production)  
**Git commit:** _(filled in after commit)_  
**Netlify:** production deploy `6a29d9b4738fb2beb9508a81` (includes `geo-country` edge function)

## How migrations were applied

`supabase db push` could not run cleanly because some migration **version numbers collide** locally (e.g. two files share `20260610140000`). Deposits migrations were applied with:

```bash
npx supabase db query --linked -f supabase/migrations/20260610160000_shop_default_deposit_amount.sql
npx supabase db query --linked -f supabase/migrations/20260610170000_deposit_max_gbp_equivalent.sql
npx supabase migration repair --status applied 20260610160000 20260610170000
```

## Migrations applied

| Migration | Purpose |
|-----------|---------|
| `20260610160000_shop_default_deposit_amount.sql` | Shop owner default deposit + booking RPC `deposit_amount` |
| `20260610170000_deposit_max_gbp_equivalent.sql` | Deposit cap = £200 GBP equivalent per shop currency |

## Edge functions deployed

- `create-stripe-checkout` — shop currency + deposit cap validation
- `send-invoice` — shop currency
- `stripe-webhook` — shop currency on deposit receipts
- `setup-stripe-connect` — Connect onboarding helper
- `setup-stripe-webhook` — platform webhook setup helper

## App changes in this savepoint

- Per-shop currency from `shop_settings.country`
- IP geo country prefill (`/api/geo-country` Netlify edge)
- Configurable default deposit (Deposits page + Schedule booking dialog)
- Deposit maximum: £200 GBP equivalent (USD, EUR, CAD, AUD, RON, SEK, NOK, BGN)
- Ukrainian locale removed from active language list

## Rollback

**Frontend / code:**

```bash
git fetch origin
git checkout <commit-before-this-savepoint>
npm run deploy:prod
```

**Edge function (example):**

```bash
git checkout <commit> -- supabase/functions/create-stripe-checkout
npx supabase functions deploy create-stripe-checkout --project-ref tkremoxfkgoiuwghtzwd
```

**Database:** Supabase Dashboard → Database → Backups, or restore migrations manually.  
New columns: `shop_settings.default_deposit_amount`. RPCs: `staff_insert_booking` / `staff_update_booking` accept `deposit_amount`.

## Verify after deploy

1. Deposits → set default deposit, confirm cap shows in shop currency
2. Schedule → new booking inherits default deposit
3. Stripe deposit link creates checkout in correct currency
4. Shop setup wizard pre-fills country from IP (production Netlify only)
