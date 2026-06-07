
-- =========================================================
-- security_events: audit log
-- =========================================================
CREATE TABLE IF NOT EXISTS public.security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  user_id uuid,
  ip text,
  user_agent text,
  route text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_security_events_created ON public.security_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_type ON public.security_events (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_severity ON public.security_events (severity, created_at DESC);

GRANT SELECT ON public.security_events TO authenticated;
GRANT ALL ON public.security_events TO service_role;
ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "security_events_admin_read" ON public.security_events;
CREATE POLICY "security_events_admin_read" ON public.security_events
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- =========================================================
-- auth_failures: brute-force tracking
-- =========================================================
CREATE TABLE IF NOT EXISTS public.auth_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier text NOT NULL,
  kind text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auth_failures_id_time ON public.auth_failures (identifier, created_at DESC);

GRANT ALL ON public.auth_failures TO service_role;
ALTER TABLE public.auth_failures ENABLE ROW LEVEL SECURITY;
-- service-role only; no policies for authenticated/anon

-- =========================================================
-- rate_limit_buckets: simple fixed-window limiter
-- =========================================================
CREATE TABLE IF NOT EXISTS public.rate_limit_buckets (
  bucket_key text PRIMARY KEY,
  window_start timestamptz NOT NULL DEFAULT now(),
  count int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.rate_limit_buckets TO service_role;
ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;
-- service-role only

-- =========================================================
-- Rate limit RPC (server-side use only, called with service role)
-- =========================================================
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  _key text, _max int, _window_seconds int
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_now timestamptz := now();
  v_count int;
  v_start timestamptz;
BEGIN
  INSERT INTO public.rate_limit_buckets(bucket_key, window_start, count)
    VALUES (_key, v_now, 1)
    ON CONFLICT (bucket_key) DO UPDATE
      SET count = CASE WHEN public.rate_limit_buckets.window_start < v_now - make_interval(secs => _window_seconds)
                       THEN 1
                       ELSE public.rate_limit_buckets.count + 1 END,
          window_start = CASE WHEN public.rate_limit_buckets.window_start < v_now - make_interval(secs => _window_seconds)
                              THEN v_now
                              ELSE public.rate_limit_buckets.window_start END,
          updated_at = v_now
    RETURNING count, window_start INTO v_count, v_start;

  RETURN jsonb_build_object(
    'allowed', v_count <= _max,
    'count', v_count,
    'limit', _max,
    'retry_after_seconds', GREATEST(0, _window_seconds - EXTRACT(EPOCH FROM (v_now - v_start))::int)
  );
END $$;

-- =========================================================
-- Auth lockout RPCs
-- =========================================================
CREATE OR REPLACE FUNCTION public.check_auth_lockout(_identifier text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int;
BEGIN
  SELECT count(*) INTO v_count
    FROM public.auth_failures
   WHERE identifier = lower(_identifier)
     AND created_at > now() - interval '15 minutes';
  RETURN jsonb_build_object('locked', v_count >= 5, 'fail_count', v_count);
END $$;

CREATE OR REPLACE FUNCTION public.record_auth_failure(_identifier text, _kind text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.auth_failures(identifier, kind) VALUES (lower(_identifier), _kind);
  DELETE FROM public.auth_failures WHERE created_at < now() - interval '7 days';
END $$;

CREATE OR REPLACE FUNCTION public.clear_auth_failures(_identifier text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.auth_failures WHERE identifier = lower(_identifier);
END $$;
