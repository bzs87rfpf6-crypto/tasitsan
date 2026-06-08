
CREATE OR REPLACE FUNCTION public.tr_lower_ascii(_t text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT translate(lower(coalesce(_t,'')),
    'çğıİöşüÇĞıİÖŞÜâîûÂÎÛ',
    'cgiiosucgiiosuaiuaiu')
$$;

CREATE OR REPLACE FUNCTION public.tr_city_normalize(_raw text)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE k text;
BEGIN
  IF _raw IS NULL OR length(trim(_raw)) = 0 THEN RETURN NULL; END IF;
  k := public.tr_lower_ascii(trim(_raw));
  k := regexp_replace(k, '\s+', ' ', 'g');
  RETURN CASE k
    WHEN 'cankaya' THEN 'Ankara' WHEN 'kecioren' THEN 'Ankara' WHEN 'mamak' THEN 'Ankara'
    WHEN 'yenimahalle' THEN 'Ankara' WHEN 'etimesgut' THEN 'Ankara' WHEN 'sincan' THEN 'Ankara'
    WHEN 'altindag' THEN 'Ankara' WHEN 'pursaklar' THEN 'Ankara' WHEN 'golbasi' THEN 'Ankara'
    WHEN 'polatli' THEN 'Ankara' WHEN 'kahramankazan' THEN 'Ankara' WHEN 'beypazari' THEN 'Ankara'
    WHEN 'kadikoy' THEN 'İstanbul' WHEN 'besiktas' THEN 'İstanbul' WHEN 'beyoglu' THEN 'İstanbul'
    WHEN 'sisli' THEN 'İstanbul' WHEN 'uskudar' THEN 'İstanbul' WHEN 'pendik' THEN 'İstanbul'
    WHEN 'maltepe' THEN 'İstanbul' WHEN 'kartal' THEN 'İstanbul' WHEN 'umraniye' THEN 'İstanbul'
    WHEN 'atasehir' THEN 'İstanbul' WHEN 'bakirkoy' THEN 'İstanbul' WHEN 'bahcelievler' THEN 'İstanbul'
    WHEN 'bagcilar' THEN 'İstanbul' WHEN 'esenyurt' THEN 'İstanbul' WHEN 'kucukcekmece' THEN 'İstanbul'
    WHEN 'buyukcekmece' THEN 'İstanbul' WHEN 'fatih' THEN 'İstanbul' WHEN 'eyup' THEN 'İstanbul'
    WHEN 'eyupsultan' THEN 'İstanbul' WHEN 'gaziosmanpasa' THEN 'İstanbul' WHEN 'sariyer' THEN 'İstanbul'
    WHEN 'sultanbeyli' THEN 'İstanbul' WHEN 'tuzla' THEN 'İstanbul' WHEN 'beylikduzu' THEN 'İstanbul'
    WHEN 'avcilar' THEN 'İstanbul' WHEN 'basaksehir' THEN 'İstanbul' WHEN 'zeytinburnu' THEN 'İstanbul'
    WHEN 'istanbul' THEN 'İstanbul'
    WHEN 'konak' THEN 'İzmir' WHEN 'bornova' THEN 'İzmir' WHEN 'karsiyaka' THEN 'İzmir'
    WHEN 'buca' THEN 'İzmir' WHEN 'cigli' THEN 'İzmir' WHEN 'gaziemir' THEN 'İzmir'
    WHEN 'bayrakli' THEN 'İzmir' WHEN 'izmir' THEN 'İzmir'
    WHEN 'osmangazi' THEN 'Bursa' WHEN 'nilufer' THEN 'Bursa' WHEN 'yildirim' THEN 'Bursa' WHEN 'bursa' THEN 'Bursa'
    WHEN 'muratpasa' THEN 'Antalya' WHEN 'kepez' THEN 'Antalya' WHEN 'konyaalti' THEN 'Antalya' WHEN 'antalya' THEN 'Antalya'
    WHEN 'melikgazi' THEN 'Kayseri' WHEN 'kocasinan' THEN 'Kayseri' WHEN 'talas' THEN 'Kayseri' WHEN 'kayseri' THEN 'Kayseri'
    WHEN 'ilkadim' THEN 'Samsun' WHEN 'atakum' THEN 'Samsun' WHEN 'canik' THEN 'Samsun' WHEN 'bafra' THEN 'Samsun' WHEN 'samsun' THEN 'Samsun'
    WHEN 'kayapinar' THEN 'Diyarbakır' WHEN 'baglar' THEN 'Diyarbakır' WHEN 'yenisehir' THEN 'Diyarbakır' WHEN 'sur' THEN 'Diyarbakır' WHEN 'diyarbakir' THEN 'Diyarbakır'
    WHEN 'nevsehir' THEN 'Nevşehir' WHEN 'bulancak' THEN 'Giresun' WHEN 'boyabat' THEN 'Sinop'
    WHEN 'ortahisar' THEN 'Trabzon' WHEN 'yesilce' THEN 'Trabzon' WHEN 'trabzon' THEN 'Trabzon'
    WHEN 'ankara' THEN 'Ankara' WHEN 'adana' THEN 'Adana' WHEN 'edirne' THEN 'Edirne' WHEN 'ordu' THEN 'Ordu'
    WHEN 'mersin' THEN 'Mersin' WHEN 'konya' THEN 'Konya' WHEN 'gaziantep' THEN 'Gaziantep' WHEN 'sanliurfa' THEN 'Şanlıurfa'
    WHEN 'kahramanmaras' THEN 'Kahramanmaraş' WHEN 'eskisehir' THEN 'Eskişehir' WHEN 'mugla' THEN 'Muğla' WHEN 'aydin' THEN 'Aydın'
    WHEN 'denizli' THEN 'Denizli' WHEN 'malatya' THEN 'Malatya' WHEN 'tekirdag' THEN 'Tekirdağ' WHEN 'manisa' THEN 'Manisa'
    WHEN 'balikesir' THEN 'Balıkesir' WHEN 'kocaeli' THEN 'Kocaeli' WHEN 'sakarya' THEN 'Sakarya' WHEN 'hatay' THEN 'Hatay'
    WHEN 'van' THEN 'Van' WHEN 'erzurum' THEN 'Erzurum' WHEN 'rize' THEN 'Rize'
    WHEN 'merkez' THEN NULL
    ELSE initcap(k)
  END;
END $$;

CREATE OR REPLACE FUNCTION public.is_meaningful_query(_q text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT _q IS NOT NULL
     AND length(regexp_replace(_q, '\s+', '', 'g')) >= 3
     AND _q ~ '[A-Za-zÇĞİÖŞÜçğıöşü]'
$$;

CREATE OR REPLACE FUNCTION public.tr_query_stem(_q text)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  s text; parts text[]; out_parts text[] := '{}'; w text;
BEGIN
  IF _q IS NULL THEN RETURN NULL; END IF;
  s := public.tr_lower_ascii(_q);
  s := regexp_replace(s, '[^a-z0-9 ]', ' ', 'g');
  s := regexp_replace(s, '\s+', ' ', 'g');
  s := trim(s);
  IF s = '' THEN RETURN NULL; END IF;
  parts := string_to_array(s, ' ');
  FOREACH w IN ARRAY parts LOOP
    IF length(w) > 4 THEN
      w := regexp_replace(w, '(lari|leri|larin|lerin|larini|lerini)$', '');
      w := regexp_replace(w, '(lar|ler)$', '');
      w := regexp_replace(w, '(isi|usu|asi|esi|sini)$', '');
      w := regexp_replace(w, '(si|su|sa|se)$', '');
      w := regexp_replace(w, '(i|u|a|e)$', '');
    END IF;
    IF length(w) >= 2 THEN
      out_parts := array_append(out_parts, w);
    END IF;
  END LOOP;
  RETURN array_to_string(out_parts, ' ');
END $$;

CREATE OR REPLACE FUNCTION public.admin_dashboard_overview()
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_total_members bigint; v_verified_sellers bigint; v_active_sellers bigint;
  v_total_parts bigint; v_parts_today bigint; v_new_members_30d bigint;
  v_active_firms jsonb; v_viewed_firms jsonb; v_top_oem jsonb;
  v_top_searches_raw jsonb; v_top_searches_grp jsonb; v_no_results jsonb;
  v_today_views bigint; v_today_whatsapp bigint; v_today_calls bigint;
  v_bot_re text;
BEGIN
  IF NOT has_role(auth.uid(),'admin'::app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT coalesce(string_agg(pattern, '|'), 'bot|crawl|spider')
    INTO v_bot_re FROM public.bot_filter_rules WHERE enabled = true;

  SELECT count(*) INTO v_total_members FROM public.profiles;
  SELECT count(*) INTO v_verified_sellers FROM public.profiles WHERE is_verified = true;
  SELECT count(DISTINCT seller_id) INTO v_active_sellers FROM public.parts;
  SELECT count(*) INTO v_total_parts FROM public.parts;
  SELECT count(*) INTO v_parts_today FROM public.parts WHERE created_at >= date_trunc('day', now());
  SELECT count(*) INTO v_new_members_30d FROM public.profiles WHERE created_at >= now() - interval '30 days';

  WITH top AS (
    SELECT p.seller_id,
           count(*) FILTER (WHERE p.status='approved') AS active_parts,
           count(*) FILTER (WHERE p.status='pending') AS pending_parts,
           count(*) AS total_parts
      FROM public.parts p GROUP BY p.seller_id ORDER BY total_parts DESC LIMIT 20)
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'seller_id', t.seller_id, 'display_name', coalesce(pr.display_name,'—'),
    'city', public.tr_city_normalize(pr.city), 'is_verified', coalesce(pr.is_verified,false),
    'active_parts', t.active_parts, 'pending_parts', t.pending_parts, 'total_parts', t.total_parts
  ) ORDER BY t.total_parts DESC), '[]'::jsonb)
  INTO v_active_firms FROM top t LEFT JOIN public.profiles pr ON pr.id = t.seller_id;

  WITH views AS (
    SELECT (e.metadata->>'seller_id')::uuid AS seller_id, count(*)::bigint AS views_30d
      FROM public.analytics_events e
     WHERE e.event_type = 'profile_view'
       AND e.created_at >= now() - interval '30 days'
       AND (e.metadata->>'seller_id') IS NOT NULL
       AND (e.user_agent IS NULL OR e.user_agent !~* v_bot_re)
     GROUP BY 1 ORDER BY views_30d DESC LIMIT 20)
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'seller_id', v.seller_id, 'display_name', coalesce(pr.display_name,'—'),
    'city', public.tr_city_normalize(pr.city), 'is_verified', coalesce(pr.is_verified,false),
    'views_30d', v.views_30d
  ) ORDER BY v.views_30d DESC), '[]'::jsonb)
  INTO v_viewed_firms FROM views v LEFT JOIN public.profiles pr ON pr.id = v.seller_id;

  WITH t AS (
    SELECT upper(trim(s.oem)) AS oem, count(*)::bigint AS search_count
      FROM public.oem_searches s
     WHERE s.created_at >= now() - interval '30 days' AND length(trim(s.oem)) >= 3
     GROUP BY 1 ORDER BY search_count DESC LIMIT 15)
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'oem', oem, 'search_count', search_count,
    'listing_count', (SELECT count(*) FROM public.parts p
                       WHERE p.status='approved' AND t.oem = ANY(p.oem_codes))
  ) ORDER BY search_count DESC), '[]'::jsonb)
  INTO v_top_oem FROM t;

  WITH q AS (
    SELECT trim(s.query) AS query, count(*)::bigint AS search_count
      FROM public.search_logs s
     WHERE public.is_meaningful_query(s.query)
       AND s.created_at >= now() - interval '30 days'
     GROUP BY trim(s.query) ORDER BY search_count DESC LIMIT 15)
  SELECT coalesce(jsonb_agg(jsonb_build_object('query', query, 'search_count', search_count)
         ORDER BY search_count DESC), '[]'::jsonb)
  INTO v_top_searches_raw FROM q;

  WITH q AS (
    SELECT public.tr_query_stem(s.query) AS stem,
           (array_agg(s.query ORDER BY s.created_at DESC))[1] AS sample,
           count(*)::bigint AS search_count
      FROM public.search_logs s
     WHERE public.is_meaningful_query(s.query)
       AND s.created_at >= now() - interval '30 days'
     GROUP BY public.tr_query_stem(s.query)
     HAVING public.tr_query_stem(s.query) IS NOT NULL AND public.tr_query_stem(s.query) <> ''
     ORDER BY search_count DESC LIMIT 15)
  SELECT coalesce(jsonb_agg(jsonb_build_object('stem', stem, 'sample', sample, 'search_count', search_count)
         ORDER BY search_count DESC), '[]'::jsonb)
  INTO v_top_searches_grp FROM q;

  WITH nr AS (
    SELECT coalesce(s.query, s.oem) AS term, count(*)::bigint AS search_count, max(s.created_at) AS last_at
      FROM public.search_logs s
     WHERE s.results_count = 0
       AND s.created_at >= now() - interval '30 days'
       AND (public.is_meaningful_query(s.query) OR (s.oem IS NOT NULL AND length(s.oem) >= 3))
     GROUP BY coalesce(s.query, s.oem)
     ORDER BY search_count DESC, last_at DESC LIMIT 25)
  SELECT coalesce(jsonb_agg(jsonb_build_object('term', term, 'search_count', search_count, 'last_at', last_at)
         ORDER BY search_count DESC), '[]'::jsonb)
  INTO v_no_results FROM nr;

  SELECT count(*) INTO v_today_views FROM public.analytics_events
   WHERE event_type IN ('part_view','profile_view') AND created_at >= date_trunc('day', now())
     AND (user_agent IS NULL OR user_agent !~* v_bot_re);
  SELECT count(*) INTO v_today_whatsapp FROM public.analytics_events
   WHERE event_type = 'click_whatsapp' AND created_at >= date_trunc('day', now())
     AND (user_agent IS NULL OR user_agent !~* v_bot_re);
  SELECT count(*) INTO v_today_calls FROM public.analytics_events
   WHERE event_type = 'click_call' AND created_at >= date_trunc('day', now())
     AND (user_agent IS NULL OR user_agent !~* v_bot_re);

  RETURN jsonb_build_object(
    'total_members', v_total_members, 'verified_sellers', v_verified_sellers,
    'active_sellers', v_active_sellers, 'total_parts', v_total_parts,
    'parts_today', v_parts_today, 'new_members_30d', v_new_members_30d,
    'today_views', v_today_views, 'today_whatsapp', v_today_whatsapp, 'today_calls', v_today_calls,
    'active_firms', v_active_firms, 'viewed_firms', v_viewed_firms,
    'top_oem', v_top_oem, 'top_searches', v_top_searches_raw,
    'top_searches_grouped', v_top_searches_grp, 'no_result_searches', v_no_results);
END $$;

CREATE OR REPLACE FUNCTION public.record_part_view(_part_id uuid, _viewer_key text)
 RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_count bigint; v_recent boolean;
BEGIN
  IF _viewer_key IS NULL OR length(_viewer_key) < 8 OR length(_viewer_key) > 200 THEN
    SELECT count(*) INTO v_count FROM public.part_views WHERE part_id = _part_id;
    RETURN v_count;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.parts WHERE id = _part_id AND status = 'approved') THEN
    SELECT count(*) INTO v_count FROM public.part_views WHERE part_id = _part_id;
    RETURN v_count;
  END IF;
  SELECT EXISTS(SELECT 1 FROM public.part_views
    WHERE part_id = _part_id AND viewer_key = _viewer_key
      AND created_at > now() - interval '30 minutes') INTO v_recent;
  IF NOT v_recent THEN
    INSERT INTO public.part_views (part_id, viewer_key) VALUES (_part_id, _viewer_key)
    ON CONFLICT (part_id, viewer_key, view_date) DO NOTHING;
  END IF;
  SELECT count(*) INTO v_count FROM public.part_views WHERE part_id = _part_id;
  RETURN v_count;
END $$;
