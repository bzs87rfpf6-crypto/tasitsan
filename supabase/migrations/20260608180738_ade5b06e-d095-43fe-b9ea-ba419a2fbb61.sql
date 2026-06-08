
-- 1) Normalize profile cities
UPDATE public.profiles
   SET city = public.tr_city_normalize(city)
 WHERE city IS NOT NULL
   AND city IS DISTINCT FROM public.tr_city_normalize(city);

-- 2) Normalize analytics_events cities (TR rows only — keep abroad as-is)
UPDATE public.analytics_events
   SET city = public.tr_city_normalize(city)
 WHERE city IS NOT NULL
   AND (country IS NULL OR country ~* '^(turkey|t[uü]rkiye|tr)$')
   AND city IS DISTINCT FROM public.tr_city_normalize(city);

-- 3) Remove meaningless search queries (under 3 chars / no letters)
DELETE FROM public.search_logs
 WHERE query IS NOT NULL
   AND NOT public.is_meaningful_query(query);

-- 4) Trim remaining search queries
UPDATE public.search_logs
   SET query = trim(regexp_replace(query, '\s+', ' ', 'g'))
 WHERE query IS NOT NULL
   AND query IS DISTINCT FROM trim(regexp_replace(query, '\s+', ' ', 'g'));

-- 5) Drop too-short OEM searches
DELETE FROM public.oem_searches
 WHERE length(trim(oem)) < 3;

-- 6) Upper/trim normalize remaining OEMs (trigger already does this on new rows)
UPDATE public.oem_searches
   SET oem = upper(trim(oem))
 WHERE oem IS DISTINCT FROM upper(trim(oem));
