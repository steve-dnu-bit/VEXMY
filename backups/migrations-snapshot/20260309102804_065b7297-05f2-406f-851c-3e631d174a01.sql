
CREATE TABLE public.channel_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  channel text NOT NULL,
  credentials jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, channel)
);

ALTER TABLE public.channel_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own connections"
  ON public.channel_connections FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own connections"
  ON public.channel_connections FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own connections"
  ON public.channel_connections FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own connections"
  ON public.channel_connections FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all connections"
  ON public.channel_connections FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
