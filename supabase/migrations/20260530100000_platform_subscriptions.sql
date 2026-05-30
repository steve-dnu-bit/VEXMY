-- Platform subscription & multi-tenant organization schema.
-- Categorises billing data separately from studio operational data for scale and security.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE public.subscription_status AS ENUM (
    'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'incomplete', 'paused'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.org_member_role AS ENUM ('owner', 'admin', 'member');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Subscription plan catalog (platform billing — not studio services)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text,
  price_gbp_monthly numeric(10, 2),
  stripe_price_id text,
  max_artist_seats integer,
  trial_days integer NOT NULL DEFAULT 14,
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  is_self_serve boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.subscription_plans IS 'VexMy SaaS plan catalog. Stripe price IDs are set via env secrets at checkout time.';
COMMENT ON COLUMN public.subscription_plans.features IS 'Feature flags: stripe_deposits, invoicing, staff_inbox, stock, billing, dashboard, stencil, etc.';

INSERT INTO public.subscription_plans (id, name, description, price_gbp_monthly, max_artist_seats, trial_days, features, sort_order, is_self_serve)
VALUES
  (
    'starter',
    'Starter',
    'Solo artist — schedule, CRM, consent, customer portal.',
    49.00,
    1,
    14,
    '{"schedule":true,"clients":true,"consent":true,"customer_portal":true,"reminders":true,"stripe_deposits":false,"invoicing":false,"staff_inbox":false,"stock":false,"billing":false,"stencil":true,"dashboard":true}'::jsonb,
    1,
    true
  ),
  (
    'studio',
    'Studio',
    'Growing shop — deposits, invoicing, inbox, stock, up to 5 seats.',
    99.00,
    5,
    14,
    '{"schedule":true,"clients":true,"consent":true,"customer_portal":true,"reminders":true,"stripe_deposits":true,"invoicing":true,"staff_inbox":true,"stock":true,"billing":true,"stencil":true,"dashboard":true,"aftercare":true}'::jsonb,
    2,
    true
  ),
  (
    'enterprise',
    'Enterprise',
    'Multi-location — unlimited seats, dedicated onboarding.',
    NULL,
    NULL,
    0,
    '{"schedule":true,"clients":true,"consent":true,"customer_portal":true,"reminders":true,"stripe_deposits":true,"invoicing":true,"staff_inbox":true,"stock":true,"billing":true,"stencil":true,"dashboard":true,"aftercare":true,"sla":true,"migration":true}'::jsonb,
    3,
    false
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

-- ---------------------------------------------------------------------------
-- Organizations (tenants)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL,
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  stripe_customer_id text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended', 'canceled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organizations_slug_format CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_slug ON public.organizations (slug);
CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_stripe_customer ON public.organizations (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_organizations_owner ON public.organizations (owner_user_id)
  WHERE owner_user_id IS NOT NULL;

COMMENT ON TABLE public.organizations IS 'Studio tenant. One org per subscribing shop.';

-- Link shop_settings to org (multi-tenant foundation)
ALTER TABLE public.shop_settings
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_shop_settings_organization ON public.shop_settings (organization_id)
  WHERE organization_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Organization membership
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.org_member_role NOT NULL DEFAULT 'member',
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_user ON public.organization_members (user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org ON public.organization_members (organization_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org_role ON public.organization_members (organization_id, role);

-- ---------------------------------------------------------------------------
-- Active platform subscriptions (Stripe-synced)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.platform_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  plan_id text NOT NULL REFERENCES public.subscription_plans(id),
  stripe_subscription_id text,
  stripe_price_id text,
  status public.subscription_status NOT NULL DEFAULT 'incomplete',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  canceled_at timestamptz,
  trial_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_subscriptions_one_per_org UNIQUE (organization_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_subs_stripe ON public.platform_subscriptions (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_platform_subs_status ON public.platform_subscriptions (status);
CREATE INDEX IF NOT EXISTS idx_platform_subs_plan ON public.platform_subscriptions (plan_id);

COMMENT ON TABLE public.platform_subscriptions IS 'Stripe subscription state for org billing. Writes from webhooks use service role only.';

-- ---------------------------------------------------------------------------
-- Subscription audit log (security & debugging)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.subscription_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  stripe_event_id text,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_events_stripe ON public.subscription_events (stripe_event_id)
  WHERE stripe_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_subscription_events_org_time ON public.subscription_events (organization_id, processed_at DESC);

-- ---------------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_user_organization_id(_user_id uuid DEFAULT auth.uid())
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id
  FROM public.organization_members
  WHERE user_id = _user_id
  ORDER BY
    CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
    joined_at ASC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_org_member(_org_id uuid, _user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = _org_id AND user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_admin(_org_id uuid, _user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = _org_id
      AND user_id = _user_id
      AND role IN ('owner', 'admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.org_has_active_subscription(_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_subscriptions
    WHERE organization_id = _org_id
      AND status IN ('trialing', 'active', 'past_due')
  );
$$;

CREATE OR REPLACE FUNCTION public.org_plan_has_feature(_org_id uuid, _feature text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT (sp.features ->> _feature)::boolean
      FROM public.platform_subscriptions ps
      JOIN public.subscription_plans sp ON sp.id = ps.plan_id
      WHERE ps.organization_id = _org_id
        AND ps.status IN ('trialing', 'active', 'past_due')
      LIMIT 1
    ),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.org_artist_seat_count(_org_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer
  FROM public.organization_members om
  JOIN public.user_roles ur ON ur.user_id = om.user_id
  WHERE om.organization_id = _org_id
    AND ur.role IN ('admin', 'artist');
$$;

CREATE OR REPLACE FUNCTION public.org_can_add_artist_seat(_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN sp.max_artist_seats IS NULL THEN true
    ELSE public.org_artist_seat_count(_org_id) < sp.max_artist_seats
  END
  FROM public.platform_subscriptions ps
  JOIN public.subscription_plans sp ON sp.id = ps.plan_id
  WHERE ps.organization_id = _org_id
    AND ps.status IN ('trialing', 'active', 'past_due')
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.set_organizations_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS organizations_updated_at ON public.organizations;
CREATE TRIGGER organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.set_organizations_updated_at();

CREATE OR REPLACE FUNCTION public.set_platform_subscriptions_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS platform_subscriptions_updated_at ON public.platform_subscriptions;
CREATE TRIGGER platform_subscriptions_updated_at
  BEFORE UPDATE ON public.platform_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_platform_subscriptions_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;

-- Plans: readable by anyone authenticated (and anon for marketing)
DROP POLICY IF EXISTS "Anyone can read active subscription plans" ON public.subscription_plans;
CREATE POLICY "Anyone can read active subscription plans"
  ON public.subscription_plans FOR SELECT
  USING (is_active = true);

-- Organizations: members read; owners/admins update name; insert via edge function (service role)
DROP POLICY IF EXISTS "Members can view their organization" ON public.organizations;
CREATE POLICY "Members can view their organization"
  ON public.organizations FOR SELECT TO authenticated
  USING (public.is_org_member(id));

DROP POLICY IF EXISTS "Org admins can update organization" ON public.organizations;
CREATE POLICY "Org admins can update organization"
  ON public.organizations FOR UPDATE TO authenticated
  USING (public.is_org_admin(id))
  WITH CHECK (public.is_org_admin(id));

-- Members: org members can view roster
DROP POLICY IF EXISTS "Members can view org roster" ON public.organization_members;
CREATE POLICY "Members can view org roster"
  ON public.organization_members FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

-- Subscriptions: org members read only (writes via service role webhooks)
DROP POLICY IF EXISTS "Members can view org subscription" ON public.platform_subscriptions;
CREATE POLICY "Members can view org subscription"
  ON public.platform_subscriptions FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

-- Audit: platform admins only
DROP POLICY IF EXISTS "Admins can view subscription events" ON public.subscription_events;
CREATE POLICY "Admins can view subscription events"
  ON public.subscription_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

GRANT SELECT ON public.subscription_plans TO anon, authenticated;

-- Bootstrap existing single-tenant deployment into default organization
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  default_org_id uuid;
  default_shop_id uuid;
  first_admin_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.organizations LIMIT 1) THEN
    SELECT user_id INTO first_admin_id
    FROM public.user_roles
    WHERE role = 'admin'
    LIMIT 1;

    INSERT INTO public.organizations (name, slug, owner_user_id, status)
    VALUES ('Default Studio', 'default-studio', first_admin_id, 'active')
    RETURNING id INTO default_org_id;

    IF first_admin_id IS NOT NULL THEN
      INSERT INTO public.organization_members (organization_id, user_id, role)
      VALUES (default_org_id, first_admin_id, 'owner')
      ON CONFLICT DO NOTHING;
    END IF;

    SELECT id INTO default_shop_id FROM public.shop_settings ORDER BY created_at LIMIT 1;
    IF default_shop_id IS NOT NULL THEN
      UPDATE public.shop_settings SET organization_id = default_org_id WHERE id = default_shop_id;
    END IF;

    INSERT INTO public.platform_subscriptions (organization_id, plan_id, status, trial_end)
    VALUES (default_org_id, 'studio', 'active', NULL)
    ON CONFLICT (organization_id) DO NOTHING;

    UPDATE public.organizations SET status = 'active' WHERE id = default_org_id;
  END IF;
END $$;

-- Grant execute on helper functions to authenticated users
GRANT EXECUTE ON FUNCTION public.get_user_organization_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_admin(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.org_has_active_subscription(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.org_plan_has_feature(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.org_artist_seat_count(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.org_can_add_artist_seat(uuid) TO authenticated;
