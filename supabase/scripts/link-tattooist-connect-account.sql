-- Link Brentwood / mr.tattooist shop Connect account for live payouts.
-- Run in Supabase SQL Editor after STRIPE_CONNECT_SECRET_KEY is set to the shop platform key.

DO $$
DECLARE
  v_org_id uuid;
  v_connect_acct text := 'acct_1TFFWdAxFvqjl4T2';
BEGIN
  SELECT o.id INTO v_org_id
  FROM organizations o
  JOIN organization_members om ON om.organization_id = o.id
  JOIN auth.users u ON u.id = om.user_id
  WHERE lower(u.email) = 'mr.tattooist@hotmail.com'
    AND om.role IN ('owner', 'admin')
  ORDER BY CASE om.role WHEN 'owner' THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No organization found for mr.tattooist@hotmail.com';
  END IF;

  UPDATE organizations SET
    stripe_connect_account_id = v_connect_acct,
    stripe_connect_charges_enabled = false,
    stripe_connect_payouts_enabled = false,
    stripe_connect_details_submitted = false,
    stripe_connect_onboarded_at = NULL
  WHERE id = v_org_id;

  UPDATE companies SET
    stripe_account_id = v_connect_acct,
    updated_at = now()
  WHERE stripe_account_id IS NULL
     OR stripe_account_id IS DISTINCT FROM v_connect_acct;

  RAISE NOTICE 'Linked org % to Connect account %', v_org_id, v_connect_acct;
END $$;

SELECT
  o.id,
  o.name,
  o.stripe_connect_account_id,
  o.stripe_connect_charges_enabled,
  o.stripe_connect_payouts_enabled,
  o.stripe_connect_details_submitted
FROM organizations o
JOIN organization_members om ON om.organization_id = o.id
JOIN auth.users u ON u.id = om.user_id
WHERE lower(u.email) = 'mr.tattooist@hotmail.com'
  AND om.role IN ('owner', 'admin');
