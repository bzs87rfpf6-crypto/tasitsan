ALTER TABLE public.analytics_events ADD COLUMN IF NOT EXISTS is_internal boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_analytics_events_internal ON public.analytics_events (is_internal, created_at DESC);

-- 3 argümanlı overload: iç (geliştirici/önizleme) oturumları da hariç tutar
CREATE OR REPLACE FUNCTION public.is_excluded_actor(_path text, _user_id uuid, _is_internal boolean)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(_is_internal, false) OR public.is_excluded_actor(_path, _user_id);
$function$;

-- Human view: iç oturumları dışla
DROP VIEW IF EXISTS public.analytics_events_human;
CREATE VIEW public.analytics_events_human
WITH (security_invoker = true) AS
  SELECT id, event_type, session_id, user_id, path, referrer, city, country,
         device, user_agent, metadata, created_at, visitor_id, fingerprint,
         duration_ms, engagement, is_bot, is_internal
    FROM public.analytics_events e
   WHERE COALESCE(is_bot, false) = false
     AND NOT public.is_bot_ua(user_agent)
     AND public.is_js_visitor(session_id, visitor_id, fingerprint)
     AND NOT public.is_excluded_actor(path, user_id, is_internal);

GRANT SELECT ON public.analytics_events_human TO authenticated, service_role;

DO $do$
DECLARE d text;
BEGIN
  -- admin_visitor_report: iç oturumları hariç tut
  d := pg_get_functiondef('public.admin_visitor_report(integer)'::regprocedure);
  d := replace(d, 'public.is_excluded_actor(e.path, e.user_id)', 'public.is_excluded_actor(e.path, e.user_id, e.is_internal)');
  EXECUTE d;

  -- admin_live_traffic: admin/geliştirici oturumlarını sil değil, ayrı kategoride say
  d := pg_get_functiondef('public.admin_live_traffic(boolean)'::regprocedure);
  d := replace(d,
    'AND NOT public.is_excluded_actor(path, user_id)',
    'AND COALESCE(path,'''') NOT LIKE ''/api/%''');
  d := replace(d,
    'bool_or(COALESCE(e.is_bot,false) OR public.is_bot_ua(e.user_agent)) AS is_bot_ua,',
    'bool_or(COALESCE(e.is_bot,false) OR public.is_bot_ua(e.user_agent)) AS is_bot_ua, bool_or(COALESCE(e.is_internal,false) OR COALESCE(e.path,'''') LIKE ''/admin%'') AS is_dev,');
  d := replace(d,
    'WHEN is_admin_user THEN ''admin''',
    'WHEN is_admin_user OR is_dev THEN ''admin''');
  EXECUTE d;
END
$do$;