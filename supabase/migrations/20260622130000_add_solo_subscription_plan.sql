-- Solo plan: single artist / solo organization at £9.95/mo.
-- Limits: 2 ticket images per person per conversation, 2 AI stencils per 24h.

INSERT INTO public.subscription_plans (
  id,
  name,
  description,
  price_gbp_monthly,
  max_artist_seats,
  trial_days,
  features,
  sort_order,
  is_self_serve
)
VALUES (
  'solo',
  'Solo',
  'Essentials for a solo artist — one seat, core platform tools, support tickets and contact links.',
  9.95,
  1,
  14,
  '{
    "schedule": true, "clients": true, "consent": true, "customer_portal": true,
    "reminders": true, "stripe_deposits": true, "invoicing": true, "stock": true,
    "billing": true, "stencil": true, "dashboard": true, "aftercare": true,
    "staff_inbox": false, "support_tickets": true,
    "inbox_email": false, "inbox_whatsapp": false, "inbox_instagram": false,
    "inbox_facebook": false, "inbox_sms": false,
    "inbox_max_channels": 0, "inbox_monthly_message_cap": 0,
    "ticket_media_max_per_user": 2,
    "stencil_max_per_24h": 2
  }'::jsonb,
  0,
  true
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price_gbp_monthly = EXCLUDED.price_gbp_monthly,
  max_artist_seats = EXCLUDED.max_artist_seats,
  trial_days = EXCLUDED.trial_days,
  features = EXCLUDED.features,
  sort_order = EXCLUDED.sort_order,
  is_self_serve = EXCLUDED.is_self_serve,
  updated_at = now();

INSERT INTO public.subscription_plan_prices (plan_id, currency, amount_monthly, stripe_price_id)
VALUES
  ('solo', 'gbp', 9.95, NULL),
  ('solo', 'eur', 11.95, NULL),
  ('solo', 'usd', 12.95, NULL),
  ('solo', 'aud', 15.95, NULL),
  ('solo', 'cad', 13.95, NULL),
  ('solo', 'sek', 129.00, NULL),
  ('solo', 'nok', 129.00, NULL),
  ('solo', 'ron', 56.95, NULL),
  ('solo', 'bgn', 23.95, NULL)
ON CONFLICT (plan_id, currency) DO UPDATE SET
  amount_monthly = EXCLUDED.amount_monthly;

-- Accept any active catalog plan (including solo) for platform admin gratuity grants.
CREATE OR REPLACE FUNCTION public.platform_admin_grant_subscription(
  _org_id uuid,
  _plan_id text,
  _months integer DEFAULT 12,
  _note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _months_safe integer;
  _period_end timestamptz;
BEGIN
  PERFORM public.platform_admin_assert();

  IF _org_id IS NULL THEN
    RAISE EXCEPTION 'organization_id_required';
  END IF;

  IF _plan_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.subscription_plans WHERE id = _plan_id AND is_active
  ) THEN
    RAISE EXCEPTION 'invalid_plan_id';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = _org_id) THEN
    RAISE EXCEPTION 'organization_not_found';
  END IF;

  _months_safe := GREATEST(1, LEAST(COALESCE(_months, 12), 120));
  _period_end := now() + make_interval(months => _months_safe);

  INSERT INTO public.platform_subscriptions (
    organization_id,
    plan_id,
    status,
    stripe_subscription_id,
    stripe_price_id,
    trial_end,
    current_period_start,
    current_period_end,
    cancel_at_period_end,
    canceled_at
  ) VALUES (
    _org_id,
    _plan_id,
    'active',
    NULL,
    NULL,
    NULL,
    now(),
    _period_end,
    false,
    NULL
  )
  ON CONFLICT (organization_id) DO UPDATE SET
    plan_id = EXCLUDED.plan_id,
    status = EXCLUDED.status,
    stripe_subscription_id = NULL,
    stripe_price_id = NULL,
    trial_end = EXCLUDED.trial_end,
    current_period_start = EXCLUDED.current_period_start,
    current_period_end = EXCLUDED.current_period_end,
    cancel_at_period_end = false,
    canceled_at = NULL,
    updated_at = now();

  UPDATE public.organizations
  SET status = 'active', updated_at = now()
  WHERE id = _org_id;

  INSERT INTO public.subscription_events (organization_id, event_type, payload)
  VALUES (
    _org_id,
    'platform_admin_gratuity',
    jsonb_build_object(
      'plan_id', _plan_id,
      'months', _months_safe,
      'period_end', _period_end,
      'note', _note,
      'granted_by', auth.uid()
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'organizationId', _org_id,
    'planId', _plan_id,
    'status', 'active',
    'isGratuity', true,
    'currentPeriodEnd', _period_end
  );
END;
$$;
