-- One-time data fix: user cannot pass booking RLS (missing artist role or schedule permission).
-- UUID: 4ee05ccd-6b8c-4f98-8cbb-ee0a4d10db9b (from support). Safe to re-run.

INSERT INTO public.user_roles (user_id, role)
VALUES ('4ee05ccd-6b8c-4f98-8cbb-ee0a4d10db9b'::uuid, 'artist'::public.app_role)
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.user_permissions (user_id, feature, granted)
VALUES ('4ee05ccd-6b8c-4f98-8cbb-ee0a4d10db9b'::uuid, 'schedule', true)
ON CONFLICT (user_id, feature) DO UPDATE SET granted = EXCLUDED.granted;
