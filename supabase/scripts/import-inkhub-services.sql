-- Import services catalog from Inkhub (obxnxazrivonewlbyqap) into Velbok production.
-- Replaces default seed services with Brentwood Inkaholics' custom service list.
-- Safe to re-run: deletes all services then upserts by id (no FK references on services).

BEGIN;

DELETE FROM public.services;

INSERT INTO public.services (
  id, name, duration, booking_type, color, price, is_active, sort_order,
  created_by, created_at, updated_at, service_category
) VALUES
  ('35904f2c-bf4d-42cf-a741-5cbe6e83d43c', 'LASER TREATMENT', 45, 'laser-session', 'amber', NULL, true, 1,
   '00000000-0000-0000-0000-000000000000', '2026-03-17 14:25:18.978744+00', '2026-03-17 14:25:18.978744+00', 'laser'),
  ('867b91c8-ba1b-4147-a31b-eaad9ab40136', 'Ana Piercing', 30, 'piercing-session', 'pink', NULL, true, 2,
   '00000000-0000-0000-0000-000000000000', '2026-03-17 14:25:18.978744+00', '2026-03-17 14:25:18.978744+00', 'piercing'),
  ('8210e9e5-31d0-4a0b-b08c-d152690b16cc', 'Design session 2h', 120, 'consultation', 'violet', NULL, true, 3,
   '00000000-0000-0000-0000-000000000000', '2026-03-17 14:25:18.978744+00', '2026-03-17 14:25:18.978744+00', 'consultation'),
  ('b33f4b93-58d7-4d34-a054-61f26b89c765', 'Day Session 6h tattoo + 1.5h design', 450, 'session', 'gold', NULL, true, 4,
   '00000000-0000-0000-0000-000000000000', '2026-03-17 14:25:18.978744+00', '2026-03-17 14:25:18.978744+00', 'tattoo'),
  ('8768059a-ade6-4ef9-a474-8b274d763e14', 'Tattooing for 1 hour', 60, 'session', 'blue', NULL, true, 5,
   '00000000-0000-0000-0000-000000000000', '2026-03-17 14:25:18.978744+00', '2026-03-17 14:25:18.978744+00', 'tattoo'),
  ('0ebd0893-33eb-4f0f-bae7-12b468c45669', 'Tattooing for 2 hours', 120, 'session', 'blue', NULL, true, 6,
   '00000000-0000-0000-0000-000000000000', '2026-03-17 14:25:18.978744+00', '2026-03-17 14:25:18.978744+00', 'tattoo'),
  ('e0e7d468-76f5-4e4a-a828-3b04a3ee184b', 'Tattooing for 3 hours', 180, 'session', 'blue', NULL, true, 7,
   '00000000-0000-0000-0000-000000000000', '2026-03-17 14:25:18.978744+00', '2026-03-17 14:25:18.978744+00', 'tattoo'),
  ('85aab618-78a1-4682-9d40-4e78f10e293c', 'Tattooing for 6 hours', 360, 'session', 'blue', NULL, true, 8,
   '00000000-0000-0000-0000-000000000000', '2026-03-17 14:25:18.978744+00', '2026-03-17 14:25:18.978744+00', 'tattoo'),
  ('1d7aefb6-4aef-49ec-88ef-e5a0bb60b587', 'STEFAN Piercing', 15, 'piercing-session', 'orange', NULL, true, 9,
   '00000000-0000-0000-0000-000000000000', '2026-03-17 14:25:18.978744+00', '2026-03-17 14:25:18.978744+00', 'piercing'),
  ('365bfd46-4e75-4d2c-bdce-32e289c648f4', 'Tattooing for 4 hours', 240, 'session', 'blue', NULL, true, 10,
   '00000000-0000-0000-0000-000000000000', '2026-03-17 14:25:18.978744+00', '2026-03-17 14:25:18.978744+00', 'tattoo'),
  ('d6c067d1-4c35-4463-a665-59cadcc9a312', 'Tattooing for 5 hours', 300, 'session', 'blue', NULL, true, 11,
   '00000000-0000-0000-0000-000000000000', '2026-03-17 14:25:18.978744+00', '2026-03-17 14:25:18.978744+00', 'tattoo'),
  ('519d6883-a889-47e8-b1b1-cb18c965a2c4', 'Consultation for 15 minutes', 15, 'consultation', 'emerald', NULL, true, 12,
   '00000000-0000-0000-0000-000000000000', '2026-03-17 14:25:18.978744+00', '2026-03-17 14:25:18.978744+00', 'consultation'),
  ('24b936b9-88ff-4b6f-992d-e78c86df0604', 'Zoom/WhatsApp consultation 15 min', 15, 'consultation', 'cyan', NULL, true, 13,
   '00000000-0000-0000-0000-000000000000', '2026-03-17 14:25:18.978744+00', '2026-03-17 14:25:18.978744+00', 'consultation'),
  ('e0b93247-e210-47d3-b946-aafd96468880', 'Laser service 30 minutes', 30, 'laser-session', 'red', NULL, true, 14,
   '00000000-0000-0000-0000-000000000000', '2026-03-17 14:25:18.978744+00', '2026-03-17 14:25:18.978744+00', 'laser'),
  ('ff07327a-0531-45e6-a085-3ecfa6dcf42b', 'Laser Treatment 1 hour', 60, 'session', 'red', NULL, true, 15,
   '00000000-0000-0000-0000-000000000000', '2026-03-17 14:25:18.978744+00', '2026-03-17 14:25:18.978744+00', 'tattoo'),
  ('73b6ccc8-f01b-4d05-8f24-32ca5d1b5cda', 'Patch test for Laser Treatment', 15, 'laser-session', 'red', NULL, true, 16,
   '00000000-0000-0000-0000-000000000000', '2026-03-17 14:25:18.978744+00', '2026-03-17 14:25:18.978744+00', 'laser'),
  ('2c704caf-f1ac-40db-8697-70e2f1830fdd', 'Carbon Skin Rejuvenation', 60, 'laser-session', 'red', NULL, true, 17,
   '00000000-0000-0000-0000-000000000000', '2026-03-17 14:25:18.978744+00', '2026-03-17 14:25:18.978744+00', 'laser'),
  ('c209d805-2158-4da1-8417-bbc2c4b52b5e', 'Piercing', 30, 'piercing-session', 'blue', NULL, true, 17,
   '28be2d2d-1121-46d7-9760-cdcd30062407', '2026-05-12 16:44:11.041513+00', '2026-05-12 16:44:11.041513+00', 'piercing'),
  ('096d2fc4-b238-4e2e-b2ac-a7c33ed28db8', 'Event', 1, 'consultation', 'orange', NULL, true, 18,
   '28be2d2d-1121-46d7-9760-cdcd30062407', '2026-05-15 11:30:16.464089+00', '2026-05-15 11:30:16.464089+00', 'consultation'),
  ('2e2e0a3a-fb2d-4a2a-af1f-1436ca1ac2ff', 'Touch-Up', 30, 'session', 'blue', NULL, true, 19,
   '28be2d2d-1121-46d7-9760-cdcd30062407', '2026-05-26 17:11:05.128382+00', '2026-05-26 17:11:05.128382+00', 'tattoo');

COMMIT;
