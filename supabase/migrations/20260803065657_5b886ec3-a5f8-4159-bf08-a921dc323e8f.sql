-- ============ Fırsatlar / Talep İstihbaratı ============

CREATE OR REPLACE FUNCTION public.normalize_demand_key(_raw text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT NULLIF(regexp_replace(upper(coalesce(_raw,'')), '[^A-Z0-9]', '', 'g'), '')
$$;

CREATE TABLE public.demand_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  oem_code text,
  oem_normalized text,
  keyword text,
  keyword_key text,
  dedupe_key text NOT NULL,
  part_name text,
  brand text,
  model text,
  year integer,
  vehicle_class text,
  category text,
  search_count integer NOT NULL DEFAULT 0,
  unique_users integer NOT NULL DEFAULT 0,
  count_7d integer NOT NULL DEFAULT 0,
  count_30d integer NOT NULL DEFAULT 0,
  repeat_ratio numeric NOT NULL DEFAULT 0,
  score integer NOT NULL DEFAULT 0,
  tier text NOT NULL DEFAULT 'low',
  in_stock_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open',
  fulfilled_at timestamptz,
  fulfilled_part_id uuid,
  ai_note text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX demand_signals_dedupe_uidx ON public.demand_signals (dedupe_key);
CREATE INDEX demand_signals_score_idx ON public.demand_signals (score DESC, last_seen_at DESC);
CREATE INDEX demand_signals_status_idx ON public.demand_signals (status, last_seen_at DESC);
CREATE INDEX demand_signals_oem_idx ON public.demand_signals (oem_normalized);

GRANT SELECT ON public.demand_signals TO authenticated;
GRANT ALL ON public.demand_signals TO service_role;
ALTER TABLE public.demand_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read demand signals"
  ON public.demand_signals FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins manage demand signals"
  ON public.demand_signals FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE public.demand_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id uuid NOT NULL REFERENCES public.demand_signals(id) ON DELETE CASCADE,
  user_id uuid,
  ip_hash text,
  source text,
  city text,
  results_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX demand_events_signal_idx ON public.demand_events (signal_id, created_at DESC);
CREATE INDEX demand_events_user_idx ON public.demand_events (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX demand_events_created_idx ON public.demand_events (created_at DESC);

GRANT SELECT ON public.demand_events TO authenticated;
GRANT ALL ON public.demand_events TO service_role;
ALTER TABLE public.demand_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read demand events"
  ON public.demand_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_demand_signals_updated
  BEFORE UPDATE ON public.demand_signals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- score helper ----------
CREATE OR REPLACE FUNCTION public.demand_compute_score(
  _search_count integer, _unique_users integer, _c7 integer, _c30 integer,
  _in_stock integer, _repeat numeric
) RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT LEAST(100, GREATEST(0, (
      LEAST(30, coalesce(_search_count,0) * 3)
    + LEAST(25, coalesce(_unique_users,0) * 5)
    + LEAST(20, coalesce(_c7,0) * 4)
    + LEAST(10, coalesce(_c30,0))
    + CASE WHEN coalesce(_in_stock,0) = 0 THEN 15 ELSE 0 END
    + LEAST(10, (coalesce(_repeat,0) * 10)::int)
  )::int))
$$;

CREATE OR REPLACE FUNCTION public.demand_tier(_score integer)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN _score >= 80 THEN 'critical'
              WHEN _score >= 60 THEN 'high'
              WHEN _score >= 35 THEN 'medium'
              ELSE 'low' END
$$;

-- ---------- kayıt ----------
CREATE OR REPLACE FUNCTION public.record_demand_signal(
  _oem text DEFAULT NULL,
  _query text DEFAULT NULL,
  _part_name text DEFAULT NULL,
  _brand text DEFAULT NULL,
  _model text DEFAULT NULL,
  _year integer DEFAULT NULL,
  _vehicle_class text DEFAULT NULL,
  _category text DEFAULT NULL,
  _ip_hash text DEFAULT NULL,
  _source text DEFAULT NULL,
  _city text DEFAULT NULL,
  _results_count integer DEFAULT 0,
  _is_internal boolean DEFAULT false
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_oem_norm text := public.normalize_demand_key(_oem);
  v_kw text := NULLIF(btrim(coalesce(_query, _part_name, '')), '');
  v_kw_key text;
  v_key text;
  v_id uuid;
  v_dup boolean;
  v_stock integer;
BEGIN
  -- spam / iç trafik koruması
  IF _is_internal THEN RETURN NULL; END IF;
  IF v_uid IS NOT NULL AND public.has_role(v_uid, 'admin'::app_role) THEN RETURN NULL; END IF;
  IF coalesce(_results_count, 0) > 2 THEN RETURN NULL; END IF;

  v_kw_key := public.normalize_demand_key(v_kw);
  v_key := coalesce(v_oem_norm, v_kw_key);
  IF v_key IS NULL OR length(v_key) < 3 THEN RETURN NULL; END IF;

  INSERT INTO public.demand_signals (
    oem_code, oem_normalized, keyword, keyword_key, dedupe_key,
    part_name, brand, model, year, vehicle_class, category
  ) VALUES (
    NULLIF(btrim(coalesce(_oem,'')),''), v_oem_norm, left(coalesce(v_kw,''), 200), v_kw_key, v_key,
    NULLIF(left(btrim(coalesce(_part_name,'')),120),''),
    NULLIF(left(btrim(coalesce(_brand,'')),80),''),
    NULLIF(left(btrim(coalesce(_model,'')),80),''),
    _year, NULLIF(_vehicle_class,''), NULLIF(left(btrim(coalesce(_category,'')),80),'')
  )
  ON CONFLICT (dedupe_key) DO UPDATE SET
    part_name = coalesce(public.demand_signals.part_name, EXCLUDED.part_name),
    brand     = coalesce(public.demand_signals.brand, EXCLUDED.brand),
    model     = coalesce(public.demand_signals.model, EXCLUDED.model),
    year      = coalesce(public.demand_signals.year, EXCLUDED.year),
    category  = coalesce(public.demand_signals.category, EXCLUDED.category),
    vehicle_class = coalesce(public.demand_signals.vehicle_class, EXCLUDED.vehicle_class),
    oem_code  = coalesce(public.demand_signals.oem_code, EXCLUDED.oem_code)
  RETURNING id INTO v_id;

  -- 30 dakikalık tekil pencere (aynı kullanıcı / IP)
  SELECT EXISTS (
    SELECT 1 FROM public.demand_events e
    WHERE e.signal_id = v_id
      AND e.created_at > now() - interval '30 minutes'
      AND ((v_uid IS NOT NULL AND e.user_id = v_uid)
        OR (v_uid IS NULL AND _ip_hash IS NOT NULL AND e.ip_hash = _ip_hash))
  ) INTO v_dup;

  INSERT INTO public.demand_events (signal_id, user_id, ip_hash, source, city, results_count)
  VALUES (v_id, v_uid, left(coalesce(_ip_hash,''),64), NULLIF(left(coalesce(_source,''),60),''),
          NULLIF(left(coalesce(_city,''),80),''), coalesce(_results_count,0));

  IF v_dup THEN RETURN v_id; END IF;

  SELECT count(*) INTO v_stock
  FROM public.parts p
  WHERE p.status = 'active' AND coalesce(p.is_sold,false) = false
    AND (
      (v_oem_norm IS NOT NULL AND public.normalize_demand_key(p.oem_code) = v_oem_norm)
      OR (v_oem_norm IS NULL AND v_kw IS NOT NULL AND p.title ILIKE '%' || v_kw || '%')
    );

  UPDATE public.demand_signals s SET
    search_count = s.search_count + 1,
    last_seen_at = now(),
    in_stock_count = coalesce(v_stock,0),
    unique_users = (
      SELECT count(DISTINCT coalesce(e.user_id::text, e.ip_hash))
      FROM public.demand_events e WHERE e.signal_id = v_id
    ),
    count_7d = (SELECT count(*) FROM public.demand_events e
                WHERE e.signal_id = v_id AND e.created_at > now() - interval '7 days'),
    count_30d = (SELECT count(*) FROM public.demand_events e
                 WHERE e.signal_id = v_id AND e.created_at > now() - interval '30 days')
  WHERE s.id = v_id;

  UPDATE public.demand_signals s SET
    repeat_ratio = CASE WHEN s.unique_users > 0 THEN round(s.search_count::numeric / s.unique_users, 2) ELSE 0 END,
    score = public.demand_compute_score(s.search_count, s.unique_users, s.count_7d, s.count_30d, s.in_stock_count,
             CASE WHEN s.unique_users > 0 THEN s.search_count::numeric / s.unique_users ELSE 0 END),
    tier = public.demand_tier(public.demand_compute_score(s.search_count, s.unique_users, s.count_7d, s.count_30d, s.in_stock_count,
             CASE WHEN s.unique_users > 0 THEN s.search_count::numeric / s.unique_users ELSE 0 END))
  WHERE s.id = v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_demand_signal(text,text,text,text,text,integer,text,text,text,text,text,integer,boolean) TO anon, authenticated;

-- ---------- puan yenileme (gece işi) ----------
CREATE OR REPLACE FUNCTION public.refresh_demand_scores()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  UPDATE public.demand_signals s SET
    count_7d = (SELECT count(*) FROM public.demand_events e WHERE e.signal_id = s.id AND e.created_at > now() - interval '7 days'),
    count_30d = (SELECT count(*) FROM public.demand_events e WHERE e.signal_id = s.id AND e.created_at > now() - interval '30 days'),
    in_stock_count = (
      SELECT count(*) FROM public.parts p
      WHERE p.status='active' AND coalesce(p.is_sold,false)=false
        AND s.oem_normalized IS NOT NULL
        AND public.normalize_demand_key(p.oem_code) = s.oem_normalized
    );
  UPDATE public.demand_signals s SET
    repeat_ratio = CASE WHEN s.unique_users > 0 THEN round(s.search_count::numeric / s.unique_users, 2) ELSE 0 END,
    score = public.demand_compute_score(s.search_count, s.unique_users, s.count_7d, s.count_30d, s.in_stock_count, s.repeat_ratio),
    tier  = public.demand_tier(public.demand_compute_score(s.search_count, s.unique_users, s.count_7d, s.count_30d, s.in_stock_count, s.repeat_ratio));
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.refresh_demand_scores() FROM anon;
GRANT EXECUTE ON FUNCTION public.refresh_demand_scores() TO authenticated, service_role;

-- ---------- satıcı fırsat listesi ----------
CREATE OR REPLACE FUNCTION public.demand_opportunities(_limit integer DEFAULT 50, _search text DEFAULT NULL, _only_missing boolean DEFAULT false)
RETURNS TABLE(
  id uuid, oem_code text, keyword text, part_name text, brand text, model text,
  year integer, category text, vehicle_class text,
  search_count integer, unique_users integer, count_7d integer, count_30d integer,
  in_stock_count integer, score integer, tier text, status text, last_seen_at timestamptz
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, s.oem_code, s.keyword, s.part_name, s.brand, s.model, s.year, s.category, s.vehicle_class,
         s.search_count, s.unique_users, s.count_7d, s.count_30d, s.in_stock_count,
         s.score, s.tier, s.status, s.last_seen_at
  FROM public.demand_signals s
  WHERE auth.uid() IS NOT NULL
    AND (_only_missing = false OR s.in_stock_count = 0)
    AND (_search IS NULL OR _search = '' OR
         s.oem_code ILIKE '%'||_search||'%' OR s.keyword ILIKE '%'||_search||'%' OR
         s.part_name ILIKE '%'||_search||'%' OR s.brand ILIKE '%'||_search||'%')
  ORDER BY s.score DESC, s.last_seen_at DESC
  LIMIT LEAST(coalesce(_limit,50), 200)
$$;
GRANT EXECUTE ON FUNCTION public.demand_opportunities(integer,text,boolean) TO authenticated;

-- ---------- ana sayfa: bugün en çok aranan ----------
CREATE OR REPLACE FUNCTION public.top_demand_today(_limit integer DEFAULT 10)
RETURNS TABLE(oem_code text, label text, brand text, category text, search_count integer, score integer, tier text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.oem_code,
         coalesce(NULLIF(s.part_name,''), NULLIF(s.keyword,''), s.oem_code) AS label,
         s.brand, s.category,
         (SELECT count(*)::int FROM public.demand_events e
           WHERE e.signal_id = s.id AND e.created_at >= (now() AT TIME ZONE 'Europe/Istanbul')::date) AS search_count,
         s.score, s.tier
  FROM public.demand_signals s
  WHERE s.last_seen_at > now() - interval '2 days'
  ORDER BY 5 DESC, s.score DESC
  LIMIT LEAST(coalesce(_limit,10), 20)
$$;
GRANT EXECUTE ON FUNCTION public.top_demand_today(integer) TO anon, authenticated;

-- ---------- admin analiz ----------
CREATE OR REPLACE FUNCTION public.admin_demand_analytics(_days integer DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT jsonb_build_object(
    'totals', (SELECT jsonb_build_object(
        'signals', count(*),
        'open', count(*) FILTER (WHERE status='open'),
        'fulfilled', count(*) FILTER (WHERE status='fulfilled'),
        'missing', count(*) FILTER (WHERE in_stock_count=0),
        'searches', coalesce(sum(search_count),0)
      ) FROM public.demand_signals),
    'top_oems', (SELECT coalesce(jsonb_agg(x),'[]'::jsonb) FROM (
        SELECT oem_code, part_name, brand, search_count, score, tier, in_stock_count
        FROM public.demand_signals WHERE oem_code IS NOT NULL
        ORDER BY search_count DESC LIMIT 20) x),
    'top_keywords', (SELECT coalesce(jsonb_agg(x),'[]'::jsonb) FROM (
        SELECT keyword, search_count, score FROM public.demand_signals
        WHERE keyword IS NOT NULL AND keyword <> '' ORDER BY search_count DESC LIMIT 20) x),
    'missing', (SELECT coalesce(jsonb_agg(x),'[]'::jsonb) FROM (
        SELECT oem_code, coalesce(part_name, keyword) AS label, brand, search_count, unique_users, score, tier, last_seen_at
        FROM public.demand_signals WHERE in_stock_count = 0
        ORDER BY score DESC, search_count DESC LIMIT 30) x),
    'rising', (SELECT coalesce(jsonb_agg(x),'[]'::jsonb) FROM (
        SELECT oem_code, coalesce(part_name, keyword) AS label, brand, count_7d, count_30d, score, tier
        FROM public.demand_signals WHERE count_7d > 0
        ORDER BY count_7d DESC, score DESC LIMIT 20) x),
    'repeated', (SELECT coalesce(jsonb_agg(x),'[]'::jsonb) FROM (
        SELECT oem_code, coalesce(part_name, keyword) AS label, search_count, unique_users, repeat_ratio
        FROM public.demand_signals WHERE unique_users > 0
        ORDER BY repeat_ratio DESC, search_count DESC LIMIT 20) x),
    'by_brand', (SELECT coalesce(jsonb_agg(x),'[]'::jsonb) FROM (
        SELECT brand, sum(search_count)::int AS searches, count(*)::int AS signals
        FROM public.demand_signals WHERE brand IS NOT NULL GROUP BY brand
        ORDER BY searches DESC LIMIT 15) x),
    'by_category', (SELECT coalesce(jsonb_agg(x),'[]'::jsonb) FROM (
        SELECT category, sum(search_count)::int AS searches, count(*)::int AS signals
        FROM public.demand_signals WHERE category IS NOT NULL GROUP BY category
        ORDER BY searches DESC LIMIT 15) x),
    'daily', (SELECT coalesce(jsonb_agg(x ORDER BY x.day),'[]'::jsonb) FROM (
        SELECT (e.created_at AT TIME ZONE 'Europe/Istanbul')::date AS day, count(*)::int AS searches
        FROM public.demand_events e
        WHERE e.created_at > now() - make_interval(days => LEAST(coalesce(_days,30), 90))
        GROUP BY 1) x),
    'weekly', (SELECT coalesce(jsonb_agg(x ORDER BY x.week),'[]'::jsonb) FROM (
        SELECT date_trunc('week', e.created_at AT TIME ZONE 'Europe/Istanbul')::date AS week, count(*)::int AS searches
        FROM public.demand_events e WHERE e.created_at > now() - interval '90 days'
        GROUP BY 1) x),
    'monthly', (SELECT coalesce(jsonb_agg(x ORDER BY x.month),'[]'::jsonb) FROM (
        SELECT date_trunc('month', e.created_at AT TIME ZONE 'Europe/Istanbul')::date AS month, count(*)::int AS searches
        FROM public.demand_events e WHERE e.created_at > now() - interval '365 days'
        GROUP BY 1) x),
    'sources', (SELECT coalesce(jsonb_agg(x),'[]'::jsonb) FROM (
        SELECT coalesce(source,'direct') AS source, count(*)::int AS hits
        FROM public.demand_events GROUP BY 1 ORDER BY hits DESC LIMIT 10) x)
  ) INTO result;
  RETURN result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_demand_analytics(integer) TO authenticated;

-- ---------- ürün eklenince talebi karşıla + bildirim ----------
CREATE OR REPLACE FUNCTION public.fulfill_demand_for_part()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_norm text := public.normalize_demand_key(NEW.oem_code);
  s record;
BEGIN
  IF NEW.status <> 'active' OR coalesce(NEW.is_sold,false) THEN RETURN NEW; END IF;
  IF v_norm IS NULL THEN RETURN NEW; END IF;

  FOR s IN
    SELECT * FROM public.demand_signals
    WHERE oem_normalized = v_norm AND status = 'open'
  LOOP
    UPDATE public.demand_signals
      SET status='fulfilled', fulfilled_at=now(), fulfilled_part_id=NEW.id,
          in_stock_count = in_stock_count + 1
      WHERE id = s.id;

    INSERT INTO public.user_notifications (user_id, kind, title, body, link, related_id)
    SELECT DISTINCT e.user_id, 'demand_fulfilled',
           'Aradığın parça eklendi',
           coalesce(s.part_name, s.keyword, s.oem_code) || ' için yeni ilan yayında.',
           '/parts/' || coalesce(NEW.seo_slug, NEW.id::text),
           NEW.id
    FROM public.demand_events e
    WHERE e.signal_id = s.id AND e.user_id IS NOT NULL AND e.user_id <> NEW.seller_id;
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_parts_fulfill_demand
  AFTER INSERT OR UPDATE OF status, oem_code, is_sold ON public.parts
  FOR EACH ROW EXECUTE FUNCTION public.fulfill_demand_for_part();