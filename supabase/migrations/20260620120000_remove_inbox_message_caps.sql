-- Inbox is not sold or metered by API messages per month.

UPDATE public.subscription_plans SET
  features = features || '{"inbox_monthly_message_cap": 0, "inbox_overage_rate_gbp": 0}'::jsonb,
  updated_at = now()
WHERE id IN ('starter', 'studio', 'enterprise');

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
  _overage integer;
  _total integer;
  _dir text := lower(trim(COALESCE(_direction, 'inbound')));
BEGIN
  IF _org_id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'error', 'invalid_org');
  END IF;

  IF NOT public.org_plan_has_feature(_org_id, 'staff_inbox') THEN
    RETURN jsonb_build_object('allowed', false, 'error', 'plan_no_inbox');
  END IF;

  IF _dir NOT IN ('inbound', 'outbound') THEN
    RETURN jsonb_build_object('allowed', false, 'error', 'invalid_direction');
  END IF;

  _cap := COALESCE(public.org_plan_feature_number(_org_id, 'inbox_monthly_message_cap')::integer, 0);

  PERFORM pg_advisory_xact_lock(hashtextextended(_org_id::text, 42));

  INSERT INTO public.inbox_api_usage (organization_id, period_month)
  VALUES (_org_id, _period)
  ON CONFLICT (organization_id, period_month) DO NOTHING;

  SELECT inbound_count, outbound_count, overage_count
  INTO _inbound, _outbound, _overage
  FROM public.inbox_api_usage
  WHERE organization_id = _org_id AND period_month = _period
  FOR UPDATE;

  _inbound := COALESCE(_inbound, 0);
  _outbound := COALESCE(_outbound, 0);
  _overage := COALESCE(_overage, 0);
  _total := _inbound + _outbound;

  -- No monthly cap configured: track usage for reporting only.
  IF _cap <= 0 THEN
    IF _dir = 'inbound' THEN
      UPDATE public.inbox_api_usage
      SET inbound_count = inbound_count + 1, updated_at = now()
      WHERE organization_id = _org_id AND period_month = _period;
    ELSE
      UPDATE public.inbox_api_usage
      SET outbound_count = outbound_count + 1, updated_at = now()
      WHERE organization_id = _org_id AND period_month = _period;
    END IF;

    RETURN jsonb_build_object(
      'allowed', true,
      'cap', 0,
      'used', _total + 1,
      'remaining', null,
      'unlimited', true,
      'direction', _dir
    );
  END IF;

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
    'overage_count', _overage,
    'in_overage', false,
    'direction', _dir
  );
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
  _overage integer := 0;
  _max_channels integer;
  _total integer;
BEGIN
  IF _org_id IS NULL THEN
    RETURN jsonb_build_object('error', 'invalid_org');
  END IF;

  _cap := COALESCE(public.org_plan_feature_number(_org_id, 'inbox_monthly_message_cap')::integer, 0);
  _max_channels := COALESCE(public.org_plan_feature_number(_org_id, 'inbox_max_channels')::integer, 0);

  SELECT u.inbound_count, u.outbound_count, u.overage_count
  INTO _inbound, _outbound, _overage
  FROM public.inbox_api_usage u
  WHERE u.organization_id = _org_id AND u.period_month = _period;

  _inbound := COALESCE(_inbound, 0);
  _outbound := COALESCE(_outbound, 0);
  _overage := COALESCE(_overage, 0);
  _total := _inbound + _outbound;

  RETURN jsonb_build_object(
    'organization_id', _org_id,
    'staff_inbox', public.org_plan_has_feature(_org_id, 'staff_inbox'),
    'monthly_cap', _cap,
    'max_channels', _max_channels,
    'inbound_count', _inbound,
    'outbound_count', _outbound,
    'total_count', _total,
    'remaining', CASE WHEN _cap <= 0 THEN NULL ELSE GREATEST(0, _cap - _total) END,
    'overage_count', _overage,
    'overage_rate_gbp', 0,
    'in_overage', false,
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
