CREATE TABLE IF NOT EXISTS public.client_conduct (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_key text NOT NULL UNIQUE,
  client_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  client_name text NOT NULL,
  client_email text NULL,
  client_phone text NULL,
  no_shows_count integer NOT NULL DEFAULT 0,
  late_cancellations_count integer NOT NULL DEFAULT 0,
  reschedules_count integer NOT NULL DEFAULT 0,
  is_banned boolean NOT NULL DEFAULT false,
  ban_reason text NULL,
  updated_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_conduct_client_user_id_idx
  ON public.client_conduct (client_user_id);

CREATE INDEX IF NOT EXISTS client_conduct_client_email_idx
  ON public.client_conduct (client_email);

CREATE OR REPLACE FUNCTION public.set_client_conduct_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_client_conduct_updated_at ON public.client_conduct;
CREATE TRIGGER trg_client_conduct_updated_at
BEFORE UPDATE ON public.client_conduct
FOR EACH ROW
EXECUTE FUNCTION public.set_client_conduct_updated_at();

ALTER TABLE public.client_conduct ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can read client conduct" ON public.client_conduct;
CREATE POLICY "Staff can read client conduct"
  ON public.client_conduct
  FOR SELECT
  TO authenticated
  USING (
    public.has_permission(auth.uid(), 'schedule')
    OR public.has_permission(auth.uid(), 'deposits')
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'artist'::public.app_role)
    OR public.has_role(auth.uid(), 'assistant'::public.app_role)
  );

DROP POLICY IF EXISTS "Customers can read own client conduct" ON public.client_conduct;
CREATE POLICY "Customers can read own client conduct"
  ON public.client_conduct
  FOR SELECT
  TO authenticated
  USING (
    client_user_id = auth.uid()
    OR (
      client_email IS NOT NULL
      AND lower(trim(client_email)) = lower(trim(auth.jwt() ->> 'email'))
    )
  );

DROP POLICY IF EXISTS "Staff can insert client conduct" ON public.client_conduct;
CREATE POLICY "Staff can insert client conduct"
  ON public.client_conduct
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_permission(auth.uid(), 'schedule')
    OR public.has_permission(auth.uid(), 'deposits')
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'artist'::public.app_role)
    OR public.has_role(auth.uid(), 'assistant'::public.app_role)
  );

DROP POLICY IF EXISTS "Staff can update client conduct" ON public.client_conduct;
CREATE POLICY "Staff can update client conduct"
  ON public.client_conduct
  FOR UPDATE
  TO authenticated
  USING (
    public.has_permission(auth.uid(), 'schedule')
    OR public.has_permission(auth.uid(), 'deposits')
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'artist'::public.app_role)
    OR public.has_role(auth.uid(), 'assistant'::public.app_role)
  )
  WITH CHECK (
    public.has_permission(auth.uid(), 'schedule')
    OR public.has_permission(auth.uid(), 'deposits')
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'artist'::public.app_role)
    OR public.has_role(auth.uid(), 'assistant'::public.app_role)
  );
