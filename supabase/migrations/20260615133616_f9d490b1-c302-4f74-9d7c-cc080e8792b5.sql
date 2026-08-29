
-- 1) New columns (backwards-compatible defaults)
ALTER TABLE public.parts
  ADD COLUMN IF NOT EXISTS vehicle_class text NOT NULL DEFAULT 'automobile',
  ADD COLUMN IF NOT EXISTS machine_subcategory text;

ALTER TABLE public.part_requests
  ADD COLUMN IF NOT EXISTS vehicle_class text NOT NULL DEFAULT 'automobile',
  ADD COLUMN IF NOT EXISTS machine_subcategory text;

ALTER TABLE public.request_quotes
  ADD COLUMN IF NOT EXISTS vehicle_class text NOT NULL DEFAULT 'automobile';

ALTER TABLE public.stok_listings
  ADD COLUMN IF NOT EXISTS vehicle_class text NOT NULL DEFAULT 'automobile';

-- 2) Validation via trigger (avoid CHECK on mutable rules; safer for restores)
CREATE OR REPLACE FUNCTION public.validate_vehicle_class()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.vehicle_class NOT IN ('automobile','heavy_vehicle','construction','agriculture') THEN
    RAISE EXCEPTION 'invalid vehicle_class: %', NEW.vehicle_class;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_parts_vclass ON public.parts;
CREATE TRIGGER trg_parts_vclass BEFORE INSERT OR UPDATE OF vehicle_class ON public.parts
  FOR EACH ROW EXECUTE FUNCTION public.validate_vehicle_class();

DROP TRIGGER IF EXISTS trg_pr_vclass ON public.part_requests;
CREATE TRIGGER trg_pr_vclass BEFORE INSERT OR UPDATE OF vehicle_class ON public.part_requests
  FOR EACH ROW EXECUTE FUNCTION public.validate_vehicle_class();

DROP TRIGGER IF EXISTS trg_rq_vclass ON public.request_quotes;
CREATE TRIGGER trg_rq_vclass BEFORE INSERT OR UPDATE OF vehicle_class ON public.request_quotes
  FOR EACH ROW EXECUTE FUNCTION public.validate_vehicle_class();

DROP TRIGGER IF EXISTS trg_stok_vclass ON public.stok_listings;
CREATE TRIGGER trg_stok_vclass BEFORE INSERT OR UPDATE OF vehicle_class ON public.stok_listings
  FOR EACH ROW EXECUTE FUNCTION public.validate_vehicle_class();

-- 3) Indexes for filtering
CREATE INDEX IF NOT EXISTS idx_parts_vehicle_class ON public.parts(vehicle_class);
CREATE INDEX IF NOT EXISTS idx_parts_vclass_brand ON public.parts(vehicle_class, brand);
CREATE INDEX IF NOT EXISTS idx_parts_machine_sub ON public.parts(machine_subcategory) WHERE machine_subcategory IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pr_vehicle_class ON public.part_requests(vehicle_class);
CREATE INDEX IF NOT EXISTS idx_rq_vehicle_class ON public.request_quotes(vehicle_class);
CREATE INDEX IF NOT EXISTS idx_stok_vehicle_class ON public.stok_listings(vehicle_class);

-- 4) Extend search RPC with optional _vehicle_class (NULL = old behavior)
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
   ORDER BY score DESC, b.created_at DESC
   LIMIT GREATEST(1, LEAST(coalesce(_limit, 60), 200))
   OFFSET GREATEST(0, coalesce(_offset, 0));
END
$function$;

-- 5) Extend admin moderation stats with construction counters
CREATE OR REPLACE FUNCTION public.admin_moderation_stats()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT jsonb_build_object(
    'requests', jsonb_build_object(
      'active',  (SELECT count(*) FROM part_requests WHERE deleted_at IS NULL AND is_active = true),
      'passive', (SELECT count(*) FROM part_requests WHERE deleted_at IS NULL AND is_active = false),
      'deleted', (SELECT count(*) FROM part_requests WHERE deleted_at IS NOT NULL),
      'total',   (SELECT count(*) FROM part_requests)
    ),
    'quotes', jsonb_build_object(
      'active',  (SELECT count(*) FROM request_quotes WHERE deleted_at IS NULL AND is_active = true),
      'passive', (SELECT count(*) FROM request_quotes WHERE deleted_at IS NULL AND is_active = false),
      'deleted', (SELECT count(*) FROM request_quotes WHERE deleted_at IS NOT NULL),
      'total',   (SELECT count(*) FROM request_quotes)
    ),
    'construction', jsonb_build_object(
      'parts',    (SELECT count(*) FROM parts WHERE vehicle_class = 'construction' AND status='approved'),
      'requests', (SELECT count(*) FROM part_requests WHERE vehicle_class = 'construction' AND deleted_at IS NULL),
      'quotes',   (SELECT count(*) FROM request_quotes WHERE vehicle_class = 'construction' AND deleted_at IS NULL),
      'top_oems', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('oem', oem, 'count', c))
          FROM (
            SELECT upper(trim(s.oem)) AS oem, count(*)::int AS c
              FROM public.oem_searches s
              JOIN public.parts p ON upper(trim(s.oem)) = ANY(p.oem_codes) AND p.vehicle_class='construction'
             WHERE s.created_at >= now() - interval '30 days'
             GROUP BY 1 ORDER BY c DESC LIMIT 10
          ) z
      ), '[]'::jsonb)
    )
  ) INTO v;
  RETURN v;
END;
$function$;
