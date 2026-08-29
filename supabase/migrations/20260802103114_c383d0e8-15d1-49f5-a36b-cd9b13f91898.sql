-- 1) Ortak bot deseni
CREATE OR REPLACE FUNCTION public.bot_ua_pattern()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
  SELECT COALESCE(NULLIF(string_agg(pattern, '|'), '') || '|', '')
      || 'googlebot|adsbot-google|googleother|google-inspectiontool|bingbot|bingpreview|yandex|duckduckbot|baiduspider|applebot|gptbot|oai-searchbot|chatgpt-user|chatgpt|claudebot|anthropic|ccbot|amazonbot|perplexity|facebookexternalhit|meta-externalagent|meta-externalfetcher|linkedinbot|twitterbot|pinterestbot|semrushbot|ahrefsbot|mj12bot|dotbot|petalbot|bytespider|sogou|seznambot|exabot|archive\.org_bot|ia_archiver|uptimerobot|pingdom|gtmetrix|lighthouse|pagespeed|curl/|wget|python-requests|go-http-client|node-fetch|okhttp|java/|axios|httpclient|headless|puppeteer|playwright|selenium|phantom|bot|crawl|spider|slurp|monitor|scrapy'
  FROM public.bot_filter_rules WHERE enabled = true;
$fn$;

CREATE OR REPLACE FUNCTION public.is_bot_ua(_ua text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
  SELECT _ua IS NOT NULL AND _ua ~* public.bot_ua_pattern();
$fn$;

-- JS çalıştıran gerçek istemci mi? (oturum/parmak izi üreten istemci)
CREATE OR REPLACE FUNCTION public.is_js_visitor(_session_id text, _visitor_id text, _fingerprint text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $fn$
  SELECT COALESCE(NULLIF(_session_id,''), NULLIF(_visitor_id,''), NULLIF(_fingerprint,'')) IS NOT NULL;
$fn$;

-- Admin kullanıcısı / admin paneli / api yolu mu?
CREATE OR REPLACE FUNCTION public.is_excluded_actor(_path text, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
  SELECT COALESCE(_path,'') LIKE '/api/%'
      OR COALESCE(_path,'') LIKE '/admin%'
      OR (_user_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = _user_id AND ur.role::text IN ('admin','super_admin')));
$fn$;

-- 2) Gerçek kullanıcı / bot görünümleri
DROP VIEW IF EXISTS public.analytics_events_human;
CREATE VIEW public.analytics_events_human WITH (security_invoker = true) AS
  SELECT * FROM public.analytics_events e
  WHERE COALESCE(e.is_bot, false) = false
    AND NOT public.is_bot_ua(e.user_agent)
    AND public.is_js_visitor(e.session_id, e.visitor_id, e.fingerprint)
    AND NOT public.is_excluded_actor(e.path, e.user_id);

DROP VIEW IF EXISTS public.analytics_events_bot;
CREATE VIEW public.analytics_events_bot WITH (security_invoker = true) AS
  SELECT * FROM public.analytics_events e
  WHERE COALESCE(e.is_bot, false) = true OR public.is_bot_ua(e.user_agent);

GRANT SELECT ON public.analytics_events_human TO authenticated, service_role;
GRANT SELECT ON public.analytics_events_bot TO authenticated, service_role;

-- 3) Tekil ziyaretçi: 5 dakikalık pencerede tek sayım
CREATE OR REPLACE FUNCTION public.unique_visitors_today()
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
  SELECT COUNT(DISTINCT COALESCE(NULLIF(ae.fingerprint,''), NULLIF(ae.visitor_id,''), ae.session_id))::int
  FROM public.analytics_events_human ae
  WHERE ae.created_at >= (date_trunc('day', now() AT TIME ZONE 'Europe/Istanbul')) AT TIME ZONE 'Europe/Istanbul';
$fn$;

-- 5 dakikalık tekilleştirilmiş ziyaret sayısı
CREATE OR REPLACE FUNCTION public.visits_today_deduped()
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
  SELECT COUNT(*)::int FROM (
    SELECT DISTINCT
      COALESCE(NULLIF(ae.fingerprint,''), NULLIF(ae.visitor_id,''), ae.session_id) AS vkey,
      floor(extract(epoch FROM ae.created_at) / 300) AS bucket
    FROM public.analytics_events_human ae
    WHERE ae.created_at >= (date_trunc('day', now() AT TIME ZONE 'Europe/Istanbul')) AT TIME ZONE 'Europe/Istanbul'
  ) s;
$fn$;

-- Bugün filtrelenen bot isabetleri
CREATE OR REPLACE FUNCTION public.filtered_bots_today()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
  SELECT jsonb_build_object(
    'hits', COUNT(*)::int,
    'sessions', COUNT(DISTINCT session_id)::int
  )
  FROM public.analytics_events_bot
  WHERE created_at >= (date_trunc('day', now() AT TIME ZONE 'Europe/Istanbul')) AT TIME ZONE 'Europe/Istanbul';
$fn$;

-- 4) Mevcut raporlama fonksiyonlarını yeni filtreleme mantığına bağla
DO $mig$
DECLARE d text;
BEGIN
  -- analytics overview: sadece gerçek kullanıcı olayları + filtrelenen bot metriği
  d := pg_get_functiondef('public.admin_analytics_overview()'::regprocedure);
  d := replace(d, 'FROM public.analytics_events'||chr(10), 'FROM public.analytics_events_human'||chr(10));
  d := replace(d, '''debug'', jsonb_build_object(',
                  '''botsFiltered'', public.filtered_bots_today(),'||chr(10)||'    ''visitsTodayDeduped'', public.visits_today_deduped(),'||chr(10)||'    ''debug'', jsonb_build_object(');
  EXECUTE d;

  -- conversion analytics: tüm analytics_events okumaları gerçek kullanıcı görünümüne
  d := pg_get_functiondef('public.admin_conversion_analytics()'::regprocedure);
  d := replace(d, 'FROM analytics_events', 'FROM public.analytics_events_human');
  d := replace(d, '''snapshot_at'', _now', '''bots_filtered'', public.filtered_bots_today(),'||chr(10)||'    ''snapshot_at'', _now');
  EXECUTE d;

  -- visitor report: bot satırları korunur, JS'siz ve admin trafiği hariç
  d := pg_get_functiondef('public.admin_visitor_report(integer)'::regprocedure);
  d := replace(d,
    'WHERE e.created_at >= _since',
    'WHERE e.created_at >= _since'||chr(10)||
    '      AND (COALESCE(e.is_bot,false) OR public.is_bot_ua(e.user_agent) OR ('||chr(10)||
    '            public.is_js_visitor(e.session_id, e.visitor_id, e.fingerprint)'||chr(10)||
    '            AND NOT public.is_excluded_actor(e.path, e.user_id)))');
  d := replace(d, '(e.is_bot OR (e.user_agent IS NOT NULL AND e.user_agent ~* _bot_re))',
                  '(COALESCE(e.is_bot,false) OR public.is_bot_ua(e.user_agent))');
  d := replace(d, '''dailySeries'', (SELECT arr FROM daily_json)',
                  '''dailySeries'', (SELECT arr FROM daily_json),'||chr(10)||'    ''botsFilteredToday'', public.filtered_bots_today()');
  EXECUTE d;

  -- live traffic: bot tespiti ortak fonksiyona, admin/JS filtresi, filtrelenen bot sayacı
  d := pg_get_functiondef('public.admin_live_traffic(boolean)'::regprocedure);
  d := replace(d, 'bool_or(e.user_agent IS NOT NULL AND e.user_agent ~* _bot_re)',
                  'bool_or(COALESCE(e.is_bot,false) OR public.is_bot_ua(e.user_agent))');
  d := replace(d,
    'WHERE created_at >= _window_since AND session_id IS NOT NULL',
    'WHERE created_at >= _window_since AND session_id IS NOT NULL'||chr(10)||
    '       AND NOT public.is_excluded_actor(path, user_id)');
  d := replace(d,
    '''real_users'', real_users, ''bots'', bots, ''admins'', admins,',
    '''real_users'', real_users, ''bots'', bots, ''admins'', admins,'||chr(10)||
    '                       ''filtered_bot_hits'', filtered_bot_hits,');
  d := replace(d,
    '(SELECT COALESCE(AVG(NULLIF(duration_sec, 0)), 0)::int FROM sessions_enriched) AS avg_session_sec',
    '(SELECT COALESCE(AVG(NULLIF(duration_sec, 0)), 0)::int FROM sessions_enriched) AS avg_session_sec,'||chr(10)||
    '      (SELECT COUNT(*) FROM ev_all a JOIN session_kind k2 ON k2.session_id = a.session_id WHERE k2.kind = ''bot'') AS filtered_bot_hits');
  EXECUTE d;
END
$mig$;