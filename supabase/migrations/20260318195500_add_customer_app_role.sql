-- Must be separate from policies that reference 'customer' (Postgres enum commit rule).
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'customer';
