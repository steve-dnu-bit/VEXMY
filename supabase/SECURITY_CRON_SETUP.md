# Cron chain setup (reminders, aftercare, booking emails)

Automated jobs share one secret between **Edge Functions** and **Supabase Vault**.

## Quick setup (recommended)

```powershell
cd inkaholics-29cc97fa-main
npx supabase login
.\scripts\setup-cron-chain.ps1
```

## What runs on the chain

| Trigger | Target | Schedule |
|---------|--------|----------|
| `pg_cron` | `send-booking-reminders` | Every 15 minutes |
| `pg_cron` | `send-aftercare-emails` | Every 15 minutes |
| DB trigger on `bookings` | `booking-notifications` | On insert/update/delete |

Project URL: `https://tkremoxfkgoiuwghtzwd.supabase.co/functions/v1`

## Manual steps

1. Set Edge secret `CRON_SECRET` (random 32+ chars).
2. Set vault secret `cron_secret` to the **same** value.
3. Apply migrations (`npm run db:push`) or run:

   ```sql
   SELECT * FROM public.refresh_cron_jobs();
   ```

4. Set email secrets for actual sends: `.\scripts\setup-booking-email.ps1`

## Verify

```sql
SELECT jobname, schedule, active FROM cron.job WHERE jobname LIKE 'send-%';
```

`CRON_SECRET` (Edge) and `cron_secret` (Vault) must match exactly.
