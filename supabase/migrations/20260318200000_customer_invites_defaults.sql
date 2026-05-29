-- Customer role + invite defaults + customer booking access
-- (customer enum value added in 20260318195500_add_customer_app_role.sql)

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS client_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS bookings_client_user_id_idx ON public.bookings (client_user_id);

CREATE TABLE public.permission_role_defaults (
  role_template text NOT NULL CHECK (role_template IN ('customer', 'artist')),
  feature text NOT NULL,
  granted boolean NOT NULL DEFAULT true,
  PRIMARY KEY (role_template, feature)
);

ALTER TABLE public.permission_role_defaults ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage permission defaults"
  ON public.permission_role_defaults FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Authenticated read permission defaults"
  ON public.permission_role_defaults FOR SELECT TO authenticated
  USING (true);

INSERT INTO public.permission_role_defaults (role_template, feature, granted) VALUES
  ('customer', 'my_bookings', true),
  ('customer', 'customer_consent', true),
  ('artist', 'schedule', true),
  ('artist', 'inbox', true),
  ('artist', 'services', true),
  ('artist', 'stencil', true),
  ('artist', 'clients', true),
  ('artist', 'stock', false),
  ('artist', 'dashboard', true),
  ('artist', 'settings', true),
  ('artist', 'deposits', true),
  ('artist', 'billing', false),
  ('artist', 'admin', false),
  ('artist', 'my_bookings', false),
  ('artist', 'customer_consent', true)
ON CONFLICT (role_template, feature) DO NOTHING;

-- Staff: customers no longer see all bookings
DROP POLICY IF EXISTS "Staff can view all bookings" ON public.bookings;

CREATE POLICY "Staff can view all bookings"
  ON public.bookings FOR SELECT TO authenticated
  USING (
    NOT EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'customer'::public.app_role
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin'::public.app_role, 'artist'::public.app_role, 'assistant'::public.app_role)
    )
  );

CREATE POLICY "Customers can view own bookings"
  ON public.bookings FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'customer'::public.app_role
    )
    AND (
      client_user_id = auth.uid()
      OR (
        COALESCE(NULLIF(trim(client_email), ''), NULL) IS NOT NULL
        AND lower(trim(client_email)) = lower(trim(COALESCE(auth.jwt() ->> 'email', '')))
      )
    )
  );

-- Expanded permission rows + apply invite defaults
CREATE OR REPLACE FUNCTION public.handle_new_profile_permissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  features text[] := ARRAY[
    'schedule','inbox','services','stencil','clients','stock','dashboard',
    'settings','deposits','billing','admin','my_bookings','customer_consent'
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

-- Assign role on signup from invite metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invite_type text;
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'display_name', split_part(NEW.email, '@', 1))
  );

  invite_type := NEW.raw_user_meta_data ->> 'invite_type';
  IF invite_type = 'customer' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'customer'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSIF invite_type = 'artist' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'artist'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

INSERT INTO public.user_permissions (user_id, feature, granted)
SELECT p.user_id, f, false
FROM public.profiles p
CROSS JOIN (VALUES ('my_bookings'), ('customer_consent')) AS t(f)
ON CONFLICT (user_id, feature) DO NOTHING;
