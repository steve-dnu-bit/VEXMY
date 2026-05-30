-- Artist seat packages: Starter 3, Studio 6, Enterprise 10.

UPDATE public.subscription_plans SET
  max_artist_seats = 3,
  updated_at = now()
WHERE id = 'starter';

UPDATE public.subscription_plans SET
  max_artist_seats = 6,
  description = 'Growing shop — full toolkit with deposits, inbox, stock (up to 6 artists).',
  updated_at = now()
WHERE id = 'studio';

UPDATE public.subscription_plans SET
  max_artist_seats = 10,
  updated_at = now()
WHERE id = 'enterprise';
