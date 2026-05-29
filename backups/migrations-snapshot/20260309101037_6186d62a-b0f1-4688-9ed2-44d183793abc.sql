
CREATE TABLE public.user_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature text NOT NULL,
  granted boolean NOT NULL DEFAULT false,
  UNIQUE (user_id, feature)
);

ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage permissions"
  ON public.user_permissions
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Staff can view own permissions"
  ON public.user_permissions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Function to check if a user has a specific feature permission
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _feature text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_permissions
    WHERE user_id = _user_id AND feature = _feature AND granted = true
  )
$$;

-- Auto-create all permissions (disabled) when a new user profile is created
CREATE OR REPLACE FUNCTION public.handle_new_profile_permissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  features text[] := ARRAY['schedule','inbox','services','stencil','clients','stock','dashboard','settings','deposits','billing','admin'];
  f text;
BEGIN
  FOREACH f IN ARRAY features LOOP
    INSERT INTO public.user_permissions (user_id, feature, granted)
    VALUES (NEW.user_id, f, false)
    ON CONFLICT (user_id, feature) DO NOTHING;
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_profile_created_permissions
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_profile_permissions();
