-- Revoke should immediately end access (not wait for period end).

CREATE OR REPLACE FUNCTION public.platform_admin_set_subscription_status(
  _org_id uuid,
  _status public.subscription_status
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.platform_admin_assert();

  IF _org_id IS NULL THEN
    RAISE EXCEPTION 'organization_id_required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.platform_subscriptions WHERE organization_id = _org_id) THEN
    RAISE EXCEPTION 'subscription_not_found';
  END IF;

  UPDATE public.platform_subscriptions
  SET
    status = _status,
    canceled_at = CASE WHEN _status = 'canceled' THEN now() ELSE canceled_at END,
    cancel_at_period_end = CASE WHEN _status = 'canceled' THEN false ELSE cancel_at_period_end END,
    current_period_end = CASE WHEN _status = 'canceled' THEN now() ELSE current_period_end END,
    trial_end = CASE WHEN _status = 'canceled' THEN NULL ELSE trial_end END,
    updated_at = now()
  WHERE organization_id = _org_id;

  IF _status = 'canceled' THEN
    UPDATE public.organizations SET status = 'canceled', updated_at = now() WHERE id = _org_id;
  ELSIF _status IN ('trialing', 'active', 'past_due') THEN
    UPDATE public.organizations SET status = 'active', updated_at = now() WHERE id = _org_id;
  END IF;

  INSERT INTO public.subscription_events (organization_id, event_type, payload)
  VALUES (
    _org_id,
    'platform_admin_status_change',
    jsonb_build_object(
      'status', _status,
      'changed_by', auth.uid()
    )
  );

  RETURN jsonb_build_object('ok', true, 'organizationId', _org_id, 'status', _status);
END;
$$;
