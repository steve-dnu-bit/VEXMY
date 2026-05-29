-- One-shot: reset ALL policies on public.bookings, then recreate staff/customer/admin rules.
-- Staff writes use the SAME predicate as staff SELECT (see 20260429200500). Run in Supabase SQL Editor.

DO $$
DECLARE pol text;
BEGIN
  FOR pol IN
    SELECT p.polname
    FROM pg_policy p
    JOIN pg_class c ON p.polrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public'
      AND c.relname = 'bookings'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.bookings', pol);
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS public.bookings_write_allowed(uuid);

CREATE POLICY "Staff can view all bookings"
  ON public.bookings
  FOR SELECT
  TO authenticated
  USING (
    public.has_permission(auth.uid(), 'schedule')
    OR public.has_permission(auth.uid(), 'deposits')
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'artist'::public.app_role)
  );

CREATE POLICY "Customers can view own bookings"
  ON public.bookings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
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

CREATE POLICY "Staff can insert bookings"
  ON public.bookings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_permission(auth.uid(), 'schedule')
    OR public.has_permission(auth.uid(), 'deposits')
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'artist'::public.app_role)
  );

CREATE POLICY "Staff can update bookings"
  ON public.bookings
  FOR UPDATE
  TO authenticated
  USING (
    public.has_permission(auth.uid(), 'schedule')
    OR public.has_permission(auth.uid(), 'deposits')
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'artist'::public.app_role)
  )
  WITH CHECK (
    public.has_permission(auth.uid(), 'schedule')
    OR public.has_permission(auth.uid(), 'deposits')
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'artist'::public.app_role)
  );

CREATE POLICY "Staff can delete bookings"
  ON public.bookings
  FOR DELETE
  TO authenticated
  USING (
    public.has_permission(auth.uid(), 'schedule')
    OR public.has_permission(auth.uid(), 'deposits')
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'artist'::public.app_role)
  );

CREATE POLICY "Admins can manage all bookings"
  ON public.bookings
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bookings TO authenticated;

ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_booking_type_check;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_booking_type_check
  CHECK (booking_type IN ('consultation', 'session', 'touch-up', 'piercing-session', 'laser-session'));

-- === staff booking RPCs (used by the web app; bypass table RLS after staff check) ===
-- (same as supabase/migrations/20260515200000_staff_booking_write_rpc.sql)

CREATE OR REPLACE FUNCTION public._staff_booking_caller_allowed()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND (
      public.has_permission(auth.uid(), 'schedule')
      OR public.has_permission(auth.uid(), 'deposits')
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'artist'::public.app_role)
    );
$$;

CREATE OR REPLACE FUNCTION public.staff_insert_booking(
  p_artist_id uuid,
  p_client_name text,
  p_client_phone text,
  p_client_email text,
  p_client_user_id uuid,
  p_tattoo_style text,
  p_tattoo_size text,
  p_tattoo_placement text,
  p_notes text,
  p_booking_type text,
  p_status text,
  p_deposit_paid boolean,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.bookings%ROWTYPE;
BEGIN
  IF NOT public._staff_booking_caller_allowed() THEN
    RAISE EXCEPTION 'not allowed to create bookings';
  END IF;

  INSERT INTO public.bookings (
    artist_id,
    client_name,
    client_phone,
    client_email,
    client_user_id,
    tattoo_style,
    tattoo_size,
    tattoo_placement,
    notes,
    booking_type,
    status,
    deposit_paid,
    starts_at,
    ends_at
  )
  VALUES (
    p_artist_id,
    p_client_name,
    NULLIF(trim(COALESCE(p_client_phone, '')), ''),
    NULLIF(trim(COALESCE(p_client_email, '')), ''),
    p_client_user_id,
    NULLIF(trim(COALESCE(p_tattoo_style, '')), ''),
    NULLIF(trim(COALESCE(p_tattoo_size, '')), ''),
    NULLIF(trim(COALESCE(p_tattoo_placement, '')), ''),
    NULLIF(trim(COALESCE(p_notes, '')), ''),
    COALESCE(NULLIF(trim(p_booking_type), ''), 'session'),
    COALESCE(NULLIF(trim(p_status), ''), 'confirmed'),
    COALESCE(p_deposit_paid, false),
    p_starts_at,
    p_ends_at
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_update_booking(p_id uuid, p_patch jsonb)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.bookings%ROWTYPE;
BEGIN
  IF NOT public._staff_booking_caller_allowed() THEN
    RAISE EXCEPTION 'not allowed to update bookings';
  END IF;

  UPDATE public.bookings b
  SET
    artist_id = CASE WHEN p_patch ? 'artist_id' THEN (p_patch->>'artist_id')::uuid ELSE b.artist_id END,
    client_name = CASE WHEN p_patch ? 'client_name' THEN p_patch->>'client_name' ELSE b.client_name END,
    client_phone = CASE
      WHEN p_patch ? 'client_phone' THEN NULLIF(trim(p_patch->>'client_phone'), '')
      ELSE b.client_phone
    END,
    client_email = CASE
      WHEN p_patch ? 'client_email' THEN NULLIF(lower(trim(p_patch->>'client_email')), '')
      ELSE b.client_email
    END,
    client_user_id = CASE
      WHEN p_patch ? 'client_user_id' THEN (NULLIF(p_patch->>'client_user_id', ''))::uuid
      ELSE b.client_user_id
    END,
    tattoo_style = CASE
      WHEN p_patch ? 'tattoo_style' THEN NULLIF(trim(p_patch->>'tattoo_style'), '')
      ELSE b.tattoo_style
    END,
    tattoo_size = CASE
      WHEN p_patch ? 'tattoo_size' THEN NULLIF(trim(p_patch->>'tattoo_size'), '')
      ELSE b.tattoo_size
    END,
    tattoo_placement = CASE
      WHEN p_patch ? 'tattoo_placement' THEN NULLIF(trim(p_patch->>'tattoo_placement'), '')
      ELSE b.tattoo_placement
    END,
    notes = CASE
      WHEN p_patch ? 'notes' THEN NULLIF(trim(p_patch->>'notes'), '')
      ELSE b.notes
    END,
    booking_type = CASE WHEN p_patch ? 'booking_type' THEN p_patch->>'booking_type' ELSE b.booking_type END,
    status = CASE WHEN p_patch ? 'status' THEN p_patch->>'status' ELSE b.status END,
    deposit_paid = CASE WHEN p_patch ? 'deposit_paid' THEN (p_patch->>'deposit_paid')::boolean ELSE b.deposit_paid END,
    starts_at = CASE WHEN p_patch ? 'starts_at' THEN (p_patch->>'starts_at')::timestamptz ELSE b.starts_at END,
    ends_at = CASE WHEN p_patch ? 'ends_at' THEN (p_patch->>'ends_at')::timestamptz ELSE b.ends_at END
  WHERE b.id = p_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking not found';
  END IF;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_delete_booking(p_id uuid)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.bookings%ROWTYPE;
BEGIN
  IF NOT public._staff_booking_caller_allowed() THEN
    RAISE EXCEPTION 'not allowed to delete bookings';
  END IF;

  DELETE FROM public.bookings b WHERE b.id = p_id RETURNING * INTO v_row;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking not found';
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public._staff_booking_caller_allowed() FROM PUBLIC;

REVOKE ALL ON FUNCTION public.staff_insert_booking(
  uuid, text, text, text, uuid, text, text, text, text, text, text, boolean, timestamptz, timestamptz
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_insert_booking(
  uuid, text, text, text, uuid, text, text, text, text, text, text, boolean, timestamptz, timestamptz
) TO authenticated;

REVOKE ALL ON FUNCTION public.staff_update_booking(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_update_booking(uuid, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.staff_delete_booking(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_delete_booking(uuid) TO authenticated;
