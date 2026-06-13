-- Route tickets to a chosen artist; let staff start conversations with booked customers.

ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS assigned_artist_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_support_tickets_assigned_artist
  ON public.support_tickets (assigned_artist_id, status, coalesce(last_message_at, created_at) DESC);

CREATE OR REPLACE FUNCTION public.is_org_artist(_org_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members om
    JOIN public.user_roles ur ON ur.user_id = om.user_id AND ur.role = 'artist'::public.app_role
    WHERE om.organization_id = _org_id
      AND om.user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.staff_can_view_ticket(_ticket public.support_tickets, _user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.staff_can_access_org_tickets(_ticket.organization_id, _user_id)
    AND (
      public.has_role(_user_id, 'admin'::public.app_role)
      OR NOT public.has_role(_user_id, 'artist'::public.app_role)
      OR _ticket.assigned_artist_id = _user_id
      OR _ticket.assigned_artist_id IS NULL
    );
$$;

DROP POLICY IF EXISTS "Staff view org tickets" ON public.support_tickets;
CREATE POLICY "Staff view org tickets"
  ON public.support_tickets FOR SELECT TO authenticated
  USING (public.staff_can_view_ticket(support_tickets.*));

DROP POLICY IF EXISTS "Ticket participants view messages" ON public.support_ticket_messages;
CREATE POLICY "Ticket participants view messages"
  ON public.support_ticket_messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_id
        AND (
          t.customer_id = auth.uid()
          OR public.staff_can_view_ticket(t.*)
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
          OR public.staff_can_view_ticket(t.*)
        )
    )
  );

DROP POLICY IF EXISTS "Staff update org tickets" ON public.support_tickets;
CREATE POLICY "Staff update org tickets"
  ON public.support_tickets FOR UPDATE TO authenticated
  USING (public.staff_can_view_ticket(support_tickets.*))
  WITH CHECK (public.staff_can_view_ticket(support_tickets.*));

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
    v_recipient_id := v_ticket.assigned_artist_id;

    IF v_recipient_id IS NULL THEN
      SELECT ur.user_id INTO v_recipient_id
      FROM public.user_roles ur
      JOIN public.organization_members om ON om.user_id = ur.user_id
      WHERE om.organization_id = v_ticket.organization_id
        AND ur.role = 'admin'::public.app_role
      ORDER BY om.joined_at ASC
      LIMIT 1;
    END IF;

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

  v_preview := left(coalesce(nullif(trim(NEW.body), ''), 'You received a new inbox message.'), 280);

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
    NEW.ticket_id, v_recipient_id, NEW.sender_id, NEW.id, v_preview, now() + interval '2 minutes'
  );

  RETURN NEW;
END;
$$;

DROP FUNCTION IF EXISTS public.create_support_ticket(uuid, text, text, text, uuid);

CREATE OR REPLACE FUNCTION public.create_support_ticket(
  p_organization_id uuid,
  p_subject text,
  p_category text,
  p_body text,
  p_booking_id uuid DEFAULT NULL,
  p_assigned_artist_id uuid DEFAULT NULL
)
RETURNS public.support_tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket public.support_tickets%ROWTYPE;
  v_cat text;
  v_artist_id uuid;
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

  v_artist_id := p_assigned_artist_id;

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

    IF v_artist_id IS NULL THEN
      SELECT b.artist_id INTO v_artist_id
      FROM public.bookings b
      WHERE b.id = p_booking_id;
    END IF;
  END IF;

  IF v_artist_id IS NULL THEN
    RAISE EXCEPTION 'Choose an artist for this message';
  END IF;

  IF NOT public.is_org_artist(p_organization_id, v_artist_id) THEN
    RAISE EXCEPTION 'Invalid artist for this studio';
  END IF;

  INSERT INTO public.support_tickets (
    organization_id, customer_id, booking_id, subject, category, status, assigned_artist_id
  )
  VALUES (
    p_organization_id,
    auth.uid(),
    p_booking_id,
    trim(p_subject),
    v_cat,
    'open',
    v_artist_id
  )
  RETURNING * INTO v_ticket;

  INSERT INTO public.support_ticket_messages (ticket_id, sender_id, body)
  VALUES (v_ticket.id, auth.uid(), trim(p_body));

  RETURN v_ticket;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_staff_ticket(
  p_customer_id uuid,
  p_subject text,
  p_body text,
  p_category text DEFAULT 'general',
  p_booking_id uuid DEFAULT NULL
)
RETURNS public.support_tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket public.support_tickets%ROWTYPE;
  v_org_id uuid;
  v_cat text;
  v_is_admin boolean;
  v_is_artist boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  v_org_id := public.get_user_organization_id(auth.uid());
  IF v_org_id IS NULL OR NOT public.staff_can_access_org_tickets(v_org_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  v_is_admin := public.has_role(auth.uid(), 'admin'::public.app_role);
  v_is_artist := public.has_role(auth.uid(), 'artist'::public.app_role);

  IF NOT v_is_admin AND NOT v_is_artist THEN
    RAISE EXCEPTION 'Only artists or admins can start inbox messages';
  END IF;

  v_cat := lower(trim(coalesce(p_category, 'general')));
  IF v_cat NOT IN ('general', 'booking', 'deposit', 'design', 'aftercare') THEN
    v_cat := 'general';
  END IF;

  IF p_booking_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = p_booking_id
        AND b.organization_id = v_org_id
        AND b.client_user_id = p_customer_id
        AND (v_is_admin OR b.artist_id = auth.uid())
    ) THEN
      RAISE EXCEPTION 'Invalid booking for this customer';
    END IF;
  ELSIF v_is_artist AND NOT v_is_admin THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.organization_id = v_org_id
        AND b.client_user_id = p_customer_id
        AND b.artist_id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'You can only message customers on your bookings';
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.organization_id = v_org_id
      AND b.client_user_id = p_customer_id
  ) THEN
    RAISE EXCEPTION 'Customer is not linked to this studio';
  END IF;

  INSERT INTO public.support_tickets (
    organization_id, customer_id, booking_id, subject, category, status, assigned_artist_id
  )
  VALUES (
    v_org_id,
    p_customer_id,
    p_booking_id,
    trim(p_subject),
    v_cat,
    'open',
    auth.uid()
  )
  RETURNING * INTO v_ticket;

  INSERT INTO public.support_ticket_messages (ticket_id, sender_id, body)
  VALUES (v_ticket.id, auth.uid(), trim(p_body));

  RETURN v_ticket;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_support_ticket(uuid, text, text, text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_staff_ticket(uuid, text, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_artist(uuid, uuid) TO authenticated;
