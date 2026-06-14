-- Merge Brentwood Inkaholics org into mr.tattooist@hotmail.com owner org (Default Studio).
-- Moves artists, schedule (bookings), clients (org members + bookings), subscription, and shop settings.
-- Run once in Supabase SQL editor.

DO $$
DECLARE
  v_source_org uuid := 'c94a7432-fd7c-4bf7-9ebc-e1c23cdd8ad2'; -- Brentwood Inkaholics
  v_target_org uuid := 'f58d5887-a6d7-42f8-8abd-9c6f08b80d01'; -- Default Studio (mr.tattooist owner)
  v_target_owner uuid := '1706c538-1690-44bb-8c27-ba52287307ea'; -- mr.tattooist@hotmail.com
  v_source_shop_id uuid;
  v_target_shop_id uuid;
  v_moved_bookings int;
  v_moved_members int;
BEGIN
  IF v_source_org = v_target_org THEN
    RAISE EXCEPTION 'Source and target org must differ';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = v_source_org) THEN
    RAISE EXCEPTION 'Source org not found';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = v_target_org) THEN
    RAISE EXCEPTION 'Target org not found';
  END IF;

  SELECT id INTO v_source_shop_id FROM public.shop_settings WHERE organization_id = v_source_org LIMIT 1;
  SELECT id INTO v_target_shop_id FROM public.shop_settings WHERE organization_id = v_target_org LIMIT 1;

  -- Drop duplicate templates on target (Brentwood copies are canonical).
  DELETE FROM public.consent_form_templates WHERE organization_id = v_target_org;
  DELETE FROM public.shop_aftercare_templates WHERE organization_id = v_target_org;

  -- Move org-scoped rows (bookings = schedule, members = artists/clients).
  UPDATE public.bookings SET organization_id = v_target_org WHERE organization_id = v_source_org;
  GET DIAGNOSTICS v_moved_bookings = ROW_COUNT;

  UPDATE public.support_tickets SET organization_id = v_target_org WHERE organization_id = v_source_org;
  UPDATE public.invoices SET organization_id = v_target_org WHERE organization_id = v_source_org;
  UPDATE public.pos_sales SET organization_id = v_target_org WHERE organization_id = v_source_org;
  UPDATE public.consent_form_templates SET organization_id = v_target_org WHERE organization_id = v_source_org;
  UPDATE public.messages SET organization_id = v_target_org WHERE organization_id = v_source_org;
  UPDATE public.client_conduct SET organization_id = v_target_org WHERE organization_id = v_source_org;
  UPDATE public.channel_connections SET organization_id = v_target_org WHERE organization_id = v_source_org;
  UPDATE public.contacts_import SET organization_id = v_target_org WHERE organization_id = v_source_org;
  UPDATE public.inbox_api_usage SET organization_id = v_target_org WHERE organization_id = v_source_org;
  UPDATE public.shop_aftercare_templates SET organization_id = v_target_org WHERE organization_id = v_source_org;
  UPDATE public.shop_sales_reports SET organization_id = v_target_org WHERE organization_id = v_source_org;
  UPDATE public.stencil_usage SET organization_id = v_target_org WHERE organization_id = v_source_org;
  UPDATE public.subscription_events SET organization_id = v_target_org WHERE organization_id = v_source_org;
  UPDATE public.artist_pos_splits SET organization_id = v_target_org WHERE organization_id = v_source_org;

  -- POS settings: target wins if both exist; otherwise move source row.
  IF EXISTS (SELECT 1 FROM public.shop_pos_settings WHERE organization_id = v_target_org) THEN
    DELETE FROM public.shop_pos_settings WHERE organization_id = v_source_org;
  ELSE
    UPDATE public.shop_pos_settings SET organization_id = v_target_org WHERE organization_id = v_source_org;
  END IF;

  -- Billing profile: copy Brentwood profile onto target PK row.
  IF EXISTS (SELECT 1 FROM public.organization_billing_profiles WHERE organization_id = v_source_org) THEN
    IF EXISTS (SELECT 1 FROM public.organization_billing_profiles WHERE organization_id = v_target_org) THEN
      UPDATE public.organization_billing_profiles tgt
      SET
        country_code = src.country_code,
        currency = src.currency,
        default_tax_rate = src.default_tax_rate,
        tax_label = src.tax_label,
        tax_registration_number = src.tax_registration_number,
        company_registration_number = src.company_registration_number,
        prices_include_tax = src.prices_include_tax,
        tax_exempt = src.tax_exempt,
        invoice_legal_name = src.invoice_legal_name,
        invoice_trading_name = src.invoice_trading_name,
        invoice_address_line1 = src.invoice_address_line1,
        invoice_address_line2 = src.invoice_address_line2,
        invoice_city = src.invoice_city,
        invoice_postcode = src.invoice_postcode,
        invoice_support_email = src.invoice_support_email,
        invoice_number_prefix = src.invoice_number_prefix,
        next_invoice_sequence = GREATEST(tgt.next_invoice_sequence, src.next_invoice_sequence),
        default_payment_method = src.default_payment_method,
        default_payment_term_days = src.default_payment_term_days,
        updated_at = now()
      FROM public.organization_billing_profiles src
      WHERE src.organization_id = v_source_org AND tgt.organization_id = v_target_org;
      DELETE FROM public.organization_billing_profiles WHERE organization_id = v_source_org;
    ELSE
      UPDATE public.organization_billing_profiles SET organization_id = v_target_org WHERE organization_id = v_source_org;
    END IF;
  END IF;

  -- Active subscription lives on Brentwood — attach to target org.
  UPDATE public.platform_subscriptions
  SET organization_id = v_target_org, updated_at = now()
  WHERE organization_id = v_source_org;

  -- Shop settings: apply Brentwood branding/setup to target shop row.
  IF v_source_shop_id IS NOT NULL AND v_target_shop_id IS NOT NULL THEN
    UPDATE public.shop_settings tgt
    SET
      shop_name = src.shop_name,
      legal_name = src.legal_name,
      trading_name = src.trading_name,
      support_email = src.support_email,
      privacy_email = src.privacy_email,
      phone = src.phone,
      website_url = src.website_url,
      address_line1 = src.address_line1,
      address_line2 = src.address_line2,
      city = src.city,
      postcode = src.postcode,
      country = src.country,
      country_code = src.country_code,
      logo_url = src.logo_url,
      setup_completed_at = COALESCE(src.setup_completed_at, tgt.setup_completed_at),
      dashboard_theme_mode = src.dashboard_theme_mode,
      shop_portal_bg_color = src.shop_portal_bg_color,
      shop_portal_bg_image_url = src.shop_portal_bg_image_url,
      default_deposit_amount = src.default_deposit_amount,
      schedule_open_time = src.schedule_open_time,
      schedule_close_time = src.schedule_close_time,
      schedule_extra_buffer_minutes = src.schedule_extra_buffer_minutes,
      inbox_primary_channel = src.inbox_primary_channel,
      updated_at = now()
    FROM public.shop_settings src
    WHERE src.id = v_source_shop_id AND tgt.id = v_target_shop_id;
    DELETE FROM public.shop_settings WHERE id = v_source_shop_id;
  ELSIF v_source_shop_id IS NOT NULL THEN
    UPDATE public.shop_settings SET organization_id = v_target_org WHERE id = v_source_shop_id;
  END IF;

  -- Move artists/customers into target org (source owner becomes admin; target owner stays owner).
  INSERT INTO public.organization_members (organization_id, user_id, role, invited_by, joined_at)
  SELECT
    v_target_org,
    om.user_id,
    CASE
      WHEN om.user_id = v_target_owner THEN 'owner'::public.org_member_role
      WHEN om.role = 'owner'::public.org_member_role THEN 'admin'::public.org_member_role
      ELSE om.role
    END,
    om.invited_by,
    om.joined_at
  FROM public.organization_members om
  WHERE om.organization_id = v_source_org
  ON CONFLICT (organization_id, user_id) DO UPDATE SET
    role = CASE
      WHEN public.organization_members.role = 'owner'::public.org_member_role THEN public.organization_members.role
      WHEN EXCLUDED.role = 'admin'::public.org_member_role THEN 'admin'::public.org_member_role
      ELSE public.organization_members.role
    END;

  GET DIAGNOSTICS v_moved_members = ROW_COUNT;

  -- Free Brentwood slug, rebrand target org as Brentwood Inkaholics.
  UPDATE public.organizations
  SET slug = 'brentwood-inkaholics-archived-' || to_char(now(), 'YYYYMMDDHH24MISS'), status = 'canceled', updated_at = now()
  WHERE id = v_source_org;

  UPDATE public.organizations
  SET
    name = 'Brentwood Inkaholics',
    slug = 'brentwood-inkaholics',
    owner_user_id = v_target_owner,
    status = 'active',
    updated_at = now()
  WHERE id = v_target_org;

  DELETE FROM public.organization_members WHERE organization_id = v_source_org;

  RAISE NOTICE 'Merge complete: % bookings moved, org members upserted %, target org % is now Brentwood Inkaholics',
    v_moved_bookings, v_moved_members, v_target_org;
END $$;

-- Verify
SELECT o.id, o.name, o.slug, o.status,
  (SELECT COUNT(*) FROM organization_members om WHERE om.organization_id = o.id) AS members,
  (SELECT COUNT(*) FROM bookings b WHERE b.organization_id = o.id) AS bookings,
  (SELECT shop_name FROM shop_settings ss WHERE ss.organization_id = o.id LIMIT 1) AS shop_name
FROM public.organizations o
WHERE o.id IN ('f58d5887-a6d7-42f8-8abd-9c6f08b80d01', 'c94a7432-fd7c-4bf7-9ebc-e1c23cdd8ad2')
   OR o.slug LIKE 'brentwood-inkaholics%';
