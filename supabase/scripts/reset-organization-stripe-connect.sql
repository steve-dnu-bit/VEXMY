-- Reset Stripe Connect payout link for one tattoo shop organization.
-- Run in Supabase SQL Editor after replacing the placeholders below.
--
-- Use when the wrong Stripe connected account (e.g. Velbok instead of Inkaholics)
-- was linked via Admin → Payouts.
--
-- Duplicate "Velbok" accounts in Stripe Express usually mean multiple Express
-- connected accounts were created for the same login email. Velbok only uses ONE
-- account per organization (organizations.stripe_connect_account_id). Delete unused
-- duplicates in Stripe Dashboard → Connect → Accounts (keep the id from step 1).

-- 1) Inspect current links
SELECT
  o.id,
  o.name,
  o.slug,
  o.stripe_connect_account_id,
  o.stripe_connect_charges_enabled,
  o.stripe_connect_payouts_enabled,
  ss.shop_name,
  ss.support_email
FROM organizations o
LEFT JOIN shop_settings ss ON ss.organization_id = o.id
ORDER BY o.created_at;

-- 2) Reset one organization (replace <org-id> and optionally <wrong-acct-id>)
BEGIN;

UPDATE organizations SET
  stripe_connect_account_id = NULL,
  stripe_connect_charges_enabled = false,
  stripe_connect_payouts_enabled = false,
  stripe_connect_details_submitted = false,
  stripe_connect_onboarded_at = NULL
WHERE id = '<org-id>';

UPDATE companies SET
  stripe_account_id = NULL,
  updated_at = now()
WHERE stripe_account_id = '<wrong-acct-id>';

COMMIT;

-- 3) After reset: Admin → Payouts → Start setup (with STRIPE_CONNECT_SECRET_KEY set to Inkaholics).
