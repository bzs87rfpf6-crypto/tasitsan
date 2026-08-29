
-- 1) Status enum
DO $$ BEGIN
  CREATE TYPE public.signup_failure_status AS ENUM ('pending','resolved','converted','dismissed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Table
CREATE TABLE IF NOT EXISTS public.signup_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid,
  status public.signup_failure_status NOT NULL DEFAULT 'pending',
  display_name text,
  email text,
  phone text,
  company_name text,
  error_code text,
  error_message text,
  ip text,
  user_agent text,
  form_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempt_count int NOT NULL DEFAULT 1,
  notified boolean NOT NULL DEFAULT false,
  created_user_id uuid,
  admin_notes text
);

CREATE INDEX IF NOT EXISTS signup_failures_created_at_idx ON public.signup_failures (created_at DESC);
CREATE INDEX IF NOT EXISTS signup_failures_status_idx ON public.signup_failures (status);
CREATE INDEX IF NOT EXISTS signup_failures_error_code_idx ON public.signup_failures (error_code);
CREATE INDEX IF NOT EXISTS signup_failures_email_idx ON public.signup_failures (lower(email));

-- 3) Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.signup_failures TO authenticated;
GRANT ALL ON public.signup_failures TO service_role;

-- 4) RLS
ALTER TABLE public.signup_failures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin read signup failures" ON public.signup_failures;
CREATE POLICY "admin read signup failures" ON public.signup_failures
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "admin update signup failures" ON public.signup_failures;
CREATE POLICY "admin update signup failures" ON public.signup_failures
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "admin delete signup failures" ON public.signup_failures;
CREATE POLICY "admin delete signup failures" ON public.signup_failures
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- No INSERT policy — inserts go through SECURITY DEFINER RPC below.

-- 5) updated_at trigger
DROP TRIGGER IF EXISTS signup_failures_set_updated ON public.signup_failures;
CREATE TRIGGER signup_failures_set_updated
BEFORE UPDATE ON public.signup_failures
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 6) Public RPC to log a failure (no auth required)
CREATE OR REPLACE FUNCTION public.log_signup_failure(
  _display_name text,
  _email text,
  _phone text,
  _company_name text,
  _error_code text,
  _error_message text,
  _user_agent text,
  _form_data jsonb,
  _ip text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_safe jsonb;
  v_recent int;
BEGIN
  -- strip sensitive keys
  v_safe := COALESCE(_form_data, '{}'::jsonb) - 'password' - 'newPassword' - 'currentPassword' - 'pwd' - 'pass';

  -- soft per-IP rate limit (max 20 per minute)
  IF _ip IS NOT NULL THEN
    SELECT count(*) INTO v_recent
      FROM public.signup_failures
     WHERE ip = _ip AND created_at > now() - interval '1 minute';
    IF v_recent >= 20 THEN
      RETURN NULL;
    END IF;
  END IF;

  INSERT INTO public.signup_failures(
    display_name, email, phone, company_name,
    error_code, error_message, ip, user_agent, form_data
  ) VALUES (
    NULLIF(trim(_display_name),''),
    lower(NULLIF(trim(_email),'')),
    NULLIF(trim(_phone),''),
    NULLIF(trim(_company_name),''),
    NULLIF(trim(_error_code),''),
    NULLIF(trim(_error_message),''),
    NULLIF(trim(_ip),''),
    NULLIF(trim(_user_agent),''),
    v_safe
  ) RETURNING id INTO v_id;

  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.log_signup_failure(text,text,text,text,text,text,text,jsonb,text) FROM public;
GRANT EXECUTE ON FUNCTION public.log_signup_failure(text,text,text,text,text,text,text,jsonb,text) TO anon, authenticated;

-- 7) Trigger: push admin_notifications row + mark notified
CREATE OR REPLACE FUNCTION public.notify_admin_signup_failure()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recent int := 0;
  v_pri text := 'normal';
BEGIN
  IF NEW.error_code IS NOT NULL THEN
    SELECT count(*) INTO v_recent
      FROM public.signup_failures
     WHERE error_code = NEW.error_code
       AND created_at > now() - interval '1 hour';
    IF v_recent >= 5 THEN v_pri := 'high'; END IF;
  END IF;

  INSERT INTO public.admin_notifications(kind, priority, title, body, link, related_id)
  VALUES (
    'signup_failure', v_pri,
    CASE WHEN v_pri = 'high' THEN '🚨 Üyelik hatası alarmı' ELSE 'Üyelik hatası' END,
    COALESCE(NEW.display_name, NEW.email, NEW.phone, 'Bilinmeyen kullanıcı') ||
      ' • ' || COALESCE(NEW.error_message, NEW.error_code, 'hata'),
    '/admin?tab=signup-failures',
    NEW.id
  );

  UPDATE public.signup_failures SET notified = true WHERE id = NEW.id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS signup_failures_notify ON public.signup_failures;
CREATE TRIGGER signup_failures_notify
AFTER INSERT ON public.signup_failures
FOR EACH ROW EXECUTE FUNCTION public.notify_admin_signup_failure();

-- 8) Stats RPC (admin only)
CREATE OR REPLACE FUNCTION public.signup_failures_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v jsonb; v_top jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  SELECT to_jsonb(t) INTO v FROM (
    SELECT
      count(*) FILTER (WHERE status = 'pending')                   AS pending,
      count(*) FILTER (WHERE status IN ('resolved','converted','dismissed')) AS resolved,
      count(*) FILTER (WHERE created_at > now() - interval '24 hours') AS last_24h,
      count(*) FILTER (WHERE created_at > now() - interval '7 days')  AS last_7d,
      count(*)                                                     AS total,
      count(*) FILTER (WHERE status = 'converted')                 AS converted
    FROM public.signup_failures
  ) t;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('error_code', error_code, 'count', c)), '[]'::jsonb)
    INTO v_top
    FROM (
      SELECT COALESCE(error_code,'(boş)') AS error_code, count(*)::int AS c
        FROM public.signup_failures
       WHERE created_at > now() - interval '30 days'
       GROUP BY 1 ORDER BY 2 DESC LIMIT 5
    ) x;

  RETURN v || jsonb_build_object('top_errors', v_top);
END $$;

GRANT EXECUTE ON FUNCTION public.signup_failures_stats() TO authenticated;

-- 9) Critical alert RPC (admin only): error codes occurring 5+ times in last 1h with at least one unresolved
CREATE OR REPLACE FUNCTION public.signup_failures_critical_alerts()
RETURNS TABLE(error_code text, occurrences int, last_at timestamptz)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'admin only';
  END IF;
  RETURN QUERY
  SELECT COALESCE(s.error_code,'(boş)') AS error_code,
         count(*)::int AS occurrences,
         max(s.created_at) AS last_at
    FROM public.signup_failures s
   WHERE s.created_at > now() - interval '1 hour'
   GROUP BY 1
  HAVING count(*) >= 5
     AND bool_or(s.status = 'pending')
   ORDER BY occurrences DESC;
END $$;

GRANT EXECUTE ON FUNCTION public.signup_failures_critical_alerts() TO authenticated;

-- 10) Conversion report
CREATE OR REPLACE FUNCTION public.signup_conversion_report(_days int DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from timestamptz;
  v_success bigint;
  v_fail bigint;
  v_top text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'admin only';
  END IF;
  v_from := now() - make_interval(days => GREATEST(1, LEAST(_days, 365)));

  SELECT count(*) INTO v_success
    FROM public.profiles
   WHERE created_at >= v_from;

  SELECT count(*) INTO v_fail
    FROM public.signup_failures
   WHERE created_at >= v_from;

  SELECT error_code INTO v_top FROM (
    SELECT COALESCE(error_code,'(boş)') AS error_code, count(*) AS c
      FROM public.signup_failures
     WHERE created_at >= v_from
     GROUP BY 1 ORDER BY 2 DESC LIMIT 1
  ) z;

  RETURN jsonb_build_object(
    'days', _days,
    'success', v_success,
    'failed',  v_fail,
    'total',   v_success + v_fail,
    'success_rate', CASE WHEN (v_success + v_fail) > 0
                    THEN round(100.0 * v_success / (v_success + v_fail), 1)
                    ELSE 100 END,
    'top_error', v_top
  );
END $$;

GRANT EXECUTE ON FUNCTION public.signup_conversion_report(int) TO authenticated;
