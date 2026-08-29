
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- search_doc kolonu (trigger ile doldurulur — lower() STABLE olduğundan generated column kullanılamıyor)
ALTER TABLE public.parts ADD COLUMN IF NOT EXISTS search_doc text;

CREATE OR REPLACE FUNCTION public.parts_fill_search_doc()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.search_doc := public.tr_lower_ascii(
    coalesce(NEW.title,'') || ' ' ||
    coalesce(NEW.brand,'') || ' ' ||
    coalesce(NEW.model,'') || ' ' ||
    coalesce(NEW.description,'') || ' ' ||
    coalesce(array_to_string(NEW.oem_codes,' '),'')
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_parts_fill_search_doc ON public.parts;
CREATE TRIGGER trg_parts_fill_search_doc
  BEFORE INSERT OR UPDATE OF title, brand, model, description, oem_codes
  ON public.parts
  FOR EACH ROW EXECUTE FUNCTION public.parts_fill_search_doc();

-- Mevcut kayıtlar için geriye dönük doldurma
UPDATE public.parts
   SET search_doc = public.tr_lower_ascii(
     coalesce(title,'') || ' ' || coalesce(brand,'') || ' ' || coalesce(model,'') || ' ' ||
     coalesce(description,'') || ' ' || coalesce(array_to_string(oem_codes,' '),'')
   )
 WHERE search_doc IS NULL;

-- Trigram GIN indeksi
CREATE INDEX IF NOT EXISTS parts_search_doc_trgm_idx
  ON public.parts USING gin (search_doc gin_trgm_ops)
  WHERE status = 'approved';

-- RPC: alaka skoruna göre sıralı arama
CREATE OR REPLACE FUNCTION public.search_parts_ranked(
  _q          text,
  _category   text    DEFAULT NULL,
  _part_type  text    DEFAULT NULL,
  _brand      text    DEFAULT NULL,
  _model      text    DEFAULT NULL,
  _year       int     DEFAULT NULL,
  _min_price  numeric DEFAULT NULL,
  _max_price  numeric DEFAULT NULL,
  _oem        text    DEFAULT NULL,
  _limit      int     DEFAULT 60
)
RETURNS TABLE(
  id uuid, title text, brand text, model text, year int, price numeric,
  city text, photos text[], condition text, category text, stock_quantity int,
  oem_code text, seller_id uuid, part_type text, score int
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  qn        text;
  qnorm_oem text;
  toks      text[];
BEGIN
  qn := trim(regexp_replace(public.tr_lower_ascii(coalesce(_q,'')), '\s+', ' ', 'g'));
  qnorm_oem := public.normalize_oem(coalesce(_q,''));

  IF qn = '' THEN
    toks := ARRAY[]::text[];
  ELSE
    SELECT coalesce(array_agg(t), ARRAY[]::text[]) INTO toks
      FROM unnest(string_to_array(qn, ' ')) t WHERE length(t) >= 2;
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT p.id, p.title, p.brand, p.model, p.year, p.price, p.city, p.photos,
           p.condition, p.category, p.stock_quantity, p.oem_code, p.seller_id,
           p.part_type, p.created_at, p.oem_codes, p.search_doc,
           public.tr_lower_ascii(coalesce(p.title,''))       AS t_n,
           public.tr_lower_ascii(coalesce(p.brand,''))       AS b_n,
           public.tr_lower_ascii(coalesce(p.model,''))       AS m_n,
           public.tr_lower_ascii(coalesce(p.description,'')) AS d_n,
           public.tr_lower_ascii(coalesce(array_to_string(p.oem_codes,' '),'')) AS o_n
      FROM public.parts p
     WHERE p.status = 'approved'
       AND (_category  IS NULL OR p.category  = _category)
       AND (_part_type IS NULL OR p.part_type = _part_type)
       AND (_brand     IS NULL OR p.brand ILIKE '%'||_brand||'%')
       AND (_model     IS NULL OR p.model ILIKE '%'||_model||'%')
       AND (_year      IS NULL OR p.year = _year)
       AND (_min_price IS NULL OR p.price >= _min_price)
       AND (_max_price IS NULL OR p.price <= _max_price)
       AND (
         _oem IS NULL
         OR upper(_oem) = ANY(p.oem_codes)
         OR coalesce(p.search_doc,'') LIKE '%'||public.tr_lower_ascii(_oem)||'%'
       )
       AND (
         array_length(toks,1) IS NULL
         OR (
           SELECT bool_and(coalesce(p.search_doc,'') LIKE '%'||t||'%')
             FROM unnest(toks) t
         )
       )
  )
  SELECT b.id, b.title, b.brand, b.model, b.year, b.price, b.city, b.photos,
         b.condition, b.category, b.stock_quantity, b.oem_code, b.seller_id, b.part_type,
         (
           (CASE WHEN qnorm_oem <> '' AND qnorm_oem = ANY(coalesce(b.oem_codes,'{}'::text[])) THEN 500 ELSE 0 END)
         + (CASE WHEN qn <> '' AND position(qn in b.t_n) > 0 THEN 200 ELSE 0 END)
         + coalesce((
             SELECT sum(
                 (CASE WHEN position(t in b.t_n) > 0 THEN 40 ELSE 0 END)
               + (CASE WHEN position(t in b.b_n) > 0 THEN 15 ELSE 0 END)
               + (CASE WHEN position(t in b.m_n) > 0 THEN 15 ELSE 0 END)
               + (CASE WHEN position(t in b.d_n) > 0 THEN 5  ELSE 0 END)
               + (CASE WHEN position(t in b.o_n) > 0 THEN 25 ELSE 0 END)
             )::int FROM unnest(toks) t
           ), 0)
         + (CASE WHEN array_length(toks,1) IS NOT NULL AND (
              SELECT bool_and(position(t in b.t_n) > 0) FROM unnest(toks) t
            ) THEN 100 ELSE 0 END)
         )::int AS score
    FROM base b
   ORDER BY score DESC, b.created_at DESC
   LIMIT GREATEST(1, LEAST(coalesce(_limit, 60), 200));
END
$$;

GRANT EXECUTE ON FUNCTION public.search_parts_ranked(text,text,text,text,text,int,numeric,numeric,text,int)
  TO anon, authenticated;
