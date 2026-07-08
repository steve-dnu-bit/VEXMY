-- Vapi voice agent call transcripts (Velbok platform support line).

CREATE TABLE public.vapi_call_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vapi_call_id text NOT NULL UNIQUE,
  assistant_id text,
  call_type text,
  customer_number text,
  customer_name text,
  customer_email text,
  ended_reason text,
  duration_seconds numeric,
  cost numeric,
  transcript text,
  summary text,
  recording_url text,
  messages jsonb,
  started_at timestamptz,
  ended_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_vapi_call_logs_created_at
  ON public.vapi_call_logs (created_at DESC);

ALTER TABLE public.vapi_call_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins read vapi call logs"
  ON public.vapi_call_logs FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.platform_admin_list_vapi_calls(_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.platform_admin_assert();

  RETURN COALESCE(
    (
      SELECT jsonb_agg(row_data ORDER BY row_data ->> 'createdAt' DESC)
      FROM (
        SELECT jsonb_build_object(
          'id', v.id,
          'vapiCallId', v.vapi_call_id,
          'assistantId', v.assistant_id,
          'customerNumber', v.customer_number,
          'customerName', v.customer_name,
          'customerEmail', v.customer_email,
          'endedReason', v.ended_reason,
          'durationSeconds', v.duration_seconds,
          'transcript', v.transcript,
          'summary', v.summary,
          'recordingUrl', v.recording_url,
          'startedAt', v.started_at,
          'endedAt', v.ended_at,
          'createdAt', v.created_at
        ) AS row_data
        FROM public.vapi_call_logs v
        ORDER BY v.created_at DESC
        LIMIT GREATEST(1, LEAST(COALESCE(_limit, 50), 200))
      ) sub
    ),
    '[]'::jsonb
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.platform_admin_list_vapi_calls(integer) TO authenticated;
