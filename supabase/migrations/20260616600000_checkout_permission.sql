-- Dedicated checkout permission (POS / WisePad) separate from billing/invoices

INSERT INTO public.permission_role_defaults (role_template, feature, granted)
VALUES ('artist', 'checkout', true)
ON CONFLICT (role_template, feature) DO NOTHING;

CREATE OR REPLACE FUNCTION public.handle_new_profile_permissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  features text[] := ARRAY[
    'schedule','inbox','services','stencil','clients','stock','dashboard',
    'settings','deposits','billing','checkout','admin','my_bookings','customer_consent'
  ];
  f text;
  invite_type text;
BEGIN
  SELECT u.raw_user_meta_data ->> 'invite_type' INTO invite_type
  FROM auth.users u WHERE u.id = NEW.user_id;

  FOREACH f IN ARRAY features LOOP
    INSERT INTO public.user_permissions (user_id, feature, granted)
    VALUES (NEW.user_id, f, false)
    ON CONFLICT (user_id, feature) DO NOTHING;
  END LOOP;

  IF invite_type = 'customer' THEN
    UPDATE public.user_permissions up
    SET granted = prd.granted
    FROM public.permission_role_defaults prd
    WHERE up.user_id = NEW.user_id
      AND prd.role_template = 'customer'
      AND up.feature = prd.feature;
  ELSIF invite_type = 'artist' THEN
    UPDATE public.user_permissions up
    SET granted = prd.granted
    FROM public.permission_role_defaults prd
    WHERE up.user_id = NEW.user_id
      AND prd.role_template = 'artist'
      AND up.feature = prd.feature;
  END IF;

  RETURN NEW;
END;
$$;

-- Anyone with billing can also use checkout; artists get checkout via role defaults
INSERT INTO public.user_permissions (user_id, feature, granted)
SELECT up.user_id, 'checkout', up.granted
FROM public.user_permissions up
WHERE up.feature = 'billing'
ON CONFLICT (user_id, feature) DO UPDATE
  SET granted = public.user_permissions.granted OR EXCLUDED.granted;

INSERT INTO public.user_permissions (user_id, feature, granted)
SELECT ur.user_id, 'checkout', true
FROM public.user_roles ur
WHERE ur.role = 'artist'::public.app_role
ON CONFLICT (user_id, feature) DO UPDATE
  SET granted = public.user_permissions.granted OR EXCLUDED.granted;
