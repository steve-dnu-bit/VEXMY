-- Org-wide VIP toggle: update all matching client bookings in one call (bypasses per-row RLS limits).

CREATE OR REPLACE FUNCTION public.set_client_vip_for_organization(
  p_organization_id uuid,
  p_client_user_id uuid,
  p_client_email text,
  p_client_phone text,
  p_client_name text,
  p_vip boolean
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_count integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT public.can_access_bookings(v_uid) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF NOT public.is_org_member(p_organization_id, v_uid) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.bookings b
  SET vip_client = p_vip
  WHERE b.organization_id = p_organization_id
    AND (
      (p_client_user_id IS NOT NULL AND b.client_user_id = p_client_user_id)
      OR (
        p_client_email IS NOT NULL
        AND trim(p_client_email) <> ''
        AND b.client_email IS NOT NULL
        AND lower(trim(b.client_email)) = lower(trim(p_client_email))
      )
      OR (
        p_client_phone IS NOT NULL
        AND trim(p_client_phone) <> ''
        AND b.client_phone IS NOT NULL
        AND regexp_replace(b.client_phone, '\s', '', 'g') = regexp_replace(p_client_phone, '\s', '', 'g')
      )
      OR (
        p_client_name IS NOT NULL
        AND trim(p_client_name) <> ''
        AND lower(trim(b.client_name)) = lower(trim(p_client_name))
      )
    )
    AND (
      NOT public.shop_artist_data_privacy_enabled(p_organization_id)
      OR public.staff_bypasses_artist_data_privacy(v_uid, p_organization_id)
      OR b.artist_id = v_uid
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_client_vip_for_organization(uuid, uuid, text, text, text, boolean) TO authenticated;
