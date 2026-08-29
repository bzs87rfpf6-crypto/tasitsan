ALTER TABLE public.parts
  ADD COLUMN IF NOT EXISTS has_photos boolean
  GENERATED ALWAYS AS (photos IS NOT NULL AND array_length(photos, 1) > 0) STORED;

CREATE INDEX IF NOT EXISTS idx_parts_vclass_hasphotos_created
  ON public.parts (vehicle_class, has_photos DESC, created_at DESC)
  WHERE status = 'approved';

CREATE OR REPLACE FUNCTION public.search_parts_ranked(
  _q text,
  _category text DEFAULT NULL,
  _part_type text DEFAULT NULL,
  _brand text DEFAULT NULL,
  _model text DEFAULT NULL,
  _year integer DEFAULT NULL,
  _min_price numeric DEFAULT NULL,
  _max_price numeric DEFAULT NULL,
  _oem text DEFAULT NULL,
  _limit integer DEFAULT 60,
  _offset integer DEFAULT 0,
  _vehicle_class text DEFAULT NULL
)
RETURNS TABLE(id uuid, title text, brand text, model text, year integer, price numeric, city text, photos text[], condition text, category text, stock_quantity integer, oem_code text, seller_id uuid, part_type text, score integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  qn        text;
  qnorm_oem text;
  toks      text[];
BEGIN
  qn := trim(regexp_replace(public.tr_lower_ascii(coalesce(_q,'')), '\s+', ' ', 'g'));
  qnorm_oem := public.normalize_oem(coalesce(_q,''));
  IF qn = '' THEN toks := ARRAY[]::text[];
  ELSE
    SELECT coalesce(array_agg(t), ARRAY[]::text[]) INTO toks
      FROM unnest(string_to_array(qn, ' ')) t WHERE length(t) >= 2;
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT p.id, p.title, p.brand, p.model, p.year, p.price, p.city, p.photos,
           p.condition, p.category, p.stock_quantity, p.oem_code, p.seller_id,
           p.part_type, p.created_at, p.oem_codes, p.search_doc,
           (p.photos IS NOT NULL AND array_length(p.photos,1) > 0) AS has_photos,
           public.tr_lower_ascii(coalesce(p.title,''))       AS t_n,
           public.tr_lower_ascii(coalesce(p.brand,''))       AS b_n,
           public.tr_lower_ascii(coalesce(p.model,''))       AS m_n,
           public.tr_lower_ascii(coalesce(p.description,'')) AS d_n,
           public.tr_lower_ascii(coalesce(array_to_string(p.oem_codes,' '),'')) AS o_n
      FROM public.parts p
     WHERE p.status = 'approved'
       AND (_vehicle_class IS NULL OR p.vehicle_class = _vehicle_class)
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
         OR (SELECT bool_and(coalesce(p.search_doc,'') LIKE '%'||t||'%') FROM unnest(toks) t)
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
   ORDER BY b.has_photos DESC, score DESC, b.created_at DESC
   LIMIT GREATEST(1, LEAST(coalesce(_limit, 60), 200))
   OFFSET GREATEST(0, coalesce(_offset, 0));
END
$function$;