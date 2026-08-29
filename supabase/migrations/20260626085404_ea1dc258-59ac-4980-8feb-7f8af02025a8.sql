
-- 1) Add click tracking to search_logs for conversion analytics
ALTER TABLE public.search_logs ADD COLUMN IF NOT EXISTS clicked_part_id uuid;
CREATE INDEX IF NOT EXISTS idx_search_logs_clicked_part ON public.search_logs(clicked_part_id) WHERE clicked_part_id IS NOT NULL;

-- Allow public/auth users to UPDATE their own search_log row (to set clicked_part_id) within a window
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='search_logs' AND policyname='Update own recent search log') THEN
    CREATE POLICY "Update own recent search log" ON public.search_logs
      FOR UPDATE TO anon, authenticated
      USING (created_at > now() - interval '1 hour')
      WITH CHECK (created_at > now() - interval '1 hour' AND (clicked_part_id IS NOT NULL));
  END IF;
END $$;

-- 2) Upgraded smart search: adds photo/stock/recency boost + _condition / _in_stock / _with_photo filters
CREATE OR REPLACE FUNCTION public.search_parts_smart(
  _q text DEFAULT NULL,
  _category text DEFAULT NULL,
  _part_type text DEFAULT NULL,
  _brand text DEFAULT NULL,
  _model text DEFAULT NULL,
  _year integer DEFAULT NULL,
  _min_price numeric DEFAULT NULL,
  _max_price numeric DEFAULT NULL,
  _city text DEFAULT NULL,
  _limit integer DEFAULT 60,
  _offset integer DEFAULT 0,
  _condition text DEFAULT NULL,
  _in_stock boolean DEFAULT NULL,
  _with_photo boolean DEFAULT NULL
)
RETURNS TABLE(
  id uuid, title text, brand text, model text, year integer, price numeric,
  city text, photos text[], condition text, category text, stock_quantity integer,
  oem_code text, oem_codes text[], seller_id uuid, part_type text,
  created_at timestamp with time zone, score integer, match_kind text, total_count bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  qn        text;
  qnorm_oem text;
  toks      text[];
  is_oemish boolean := false;
BEGIN
  qn := trim(regexp_replace(public.tr_lower_ascii(coalesce(_q,'')), '\s+', ' ', 'g'));
  qnorm_oem := public.normalize_oem_strict(coalesce(_q,''));
  is_oemish := length(qnorm_oem) >= 4 AND qnorm_oem ~ '[0-9]';

  IF qn = '' THEN
    toks := ARRAY[]::text[];
  ELSE
    SELECT coalesce(array_agg(t), ARRAY[]::text[]) INTO toks
      FROM unnest(string_to_array(qn, ' ')) t WHERE length(t) >= 2;
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT p.*,
           public.tr_lower_ascii(coalesce(p.title,''))       AS t_n,
           public.tr_lower_ascii(coalesce(p.brand,''))       AS b_n,
           public.tr_lower_ascii(coalesce(p.model,''))       AS m_n,
           public.tr_lower_ascii(coalesce(p.description,'')) AS d_n,
           public.tr_lower_ascii(coalesce(p.category,''))    AS cat_n
      FROM public.parts p
     WHERE p.status = 'approved'
       AND (_category   IS NULL OR p.category  = _category)
       AND (_part_type  IS NULL OR p.part_type = _part_type)
       AND (_brand      IS NULL OR p.brand ILIKE '%'||_brand||'%')
       AND (_model      IS NULL OR p.model ILIKE '%'||_model||'%')
       AND (_year       IS NULL OR p.year = _year)
       AND (_min_price  IS NULL OR p.price >= _min_price)
       AND (_max_price  IS NULL OR p.price <= _max_price)
       AND (_city       IS NULL OR p.city ILIKE '%'||_city||'%')
       AND (_condition  IS NULL OR p.condition = _condition)
       AND (_in_stock   IS NULL OR (CASE WHEN _in_stock THEN coalesce(p.stock_quantity,0) > 0 ELSE TRUE END))
       AND (_with_photo IS NULL OR (CASE WHEN _with_photo THEN p.has_photos ELSE TRUE END))
       AND (
         qn = '' OR (
           (is_oemish AND (
              qnorm_oem = ANY(coalesce(p.oem_norm,'{}'))
              OR EXISTS (SELECT 1 FROM unnest(coalesce(p.oem_norm,'{}')) c
                          WHERE c ILIKE '%'||qnorm_oem||'%' OR qnorm_oem ILIKE '%'||c||'%')
           ))
           OR coalesce(p.search_doc,'') ILIKE '%'||qn||'%'
           OR (array_length(toks,1) IS NOT NULL AND (
                SELECT bool_and(coalesce(p.search_doc,'') ILIKE '%'||t||'%') FROM unnest(toks) t
           ))
           OR coalesce(p.search_doc,'') % qn
         )
       )
  ),
  scored AS (
    SELECT b.*,
      (
        (CASE WHEN is_oemish AND qnorm_oem = ANY(coalesce(b.oem_norm,'{}')) THEN 100 ELSE 0 END)
      + (CASE WHEN is_oemish AND EXISTS (
            SELECT 1 FROM unnest(coalesce(b.oem_norm,'{}')) c
             WHERE c ILIKE '%'||qnorm_oem||'%' OR qnorm_oem ILIKE '%'||c||'%'
          ) AND NOT (qnorm_oem = ANY(coalesce(b.oem_norm,'{}'))) THEN 90 ELSE 0 END)
      + (CASE WHEN qn <> '' AND position(qn in b.t_n) > 0 THEN 80 ELSE 0 END)
      + (CASE WHEN array_length(toks,1) IS NOT NULL AND (
            SELECT bool_or(position(t in b.b_n) > 0 OR position(t in b.m_n) > 0) FROM unnest(toks) t
          ) THEN 70 ELSE 0 END)
      + (CASE WHEN array_length(toks,1) IS NOT NULL AND (
            SELECT bool_or(position(t in b.cat_n) > 0) FROM unnest(toks) t
          ) THEN 60 ELSE 0 END)
      + (CASE WHEN array_length(toks,1) IS NOT NULL AND (
            SELECT bool_or(position(t in b.d_n) > 0) FROM unnest(toks) t
          ) THEN 50 ELSE 0 END)
      + coalesce((
          SELECT sum(
              (CASE WHEN position(t in b.t_n) > 0 THEN 40 ELSE 0 END)
            + (CASE WHEN position(t in b.b_n) > 0 THEN 15 ELSE 0 END)
            + (CASE WHEN position(t in b.m_n) > 0 THEN 15 ELSE 0 END)
            + (CASE WHEN position(t in b.d_n) > 0 THEN 5  ELSE 0 END)
          )::int FROM unnest(toks) t
        ), 0)
      + (CASE WHEN qn <> '' THEN (similarity(coalesce(b.search_doc,''), qn) * 30)::int ELSE 0 END)
      -- relevance-neutral boosts (apply also when qn = '')
      + (CASE WHEN b.has_photos THEN 30 ELSE 0 END)
      + (CASE WHEN coalesce(b.stock_quantity,0) > 0 THEN 20 ELSE 0 END)
      + (CASE WHEN b.created_at > now() - interval '7 days'  THEN 25
              WHEN b.created_at > now() - interval '30 days' THEN 10
              ELSE 0 END)
      )::int AS score
    FROM base b
  ),
  counted AS (SELECT *, count(*) OVER() AS total_count FROM scored)
  SELECT c.id, c.title, c.brand, c.model, c.year, c.price, c.city, c.photos,
         c.condition, c.category, c.stock_quantity, c.oem_code, c.oem_codes,
         c.seller_id, c.part_type, c.created_at, c.score,
         CASE
           WHEN is_oemish AND qnorm_oem = ANY(coalesce(c.oem_norm,'{}')) THEN 'oem_exact'
           WHEN is_oemish AND c.score >= 90 THEN 'oem_partial'
           WHEN c.score >= 80 THEN 'title'
           WHEN c.score >= 60 THEN 'fields'
           ELSE 'fuzzy'
         END AS match_kind,
         c.total_count
    FROM counted c
   ORDER BY c.score DESC, c.has_photos DESC, c.created_at DESC
   LIMIT GREATEST(1, LEAST(coalesce(_limit, 60), 200))
   OFFSET GREATEST(0, coalesce(_offset, 0));
END $function$;

-- 3) Zero-result searches RPC (admin analytics)
CREATE OR REPLACE FUNCTION public.zero_result_searches(_range text DEFAULT '30d', _limit integer DEFAULT 100)
RETURNS TABLE(query text, oem text, search_count bigint, last_searched_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH bounds AS (
    SELECT CASE _range
             WHEN 'today' THEN now() - interval '1 day'
             WHEN '7d'    THEN now() - interval '7 days'
             WHEN '30d'   THEN now() - interval '30 days'
             ELSE 'epoch'::timestamptz
           END AS since
  )
  SELECT coalesce(nullif(trim(sl.query),''), '(boş)') AS query,
         coalesce(nullif(trim(sl.oem),''), '') AS oem,
         count(*) AS search_count,
         max(sl.created_at) AS last_searched_at
    FROM public.search_logs sl, bounds b
   WHERE sl.created_at >= b.since
     AND coalesce(sl.results_count,0) = 0
     AND coalesce(trim(sl.query),'') <> ''
   GROUP BY 1, 2
   ORDER BY search_count DESC, last_searched_at DESC
   LIMIT GREATEST(1, LEAST(_limit, 500));
$$;

-- 4) Conversion stats RPC: searches vs clicks
CREATE OR REPLACE FUNCTION public.search_conversion_stats(_range text DEFAULT '30d')
RETURNS TABLE(total_searches bigint, total_clicks bigint, zero_result_count bigint, conversion_pct numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH bounds AS (
    SELECT CASE _range
             WHEN 'today' THEN now() - interval '1 day'
             WHEN '7d'    THEN now() - interval '7 days'
             WHEN '30d'   THEN now() - interval '30 days'
             ELSE 'epoch'::timestamptz
           END AS since
  ),
  agg AS (
    SELECT
      count(*) FILTER (WHERE coalesce(trim(sl.query),'') <> '' OR coalesce(trim(sl.oem),'') <> '') AS searches,
      count(*) FILTER (WHERE sl.clicked_part_id IS NOT NULL) AS clicks,
      count(*) FILTER (WHERE coalesce(sl.results_count,0) = 0 AND coalesce(trim(sl.query),'') <> '') AS zeros
    FROM public.search_logs sl, bounds b
    WHERE sl.created_at >= b.since
  )
  SELECT
    searches,
    clicks,
    zeros,
    CASE WHEN searches > 0
         THEN round((clicks::numeric / searches::numeric) * 100.0, 2)
         ELSE 0 END
  FROM agg;
$$;

GRANT EXECUTE ON FUNCTION public.zero_result_searches(text,integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_conversion_stats(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_parts_smart(text,text,text,text,text,integer,numeric,numeric,text,integer,integer,text,boolean,boolean) TO anon, authenticated, service_role;
