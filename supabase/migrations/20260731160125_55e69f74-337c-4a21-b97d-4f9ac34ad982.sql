CREATE OR REPLACE FUNCTION public.admin_analytics_overview()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _is_admin boolean;
  _tz constant text := 'Europe/Istanbul';
  _now timestamptz := now();
  _day_start timestamptz := (date_trunc('day', _now AT TIME ZONE _tz)) AT TIME ZONE _tz;
  _week_start timestamptz := _day_start - interval '6 days';
  _month_start timestamptz := _day_start - interval '29 days';
  _bot_re text;
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
    WHERE created_at >= _month_start
      AND (user_agent IS NULL OR user_agent !~* _bot_re)
  ),
  pv AS (
    SELECT * FROM ev WHERE event_type = 'page_view'
  ),
  vis AS (
    SELECT
      COUNT(DISTINCT COALESCE(visitor_id, session_id)) AS total30,
      COUNT(DISTINCT COALESCE(visitor_id, session_id)) FILTER (WHERE created_at >= _day_start) AS today,
      COUNT(DISTINCT COALESCE(visitor_id, session_id)) FILTER (WHERE created_at >= _week_start) AS week,
      COUNT(DISTINCT COALESCE(visitor_id, session_id)) FILTER (WHERE created_at >= _month_start) AS month,
      COUNT(DISTINCT session_id) AS sessions30,
      COUNT(DISTINCT session_id) FILTER (WHERE created_at >= _day_start) AS sessions_today,
      COUNT(*) AS pageviews30,
      COUNT(*) FILTER (WHERE created_at >= _day_start) AS pageviews_today
    FROM pv
    WHERE COALESCE(visitor_id, session_id) IS NOT NULL
  ),
  session_geo AS (
    SELECT DISTINCT ON (vkey) vkey, city, country
    FROM (SELECT COALESCE(visitor_id, session_id) AS vkey, city, country, created_at FROM pv WHERE COALESCE(visitor_id, session_id) IS NOT NULL) q
    ORDER BY vkey, created_at ASC
  ),
  tr_cities AS (
    SELECT public.tr_normalize_city(city) AS city, COUNT(*) AS cnt
    FROM session_geo
    WHERE (country IS NULL OR country ~* '^(turkey|turkiye|türkiye|tr)$')
      AND public.tr_normalize_city(city) IS NOT NULL
    GROUP BY 1
  ),
  abroad AS (
    SELECT COUNT(*) AS cnt
    FROM session_geo
    WHERE country IS NOT NULL
      AND country !~* '^(turkey|turkiye|türkiye|tr)$'
  ),
  cities_list AS (
    SELECT jsonb_build_object('city', city, 'count', cnt) AS j, cnt FROM tr_cities
    UNION ALL
    SELECT jsonb_build_object('city', 'Diğer Ülkeler', 'count', cnt), cnt FROM abroad WHERE cnt > 0
  ),
  cities_json AS (
    SELECT COALESCE(jsonb_agg(j ORDER BY cnt DESC), '[]'::jsonb) AS arr,
           (SELECT COUNT(*) FROM tr_cities) AS distinct_cities
    FROM (SELECT j, cnt FROM cities_list ORDER BY cnt DESC LIMIT 15) s
  ),
  devices AS (
    SELECT COALESCE(device, 'unknown') AS device,
           COUNT(DISTINCT session_id) AS sessions
    FROM pv
    GROUP BY 1
  ),
  devices_json AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('device', device, 'sessions', sessions) ORDER BY sessions DESC), '[]'::jsonb) AS arr
    FROM devices
  ),
  top_parts AS (
    SELECT
      (metadata->>'part_id') AS part_id,
      MAX(metadata->>'title') AS title,
      COUNT(*) AS views
    FROM ev
    WHERE event_type = 'part_view' AND metadata ? 'part_id'
    GROUP BY 1
    ORDER BY views DESC
    LIMIT 10
  ),
  top_parts_json AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('part_id', part_id, 'title', COALESCE(title,''), 'views', views) ORDER BY views DESC), '[]'::jsonb) AS arr
    FROM top_parts
  ),
  top_searches AS (
    SELECT lower(trim(metadata->>'query')) AS query, COUNT(*) AS cnt
    FROM ev
    WHERE event_type = 'search' AND COALESCE(trim(metadata->>'query'),'') <> ''
    GROUP BY 1 ORDER BY cnt DESC LIMIT 10
  ),
  top_searches_json AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('query', query, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb) AS arr
    FROM top_searches
  ),
  top_oem AS (
    SELECT upper(trim(metadata->>'oem')) AS oem, COUNT(*) AS cnt
    FROM ev
    WHERE event_type = 'oem_search' AND COALESCE(trim(metadata->>'oem'),'') <> ''
    GROUP BY 1 ORDER BY cnt DESC LIMIT 10
  ),
  top_oem_json AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('oem', oem, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb) AS arr
    FROM top_oem
  ),
  click_counts AS (
    SELECT
      COUNT(*) FILTER (WHERE event_type = 'click_whatsapp') AS wa,
      COUNT(*) FILTER (WHERE event_type = 'click_call') AS call
    FROM ev
  ),
  totals AS (
    SELECT
      (SELECT COUNT(*) FROM public.profiles) AS total_members,
      (SELECT COUNT(*) FROM public.profiles WHERE created_at >= _day_start) AS new_members_today,
      (SELECT COUNT(*) FROM public.parts) AS total_parts,
      (SELECT COUNT(*) FROM public.parts WHERE created_at >= _day_start) AS new_parts_today
  ),
  top_sellers_raw AS (
    SELECT seller_id, COUNT(*) AS cnt
    FROM public.parts
    GROUP BY seller_id
    ORDER BY cnt DESC
    LIMIT 10
  ),
  top_sellers AS (
    SELECT s.seller_id, COALESCE(p.display_name, '—') AS name, s.cnt
    FROM top_sellers_raw s
    LEFT JOIN public.profiles p ON p.id = s.seller_id
  ),
  top_sellers_json AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('seller_id', seller_id, 'name', name, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb) AS arr
    FROM top_sellers
  ),
  days AS (
    SELECT generate_series(0, 29) AS i
  ),
  daily AS (
    SELECT
      to_char((_day_start - (29 - d.i) * interval '1 day') AT TIME ZONE _tz, 'YYYY-MM-DD') AS date,
      (_day_start - (29 - d.i) * interval '1 day') AS day_start_ts,
      (_day_start - (29 - d.i - 1) * interval '1 day') AS day_end_ts
    FROM days d
  ),
  daily_series AS (
    SELECT
      dy.date,
      COALESCE((SELECT COUNT(DISTINCT COALESCE(visitor_id, session_id)) FROM pv WHERE COALESCE(visitor_id, session_id) IS NOT NULL AND created_at >= dy.day_start_ts AND created_at < dy.day_end_ts), 0) AS visitors,
      COALESCE((SELECT COUNT(*) FROM public.profiles WHERE created_at >= dy.day_start_ts AND created_at < dy.day_end_ts), 0) AS new_members,
      COALESCE((SELECT COUNT(*) FROM public.parts WHERE created_at >= dy.day_start_ts AND created_at < dy.day_end_ts), 0) AS new_parts
    FROM daily dy
    ORDER BY dy.date
  ),
  daily_json AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('date', date, 'visitors', visitors, 'newMembers', new_members, 'newParts', new_parts) ORDER BY date), '[]'::jsonb) AS arr
    FROM daily_series
  )
  SELECT jsonb_build_object(
    'visitorsTotal', (SELECT total30 FROM vis),
    'visitorsDaily', (SELECT today FROM vis),
    'visitorsWeekly', (SELECT week FROM vis),
    'visitorsMonthly', (SELECT month FROM vis),
    'distinctCities', (SELECT distinct_cities FROM cities_json),
    'uniqueVisitors30', (SELECT total30 FROM vis),
    'uniqueVisitorsToday', (SELECT today FROM vis),
    'sessions30', (SELECT sessions30 FROM vis),
    'sessionsToday', (SELECT sessions_today FROM vis),
    'pageViews30', (SELECT pageviews30 FROM vis),
    'pageViewsToday', (SELECT pageviews_today FROM vis),
    'cities', (SELECT arr FROM cities_json),
    'topParts', (SELECT arr FROM top_parts_json),
    'topSearches', (SELECT arr FROM top_searches_json),
    'topOem', (SELECT arr FROM top_oem_json),
    'devices', (SELECT arr FROM devices_json),
    'whatsappClicks', (SELECT wa FROM click_counts),
    'callClicks', (SELECT call FROM click_counts),
    'totalMembers', (SELECT total_members FROM totals),
    'newMembersToday', (SELECT new_members_today FROM totals),
    'totalParts', (SELECT total_parts FROM totals),
    'newPartsToday', (SELECT new_parts_today FROM totals),
    'topSellers', (SELECT arr FROM top_sellers_json),
    'dailySeries', (SELECT arr FROM daily_json),
    'debug', jsonb_build_object(
      'snapshotAt', _now,
      'tz', _tz,
      'dayStart', _day_start,
      'weekStart', _week_start,
      'monthStart', _month_start,
      'analyticsRowsLast30', (SELECT COUNT(*) FROM ev),
      'pageViewRowsLast30', (SELECT COUNT(*) FROM pv),
      'distinctSessionsLast30', (SELECT sessions30 FROM vis),
      'distinctVisitorsTodayFromUsers', (SELECT COUNT(DISTINCT user_id) FROM pv WHERE user_id IS NOT NULL AND created_at >= _day_start)
    )
  )
  INTO _result;

  RETURN _result;
END;
$function$;