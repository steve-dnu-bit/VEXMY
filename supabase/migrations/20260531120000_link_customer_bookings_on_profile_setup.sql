-- When a customer completes portal setup, link existing bookings and conduct rows by email.

CREATE OR REPLACE FUNCTION public.link_customer_records_by_email(_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _email text;
  _bookings_updated integer := 0;
BEGIN
  SELECT lower(trim(u.email)) INTO _email
  FROM auth.users u
  WHERE u.id = _user_id;

  IF _email IS NULL OR _email = '' THEN
    RETURN 0;
  END IF;

  UPDATE public.bookings
  SET client_user_id = _user_id
  WHERE lower(trim(client_email)) = _email
    AND (client_user_id IS NULL OR client_user_id = _user_id);
  GET DIAGNOSTICS _bookings_updated = ROW_COUNT;

  UPDATE public.client_conduct
  SET client_user_id = _user_id
  WHERE lower(trim(client_email)) = _email
    AND (client_user_id IS NULL OR client_user_id = _user_id);

  RETURN _bookings_updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.link_my_bookings_by_email()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  RETURN public.link_customer_records_by_email(auth.uid());
END;
$$;

GRANT EXECUTE ON FUNCTION public.link_my_bookings_by_email() TO authenticated;

CREATE OR REPLACE FUNCTION public.handle_customer_profile_permission_grants()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(new.customer_profile_completed, false) THEN
    PERFORM public.grant_customer_portal_permissions(new.user_id);
    PERFORM public.link_customer_records_by_email(new.user_id);
  END IF;
  RETURN new;
END;
$$;

-- Backfill customers who already finished profile setup.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.user_id
    FROM public.profiles p
    WHERE coalesce(p.customer_profile_completed, false) = true
  LOOP
    PERFORM public.link_customer_records_by_email(r.user_id);
  END LOOP;
END $$;
