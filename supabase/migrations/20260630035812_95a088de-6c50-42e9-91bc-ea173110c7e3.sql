CREATE OR REPLACE FUNCTION public.enqueue_indexnow_for_part()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  base text := 'https://tasitsan.com.tr';
  v_slug text;
  v_target_url text;
BEGIN
  IF TG_OP = 'UPDATE' AND
     NEW.status = OLD.status AND
     NEW.stock_quantity = OLD.stock_quantity AND
     NEW.price IS NOT DISTINCT FROM OLD.price AND
     NEW.photos = OLD.photos AND
     NEW.seo_slug IS NOT DISTINCT FROM OLD.seo_slug
  THEN
    RETURN NEW;
  END IF;

  IF NEW.status <> 'approved' OR NEW.stock_quantity IS NULL OR NEW.stock_quantity <= 0 THEN
    RETURN NEW;
  END IF;

  v_slug := COALESCE(NEW.seo_slug, NEW.id::text);
  v_target_url := base || '/parts/' || v_slug;

  INSERT INTO public.indexnow_queue (url) VALUES (v_target_url)
  ON CONFLICT (url) WHERE status = 'pending' DO NOTHING;

  IF NEW.oem_code IS NOT NULL AND length(NEW.oem_code) >= 3 THEN
    INSERT INTO public.indexnow_queue (url)
    VALUES (base || '/oem/' || lower(regexp_replace(NEW.oem_code, '[^A-Za-z0-9]', '-', 'g')))
    ON CONFLICT (url) WHERE status = 'pending' DO NOTHING;
  END IF;

  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION public.admin_live_traffic(_exclude_admins boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _is_admin boolean;
  _now timestamptz := now();
  _online_since timestamptz := _now - interval '5 minutes';
  _window_since timestamptz := _now - interval '30 minutes';
  _bot_re text;
  _result jsonb;
BEGIN
  SELECT public.has_role(auth.uid(), 'admin') INTO _is_admin;
  IF NOT COALESCE(_is_admin, false) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT NULLIF(string_agg(pattern, '|'), '')
    INTO _bot_re FROM public.bot_filter_rules WHERE enabled = true;
  IF _bot_re IS NULL THEN
    _bot_re := 'bot|crawl|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegram|preview|headless|lighthouse|pagespeed|gtmetrix|pingdom|uptimerobot|semrush|ahrefs|mj12|dotbot|petalbot|yandex|baidu|duckduckbot|applebot|googlebot|bingbot|embedly|vercelbot|phantom|puppeteer|selenium|gptbot|oai-searchbot|chatgpt|claudebot|anthropic|perplexity|bytespider|amazonbot|linkedinbot|twitterbot';
  END IF;

  WITH admin_ids AS (
    SELECT user_id FROM public.user_roles WHERE role = 'admin'
  ),
  ev_all AS (
    SELECT * FROM public.analytics_events
     WHERE created_at >= _window_since AND session_id IS NOT NULL
  ),
  sess_users AS (
    SELECT session_id, MAX(user_id::text) AS user_id_text
      FROM ev_all WHERE user_id IS NOT NULL GROUP BY session_id
  ),
  session_class AS (
    SELECT e.session_id,
           MAX(e.user_agent) AS user_agent,
           bool_or(e.user_agent IS NOT NULL AND e.user_agent ~* _bot_re) AS is_bot_ua,
           EXISTS(SELECT 1 FROM admin_ids a, sess_users su
                   WHERE su.session_id = e.session_id
                     AND a.user_id::text = su.user_id_text) AS is_admin_user
      FROM ev_all e GROUP BY e.session_id
  ),
  session_kind AS (
    SELECT session_id, user_agent,
      CASE WHEN is_bot_ua THEN 'bot' WHEN is_admin_user THEN 'admin' ELSE 'human' END AS kind,
      CASE
        WHEN user_agent ~* 'googlebot' THEN 'Googlebot'
        WHEN user_agent ~* 'bingbot|bingpreview' THEN 'Bingbot'
        WHEN user_agent ~* 'yandex' THEN 'YandexBot'
        WHEN user_agent ~* 'duckduckbot' THEN 'DuckDuckBot'
        WHEN user_agent ~* 'applebot' THEN 'Applebot'
        WHEN user_agent ~* 'baidu' THEN 'Baiduspider'
        WHEN user_agent ~* 'facebookexternalhit|facebot' THEN 'Facebook'
        WHEN user_agent ~* 'whatsapp' THEN 'WhatsApp'
        WHEN user_agent ~* 'telegram' THEN 'Telegram'
        WHEN user_agent ~* 'twitterbot' THEN 'Twitterbot'
        WHEN user_agent ~* 'linkedinbot' THEN 'LinkedInBot'
        WHEN user_agent ~* 'ahrefs' THEN 'AhrefsBot'
        WHEN user_agent ~* 'semrush' THEN 'SemrushBot'
        WHEN user_agent ~* 'mj12' THEN 'MJ12bot'
        WHEN user_agent ~* 'dotbot' THEN 'DotBot'
        WHEN user_agent ~* 'petalbot' THEN 'PetalBot'
        WHEN user_agent ~* 'gptbot' THEN 'GPTBot'
        WHEN user_agent ~* 'oai-searchbot|chatgpt' THEN 'ChatGPT'
        WHEN user_agent ~* 'perplexity' THEN 'PerplexityBot'
        WHEN user_agent ~* 'claudebot|anthropic' THEN 'ClaudeBot'
        WHEN user_agent ~* 'amazonbot' THEN 'Amazonbot'
        WHEN user_agent ~* 'bytespider' THEN 'Bytespider'
        WHEN user_agent ~* 'embedly' THEN 'Embedly'
        WHEN user_agent ~* 'lighthouse|pagespeed' THEN 'Lighthouse'
        WHEN user_agent ~* 'uptimerobot|pingdom|gtmetrix' THEN 'Monitor'
        WHEN user_agent ~* 'headless|puppeteer|playwright|selenium|phantom' THEN 'Headless'
        WHEN is_bot_ua THEN 'Diğer Bot'
        ELSE NULL
      END AS bot_name
    FROM session_class
  ),
  ev AS (
    SELECT e.*, k.kind, k.bot_name FROM ev_all e JOIN session_kind k USING (session_id)
     WHERE (NOT _exclude_admins OR k.kind <> 'admin')
  ),
  ev_human AS (SELECT * FROM ev WHERE kind = 'human'),
  online_human AS (SELECT * FROM ev_human WHERE created_at >= _online_since),
  sessions AS (
    SELECT session_id,
           MIN(created_at) AS joined_at, MAX(created_at) AS last_at,
           (ARRAY_AGG(path ORDER BY created_at ASC)  FILTER (WHERE path IS NOT NULL))[1] AS landing_path,
           (ARRAY_AGG(path ORDER BY created_at DESC) FILTER (WHERE path IS NOT NULL))[1] AS path,
           (ARRAY_AGG(city ORDER BY created_at DESC) FILTER (WHERE city IS NOT NULL))[1] AS city,
           (ARRAY_AGG(country ORDER BY created_at DESC) FILTER (WHERE country IS NOT NULL))[1] AS country,
           (ARRAY_AGG(device ORDER BY created_at DESC) FILTER (WHERE device IS NOT NULL))[1] AS device,
           (ARRAY_AGG(user_agent ORDER BY created_at DESC) FILTER (WHERE user_agent IS NOT NULL))[1] AS user_agent,
           (ARRAY_AGG(referrer ORDER BY created_at ASC) FILTER (WHERE referrer IS NOT NULL AND referrer <> ''))[1] AS first_referrer
      FROM online_human GROUP BY session_id
  ),
  intent_raw AS (
    SELECT s.session_id,
      (SELECT GREATEST(0, COUNT(*) - 1) FROM ev_human e2
        WHERE e2.session_id = s.session_id AND e2.event_type = 'search'
          AND COALESCE(e2.metadata->>'query','') ~ '^[A-Z0-9][A-Z0-9\-\.\/ ]{4,}$') * 20 AS s_oem_repeat,
      (SELECT GREATEST(0, COUNT(*) - COUNT(DISTINCT e2.metadata->>'part_id'))
         FROM ev_human e2 WHERE e2.session_id = s.session_id AND e2.event_type = 'part_view'
          AND e2.metadata ? 'part_id') * 15 AS s_part_repeat,
      (SELECT COUNT(*) FROM ev_human e2 WHERE e2.session_id = s.session_id AND e2.event_type = 'click_whatsapp') * 40 AS s_wa,
      (SELECT COUNT(*) FROM ev_human e2 WHERE e2.session_id = s.session_id AND e2.event_type = 'click_call') * 40 AS s_call,
      (SELECT COUNT(*) FROM ev_human e2 WHERE e2.session_id = s.session_id AND e2.event_type = 'favorite_add') * 20 AS s_fav
    FROM sessions s
  ),
  intent AS (
    SELECT session_id, LEAST(100, s_oem_repeat + s_part_repeat + s_wa + s_call + s_fav)::int AS score FROM intent_raw
  ),
  sessions_enriched AS (
    SELECT s.session_id, s.joined_at, s.last_at, s.landing_path, s.path, s.city, s.country,
      COALESCE(s.device, 'unknown') AS device,
      CASE WHEN s.user_agent IS NULL THEN 'Bilinmiyor'
           WHEN s.user_agent ~* 'edg/' THEN 'Edge'
           WHEN s.user_agent ~* 'chrome/' AND s.user_agent !~* 'edg/' THEN 'Chrome'
           WHEN s.user_agent ~* 'firefox/' THEN 'Firefox'
           WHEN s.user_agent ~* 'safari/' AND s.user_agent !~* 'chrome/' THEN 'Safari'
           WHEN s.user_agent ~* 'opera|opr/' THEN 'Opera'
           ELSE 'Diğer' END AS browser,
      CASE WHEN s.user_agent IS NULL THEN 'Bilinmiyor'
           WHEN s.user_agent ~* 'windows nt' THEN 'Windows'
           WHEN s.user_agent ~* 'mac os x|macintosh' THEN 'macOS'
           WHEN s.user_agent ~* 'android' THEN 'Android'
           WHEN s.user_agent ~* 'iphone|ipad|ipod' THEN 'iOS'
           WHEN s.user_agent ~* 'linux' THEN 'Linux'
           ELSE 'Diğer' END AS os,
      CASE WHEN s.first_referrer IS NULL OR s.first_referrer = '' THEN 'Direkt'
           WHEN s.first_referrer ~* 'tasitsan\.com|parca-borsasi\.lovable\.app|lovable\.app' THEN 'İç Sayfa'
           WHEN s.first_referrer ~* 'google\.' THEN 'Google'
           WHEN s.first_referrer ~* 'bing\.' THEN 'Bing'
           WHEN s.first_referrer ~* 'yandex\.' THEN 'Yandex'
           WHEN s.first_referrer ~* 'duckduckgo\.' THEN 'DuckDuckGo'
           WHEN s.first_referrer ~* 'yahoo\.' THEN 'Yahoo'
           WHEN s.first_referrer ~* 'facebook\.|fb\.com|l\.facebook' THEN 'Facebook'
           WHEN s.first_referrer ~* 'instagram\.|l\.instagram' THEN 'Instagram'
           WHEN s.first_referrer ~* 'whatsapp\.|wa\.me|api\.whatsapp' THEN 'WhatsApp'
           WHEN s.first_referrer ~* 'twitter\.|t\.co|x\.com' THEN 'Twitter/X'
           WHEN s.first_referrer ~* 'linkedin\.' THEN 'LinkedIn'
           WHEN s.first_referrer ~* 'youtube\.|youtu\.be' THEN 'YouTube'
           WHEN s.first_referrer ~* 'tiktok\.' THEN 'TikTok'
           WHEN s.first_referrer ~* 'telegram\.|t\.me' THEN 'Telegram'
           WHEN s.first_referrer ~* 'reddit\.' THEN 'Reddit'
           WHEN s.first_referrer ~* 'sahibinden\.' THEN 'Sahibinden'
           ELSE 'Diğer Site' END AS source,
      s.first_referrer AS referrer,
      COALESCE(i.score, 0) AS intent_score,
      EXTRACT(EPOCH FROM (s.last_at - s.joined_at))::int AS duration_sec
    FROM sessions s LEFT JOIN intent i ON i.session_id = s.session_id
  ),
  sessions_json AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'session', right(session_id, 6),
      'path', COALESCE(path, '/'),
      'landing_path', COALESCE(landing_path, '/'),
      'last_path', COALESCE(path, '/'),
      'city', COALESCE(NULLIF(initcap(lower(city)), ''), 'Bilinmiyor'),
      'country', COALESCE(NULLIF(initcap(lower(country)), ''), 'Bilinmiyor'),
      'device', device, 'browser', browser, 'os', os,
      'source', source, 'referrer', referrer,
      'joined_at', joined_at, 'last_at', last_at,
      'duration_sec', duration_sec, 'intent_score', intent_score, 'kind', 'human'
    ) ORDER BY intent_score DESC, last_at DESC), '[]'::jsonb) AS arr
    FROM sessions_enriched
  ),
  bots_window AS (
    SELECT COALESCE(k.bot_name, 'Diğer Bot') AS bot_name,
           COUNT(DISTINCT e.session_id) AS sessions, COUNT(*) AS hits,
           MAX(e.created_at) AS last_at,
           (ARRAY_AGG(e.path ORDER BY e.created_at DESC) FILTER (WHERE e.path IS NOT NULL))[1] AS last_path
      FROM ev e JOIN session_kind k USING (session_id)
     WHERE e.kind = 'bot' GROUP BY 1 ORDER BY sessions DESC, hits DESC LIMIT 20
  ),
  bots_json AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'bot_name', bot_name, 'sessions', sessions, 'hits', hits,
      'last_at', last_at, 'last_path', last_path
    ) ORDER BY sessions DESC), '[]'::jsonb) AS arr FROM bots_window
  ),
  source_breakdown AS (
    SELECT source, COUNT(*) AS cnt FROM sessions_enriched GROUP BY source ORDER BY cnt DESC
  ),
  sources_json AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('source', source, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb) AS arr FROM source_breakdown
  ),
  cities AS (
    SELECT COALESCE(NULLIF(initcap(lower(city)), ''), 'Bilinmiyor') AS city,
           COALESCE(NULLIF(initcap(lower(country)), ''), 'Bilinmiyor') AS country,
           COUNT(*) AS cnt
      FROM sessions GROUP BY 1,2 ORDER BY cnt DESC LIMIT 30
  ),
  cities_json AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('city', city, 'country', country, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb) AS arr FROM cities
  ),
  pages AS (
    SELECT CASE WHEN path IS NULL OR path = '' THEN '/'
                WHEN path ~ '^/parts/'  THEN '/parts/…'
                WHEN path ~ '^/stok/'   THEN '/stok/…'
                WHEN path ~ '^/u/'      THEN '/u/…'
                WHEN path ~ '^/oem/'    THEN '/oem/…'
                WHEN path ~ '^/requests/' THEN '/requests/…'
                ELSE path END AS path,
           COUNT(DISTINCT session_id) AS cnt
      FROM online_human GROUP BY 1 ORDER BY cnt DESC LIMIT 10
  ),
  pages_json AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('path', path, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb) AS arr FROM pages
  ),
  oem_searches AS (
    SELECT upper(trim(metadata->>'query')) AS oem, COUNT(*) AS cnt,
           MAX(created_at) AS last_at, MAX((metadata->>'results')::int) AS last_results
      FROM ev_human
     WHERE event_type IN ('search','oem_search')
       AND COALESCE(metadata->>'query','') ~ '^[A-Za-z0-9][A-Za-z0-9\-\.\/ ]{4,}$'
     GROUP BY 1 ORDER BY cnt DESC, last_at DESC LIMIT 15
  ),
  oem_top_json AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'oem', oem, 'count', cnt, 'last_at', last_at, 'last_results', last_results
    ) ORDER BY cnt DESC), '[]'::jsonb) AS arr FROM oem_searches
  ),
  failed_oems AS (
    SELECT upper(trim(metadata->>'query')) AS oem, COUNT(*) AS cnt, MAX(created_at) AS last_at
      FROM ev_human
     WHERE event_type IN ('search','oem_search')
       AND COALESCE((metadata->>'results')::int, 0) = 0
       AND length(trim(metadata->>'query')) > 2
     GROUP BY 1 ORDER BY cnt DESC, last_at DESC LIMIT 15
  ),
  failed_oems_json AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'oem', oem, 'count', cnt, 'last_at', last_at
    ) ORDER BY cnt DESC), '[]'::jsonb) AS arr FROM failed_oems
  ),
  funnel AS (
    SELECT COUNT(DISTINCT session_id) FILTER (WHERE event_type = 'page_view') AS visited,
           COUNT(DISTINCT session_id) FILTER (WHERE event_type IN ('search','oem_search')) AS searched,
           COUNT(DISTINCT session_id) FILTER (WHERE event_type = 'part_view') AS viewed_part,
           COUNT(DISTINCT session_id) FILTER (WHERE event_type IN ('click_whatsapp','click_call')) AS contacted,
           COUNT(DISTINCT session_id) FILTER (WHERE event_type = 'favorite_add') AS favorited
      FROM ev_human
  ),
  funnel_json AS (
    SELECT jsonb_build_object(
      'visited', visited, 'searched', searched, 'viewed_part', viewed_part,
      'contacted', contacted, 'favorited', favorited) AS obj FROM funnel
  ),
  hot_parts AS (
    SELECT metadata->>'part_id' AS part_id,
           MAX(metadata->>'title') AS title,
           COUNT(*) FILTER (WHERE event_type = 'part_view') AS views,
           COUNT(*) FILTER (WHERE event_type = 'click_whatsapp') AS wa,
           COUNT(*) FILTER (WHERE event_type = 'click_call') AS calls,
           COUNT(*) FILTER (WHERE event_type = 'favorite_add') AS favs
      FROM ev_human
     WHERE metadata ? 'part_id'
       AND event_type IN ('part_view','click_whatsapp','click_call','favorite_add')
     GROUP BY 1 HAVING COUNT(*) >= 1
     ORDER BY (COUNT(*) FILTER (WHERE event_type = 'click_whatsapp') * 5
            +  COUNT(*) FILTER (WHERE event_type = 'click_call') * 5
            +  COUNT(*) FILTER (WHERE event_type = 'favorite_add') * 3
            +  COUNT(*) FILTER (WHERE event_type = 'part_view')) DESC
     LIMIT 12
  ),
  hot_parts_json AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'part_id', part_id, 'title', COALESCE(title, '—'),
      'views', views, 'whatsapp', wa, 'calls', calls, 'favorites', favs
    )), '[]'::jsonb) AS arr FROM hot_parts
  ),
  stream AS (
    SELECT e.event_type, e.path, e.city, e.country, e.metadata, e.created_at,
           right(e.session_id, 6) AS session, k.kind, k.bot_name
      FROM ev e JOIN session_kind k USING (session_id)
     ORDER BY e.created_at DESC LIMIT 100
  ),
  stream_json AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'event_type', event_type, 'path', path,
      'city', CASE WHEN city IS NULL OR city = '' THEN NULL ELSE initcap(lower(city)) END,
      'country', CASE WHEN country IS NULL OR country = '' THEN NULL ELSE initcap(lower(country)) END,
      'session', session,
      'title', metadata->>'title', 'query', metadata->>'query',
      'oem', metadata->>'oem', 'part_id', metadata->>'part_id',
      'results', (metadata->>'results')::int,
      'created_at', created_at, 'kind', kind, 'bot_name', bot_name
    ) ORDER BY created_at DESC), '[]'::jsonb) AS arr FROM stream
  ),
  counts AS (
    SELECT
      (SELECT COUNT(DISTINCT session_id) FROM ev WHERE kind = 'human' AND created_at >= _online_since) AS real_users,
      (SELECT COUNT(DISTINCT session_id) FROM ev WHERE kind = 'bot'   AND created_at >= _online_since) AS bots,
      (SELECT COUNT(DISTINCT s.session_id)
         FROM ev_all s JOIN session_kind k USING (session_id)
        WHERE k.kind = 'admin' AND s.created_at >= _online_since) AS admins,
      (SELECT COUNT(*) FROM sessions_enriched WHERE device = 'mobile') AS mobile,
      (SELECT COUNT(*) FROM sessions_enriched WHERE device = 'desktop') AS desktop,
      (SELECT COUNT(*) FROM sessions_enriched WHERE device = 'tablet') AS tablet,
      (SELECT COUNT(DISTINCT country) FROM sessions_enriched WHERE country IS NOT NULL AND country <> '') AS countries,
      (SELECT COALESCE(AVG(NULLIF(duration_sec, 0)), 0)::int FROM sessions_enriched) AS avg_session_sec
  )
  SELECT jsonb_build_object(
    'online_count', (SELECT COUNT(*) FROM sessions),
    'counts',       (SELECT jsonb_build_object(
                       'real_users', real_users, 'bots', bots, 'admins', admins,
                       'mobile', mobile, 'desktop', desktop, 'tablet', tablet,
                       'countries', countries, 'avg_session_sec', avg_session_sec) FROM counts),
    'sessions',     (SELECT arr FROM sessions_json),
    'bots',         (SELECT arr FROM bots_json),
    'sources',      (SELECT arr FROM sources_json),
    'cities',       (SELECT arr FROM cities_json),
    'pages',        (SELECT arr FROM pages_json),
    'top_oems',     (SELECT arr FROM oem_top_json),
    'failed_oems',  (SELECT arr FROM failed_oems_json),
    'funnel',       (SELECT obj FROM funnel_json),
    'hot_parts',    (SELECT arr FROM hot_parts_json),
    'stream',       (SELECT arr FROM stream_json),
    'debug', jsonb_build_object(
      'snapshotAt', _now, 'onlineSince', _online_since, 'windowSince', _window_since,
      'excludeAdmins', _exclude_admins,
      'analyticsRowsWindow', (SELECT COUNT(*) FROM ev),
      'distinctSessions5m', (SELECT COUNT(*) FROM sessions)
    )
  ) INTO _result;

  RETURN _result;
END;
$function$;

CREATE INDEX IF NOT EXISTS idx_analytics_events_created_session
  ON public.analytics_events (created_at DESC, session_id);