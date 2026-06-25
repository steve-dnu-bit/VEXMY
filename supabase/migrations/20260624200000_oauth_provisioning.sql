-- OAuth post-sign-in provisioning: customer embed, invite tokens, booking link.

CREATE TABLE IF NOT EXISTS public.auth_provisioning_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  email text,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  intent text NOT NULL CHECK (intent IN ('customer', 'artist')),
  expires_at timestamptz NOT NULL,
  claimed_at timestamptz,
  claimed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_provisioning_intents_token
  ON public.auth_provisioning_intents (token)
  WHERE claimed_at IS NULL;

ALTER TABLE public.auth_provisioning_intents ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public._provision_customer_for_org(_user_id uuid, _org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _org_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = _org_id) THEN
    RAISE EXCEPTION 'invalid organization';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_user_id, 'customer'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.user_permissions (user_id, feature, granted)
  SELECT _user_id, prd.feature, prd.granted
  FROM public.permission_role_defaults prd
  WHERE prd.role_template = 'customer'
  ON CONFLICT (user_id, feature)
  DO UPDATE SET granted = EXCLUDED.granted;

  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (_org_id, _user_id, 'member'::public.org_member_role)
  ON CONFLICT (organization_id, user_id) DO NOTHING;

  PERFORM public.link_customer_records_by_email(_user_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_oauth_provisioning(
  _intent text,
  _organization_id uuid DEFAULT NULL,
  _invite_token text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _email text;
  _row public.auth_provisioning_intents%ROWTYPE;
  _intent_norm text := lower(trim(coalesce(_intent, '')));
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT lower(trim(u.email)) INTO _email FROM auth.users u WHERE u.id = _uid;

  IF _intent_norm IN ('', 'staff', 'studio_subscribe') THEN
    RETURN jsonb_build_object('applied', false, 'intent', _intent_norm);
  END IF;

  IF _intent_norm = 'customer' THEN
    IF _organization_id IS NULL THEN
      RETURN jsonb_build_object('applied', false, 'reason', 'missing_organization_id');
    END IF;
    PERFORM public._provision_customer_for_org(_uid, _organization_id);
    RETURN jsonb_build_object('applied', true, 'intent', 'customer', 'organization_id', _organization_id);
  END IF;

  IF _intent_norm = 'invite' AND _invite_token IS NOT NULL AND trim(_invite_token) <> '' THEN
    SELECT * INTO _row
    FROM public.auth_provisioning_intents i
    WHERE i.token = trim(_invite_token)
      AND i.claimed_at IS NULL
      AND i.expires_at > now()
    LIMIT 1;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('applied', false, 'reason', 'invalid_or_expired_token');
    END IF;

    IF _row.email IS NOT NULL AND _email IS NOT NULL AND lower(trim(_row.email)) <> _email THEN
      RETURN jsonb_build_object('applied', false, 'reason', 'email_mismatch');
    END IF;

    IF _row.intent = 'customer' AND _row.organization_id IS NOT NULL THEN
      PERFORM public._provision_customer_for_org(_uid, _row.organization_id);
    ELSIF _row.intent = 'artist' THEN
      INSERT INTO public.user_roles (user_id, role)
      VALUES (_uid, 'artist'::public.app_role)
      ON CONFLICT (user_id, role) DO NOTHING;

      UPDATE public.user_permissions up
      SET granted = prd.granted
      FROM public.permission_role_defaults prd
      WHERE up.user_id = _uid
        AND prd.role_template = 'artist'
        AND up.feature = prd.feature;

      IF _row.organization_id IS NOT NULL THEN
        INSERT INTO public.organization_members (organization_id, user_id, role)
        VALUES (_row.organization_id, _uid, 'member'::public.org_member_role)
        ON CONFLICT (organization_id, user_id) DO NOTHING;
      END IF;
    END IF;

    UPDATE public.auth_provisioning_intents
    SET claimed_at = now(), claimed_by = _uid
    WHERE id = _row.id;

    RETURN jsonb_build_object(
      'applied', true,
      'intent', _row.intent,
      'organization_id', _row.organization_id
    );
  END IF;

  RETURN jsonb_build_object('applied', false, 'reason', 'unknown_intent');
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_oauth_provisioning(text, uuid, text) TO authenticated;
