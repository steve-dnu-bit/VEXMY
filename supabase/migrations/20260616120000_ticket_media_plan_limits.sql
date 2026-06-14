-- Plan-based ticket image limits: Starter 2, Studio 6, Enterprise 10 per person per conversation.

UPDATE public.subscription_plans SET
  features = features || '{"ticket_media_max_per_user": 2}'::jsonb,
  updated_at = now()
WHERE id = 'starter';

UPDATE public.subscription_plans SET
  features = features || '{"ticket_media_max_per_user": 6}'::jsonb,
  updated_at = now()
WHERE id = 'studio';

UPDATE public.subscription_plans SET
  features = features || '{"ticket_media_max_per_user": 10}'::jsonb,
  updated_at = now()
WHERE id = 'enterprise';

CREATE OR REPLACE FUNCTION public.enforce_ticket_media_per_user_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
  v_org_id uuid;
  v_max integer;
BEGIN
  SELECT t.organization_id INTO v_org_id
  FROM public.support_tickets t
  WHERE t.id = NEW.ticket_id;

  v_max := COALESCE(public.org_plan_feature_number(v_org_id, 'ticket_media_max_per_user')::integer, 2);
  IF v_max < 1 THEN
    v_max := 2;
  END IF;

  SELECT count(*)::integer INTO v_count
  FROM public.support_ticket_media
  WHERE ticket_id = NEW.ticket_id
    AND uploaded_by = NEW.uploaded_by;

  IF v_count >= v_max THEN
    RAISE EXCEPTION 'Each person can attach up to % images per conversation', v_max;
  END IF;

  RETURN NEW;
END;
$$;
