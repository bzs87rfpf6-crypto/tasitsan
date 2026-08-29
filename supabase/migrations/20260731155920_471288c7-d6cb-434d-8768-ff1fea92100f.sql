-- 1) visitor_id for unique-visitor counting
ALTER TABLE public.analytics_events ADD COLUMN IF NOT EXISTS visitor_id text;
CREATE INDEX IF NOT EXISTS idx_analytics_events_visitor ON public.analytics_events (visitor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_created_type ON public.analytics_events (created_at DESC, event_type);

-- 2) Turkish province normalization
CREATE OR REPLACE FUNCTION public.tr_city_slug(_city text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT NULLIF(regexp_replace(
    translate(lower(coalesce(_city,'')),
      'ıİİşŞğĞüÜöÖçÇâîû',
      'iiissgguuooccaiu'),
    '[^a-z]', '', 'g'), '');
$$;

CREATE OR REPLACE FUNCTION public.tr_normalize_city(_city text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  s text := public.tr_city_slug(_city);
  provinces text[] := ARRAY[
    'adana','adiyaman','afyonkarahisar','agri','aksaray','amasya','ankara','antalya','ardahan','artvin',
    'aydin','balikesir','bartin','batman','bayburt','bilecik','bingol','bitlis','bolu','burdur','bursa',
    'canakkale','cankiri','corum','denizli','diyarbakir','duzce','edirne','elazig','erzincan','erzurum',
    'eskisehir','gaziantep','giresun','gumushane','hakkari','hatay','igdir','isparta','istanbul','izmir',
    'kahramanmaras','karabuk','karaman','kars','kastamonu','kayseri','kilis','kirikkale','kirklareli',
    'kirsehir','kocaeli','konya','kutahya','malatya','manisa','mardin','mersin','mugla','mus','nevsehir',
    'nigde','ordu','osmaniye','rize','sakarya','samsun','sanliurfa','siirt','sinop','sivas','sirnak',
    'tekirdag','tokat','trabzon','tunceli','usak','van','yalova','yozgat','zonguldak'
  ];
  names text[] := ARRAY[
    'Adana','Adıyaman','Afyonkarahisar','Ağrı','Aksaray','Amasya','Ankara','Antalya','Ardahan','Artvin',
    'Aydın','Balıkesir','Bartın','Batman','Bayburt','Bilecik','Bingöl','Bitlis','Bolu','Burdur','Bursa',
    'Çanakkale','Çankırı','Çorum','Denizli','Diyarbakır','Düzce','Edirne','Elazığ','Erzincan','Erzurum',
    'Eskişehir','Gaziantep','Giresun','Gümüşhane','Hakkari','Hatay','Iğdır','Isparta','İstanbul','İzmir',
    'Kahramanmaraş','Karabük','Karaman','Kars','Kastamonu','Kayseri','Kilis','Kırıkkale','Kırklareli',
    'Kırşehir','Kocaeli','Konya','Kütahya','Malatya','Manisa','Mardin','Mersin','Muğla','Muş','Nevşehir',
    'Niğde','Ordu','Osmaniye','Rize','Sakarya','Samsun','Şanlıurfa','Siirt','Sinop','Sivas','Şırnak',
    'Tekirdağ','Tokat','Trabzon','Tunceli','Uşak','Van','Yalova','Yozgat','Zonguldak'
  ];
  idx int;
BEGIN
  IF s IS NULL THEN RETURN NULL; END IF;

  -- common aliases / district-to-province folding
  s := CASE s
    WHEN 'afyon' THEN 'afyonkarahisar'
    WHEN 'maras' THEN 'kahramanmaras'
    WHEN 'kmaras' THEN 'kahramanmaras'
    WHEN 'marash' THEN 'kahramanmaras'
    WHEN 'urfa' THEN 'sanliurfa'
    WHEN 'icel' THEN 'mersin'
    WHEN 'antep' THEN 'gaziantep'
    WHEN 'izmit' THEN 'kocaeli'
    WHEN 'adapazari' THEN 'sakarya'
    WHEN 'constantinople' THEN 'istanbul'
    WHEN 'stanbul' THEN 'istanbul'
    WHEN 'smyrna' THEN 'izmir'
    WHEN 'sehitkamil' THEN 'gaziantep'
    ELSE s
  END;

  idx := array_position(provinces, s);
  IF idx IS NOT NULL THEN RETURN names[idx]; END IF;

  -- prefix match (e.g. "istanbulturkiye", "ankaracankaya")
  FOR idx IN 1..array_length(provinces,1) LOOP
    IF s LIKE provinces[idx] || '%' AND length(provinces[idx]) >= 4 THEN
      RETURN names[idx];
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$;

-- 3) Stats cache
CREATE TABLE IF NOT EXISTS public.stats_cache (
  key text PRIMARY KEY,
  payload jsonb NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.stats_cache TO service_role;
ALTER TABLE public.stats_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stats_cache service only" ON public.stats_cache FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4) Central public platform stats (cached, 60s)
CREATE OR REPLACE FUNCTION public.platform_stats()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _cached jsonb;
  _at timestamptz;
  _r jsonb;
BEGIN
  SELECT payload, computed_at INTO _cached, _at
  FROM public.stats_cache WHERE key = 'platform_stats';

  IF _cached IS NOT NULL AND _at > now() - interval '60 seconds' THEN
    RETURN _cached || jsonb_build_object('cached', true, 'computed_at', _at);
  END IF;

  SELECT jsonb_build_object(
    'active_parts', (SELECT count(*) FROM parts WHERE status='approved' AND COALESCE(is_sold,false)=false),
    'total_parts', (SELECT count(*) FROM parts WHERE status='approved'),
    'brand_count', (SELECT count(DISTINCT NULLIF(btrim(brand),'')) FROM parts WHERE status='approved'),
    'model_count', (SELECT count(DISTINCT NULLIF(btrim(model),'')) FROM parts WHERE status='approved'),
    'total_oem', (SELECT count(DISTINCT NULLIF(btrim(oem_code),'')) FROM parts WHERE status='approved'),
    'verified_sellers', (SELECT count(*) FROM profiles WHERE COALESCE(is_verified,false)=true),
    'total_sellers', (SELECT count(DISTINCT seller_id) FROM parts WHERE status='approved'),
    'total_cities', (SELECT count(DISTINCT public.tr_normalize_city(city)) FROM parts WHERE status='approved' AND public.tr_normalize_city(city) IS NOT NULL),
    'last24h_new', (SELECT count(*) FROM parts WHERE status='approved' AND created_at >= now() - interval '24 hours'),
    'week_count', (SELECT count(*) FROM parts WHERE status='approved' AND created_at >= now() - interval '7 days'),
    'last24h_views', (SELECT count(*) FROM part_views WHERE created_at >= now() - interval '24 hours'),
    'completed_sales', (SELECT count(*) FROM parts WHERE COALESCE(is_sold,false)=true),
    'open_part_requests', (SELECT count(*) FROM part_requests WHERE COALESCE(is_active,true)=true AND deleted_at IS NULL),
    'total_stock_value', COALESCE((
      SELECT sum(COALESCE(price,0) * GREATEST(COALESCE(stock_quantity,1),1))
      FROM parts WHERE status='approved' AND COALESCE(is_sold,false)=false AND price IS NOT NULL AND price > 0
    ), 0)
  ) INTO _r;

  INSERT INTO public.stats_cache(key, payload, computed_at)
  VALUES ('platform_stats', _r, now())
  ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload, computed_at = EXCLUDED.computed_at;

  RETURN _r || jsonb_build_object('cached', false, 'computed_at', now());
END;
$$;

REVOKE ALL ON FUNCTION public.platform_stats() FROM public;
GRANT EXECUTE ON FUNCTION public.platform_stats() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tr_normalize_city(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tr_city_slug(text) TO anon, authenticated, service_role;

-- keep legacy RPCs consistent with the central service
CREATE OR REPLACE FUNCTION public.guest_welcome_stats()
RETURNS jsonb
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$ SELECT public.platform_stats(); $$;