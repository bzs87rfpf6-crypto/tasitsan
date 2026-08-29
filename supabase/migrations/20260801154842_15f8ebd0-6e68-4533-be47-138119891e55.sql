CREATE OR REPLACE FUNCTION public.unique_visitors_today()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH re AS (
    SELECT COALESCE(
      NULLIF(string_agg(pattern, '|'), ''),
      'bot|crawl|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegram|preview|headless|lighthouse|pagespeed|gtmetrix|pingdom|uptimerobot|semrush|ahrefs|mj12|dotbot|petalbot|yandex|baidu|duckduckbot|applebot|googlebot|bingbot|embedly|vercelbot|phantom|puppeteer|selenium'
    ) AS r
    FROM public.bot_filter_rules WHERE enabled = true
  )
  SELECT COUNT(DISTINCT COALESCE(NULLIF(ae.fingerprint,''), NULLIF(ae.visitor_id,''), ae.session_id))::int
  FROM public.analytics_events ae, re
  WHERE ae.created_at >= (date_trunc('day', now() AT TIME ZONE 'Europe/Istanbul')) AT TIME ZONE 'Europe/Istanbul'
    AND COALESCE(ae.is_bot, false) = false
    AND (ae.user_agent IS NULL OR ae.user_agent !~* re.r)
    AND COALESCE(ae.path, '') NOT LIKE '/api/%'
    AND COALESCE(ae.path, '') NOT LIKE '/admin%'
    AND COALESCE(NULLIF(ae.fingerprint,''), NULLIF(ae.visitor_id,''), ae.session_id) IS NOT NULL
    AND (ae.user_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = ae.user_id AND ur.role::text IN ('admin','super_admin')
    ))
$$;

GRANT EXECUTE ON FUNCTION public.unique_visitors_today() TO authenticated, service_role;

DO $do$
DECLARE
  src text;
  newsrc text;
BEGIN
  -- 1) admin_analytics_overview: bugünkü ziyaretçi
  SELECT pg_get_functiondef(p.oid) INTO src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'admin_analytics_overview';
  newsrc := replace(src,
    'COUNT(DISTINCT COALESCE(visitor_id, session_id)) FILTER (WHERE created_at >= _day_start) AS today',
    '(SELECT public.unique_visitors_today()) AS today');
  IF newsrc = src THEN RAISE EXCEPTION 'admin_analytics_overview today pattern not found'; END IF;
  EXECUTE newsrc;

  -- 2) admin_conversion_analytics: bugünkü gerçek kullanıcı
  SELECT pg_get_functiondef(p.oid) INTO src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'admin_conversion_analytics';
  newsrc := regexp_replace(src,
    'today_users AS \(\s*SELECT count\(DISTINCT session_id\)::int AS c\s*FROM analytics_events\s*WHERE created_at >= _today_start\s*AND COALESCE\(user_agent,''''\) !~\* ''[^'']*''\s*\)',
    'today_users AS (SELECT public.unique_visitors_today() AS c)');
  IF newsrc = src THEN RAISE EXCEPTION 'admin_conversion_analytics today_users pattern not found'; END IF;
  EXECUTE newsrc;

  -- 3) admin_visitor_report: bugünkü tekil ziyaretçi
  SELECT pg_get_functiondef(p.oid) INTO src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'admin_visitor_report';
  newsrc := replace(src,
    '''uniqueVisitorsToday'', (SELECT COUNT(DISTINCT vkey) FROM pv WHERE created_at >= _day_start)',
    '''uniqueVisitorsToday'', public.unique_visitors_today()');
  IF newsrc = src THEN RAISE EXCEPTION 'admin_visitor_report uniqueVisitorsToday pattern not found'; END IF;
  EXECUTE newsrc;
END
$do$;