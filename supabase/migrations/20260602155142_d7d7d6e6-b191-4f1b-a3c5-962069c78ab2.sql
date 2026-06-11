
CREATE TABLE IF NOT EXISTS public.analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  session_id text,
  user_id uuid,
  path text,
  referrer text,
  city text,
  country text,
  device text,
  user_agent text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.analytics_events TO authenticated;
GRANT SELECT, INSERT ON public.analytics_events TO anon;
GRANT ALL ON public.analytics_events TO service_role;

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert analytics events"
  ON public.analytics_events FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Admins view analytics"
  ON public.analytics_events FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS analytics_events_created_at_idx ON public.analytics_events (created_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_event_type_idx ON public.analytics_events (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_session_idx ON public.analytics_events (session_id);

ALTER TABLE public.site_settings ADD COLUMN IF NOT EXISTS ga4_measurement_id text;
