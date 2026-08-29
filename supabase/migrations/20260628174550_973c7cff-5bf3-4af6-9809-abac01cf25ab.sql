CREATE OR REPLACE FUNCTION public.admin_live_traffic()
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
  _oem_re text := '^[A-Z0-9][A-Z0-9\-\.\/ ]{4,}$';
  _result jsonb;
BEGIN
  SELECT public.has_role(auth.uid(), 'admin') INTO _is_admin;
  IF NOT COALESCE(_is_admin, false) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT NULLIF(string_agg(pattern, '|'), '')
    INTO _bot_re
    FROM public.bot_filter_rules
    WHERE enabled = true;
  IF _bot_re IS NULL THEN
    _bot_re := 'bot|crawl|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegram|preview|headless|lighthouse|pagespeed|gtmetrix|pingdom|uptimerobot|semrush|ahrefs|mj12|dotbot|petalbot|yandex|baidu|duckduckbot|applebot|googlebot|bingbot|embedly|vercelbot|phantom|puppeteer|selenium';
  END IF;

  WITH ev AS (
    SELECT *
    FROM public.analytics_events
    WHERE created_at >= _window_since
      AND session_id IS NOT NULL
      AND (user_agent IS NULL OR user_agent !~* _bot_re)
  ),
  online_ev AS (
    SELECT * FROM ev WHERE created_at >= _online_since
  ),
  sessions AS (
    SELECT
      session_id,
      MIN(created_at) AS joined_at,
      MAX(created_at) AS last_at,
      (ARRAY_AGG(path ORDER BY created_at DESC) FILTER (WHERE path IS NOT NULL))[1] AS path,
      (ARRAY_AGG(city ORDER BY created_at DESC) FILTER (WHERE city IS NOT NULL))[1] AS city,
      (ARRAY_AGG(country ORDER BY created_at DESC) FILTER (WHERE country IS NOT NULL))[1] AS country,
      (ARRAY_AGG(device ORDER BY created_at DESC) FILTER (WHERE device IS NOT NULL))[1] AS device,
      (ARRAY_AGG(user_agent ORDER BY created_at DESC) FILTER (WHERE user_agent IS NOT NULL))[1] AS user_agent
    FROM online_ev
    GROUP BY session_id
  ),
  -- Per-session intent score from 30 min window
  intent_raw AS (
    SELECT
      session_id,
      -- oem_search: repeated OEM-shaped queries
      (SELECT GREATEST(0, COUNT(*) - 1) FROM ev e2
        WHERE e2.session_id = s.session_id
          AND e2.event_type = 'search'
          AND COALESCE(e2.metadata->>'query','') ~ '^[A-Z0-9][A-Z0-9\-\.\/ ]{4,}$') * 20 AS s_oem_repeat,
      -- same part viewed more than once
      (SELECT GREATEST(0, COUNT(*) - COUNT(DISTINCT e2.metadata->>'part_id'))
         FROM ev e2
        WHERE e2.session_id = s.session_id
          AND e2.event_type = 'part_view'
          AND e2.metadata ? 'part_id') * 15 AS s_part_repeat,
      (SELECT COUNT(*) FROM ev e2
        WHERE e2.session_id = s.session_id AND e2.event_type = 'click_whatsapp') * 40 AS s_wa,
      (SELECT COUNT(*) FROM ev e2
        WHERE e2.session_id = s.session_id AND e2.event_type = 'click_call') * 40 AS s_call,
      (SELECT COUNT(*) FROM ev e2
        WHERE e2.session_id = s.session_id AND e2.event_type = 'favorite_add') * 20 AS s_fav
    FROM sessions s
  ),
  intent AS (
    SELECT
      session_id,
      LEAST(100, s_oem_repeat + s_part_repeat + s_wa + s_call + s_fav)::int AS score
    FROM intent_raw
  ),
  sessions_enriched AS (
    SELECT
      s.session_id,
      s.joined_at,
      s.last_at,
      s.path,
      s.city,
      s.country,
      COALESCE(s.device, 'unknown') AS device,
      CASE
        WHEN s.user_agent IS NULL THEN 'Bilinmiyor'
        WHEN s.user_agent ~* 'edg/' THEN 'Edge'
        WHEN s.user_agent ~* 'chrome/' AND s.user_agent !~* 'edg/' THEN 'Chrome'
        WHEN s.user_agent ~* 'firefox/' THEN 'Firefox'
        WHEN s.user_agent ~* 'safari/' AND s.user_agent !~* 'chrome/' THEN 'Safari'
        WHEN s.user_agent ~* 'opera|opr/' THEN 'Opera'
        ELSE 'Diğer'
      END AS browser,
      COALESCE(i.score, 0) AS intent_score
    FROM sessions s
    LEFT JOIN intent i ON i.session_id = s.session_id
  ),
  sessions_json AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'session', right(session_id, 6),
      'path', COALESCE(path, '/'),
      'city', CASE
        WHEN country IS NOT NULL AND country !~* '^(turkey|türkiye|turkiye|tr)$' THEN 'Yurtdışı'
        WHEN city IS NULL OR city = '' THEN 'Bilinmiyor'
        ELSE initcap(lower(city))
      END,
      'device', device,
      'browser', browser,
      'joined_at', joined_at,
      'last_at', last_at,
      'intent_score', intent_score
    ) ORDER BY intent_score DESC, last_at DESC), '[]'::jsonb) AS arr
    FROM sessions_enriched
  ),
  cities AS (
    SELECT
      CASE
        WHEN country IS NOT NULL AND country !~* '^(turkey|türkiye|turkiye|tr)$' THEN 'Yurtdışı'
        WHEN city IS NULL OR city = '' THEN 'Bilinmiyor'
        ELSE initcap(lower(city))
      END AS city,
      COUNT(*) AS cnt
    FROM sessions
    GROUP BY 1
    ORDER BY cnt DESC
    LIMIT 30
  ),
  cities_json AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('city', city, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb) AS arr
    FROM cities
  ),
  pages AS (
    SELECT
      CASE
        WHEN path IS NULL OR path = '' THEN '/'
        WHEN path ~ '^/parts/'  THEN '/parts/…'
        WHEN path ~ '^/stok/'   THEN '/stok/…'
        WHEN path ~ '^/u/'      THEN '/u/…'
        WHEN path ~ '^/oem/'    THEN '/oem/…'
        WHEN path ~ '^/requests/' THEN '/requests/…'
        ELSE path
      END AS path,
      COUNT(DISTINCT session_id) AS cnt
    FROM online_ev
    GROUP BY 1
    ORDER BY cnt DESC
    LIMIT 10
  ),
  pages_json AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('path', path, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb) AS arr
    FROM pages
  ),
  -- Top OEM searches (OEM-shaped queries) last 30 min
  oem_searches AS (
    SELECT
      upper(trim(metadata->>'query')) AS oem,
      COUNT(*) AS cnt,
      MAX(created_at) AS last_at,
      MAX((metadata->>'results')::int) AS last_results
    FROM ev
    WHERE event_type IN ('search','oem_search')
      AND COALESCE(metadata->>'query','') ~ '^[A-Za-z0-9][A-Za-z0-9\-\.\/ ]{4,}$'
    GROUP BY 1
    ORDER BY cnt DESC, last_at DESC
    LIMIT 15
  ),
  oem_top_json AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'oem', oem, 'count', cnt, 'last_at', last_at, 'last_results', last_results
    ) ORDER BY cnt DESC), '[]'::jsonb) AS arr FROM oem_searches
  ),
  -- OEMs that returned 0 results
  failed_oems AS (
    SELECT
      upper(trim(metadata->>'query')) AS oem,
      COUNT(*) AS cnt,
      MAX(created_at) AS last_at
    FROM ev
    WHERE event_type IN ('search','oem_search')
      AND COALESCE((metadata->>'results')::int, 0) = 0
      AND length(trim(metadata->>'query')) > 2
    GROUP BY 1
    ORDER BY cnt DESC, last_at DESC
    LIMIT 15
  ),
  failed_oems_json AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'oem', oem, 'count', cnt, 'last_at', last_at
    ) ORDER BY cnt DESC), '[]'::jsonb) AS arr FROM failed_oems
  ),
  -- Funnel: distinct sessions per stage (last 30 min)
  funnel AS (
    SELECT
      COUNT(DISTINCT session_id) FILTER (WHERE event_type = 'page_view')      AS visited,
      COUNT(DISTINCT session_id) FILTER (WHERE event_type IN ('search','oem_search')) AS searched,
      COUNT(DISTINCT session_id) FILTER (WHERE event_type = 'part_view')      AS viewed_part,
      COUNT(DISTINCT session_id) FILTER (WHERE event_type IN ('click_whatsapp','click_call')) AS contacted,
      COUNT(DISTINCT session_id) FILTER (WHERE event_type = 'favorite_add')   AS favorited
    FROM ev
  ),
  funnel_json AS (
    SELECT jsonb_build_object(
      'visited',     visited,
      'searched',    searched,
      'viewed_part', viewed_part,
      'contacted',   contacted,
      'favorited',   favorited
    ) AS obj FROM funnel
  ),
  -- Hot parts: last 30 min
  hot_parts AS (
    SELECT
      metadata->>'part_id' AS part_id,
      MAX(metadata->>'title') AS title,
      COUNT(*) FILTER (WHERE event_type = 'part_view') AS views,
      COUNT(*) FILTER (WHERE event_type = 'click_whatsapp') AS wa,
      COUNT(*) FILTER (WHERE event_type = 'click_call') AS calls,
      COUNT(*) FILTER (WHERE event_type = 'favorite_add') AS favs
    FROM ev
    WHERE metadata ? 'part_id'
      AND event_type IN ('part_view','click_whatsapp','click_call','favorite_add')
    GROUP BY 1
    HAVING COUNT(*) >= 1
    ORDER BY (COUNT(*) FILTER (WHERE event_type = 'click_whatsapp') * 5
            + COUNT(*) FILTER (WHERE event_type = 'click_call') * 5
            + COUNT(*) FILTER (WHERE event_type = 'favorite_add') * 3
            + COUNT(*) FILTER (WHERE event_type = 'part_view')) DESC
    LIMIT 12
  ),
  hot_parts_json AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'part_id', part_id,
      'title', COALESCE(title, '—'),
      'views', views,
      'whatsapp', wa,
      'calls', calls,
      'favorites', favs
    )), '[]'::jsonb) AS arr FROM hot_parts
  ),
  stream AS (
    SELECT
      event_type,
      path,
      city,
      metadata,
      created_at,
      right(session_id, 6) AS session
    FROM ev
    ORDER BY created_at DESC
    LIMIT 60
  ),
  stream_json AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'event_type', event_type,
      'path', path,
      'city', CASE WHEN city IS NULL OR city = '' THEN NULL ELSE initcap(lower(city)) END,
      'session', session,
      'title', metadata->>'title',
      'query', metadata->>'query',
      'oem',   metadata->>'oem',
      'part_id', metadata->>'part_id',
      'results', (metadata->>'results')::int,
      'created_at', created_at
    ) ORDER BY created_at DESC), '[]'::jsonb) AS arr
    FROM stream
  )
  SELECT jsonb_build_object(
    'online_count', (SELECT COUNT(*) FROM sessions),
    'sessions',    (SELECT arr FROM sessions_json),
    'cities',      (SELECT arr FROM cities_json),
    'pages',       (SELECT arr FROM pages_json),
    'top_oems',    (SELECT arr FROM oem_top_json),
    'failed_oems', (SELECT arr FROM failed_oems_json),
    'funnel',      (SELECT obj FROM funnel_json),
    'hot_parts',   (SELECT arr FROM hot_parts_json),
    'stream',      (SELECT arr FROM stream_json),
    'debug', jsonb_build_object(
      'snapshotAt', _now,
      'onlineSince', _online_since,
      'windowSince', _window_since,
      'analyticsRowsWindow', (SELECT COUNT(*) FROM ev),
      'distinctSessions5m', (SELECT COUNT(*) FROM sessions)
    )
  )
  INTO _result;

  RETURN _result;
END;
$function$;