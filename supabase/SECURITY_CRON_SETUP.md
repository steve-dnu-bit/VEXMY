# Cron secret setup (reminders & aftercare)

After deploying security migrations, automated emails require a shared secret.

1. Generate a long random string (e.g. 64+ chars).
2. Set Edge Function secret (Dashboard → Edge Functions → Secrets, or CLI):

   ```bash
   npx supabase secrets set CRON_SECRET="your-secret-here" --project-ref your-project-ref
   ```

3. Store the same value in Supabase Vault (SQL Editor):

   ```sql
   SELECT vault.create_secret(
     'your-secret-here',
     'cron_secret',
     'Cron auth for send-booking-reminders and send-aftercare-emails'
   );
   ```

4. Re-run the cron migration if jobs were scheduled before the vault secret existed:

   ```bash
   npx supabase db push
   ```

`CRON_SECRET` in Edge Functions and `cron_secret` in Vault must match exactly.
