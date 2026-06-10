-- All self-serve plans include the same features; only max_artist_seats differs.

UPDATE public.subscription_plans SET
  description = 'Full Velbok platform — up to 3 artists.',
  features = '{"schedule":true,"clients":true,"consent":true,"customer_portal":true,"reminders":true,"stripe_deposits":true,"invoicing":true,"staff_inbox":true,"stock":true,"billing":true,"stencil":true,"dashboard":true,"aftercare":true}'::jsonb,
  updated_at = now()
WHERE id = 'starter';

UPDATE public.subscription_plans SET
  description = 'Full Velbok platform — up to 6 artists.',
  features = '{"schedule":true,"clients":true,"consent":true,"customer_portal":true,"reminders":true,"stripe_deposits":true,"invoicing":true,"staff_inbox":true,"stock":true,"billing":true,"stencil":true,"dashboard":true,"aftercare":true}'::jsonb,
  updated_at = now()
WHERE id = 'studio';

UPDATE public.subscription_plans SET
  description = 'Full Velbok platform — up to 10 artists.',
  features = '{"schedule":true,"clients":true,"consent":true,"customer_portal":true,"reminders":true,"stripe_deposits":true,"invoicing":true,"staff_inbox":true,"stock":true,"billing":true,"stencil":true,"dashboard":true,"aftercare":true}'::jsonb,
  updated_at = now()
WHERE id = 'enterprise';
