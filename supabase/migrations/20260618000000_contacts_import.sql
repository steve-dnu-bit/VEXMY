-- Client CSV/JSON imports live here — not as fake bookings on the schedule.

CREATE TABLE IF NOT EXISTS public.contacts_import (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  phone text,
  tattoo_style text,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.contacts_import ADD COLUMN IF NOT EXISTS tattoo_style text;
ALTER TABLE public.contacts_import ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.contacts_import ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS contacts_import_org_idx
  ON public.contacts_import (organization_id, lower(name));

CREATE UNIQUE INDEX IF NOT EXISTS contacts_import_org_email_uidx
  ON public.contacts_import (organization_id, lower(trim(email)))
  WHERE email IS NOT NULL AND trim(email) <> '';

ALTER TABLE public.contacts_import ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can view imported contacts" ON public.contacts_import;
CREATE POLICY "Org members can view imported contacts"
  ON public.contacts_import FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "Org staff can manage imported contacts" ON public.contacts_import;
CREATE POLICY "Org staff can manage imported contacts"
  ON public.contacts_import FOR ALL TO authenticated
  USING (
    public.is_org_member(organization_id)
    AND (
      public.is_org_admin(organization_id)
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'artist'::public.app_role)
      OR public.has_permission(auth.uid(), 'billing')
    )
  )
  WITH CHECK (
    public.is_org_member(organization_id)
    AND (
      public.is_org_admin(organization_id)
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'artist'::public.app_role)
      OR public.has_permission(auth.uid(), 'billing')
    )
  );

-- Move legacy CSV/JSON placeholder bookings into contacts_import, then remove them from the schedule.
INSERT INTO public.contacts_import (organization_id, name, email, phone, tattoo_style, notes, created_at)
SELECT DISTINCT ON (
  b.organization_id,
  coalesce(nullif(lower(regexp_replace(trim(b.client_email), '^mailto:', '', 'i')), ''), lower(trim(b.client_name)))
)
  b.organization_id,
  trim(b.client_name),
  nullif(lower(regexp_replace(trim(b.client_email), '^mailto:', '', 'i')), ''),
  nullif(trim(b.client_phone), ''),
  b.tattoo_style,
  b.notes,
  b.created_at
FROM public.bookings b
WHERE b.organization_id IS NOT NULL
  AND b.booking_type = 'consultation'
  AND (
    b.notes ILIKE 'Imported from CSV%'
    OR b.notes ILIKE 'Imported from JSON%'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.contacts_import c
    WHERE c.organization_id = b.organization_id
      AND (
        (
          nullif(lower(regexp_replace(trim(b.client_email), '^mailto:', '', 'i')), '') IS NOT NULL
          AND lower(trim(c.email)) = lower(regexp_replace(trim(b.client_email), '^mailto:', '', 'i'))
        )
        OR (
          coalesce(nullif(trim(b.client_email), ''), '') = ''
          AND lower(trim(c.name)) = lower(trim(b.client_name))
          AND coalesce(regexp_replace(c.phone, '\s', '', 'g'), '') = coalesce(regexp_replace(b.client_phone, '\s', '', 'g'), '')
        )
      )
  )
ORDER BY
  b.organization_id,
  coalesce(nullif(lower(regexp_replace(trim(b.client_email), '^mailto:', '', 'i')), ''), lower(trim(b.client_name))),
  b.created_at DESC;

DELETE FROM public.bookings
WHERE booking_type = 'consultation'
  AND (
    notes ILIKE 'Imported from CSV%'
    OR notes ILIKE 'Imported from JSON%'
  );
