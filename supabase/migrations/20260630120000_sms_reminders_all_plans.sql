-- SMS (Twilio) for appointment/deposit reminders on all plans with reminders.
-- Studios still bring their own Twilio account; this only removes Enterprise-only inbox SMS gating.

UPDATE public.subscription_plans
SET
  features = features || '{"inbox_sms": true}'::jsonb,
  updated_at = now()
WHERE id IN ('solo', 'starter', 'studio', 'enterprise');

CREATE OR REPLACE FUNCTION public.org_inbox_channel_allowed(_org_id uuid, _channel text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _flag text;
  _ch text := lower(trim(COALESCE(_channel, '')));
BEGIN
  IF NOT public.org_has_active_subscription(_org_id) THEN
    RETURN false;
  END IF;

  -- Any plan with reminders may connect Twilio SMS (BYO account) for reminders + inbox SMS.
  IF _ch = 'sms' AND public.org_plan_has_feature(_org_id, 'reminders') THEN
    RETURN true;
  END IF;

  _flag := CASE _ch
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

  IF public.org_plan_feature_number(_org_id, 'inbox_max_channels') = 1
     AND _ch IN ('whatsapp', 'instagram', 'facebook', 'sms') THEN
    RETURN EXISTS (
      SELECT 1 FROM public.shop_settings ss
      WHERE ss.organization_id = _org_id
        AND ss.inbox_primary_channel = _ch
    );
  END IF;

  RETURN true;
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
  _overage integer;
  _total integer;
  _dir text := lower(trim(COALESCE(_direction, 'inbound')));
BEGIN
  IF _org_id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'error', 'invalid_org');
  END IF;

  IF NOT public.org_plan_has_feature(_org_id, 'staff_inbox')
     AND NOT public.org_plan_has_feature(_org_id, 'reminders') THEN
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

  RETURN jsonb_build_object(
    'allowed', true,
    'cap', _cap,
    'used', _total + 1,
    'remaining', GREATEST(0, _cap - (_total + 1)),
    'direction', _dir
  );
END;
$$;
