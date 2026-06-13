-- Unified external inbox: tiered plan features, org-scoped messages, usage caps.
-- Enterprise price -> £49.95. Starter has contact links only (no staff_inbox API).

-- ---------------------------------------------------------------------------
-- Plan catalog: tiered inbox features + Enterprise pricing
-- ---------------------------------------------------------------------------

UPDATE public.subscription_plans SET
  price_gbp_monthly = 14.95,
  description = 'Core platform for shops with up to 3 artists. Contact clients via links from bookings.',
  features = '{
    "schedule": true, "clients": true, "consent": true, "customer_portal": true,
    "reminders": true, "stripe_deposits": true, "invoicing": true, "stock": true,
    "billing": true, "stencil": true, "dashboard": true, "aftercare": true,
    "staff_inbox": false,
    "inbox_email": false, "inbox_whatsapp": false, "inbox_instagram": false,
    "inbox_facebook": false, "inbox_sms": false,
    "inbox_max_channels": 0, "inbox_monthly_message_cap": 0
  }'::jsonb,
  updated_at = now()
WHERE id = 'starter';

UPDATE public.subscription_plans SET
  price_gbp_monthly = 19.95,
  description = 'Full platform for shops with up to 6 artists. Unified inbox: email + 1 channel.',
  features = '{
    "schedule": true, "clients": true, "consent": true, "customer_portal": true,
    "reminders": true, "stripe_deposits": true, "invoicing": true, "stock": true,
    "billing": true, "stencil": true, "dashboard": true, "aftercare": true,
    "staff_inbox": true,
    "inbox_email": true, "inbox_whatsapp": false, "inbox_instagram": false,
    "inbox_facebook": false, "inbox_sms": false,
    "inbox_max_channels": 1, "inbox_monthly_message_cap": 300
  }'::jsonb,
  updated_at = now()
WHERE id = 'studio';

UPDATE public.subscription_plans SET
  price_gbp_monthly = 49.95,
  description = 'Full platform for shops with up to 10 artists. Unified inbox: all channels.',
  features = '{
    "schedule": true, "clients": true, "consent": true, "customer_portal": true,
    "reminders": true, "stripe_deposits": true, "invoicing": true, "stock": true,
    "billing": true, "stencil": true, "dashboard": true, "aftercare": true,
    "sla": true, "migration": true,
    "staff_inbox": true,
    "inbox_email": true, "inbox_whatsapp": true, "inbox_instagram": true,
    "inbox_facebook": true, "inbox_sms": true,
    "inbox_max_channels": 4, "inbox_monthly_message_cap": 500,
    "inbox_overage_rate_gbp": 0.06
  }'::jsonb,
  updated_at = now()
WHERE id = 'enterprise';

-- ---------------------------------------------------------------------------
-- Shop settings: primary social channel for Studio (pick 1 of whatsapp / instagram)
-- ---------------------------------------------------------------------------

ALTER TABLE public.shop_settings
  ADD COLUMN IF NOT EXISTS inbox_primary_channel text
    CHECK (inbox_primary_channel IS NULL OR inbox_primary_channel IN (
      'whatsapp', 'instagram', 'facebook', 'email', 'sms'
    ));

COMMENT ON COLUMN public.shop_settings.inbox_primary_channel IS
  'Studio plan: the single API-connected inbox channel (whatsapp or instagram).';

-- ---------------------------------------------------------------------------
-- Org-scoped unified inbox messages
-- ---------------------------------------------------------------------------

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.messages m
SET organization_id = sub.org_id
FROM (
  SELECT id AS org_id FROM public.organizations ORDER BY created_at ASC LIMIT 1
) sub
WHERE m.organization_id IS NULL
  AND sub.org_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_messages_organization_created
  ON public.messages (organization_id, created_at DESC)
  WHERE organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_messages_organization_channel_created
  ON public.messages (organization_id, channel, created_at DESC)
  WHERE organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_messages_organization_unread
  ON public.messages (organization_id, is_read)
  WHERE organization_id IS NOT NULL AND is_read IS NOT TRUE;

DROP POLICY IF EXISTS "Staff can view all messages" ON public.messages;
DROP POLICY IF EXISTS "Staff can insert messages" ON public.messages;
DROP POLICY IF EXISTS "Staff can update messages" ON public.messages;

CREATE POLICY "Org members can view inbox messages"
  ON public.messages FOR SELECT TO authenticated
  USING (
    organization_id IS NOT NULL
    AND public.is_org_member(organization_id, auth.uid())
  );

CREATE POLICY "Org members can insert inbox messages"
  ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IS NOT NULL
    AND public.is_org_member(organization_id, auth.uid())
  );

CREATE POLICY "Org members can update inbox messages"
  ON public.messages FOR UPDATE TO authenticated
  USING (
    organization_id IS NOT NULL
    AND public.is_org_member(organization_id, auth.uid())
  )
  WITH CHECK (
    organization_id IS NOT NULL
    AND public.is_org_member(organization_id, auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Org-scoped channel connections
-- ---------------------------------------------------------------------------

ALTER TABLE public.channel_connections
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.channel_connections cc
SET organization_id = public.resolve_user_organization_id(cc.user_id)
WHERE cc.organization_id IS NULL
  AND public.resolve_user_organization_id(cc.user_id) IS NOT NULL;

ALTER TABLE public.channel_connections
  DROP CONSTRAINT IF EXISTS channel_connections_user_id_channel_key;

ALTER TABLE public.channel_connections
  ADD CONSTRAINT channel_connections_organization_id_channel_key
  UNIQUE (organization_id, channel);

CREATE INDEX IF NOT EXISTS idx_channel_connections_organization
  ON public.channel_connections (organization_id)
  WHERE organization_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Inbox API usage ledger (monthly caps)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.inbox_api_usage (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  period_month date NOT NULL,
  inbound_count integer NOT NULL DEFAULT 0,
  outbound_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, period_month)
);

ALTER TABLE public.inbox_api_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members view inbox usage" ON public.inbox_api_usage;
CREATE POLICY "Org members view inbox usage"
  ON public.inbox_api_usage FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

-- ---------------------------------------------------------------------------
-- Plan feature helpers (numeric + inbox limits)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.org_plan_feature_number(_org_id uuid, _feature text)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT (sp.features ->> _feature)::numeric
      FROM public.platform_subscriptions ps
      JOIN public.subscription_plans sp ON sp.id = ps.plan_id
      WHERE ps.organization_id = _org_id
        AND ps.status IN ('trialing', 'active', 'past_due')
      LIMIT 1
    ),
    0
  );
$$;

CREATE OR REPLACE FUNCTION public.org_inbox_channel_allowed(_org_id uuid, _channel text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _flag text;
BEGIN
  IF NOT public.org_has_active_subscription(_org_id) THEN
    RETURN false;
  END IF;

  _flag := CASE lower(trim(_channel))
    WHEN 'email' THEN 'inbox_email'
    WHEN 'whatsapp' THEN 'inbox_whatsapp'
    WHEN 'instagram' THEN 'inbox_instagram'
    WHEN 'facebook' THEN 'inbox_facebook'
    WHEN 'sms' THEN 'inbox_sms'
    ELSE NULL
  END;

  IF _flag IS NULL THEN
    RETURN false;
  END IF;

  IF NOT public.org_plan_has_feature(_org_id, _flag) THEN
    RETURN false;
  END IF;

  -- Studio: only inbox_primary_channel when max_channels = 1 and social flags are off individually.
  IF public.org_plan_feature_number(_org_id, 'inbox_max_channels') = 1
     AND _channel IN ('whatsapp', 'instagram', 'facebook', 'sms') THEN
    RETURN EXISTS (
      SELECT 1 FROM public.shop_settings ss
      WHERE ss.organization_id = _org_id
        AND ss.inbox_primary_channel = lower(trim(_channel))
    );
  END IF;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_org_inbox_limits(_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _period date := date_trunc('month', now())::date;
  _cap integer;
  _inbound integer := 0;
  _outbound integer := 0;
  _max_channels integer;
BEGIN
  IF _org_id IS NULL THEN
    RETURN jsonb_build_object('error', 'invalid_org');
  END IF;

  _cap := COALESCE(public.org_plan_feature_number(_org_id, 'inbox_monthly_message_cap')::integer, 0);
  _max_channels := COALESCE(public.org_plan_feature_number(_org_id, 'inbox_max_channels')::integer, 0);

  SELECT u.inbound_count, u.outbound_count
  INTO _inbound, _outbound
  FROM public.inbox_api_usage u
  WHERE u.organization_id = _org_id AND u.period_month = _period;

  _inbound := COALESCE(_inbound, 0);
  _outbound := COALESCE(_outbound, 0);

  RETURN jsonb_build_object(
    'organization_id', _org_id,
    'staff_inbox', public.org_plan_has_feature(_org_id, 'staff_inbox'),
    'monthly_cap', _cap,
    'max_channels', _max_channels,
    'inbound_count', _inbound,
    'outbound_count', _outbound,
    'total_count', _inbound + _outbound,
    'remaining', GREATEST(0, _cap - (_inbound + _outbound)),
    'overage_rate_gbp', public.org_plan_feature_number(_org_id, 'inbox_overage_rate_gbp'),
    'channels', jsonb_build_object(
      'email', public.org_inbox_channel_allowed(_org_id, 'email'),
      'whatsapp', public.org_inbox_channel_allowed(_org_id, 'whatsapp'),
      'instagram', public.org_inbox_channel_allowed(_org_id, 'instagram'),
      'facebook', public.org_inbox_channel_allowed(_org_id, 'facebook'),
      'sms', public.org_inbox_channel_allowed(_org_id, 'sms')
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_inbox_message_quota(
  _org_id uuid,
  _direction text DEFAULT 'inbound'
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _period date := date_trunc('month', now())::date;
  _cap integer;
  _inbound integer;
  _outbound integer;
  _total integer;
  _dir text := lower(trim(COALESCE(_direction, 'inbound')));
BEGIN
  IF _org_id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'error', 'invalid_org');
  END IF;

  IF NOT public.org_plan_has_feature(_org_id, 'staff_inbox') THEN
    RETURN jsonb_build_object('allowed', false, 'error', 'plan_no_inbox');
  END IF;

  _cap := COALESCE(public.org_plan_feature_number(_org_id, 'inbox_monthly_message_cap')::integer, 0);
  IF _cap <= 0 THEN
    RETURN jsonb_build_object('allowed', false, 'error', 'no_message_cap');
  END IF;

  IF _dir NOT IN ('inbound', 'outbound') THEN
    RETURN jsonb_build_object('allowed', false, 'error', 'invalid_direction');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_org_id::text, 42));

  INSERT INTO public.inbox_api_usage (organization_id, period_month)
  VALUES (_org_id, _period)
  ON CONFLICT (organization_id, period_month) DO NOTHING;

  SELECT inbound_count, outbound_count
  INTO _inbound, _outbound
  FROM public.inbox_api_usage
  WHERE organization_id = _org_id AND period_month = _period
  FOR UPDATE;

  _total := COALESCE(_inbound, 0) + COALESCE(_outbound, 0);
  IF _total >= _cap THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'error', 'monthly_cap_reached',
      'cap', _cap,
      'used', _total,
      'remaining', 0
    );
  END IF;

  IF _dir = 'inbound' THEN
    UPDATE public.inbox_api_usage
    SET inbound_count = inbound_count + 1, updated_at = now()
    WHERE organization_id = _org_id AND period_month = _period;
  ELSE
    UPDATE public.inbox_api_usage
    SET outbound_count = outbound_count + 1, updated_at = now()
    WHERE organization_id = _org_id AND period_month = _period;
  END IF;

  _total := _total + 1;

  RETURN jsonb_build_object(
    'allowed', true,
    'cap', _cap,
    'used', _total,
    'remaining', GREATEST(0, _cap - _total),
    'direction', _dir
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.org_plan_feature_number(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.org_inbox_channel_allowed(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_org_inbox_limits(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_inbox_message_quota(uuid, text) TO service_role;
