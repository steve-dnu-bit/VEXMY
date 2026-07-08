-- Restore Brentwood Inkaholics custom service catalog (from import-inkhub-services.sql).
-- Replaces the five default org services seeded by services_organization_scoped migration.
-- Safe to re-run: deletes only Brentwood Inkaholics services, then upserts by id.

BEGIN;

DO $$
DECLARE
  v_org_id uuid := 'f58d5887-a6d7-42f8-8abd-9c6f08b80d01'; -- Brentwood Inkaholics (active)
  v_owner_id uuid := '1706c538-1690-44bb-8c27-ba52287307ea'; -- mr.tattooist@hotmail.com
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.organizations
    WHERE id = v_org_id AND slug = 'brentwood-inkaholics' AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Expected active Brentwood Inkaholics org not found (id %)', v_org_id;
  END IF;

  DELETE FROM public.services WHERE organization_id = v_org_id;

  INSERT INTO public.services (
    id, organization_id, name, duration, booking_type, color, price, is_active, sort_order,
    created_by, created_at, updated_at, service_category
  ) VALUES
    ('35904f2c-bf4d-42cf-a741-5cbe6e83d43c', v_org_id, 'LASER TREATMENT', 45, 'laser-session', 'amber', NULL, true, 1,
     v_owner_id, '2026-03-17 14:25:18.978744+00', '2026-03-17 14:25:18.978744+00', 'laser'),
    ('867b91c8-ba1b-4147-a31b-eaad9ab40136', v_org_id, 'Ana Piercing', 30, 'piercing-session', 'pink', NULL, true, 2,
     v_owner_id, '2026-03-17 14:25:18.978744+00', '2026-03-17 14:25:18.978744+00', 'piercing'),
    ('8210e9e5-31d0-4a0b-b08c-d152690b16cc', v_org_id, 'Design session 2h', 120, 'consultation', 'violet', NULL, true, 3,
     v_owner_id, '2026-03-17 14:25:18.978744+00', '2026-03-17 14:25:18.978744+00', 'consultation'),
    ('b33f4b93-58d7-4d34-a054-61f26b89c765', v_org_id, 'Day Session 6h tattoo + 1.5h design', 450, 'session', 'gold', NULL, true, 4,
     v_owner_id, '2026-03-17 14:25:18.978744+00', '2026-03-17 14:25:18.978744+00', 'tattoo'),
    ('8768059a-ade6-4ef9-a474-8b274d763e14', v_org_id, 'Tattooing for 1 hour', 60, 'session', 'blue', NULL, true, 5,
     v_owner_id, '2026-03-17 14:25:18.978744+00', '2026-03-17 14:25:18.978744+00', 'tattoo'),
    ('0ebd0893-33eb-4f0f-bae7-12b468c45669', v_org_id, 'Tattooing for 2 hours', 120, 'session', 'blue', NULL, true, 6,
     v_owner_id, '2026-03-17 14:25:18.978744+00', '2026-03-17 14:25:18.978744+00', 'tattoo'),
    ('e0e7d468-76f5-4e4a-a828-3b04a3ee184b', v_org_id, 'Tattooing for 3 hours', 180, 'session', 'blue', NULL, true, 7,
     v_owner_id, '2026-03-17 14:25:18.978744+00', '2026-03-17 14:25:18.978744+00', 'tattoo'),
    ('85aab618-78a1-4682-9d40-4e78f10e293c', v_org_id, 'Tattooing for 6 hours', 360, 'session', 'blue', NULL, true, 8,
     v_owner_id, '2026-03-17 14:25:18.978744+00', '2026-03-17 14:25:18.978744+00', 'tattoo'),
    ('1d7aefb6-4aef-49ec-88ef-e5a0bb60b587', v_org_id, 'STEFAN Piercing', 15, 'piercing-session', 'orange', NULL, true, 9,
     v_owner_id, '2026-03-17 14:25:18.978744+00', '2026-03-17 14:25:18.978744+00', 'piercing'),
    ('365bfd46-4e75-4d2c-bdce-32e289c648f4', v_org_id, 'Tattooing for 4 hours', 240, 'session', 'blue', NULL, true, 10,
     v_owner_id, '2026-03-17 14:25:18.978744+00', '2026-03-17 14:25:18.978744+00', 'tattoo'),
    ('d6c067d1-4c35-4463-a665-59cadcc9a312', v_org_id, 'Tattooing for 5 hours', 300, 'session', 'blue', NULL, true, 11,
     v_owner_id, '2026-03-17 14:25:18.978744+00', '2026-03-17 14:25:18.978744+00', 'tattoo'),
    ('519d6883-a889-47e8-b1b1-cb18c965a2c4', v_org_id, 'Consultation for 15 minutes', 15, 'consultation', 'emerald', NULL, true, 12,
     v_owner_id, '2026-03-17 14:25:18.978744+00', '2026-03-17 14:25:18.978744+00', 'consultation'),
    ('24b936b9-88ff-4b6f-992d-e78c86df0604', v_org_id, 'Zoom/WhatsApp consultation 15 min', 15, 'consultation', 'cyan', NULL, true, 13,
     v_owner_id, '2026-03-17 14:25:18.978744+00', '2026-03-17 14:25:18.978744+00', 'consultation'),
    ('e0b93247-e210-47d3-b946-aafd96468880', v_org_id, 'Laser service 30 minutes', 30, 'laser-session', 'red', NULL, true, 14,
     v_owner_id, '2026-03-17 14:25:18.978744+00', '2026-03-17 14:25:18.978744+00', 'laser'),
    ('ff07327a-0531-45e6-a085-3ecfa6dcf42b', v_org_id, 'Laser Treatment 1 hour', 60, 'session', 'red', NULL, true, 15,
     v_owner_id, '2026-03-17 14:25:18.978744+00', '2026-03-17 14:25:18.978744+00', 'tattoo'),
    ('73b6ccc8-f01b-4d05-8f24-32ca5d1b5cda', v_org_id, 'Patch test for Laser Treatment', 15, 'laser-session', 'red', NULL, true, 16,
     v_owner_id, '2026-03-17 14:25:18.978744+00', '2026-03-17 14:25:18.978744+00', 'laser'),
    ('2c704caf-f1ac-40db-8697-70e2f1830fdd', v_org_id, 'Carbon Skin Rejuvenation', 60, 'laser-session', 'red', NULL, true, 17,
     v_owner_id, '2026-03-17 14:25:18.978744+00', '2026-03-17 14:25:18.978744+00', 'laser'),
    ('c209d805-2158-4da1-8417-bbc2c4b52b5e', v_org_id, 'Piercing', 30, 'piercing-session', 'blue', NULL, true, 18,
     '28be2d2d-1121-46d7-9760-cdcd30062407', '2026-05-12 16:44:11.041513+00', '2026-05-12 16:44:11.041513+00', 'piercing'),
    ('096d2fc4-b238-4e2e-b2ac-a7c33ed28db8', v_org_id, 'Event', 1, 'consultation', 'orange', NULL, true, 19,
     '28be2d2d-1121-46d7-9760-cdcd30062407', '2026-05-15 11:30:16.464089+00', '2026-05-15 11:30:16.464089+00', 'consultation'),
    ('2e2e0a3a-fb2d-4a2a-af1f-1436ca1ac2ff', v_org_id, 'Touch-Up', 30, 'session', 'blue', NULL, true, 20,
     '28be2d2d-1121-46d7-9760-cdcd30062407', '2026-05-26 17:11:05.128382+00', '2026-05-26 17:11:05.128382+00', 'tattoo')
  ON CONFLICT (id) DO UPDATE SET
    organization_id = EXCLUDED.organization_id,
    name = EXCLUDED.name,
    duration = EXCLUDED.duration,
    booking_type = EXCLUDED.booking_type,
    color = EXCLUDED.color,
    price = EXCLUDED.price,
    is_active = EXCLUDED.is_active,
    sort_order = EXCLUDED.sort_order,
    service_category = EXCLUDED.service_category,
    updated_at = now();

  RAISE NOTICE 'Restored % services for Brentwood Inkaholics', (SELECT COUNT(*) FROM public.services WHERE organization_id = v_org_id);
END $$;

COMMIT;

-- Verify
SELECT id, name, duration, booking_type, sort_order
FROM public.services
WHERE organization_id = 'f58d5887-a6d7-42f8-8abd-9c6f08b80d01'
ORDER BY sort_order;
