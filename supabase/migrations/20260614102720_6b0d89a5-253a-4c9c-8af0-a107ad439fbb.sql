
-- 1) Strict OEM normalize helper (sadece A-Z0-9)
CREATE OR REPLACE FUNCTION public.normalize_oem_strict(_raw text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$ SELECT CASE WHEN _raw IS NULL THEN NULL ELSE regexp_replace(upper(_raw), '[^A-Z0-9]', '', 'g') END $$;

-- 2) parts.oem_norm: normalize edilmiş oem dizisi
ALTER TABLE public.parts ADD COLUMN IF NOT EXISTS oem_norm text[];

-- 3) parts_fill_search_doc triggerını güncelle (oem_norm + zenginleştirilmiş doc)
CREATE OR REPLACE FUNCTION public.parts_fill_search_doc()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.oem_norm := (
    SELECT array_agg(DISTINCT n) FILTER (WHERE n IS NOT NULL AND n <> '')
    FROM (
      SELECT public.normalize_oem_strict(x) AS n
        FROM unnest(COALESCE(NEW.oem_codes, ARRAY[]::text[]) || ARRAY[COALESCE(NEW.oem_code,'')]) AS x
    ) s
  );
  NEW.search_doc := public.tr_lower_ascii(
    coalesce(NEW.title,'') || ' ' ||
    coalesce(NEW.brand,'') || ' ' ||
    coalesce(NEW.model,'') || ' ' ||
    coalesce(NEW.category,'') || ' ' ||
    coalesce(NEW.part_type,'') || ' ' ||
    coalesce(NEW.description,'') || ' ' ||
    coalesce(array_to_string(NEW.oem_codes,' '),'') || ' ' ||
    coalesce(array_to_string(NEW.oem_norm,' '),'')
  );
  RETURN NEW;
END $$;

-- 4) Backfill: trigger BEFORE INSERT/UPDATE olduğu için tek dokunuş yeter
UPDATE public.parts SET updated_at = updated_at WHERE oem_norm IS NULL;

-- 5) İndeksler
CREATE INDEX IF NOT EXISTS parts_oem_norm_gin_idx ON public.parts USING gin (oem_norm);
CREATE INDEX IF NOT EXISTS parts_title_trgm_idx ON public.parts USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS parts_brand_trgm_idx ON public.parts USING gin (brand gin_trgm_ops);
CREATE INDEX IF NOT EXISTS parts_model_trgm_idx ON public.parts USING gin (model gin_trgm_ops);

-- 6) Akıllı arama RPC
CREATE OR REPLACE FUNCTION public.search_parts_smart(
  _q text DEFAULT NULL,
  _category text DEFAULT NULL,
  _part_type text DEFAULT NULL,
  _brand text DEFAULT NULL,
  _model text DEFAULT NULL,
  _year int DEFAULT NULL,
  _min_price numeric DEFAULT NULL,
  _max_price numeric DEFAULT NULL,
  _city text DEFAULT NULL,
  _limit int DEFAULT 60,
  _offset int DEFAULT 0
)
RETURNS TABLE(
  id uuid, title text, brand text, model text, year int, price numeric,
  city text, photos text[], condition text, category text, stock_quantity int,
  oem_code text, oem_codes text[], seller_id uuid, part_type text, created_at timestamptz,
  score int, match_kind text, total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
       AND (_category  IS NULL OR p.category  = _category)
       AND (_part_type IS NULL OR p.part_type = _part_type)
       AND (_brand     IS NULL OR p.brand ILIKE '%'||_brand||'%')
       AND (_model     IS NULL OR p.model ILIKE '%'||_model||'%')
       AND (_year      IS NULL OR p.year = _year)
       AND (_min_price IS NULL OR p.price >= _min_price)
       AND (_max_price IS NULL OR p.price <= _max_price)
       AND (_city      IS NULL OR p.city ILIKE '%'||_city||'%')
       AND (
         qn = '' OR (
           -- OEM normalize eşleşmesi
           (is_oemish AND (
              qnorm_oem = ANY(coalesce(p.oem_norm,'{}'))
              OR EXISTS (SELECT 1 FROM unnest(coalesce(p.oem_norm,'{}')) c
                          WHERE c ILIKE '%'||qnorm_oem||'%' OR qnorm_oem ILIKE '%'||c||'%')
           ))
           -- Genel doc içerme (trigram destekli)
           OR coalesce(p.search_doc,'') ILIKE '%'||qn||'%'
           -- Token-AND
           OR (array_length(toks,1) IS NOT NULL AND (
                SELECT bool_and(coalesce(p.search_doc,'') ILIKE '%'||t||'%') FROM unnest(toks) t
           ))
           -- Fuzzy: search_doc ile trigram benzerliği
           OR coalesce(p.search_doc,'') % qn
         )
       )
  ),
  scored AS (
    SELECT b.*,
      (
        -- 100 → OEM tam eşleşme
        (CASE WHEN is_oemish AND qnorm_oem = ANY(coalesce(b.oem_norm,'{}')) THEN 100 ELSE 0 END)
        -- 90 → OEM substring (eşdeğer/kısmi)
      + (CASE WHEN is_oemish AND EXISTS (
            SELECT 1 FROM unnest(coalesce(b.oem_norm,'{}')) c
             WHERE c ILIKE '%'||qnorm_oem||'%' OR qnorm_oem ILIKE '%'||c||'%'
          ) AND NOT (qnorm_oem = ANY(coalesce(b.oem_norm,'{}'))) THEN 90 ELSE 0 END)
        -- 80 → title tam phrase
      + (CASE WHEN qn <> '' AND position(qn in b.t_n) > 0 THEN 80 ELSE 0 END)
        -- 70 → marka+model token eşleşmesi
      + (CASE WHEN array_length(toks,1) IS NOT NULL AND (
            SELECT bool_or(position(t in b.b_n) > 0 OR position(t in b.m_n) > 0) FROM unnest(toks) t
          ) THEN 70 ELSE 0 END)
        -- 60 → kategori
      + (CASE WHEN array_length(toks,1) IS NOT NULL AND (
            SELECT bool_or(position(t in b.cat_n) > 0) FROM unnest(toks) t
          ) THEN 60 ELSE 0 END)
        -- 50 → açıklama
      + (CASE WHEN array_length(toks,1) IS NOT NULL AND (
            SELECT bool_or(position(t in b.d_n) > 0) FROM unnest(toks) t
          ) THEN 50 ELSE 0 END)
        -- token bazlı ince ek puan
      + coalesce((
          SELECT sum(
              (CASE WHEN position(t in b.t_n) > 0 THEN 40 ELSE 0 END)
            + (CASE WHEN position(t in b.b_n) > 0 THEN 15 ELSE 0 END)
            + (CASE WHEN position(t in b.m_n) > 0 THEN 15 ELSE 0 END)
            + (CASE WHEN position(t in b.d_n) > 0 THEN 5  ELSE 0 END)
          )::int FROM unnest(toks) t
        ), 0)
        -- fuzzy similarity bonusu (0-30)
      + (CASE WHEN qn <> '' THEN (similarity(coalesce(b.search_doc,''), qn) * 30)::int ELSE 0 END)
      )::int AS score
    FROM base b
  ),
  counted AS (
    SELECT *, count(*) OVER() AS total_count FROM scored
  )
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
   ORDER BY c.score DESC, c.created_at DESC
   LIMIT GREATEST(1, LEAST(coalesce(_limit, 60), 200))
   OFFSET GREATEST(0, coalesce(_offset, 0));
END $$;

GRANT EXECUTE ON FUNCTION public.search_parts_smart(text,text,text,text,text,int,numeric,numeric,text,int,int) TO anon, authenticated;

-- 7) Canlı öneri RPC
CREATE OR REPLACE FUNCTION public.search_suggest(_q text, _limit int DEFAULT 8)
RETURNS TABLE(kind text, label text, hint text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  qn text;
  qoem text;
BEGIN
  qn := trim(public.tr_lower_ascii(coalesce(_q,'')));
  qoem := public.normalize_oem_strict(coalesce(_q,''));
  IF length(qn) < 2 AND length(qoem) < 3 THEN RETURN; END IF;

  RETURN QUERY
  (
    SELECT 'oem'::text, c::text AS label, p.title::text AS hint
      FROM public.parts p, unnest(p.oem_norm) c
     WHERE p.status='approved' AND length(qoem) >= 3 AND c ILIKE qoem||'%'
     LIMIT 3
  )
  UNION ALL
  (
    SELECT 'part'::text, p.title, (coalesce(p.brand,'')||' '||coalesce(p.model,''))::text
      FROM public.parts p
     WHERE p.status='approved' AND length(qn) >= 2
       AND public.tr_lower_ascii(p.title) ILIKE '%'||qn||'%'
     ORDER BY p.created_at DESC
     LIMIT GREATEST(1, _limit - 3)
  )
  UNION ALL
  (
    SELECT DISTINCT 'brand_model'::text,
           (coalesce(p.brand,'')||' '||coalesce(p.model,''))::text, ''::text
      FROM public.parts p
     WHERE p.status='approved' AND length(qn) >= 2
       AND (public.tr_lower_ascii(coalesce(p.brand,'')) ILIKE '%'||qn||'%'
         OR public.tr_lower_ascii(coalesce(p.model,'')) ILIKE '%'||qn||'%')
     LIMIT 3
  )
  LIMIT GREATEST(1, LEAST(_limit, 20));
END $$;

GRANT EXECUTE ON FUNCTION public.search_suggest(text,int) TO anon, authenticated;

-- 8) Boş sonuç önerileri RPC
CREATE OR REPLACE FUNCTION public.suggest_alternatives(_q text, _limit int DEFAULT 8)
RETURNS TABLE(
  id uuid, title text, brand text, model text, year int, price numeric,
  city text, photos text[], condition text, stock_quantity int,
  oem_code text, reason text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  qoem text;
  qn   text;
BEGIN
  qoem := public.normalize_oem_strict(coalesce(_q,''));
  qn   := trim(public.tr_lower_ascii(coalesce(_q,'')));

  RETURN QUERY
  (
    SELECT p.id, p.title, p.brand, p.model, p.year, p.price, p.city, p.photos,
           p.condition, p.stock_quantity, p.oem_code, 'oem_prefix'::text
      FROM public.parts p
     WHERE p.status='approved' AND length(qoem) >= 4
       AND EXISTS (SELECT 1 FROM unnest(coalesce(p.oem_norm,'{}')) c
                    WHERE c ILIKE substr(qoem,1,GREATEST(4, length(qoem)-2))||'%')
     ORDER BY p.created_at DESC
     LIMIT _limit
  )
  UNION ALL
  (
    SELECT p.id, p.title, p.brand, p.model, p.year, p.price, p.city, p.photos,
           p.condition, p.stock_quantity, p.oem_code, 'fuzzy'::text
      FROM public.parts p
     WHERE p.status='approved' AND length(qn) >= 2
       AND public.tr_lower_ascii(coalesce(p.search_doc,'')) % qn
     ORDER BY similarity(public.tr_lower_ascii(coalesce(p.search_doc,'')), qn) DESC
     LIMIT _limit
  )
  LIMIT _limit;
END $$;

GRANT EXECUTE ON FUNCTION public.suggest_alternatives(text,int) TO anon, authenticated;
