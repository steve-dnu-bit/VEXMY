-- Manual dev access grant (no Stripe). User: mr.steve.dnu@gmail.com — Solo plan
DO $$
DECLARE
  uid uuid := '1c9d946d-b8ae-4321-a234-e7f93ed0082b';
  org_id uuid;
  f text;
  features text[] := ARRAY[
    'schedule', 'inbox', 'services', 'stencil', 'clients', 'stock',
    'dashboard', 'settings', 'deposits', 'billing', 'admin',
    'my_bookings', 'customer_consent'
  ];
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (uid, 'admin'), (uid, 'artist')
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.organizations (name, slug, owner_user_id, status)
  VALUES ('Steve Studio', 'steve-studio', uid, 'active')
  ON CONFLICT (slug) DO UPDATE
    SET owner_user_id = EXCLUDED.owner_user_id, status = 'active', updated_at = now()
  RETURNING id INTO org_id;

  IF org_id IS NULL THEN
    SELECT id INTO org_id FROM public.organizations WHERE slug = 'steve-studio';
  END IF;

  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (org_id, uid, 'owner')
  ON CONFLICT (organization_id, user_id) DO UPDATE SET role = 'owner';

  IF NOT EXISTS (SELECT 1 FROM public.shop_settings WHERE organization_id = org_id) THEN
    INSERT INTO public.shop_settings (
      organization_id, shop_name, legal_name, trading_name, setup_completed_at
    ) VALUES (
      org_id, 'Steve Studio', 'Steve Studio Ltd', 'Steve Studio', now()
    );
  ELSE
    UPDATE public.shop_settings
    SET setup_completed_at = COALESCE(setup_completed_at, now()), updated_at = now()
    WHERE organization_id = org_id;
  END IF;

  INSERT INTO public.platform_subscriptions (
    organization_id, plan_id, status, trial_end, current_period_end
  ) VALUES (
    org_id, 'solo', 'active', NULL, now() + interval '1 year'
  )
  ON CONFLICT (organization_id) DO UPDATE SET
    plan_id = EXCLUDED.plan_id,
    status = EXCLUDED.status,
    trial_end = EXCLUDED.trial_end,
    current_period_end = EXCLUDED.current_period_end,
    updated_at = now();

  FOREACH f IN ARRAY features LOOP
    INSERT INTO public.user_permissions (user_id, feature, granted)
    VALUES (uid, f, true)
    ON CONFLICT (user_id, feature) DO UPDATE SET granted = true;
  END LOOP;
END $$;
