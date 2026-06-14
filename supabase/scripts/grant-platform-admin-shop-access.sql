-- Give the Velbok platform admin account full shop admin access for their studio.
-- Run in Supabase SQL editor if /admin fails for mr.tattooist@hotmail.com

DO $$
DECLARE
  uid uuid;
  org_id uuid;
  f text;
  features text[] := ARRAY[
    'schedule', 'inbox', 'services', 'stencil', 'clients', 'stock',
    'dashboard', 'settings', 'deposits', 'billing', 'checkout', 'admin',
    'my_bookings', 'customer_consent'
  ];
BEGIN
  SELECT id INTO uid FROM auth.users WHERE lower(email) = 'mr.tattooist@hotmail.com' LIMIT 1;
  IF uid IS NULL THEN
    RAISE NOTICE 'User mr.tattooist@hotmail.com not found — skip';
    RETURN;
  END IF;

  INSERT INTO public.platform_admins (user_id)
  VALUES (uid)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (uid, 'admin'), (uid, 'artist')
  ON CONFLICT (user_id, role) DO NOTHING;

  SELECT om.organization_id INTO org_id
  FROM public.organization_members om
  WHERE om.user_id = uid
  ORDER BY om.joined_at NULLS LAST
  LIMIT 1;

  IF org_id IS NULL THEN
    INSERT INTO public.organizations (name, slug, owner_user_id, status)
    VALUES ('Velbok Platform', 'velbok-platform', uid, 'active')
    ON CONFLICT (slug) DO UPDATE
      SET owner_user_id = EXCLUDED.owner_user_id, status = 'active', updated_at = now()
    RETURNING id INTO org_id;

    IF org_id IS NULL THEN
      SELECT id INTO org_id FROM public.organizations WHERE slug = 'velbok-platform';
    END IF;

    INSERT INTO public.organization_members (organization_id, user_id, role)
    VALUES (org_id, uid, 'owner')
    ON CONFLICT (organization_id, user_id) DO UPDATE SET role = 'owner';
  END IF;

  IF org_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.shop_settings WHERE organization_id = org_id
  ) THEN
    INSERT INTO public.shop_settings (
      organization_id, shop_name, legal_name, trading_name, setup_completed_at
    ) VALUES (
      org_id, 'Velbok Platform', 'Velbok Platform', 'Velbok', now()
    );
  END IF;

  FOREACH f IN ARRAY features LOOP
    INSERT INTO public.user_permissions (user_id, feature, granted)
    VALUES (uid, f, true)
    ON CONFLICT (user_id, feature) DO UPDATE SET granted = true;
  END LOOP;

  RAISE NOTICE 'Platform admin shop access granted for user % org %', uid, org_id;
END $$;
