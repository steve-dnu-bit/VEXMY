-- PR7-11: overage billing, chat deprecation, enterprise grandfathering support.

-- ---------------------------------------------------------------------------
-- Inbox overage tracking
-- ---------------------------------------------------------------------------

ALTER TABLE public.inbox_api_usage
  ADD COLUMN IF NOT EXISTS overage_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overage_reported_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.platform_subscriptions
  ADD COLUMN IF NOT EXISTS grandfathered_price boolean NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- claim_inbox_message_quota: Enterprise soft cap with overage
-- ---------------------------------------------------------------------------

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
  _overage_rate numeric;
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

  _cap := COALESCE(public.org_plan_feature_number(_org_id, 'inbox_monthly_message_cap')::integer, 0);
  IF _cap <= 0 THEN
    RETURN jsonb_build_object('allowed', false, 'error', 'no_message_cap');
  END IF;

  IF _dir NOT IN ('inbound', 'outbound') THEN
    RETURN jsonb_build_object('allowed', false, 'error', 'invalid_direction');
  END IF;

  _overage_rate := COALESCE(public.org_plan_feature_number(_org_id, 'inbox_overage_rate_gbp'), 0);

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

  IF _total >= _cap THEN
    IF _overage_rate > 0 THEN
      IF _dir = 'inbound' THEN
        UPDATE public.inbox_api_usage
        SET inbound_count = inbound_count + 1,
            overage_count = overage_count + 1,
            updated_at = now()
        WHERE organization_id = _org_id AND period_month = _period;
      ELSE
        UPDATE public.inbox_api_usage
        SET outbound_count = outbound_count + 1,
            overage_count = overage_count + 1,
            updated_at = now()
        WHERE organization_id = _org_id AND period_month = _period;
      END IF;

      _total := _total + 1;
      _overage := _overage + 1;

      RETURN jsonb_build_object(
        'allowed', true,
        'cap', _cap,
        'used', _total,
        'remaining', 0,
        'overage_count', _overage,
        'in_overage', true,
        'direction', _dir
      );
    END IF;

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
  _overage_rate numeric;
  _total integer;
BEGIN
  IF _org_id IS NULL THEN
    RETURN jsonb_build_object('error', 'invalid_org');
  END IF;

  _cap := COALESCE(public.org_plan_feature_number(_org_id, 'inbox_monthly_message_cap')::integer, 0);
  _max_channels := COALESCE(public.org_plan_feature_number(_org_id, 'inbox_max_channels')::integer, 0);
  _overage_rate := COALESCE(public.org_plan_feature_number(_org_id, 'inbox_overage_rate_gbp'), 0);

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
    'remaining', GREATEST(0, _cap - _total),
    'overage_count', _overage,
    'overage_rate_gbp', _overage_rate,
    'in_overage', _total > _cap AND _overage_rate > 0,
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

-- ---------------------------------------------------------------------------
-- Chat deprecation: stop email notification cron and triggers
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_schedule_chat_email_notification ON public.chat_messages;
DROP TRIGGER IF EXISTS trg_cancel_chat_email_on_read ON public.chat_members;

DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-chat-email-notifications-every-min') THEN
    PERFORM cron.unschedule('process-chat-email-notifications-every-min');
  END IF;
END;
$cron$;

-- Block new internal chat messages (legacy data remains readable)
CREATE OR REPLACE FUNCTION public.block_new_chat_messages()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Internal chat is deprecated. Use the unified inbox at /inbox.';
END;
$$;

DROP TRIGGER IF EXISTS trg_block_new_chat_messages ON public.chat_messages;
CREATE TRIGGER trg_block_new_chat_messages
  BEFORE INSERT ON public.chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.block_new_chat_messages();

-- Extend refresh_cron_jobs with daily inbox overage billing
CREATE OR REPLACE FUNCTION public.refresh_cron_jobs()
RETURNS TABLE(job_name text, schedule text, note text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_cron_secret text;
  v_headers jsonb;
  base_url text := 'https://tkremoxfkgoiuwghtzwd.supabase.co/functions/v1';
BEGIN
  SELECT decrypted_secret INTO v_cron_secret
  FROM vault.decrypted_secrets
  WHERE name = 'cron_secret'
  LIMIT 1;

  IF v_cron_secret IS NULL OR length(trim(v_cron_secret)) = 0 THEN
    RAISE EXCEPTION 'vault secret cron_secret is missing. Run scripts/setup-cron-chain.ps1 and apply the vault SQL.';
  END IF;

  v_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || v_cron_secret,
    'x-cron-secret', v_cron_secret
  );

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-booking-reminders-every-15-min') THEN
    PERFORM cron.unschedule('send-booking-reminders-every-15-min');
  END IF;

  PERFORM cron.schedule(
    'send-booking-reminders-every-15-min',
    '*/15 * * * *',
    format(
      $job$
        SELECT net.http_post(
          url := '%s/send-booking-reminders',
          headers := %L::jsonb,
          body := '{}'::jsonb
        );
      $job$,
      base_url,
      v_headers::text
    )
  );

  job_name := 'send-booking-reminders-every-15-min';
  schedule := '*/15 * * * *';
  note := base_url || '/send-booking-reminders';
  RETURN NEXT;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-aftercare-emails-every-15-min') THEN
    PERFORM cron.unschedule('send-aftercare-emails-every-15-min');
  END IF;

  PERFORM cron.schedule(
    'send-aftercare-emails-every-15-min',
    '*/15 * * * *',
    format(
      $job$
        SELECT net.http_post(
          url := '%s/send-aftercare-emails',
          headers := %L::jsonb,
          body := '{}'::jsonb
        );
      $job$,
      base_url,
      v_headers::text
    )
  );

  job_name := 'send-aftercare-emails-every-15-min';
  schedule := '*/15 * * * *';
  note := base_url || '/send-aftercare-emails';
  RETURN NEXT;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'report-inbox-overage-daily') THEN
    PERFORM cron.unschedule('report-inbox-overage-daily');
  END IF;

  PERFORM cron.schedule(
    'report-inbox-overage-daily',
    '15 2 * * *',
    format(
      $job$
        SELECT net.http_post(
          url := '%s/report-inbox-overage',
          headers := %L::jsonb,
          body := '{}'::jsonb
        );
      $job$,
      base_url,
      v_headers::text
    )
  );

  job_name := 'report-inbox-overage-daily';
  schedule := '15 2 * * *';
  note := base_url || '/report-inbox-overage';
  RETURN NEXT;
END;
$$;
