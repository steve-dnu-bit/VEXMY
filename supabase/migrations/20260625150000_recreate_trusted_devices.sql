-- Recreate trusted_devices after revert migration dropped it.

CREATE TABLE IF NOT EXISTS public.trusted_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_token_hash text NOT NULL,
  factor_ids text[] NOT NULL DEFAULT '{}',
  user_agent text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS trusted_devices_user_token_idx
  ON public.trusted_devices (user_id, device_token_hash);

CREATE INDEX IF NOT EXISTS trusted_devices_user_expires_idx
  ON public.trusted_devices (user_id, expires_at)
  WHERE revoked_at IS NULL;

ALTER TABLE public.trusted_devices ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.trusted_devices IS
  'Hashed browser device tokens that may bypass the MFA UI until expiry or factor rotation.';
