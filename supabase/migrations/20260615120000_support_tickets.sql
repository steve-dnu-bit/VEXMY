-- Portal support tickets (all plans) — replaces unified external inbox for messaging.

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  subject text NOT NULL,
  category text NOT NULL DEFAULT 'general'
    CHECK (category IN ('general', 'booking', 'deposit', 'design', 'aftercare')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_org_status
  ON public.support_tickets (organization_id, status, coalesce(last_message_at, created_at) DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_customer
  ON public.support_tickets (customer_id, coalesce(last_message_at, created_at) DESC);

CREATE TABLE IF NOT EXISTS public.support_ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(trim(body)) > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_ticket_messages_ticket
  ON public.support_ticket_messages (ticket_id, created_at ASC);

CREATE TABLE IF NOT EXISTS public.ticket_email_notification_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_message_id uuid NOT NULL REFERENCES public.support_ticket_messages(id) ON DELETE CASCADE,
  preview_text text NOT NULL DEFAULT '',
  notify_after timestamptz NOT NULL,
  sent_at timestamptz,
  canceled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ticket_email_notification_queue_due_idx
  ON public.ticket_email_notification_queue (notify_after)
  WHERE sent_at IS NULL AND canceled_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ticket_email_notification_queue_pending_uniq
  ON public.ticket_email_notification_queue (ticket_id, recipient_id)
  WHERE sent_at IS NULL AND canceled_at IS NULL;

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_email_notification_queue ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.customer_can_access_org(_org_id uuid, _user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = _org_id AND om.user_id = _user_id
  )
  OR EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.organization_id = _org_id
      AND (
        b.client_user_id = _user_id
        OR lower(trim(coalesce(b.client_email, ''))) = lower(trim(coalesce(
          (SELECT email FROM auth.users WHERE id = _user_id), ''
        )))
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.staff_can_access_org_tickets(_org_id uuid, _user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_user_organization_id(_user_id) = _org_id
    AND (
      public.can_access_bookings(_user_id)
      OR public.has_role(_user_id, 'admin'::public.app_role)
      OR public.has_role(_user_id, 'artist'::public.app_role)
    );
$$;

DROP POLICY IF EXISTS "Customers view own tickets" ON public.support_tickets;
CREATE POLICY "Customers view own tickets"
  ON public.support_tickets FOR SELECT TO authenticated
  USING (customer_id = auth.uid());

DROP POLICY IF EXISTS "Staff view org tickets" ON public.support_tickets;
CREATE POLICY "Staff view org tickets"
  ON public.support_tickets FOR SELECT TO authenticated
  USING (public.staff_can_access_org_tickets(organization_id));

DROP POLICY IF EXISTS "Customers create tickets" ON public.support_tickets;
CREATE POLICY "Customers create tickets"
  ON public.support_tickets FOR INSERT TO authenticated
  WITH CHECK (
    customer_id = auth.uid()
    AND status = 'open'
    AND public.customer_can_access_org(organization_id)
  );

DROP POLICY IF EXISTS "Staff update org tickets" ON public.support_tickets;
CREATE POLICY "Staff update org tickets"
  ON public.support_tickets FOR UPDATE TO authenticated
  USING (public.staff_can_access_org_tickets(organization_id))
  WITH CHECK (public.staff_can_access_org_tickets(organization_id));

DROP POLICY IF EXISTS "Ticket participants view messages" ON public.support_ticket_messages;
CREATE POLICY "Ticket participants view messages"
  ON public.support_ticket_messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_id
        AND (
          t.customer_id = auth.uid()
          OR public.staff_can_access_org_tickets(t.organization_id)
        )
    )
  );

DROP POLICY IF EXISTS "Ticket participants insert messages" ON public.support_ticket_messages;
CREATE POLICY "Ticket participants insert messages"
  ON public.support_ticket_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_id
        AND t.status = 'open'
        AND (
          t.customer_id = auth.uid()
          OR public.staff_can_access_org_tickets(t.organization_id)
        )
    )
  );

CREATE OR REPLACE FUNCTION public.touch_support_ticket_last_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.support_tickets
  SET last_message_at = NEW.created_at, updated_at = now()
  WHERE id = NEW.ticket_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_support_ticket_message_touch ON public.support_ticket_messages;
CREATE TRIGGER trg_support_ticket_message_touch
  AFTER INSERT ON public.support_ticket_messages
  FOR EACH ROW EXECUTE FUNCTION public.touch_support_ticket_last_message();

CREATE OR REPLACE FUNCTION public.schedule_ticket_email_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket public.support_tickets%ROWTYPE;
  v_recipient_id uuid;
  v_preview text;
BEGIN
  SELECT * INTO v_ticket FROM public.support_tickets WHERE id = NEW.ticket_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  IF NEW.sender_id = v_ticket.customer_id THEN
    SELECT ur.user_id INTO v_recipient_id
    FROM public.user_roles ur
    JOIN public.organization_members om ON om.user_id = ur.user_id
    WHERE om.organization_id = v_ticket.organization_id
      AND ur.role = 'admin'::public.app_role
    ORDER BY om.joined_at ASC
    LIMIT 1;

    IF v_recipient_id IS NULL THEN
      SELECT om.user_id INTO v_recipient_id
      FROM public.organization_members om
      JOIN public.user_roles ur ON ur.user_id = om.user_id AND ur.role = 'artist'::public.app_role
      WHERE om.organization_id = v_ticket.organization_id
      ORDER BY om.joined_at ASC
      LIMIT 1;
    END IF;
  ELSE
    v_recipient_id := v_ticket.customer_id;
  END IF;

  IF v_recipient_id IS NULL OR v_recipient_id = NEW.sender_id THEN
    RETURN NEW;
  END IF;

  v_preview := left(coalesce(nullif(trim(NEW.body), ''), 'You received a new support message.'), 280);

  UPDATE public.ticket_email_notification_queue
  SET canceled_at = now(), updated_at = now()
  WHERE ticket_id = NEW.ticket_id
    AND recipient_id = NEW.sender_id
    AND sent_at IS NULL
    AND canceled_at IS NULL;

  UPDATE public.ticket_email_notification_queue
  SET canceled_at = now(), updated_at = now()
  WHERE ticket_id = NEW.ticket_id
    AND recipient_id = v_recipient_id
    AND sent_at IS NULL
    AND canceled_at IS NULL;

  INSERT INTO public.ticket_email_notification_queue (
    ticket_id, recipient_id, sender_id, last_message_id, preview_text, notify_after
  )
  VALUES (
    NEW.ticket_id, v_recipient_id, NEW.sender_id, NEW.id, v_preview, now() + interval '15 minutes'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_schedule_ticket_email_notification ON public.support_ticket_messages;
CREATE TRIGGER trg_schedule_ticket_email_notification
  AFTER INSERT ON public.support_ticket_messages
  FOR EACH ROW EXECUTE FUNCTION public.schedule_ticket_email_notification();

CREATE OR REPLACE FUNCTION public.create_support_ticket(
  p_organization_id uuid,
  p_subject text,
  p_category text,
  p_body text,
  p_booking_id uuid DEFAULT NULL
)
RETURNS public.support_tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket public.support_tickets%ROWTYPE;
  v_cat text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF NOT public.customer_can_access_org(p_organization_id) THEN
    RAISE EXCEPTION 'Not allowed for this studio';
  END IF;

  v_cat := lower(trim(coalesce(p_category, 'general')));
  IF v_cat NOT IN ('general', 'booking', 'deposit', 'design', 'aftercare') THEN
    v_cat := 'general';
  END IF;

  IF p_booking_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = p_booking_id
        AND b.organization_id = p_organization_id
        AND (
          b.client_user_id = auth.uid()
          OR lower(trim(coalesce(b.client_email, ''))) = lower(trim(coalesce(
            (SELECT email FROM auth.users WHERE id = auth.uid()), ''
          )))
        )
    ) THEN
      RAISE EXCEPTION 'Invalid booking for ticket';
    END IF;
  END IF;

  INSERT INTO public.support_tickets (
    organization_id, customer_id, booking_id, subject, category, status
  )
  VALUES (
    p_organization_id,
    auth.uid(),
    p_booking_id,
    trim(p_subject),
    v_cat,
    'open'
  )
  RETURNING * INTO v_ticket;

  INSERT INTO public.support_ticket_messages (ticket_id, sender_id, body)
  VALUES (v_ticket.id, auth.uid(), trim(p_body));

  RETURN v_ticket;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_support_ticket(uuid, text, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.customer_can_access_org(uuid, uuid) TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.support_tickets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_ticket_messages;

-- All plans: portal tickets + WhatsApp contact links (no unified external inbox API).
UPDATE public.subscription_plans SET
  features = features
    || '{"staff_inbox": true, "support_tickets": true}'::jsonb
    || '{"inbox_email": false, "inbox_whatsapp": false, "inbox_instagram": false, "inbox_facebook": false, "inbox_sms": false, "inbox_max_channels": 0, "inbox_monthly_message_cap": 0, "inbox_overage_rate_gbp": 0}'::jsonb,
  updated_at = now()
WHERE id IN ('starter', 'studio', 'enterprise');
