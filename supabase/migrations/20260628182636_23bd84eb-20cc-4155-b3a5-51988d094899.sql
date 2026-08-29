
-- ============================================================
-- SEO Growth 2.0 — Phase 1
-- Internal-link RPCs + OEM landing extras + Category landing + IndexNow
-- ============================================================

-- 1) site_settings: IndexNow key (auto-generated)
ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS indexnow_key text;

UPDATE public.site_settings
SET indexnow_key = encode(gen_random_bytes(16), 'hex')
WHERE indexnow_key IS NULL OR indexnow_key = '';

-- 2) IndexNow queue
CREATE TABLE IF NOT EXISTS public.indexnow_queue (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url         text NOT NULL,
  status      text NOT NULL DEFAULT 'pending', -- pending|sent|failed
  attempts    int  NOT NULL DEFAULT 0,
  last_error  text,
  enqueued_at timestamptz NOT NULL DEFAULT now(),
  sent_at     timestamptz
);

GRANT SELECT ON public.indexnow_queue TO authenticated;
GRANT ALL    ON public.indexnow_queue TO service_role;

ALTER TABLE public.indexnow_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read indexnow_queue"
  ON public.indexnow_queue FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_indexnow_queue_pending
  ON public.indexnow_queue (enqueued_at)
  WHERE status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS uniq_indexnow_pending_url
  ON public.indexnow_queue (url)
  WHERE status = 'pending';

-- 3) Internal-link RPCs
-- Common return type via OUT inline in each.

-- same OEM exact
CREATE OR REPLACE FUNCTION public.parts_same_oem(_id uuid, _limit int DEFAULT 12)
RETURNS TABLE(
  id uuid, title text, seo_slug text, brand text, model text, year int,
  oem_code text, price numeric, city text, has_photos boolean
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH src AS (SELECT oem_code, oem_codes FROM public.parts WHERE id = _id)
  SELECT p.id, p.title, p.seo_slug, p.brand, p.model, p.year,
         p.oem_code, p.price, p.city, p.has_photos
  FROM public.parts p, src
  WHERE p.id <> _id
    AND p.status = 'approved'
    AND p.stock_quantity > 0
    AND (
      (src.oem_code IS NOT NULL AND p.oem_code = src.oem_code)
      OR (src.oem_codes IS NOT NULL AND p.oem_codes && src.oem_codes)
    )
  ORDER BY p.has_photos DESC, p.created_at DESC
  LIMIT GREATEST(1, LEAST(_limit, 30));
$$;

-- same OEM family (revision siblings)
CREATE OR REPLACE FUNCTION public.parts_same_oem_family(_id uuid, _limit int DEFAULT 12)
RETURNS TABLE(
  id uuid, title text, seo_slug text, brand text, model text, year int,
  oem_code text, price numeric, city text, has_photos boolean
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH src AS (SELECT oem_family, oem_families FROM public.parts WHERE id = _id)
  SELECT p.id, p.title, p.seo_slug, p.brand, p.model, p.year,
         p.oem_code, p.price, p.city, p.has_photos
  FROM public.parts p, src
  WHERE p.id <> _id
    AND p.status = 'approved'
    AND p.stock_quantity > 0
    AND (
      (src.oem_family IS NOT NULL AND p.oem_family = src.oem_family)
      OR (src.oem_families IS NOT NULL AND p.oem_families && src.oem_families)
    )
  ORDER BY p.has_photos DESC, p.created_at DESC
  LIMIT GREATEST(1, LEAST(_limit, 30));
$$;

-- same vehicle (brand+model, optional year window ±3)
CREATE OR REPLACE FUNCTION public.parts_same_vehicle(_id uuid, _limit int DEFAULT 12)
RETURNS TABLE(
  id uuid, title text, seo_slug text, brand text, model text, year int,
  oem_code text, price numeric, city text, has_photos boolean
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH src AS (SELECT brand, model, year FROM public.parts WHERE id = _id)
  SELECT p.id, p.title, p.seo_slug, p.brand, p.model, p.year,
         p.oem_code, p.price, p.city, p.has_photos
  FROM public.parts p, src
  WHERE p.id <> _id
    AND p.status = 'approved'
    AND p.stock_quantity > 0
    AND src.brand IS NOT NULL
    AND lower(p.brand) = lower(src.brand)
    AND (src.model IS NULL OR p.model IS NULL OR lower(p.model) = lower(src.model))
  ORDER BY p.has_photos DESC,
           (CASE WHEN src.year IS NOT NULL AND p.year IS NOT NULL
                 THEN abs(p.year - src.year) ELSE 999 END),
           p.created_at DESC
  LIMIT GREATEST(1, LEAST(_limit, 30));
$$;

-- same category
CREATE OR REPLACE FUNCTION public.parts_same_category(_id uuid, _limit int DEFAULT 12)
RETURNS TABLE(
  id uuid, title text, seo_slug text, brand text, model text, year int,
  oem_code text, price numeric, city text, has_photos boolean
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH src AS (SELECT category FROM public.parts WHERE id = _id)
  SELECT p.id, p.title, p.seo_slug, p.brand, p.model, p.year,
         p.oem_code, p.price, p.city, p.has_photos
  FROM public.parts p, src
  WHERE p.id <> _id
    AND p.status = 'approved'
    AND p.stock_quantity > 0
    AND src.category IS NOT NULL
    AND lower(p.category) = lower(src.category)
  ORDER BY p.has_photos DESC, p.created_at DESC
  LIMIT GREATEST(1, LEAST(_limit, 30));
$$;

-- same brand
CREATE OR REPLACE FUNCTION public.parts_same_brand(_id uuid, _limit int DEFAULT 12)
RETURNS TABLE(
  id uuid, title text, seo_slug text, brand text, model text, year int,
  oem_code text, price numeric, city text, has_photos boolean
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH src AS (SELECT brand FROM public.parts WHERE id = _id)
  SELECT p.id, p.title, p.seo_slug, p.brand, p.model, p.year,
         p.oem_code, p.price, p.city, p.has_photos
  FROM public.parts p, src
  WHERE p.id <> _id
    AND p.status = 'approved'
    AND p.stock_quantity > 0
    AND src.brand IS NOT NULL
    AND lower(p.brand) = lower(src.brand)
  ORDER BY p.has_photos DESC, p.created_at DESC
  LIMIT GREATEST(1, LEAST(_limit, 30));
$$;

-- popular related (most viewed in 30 days, scoped to same brand or category)
CREATE OR REPLACE FUNCTION public.parts_popular_related(_id uuid, _limit int DEFAULT 12)
RETURNS TABLE(
  id uuid, title text, seo_slug text, brand text, model text, year int,
  oem_code text, price numeric, city text, has_photos boolean, view_count bigint
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH src AS (SELECT brand, category FROM public.parts WHERE id = _id),
  views30 AS (
    SELECT part_id, COUNT(*)::bigint AS vc
    FROM public.part_views
    WHERE created_at >= now() - interval '30 days'
    GROUP BY part_id
  )
  SELECT p.id, p.title, p.seo_slug, p.brand, p.model, p.year,
         p.oem_code, p.price, p.city, p.has_photos, COALESCE(v.vc, 0) AS view_count
  FROM public.parts p
  LEFT JOIN views30 v ON v.part_id = p.id
  CROSS JOIN src
  WHERE p.id <> _id
    AND p.status = 'approved'
    AND p.stock_quantity > 0
    AND (
      (src.brand IS NOT NULL AND lower(p.brand) = lower(src.brand))
      OR (src.category IS NOT NULL AND lower(p.category) = lower(src.category))
    )
  ORDER BY COALESCE(v.vc, 0) DESC, p.has_photos DESC, p.created_at DESC
  LIMIT GREATEST(1, LEAST(_limit, 30));
$$;

GRANT EXECUTE ON FUNCTION public.parts_same_oem(uuid,int)         TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.parts_same_oem_family(uuid,int)  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.parts_same_vehicle(uuid,int)     TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.parts_same_category(uuid,int)    TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.parts_same_brand(uuid,int)       TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.parts_popular_related(uuid,int)  TO anon, authenticated;

-- 4) OEM landing extras (vehicles + engine codes + supplier brands)
CREATE OR REPLACE FUNCTION public.oem_landing_extras(_oem text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  norm text := upper(regexp_replace(_oem, '[^A-Za-z0-9]', '', 'g'));
  result jsonb;
BEGIN
  WITH matched AS (
    SELECT * FROM public.parts
    WHERE status='approved'
      AND (
        upper(regexp_replace(coalesce(oem_code,''), '[^A-Za-z0-9]','','g')) = norm
        OR EXISTS (
          SELECT 1 FROM unnest(coalesce(oem_codes,'{}'::text[])) c
          WHERE upper(regexp_replace(c,'[^A-Za-z0-9]','','g')) = norm
        )
      )
  )
  SELECT jsonb_build_object(
    'vehicles', COALESCE((
      SELECT jsonb_agg(DISTINCT jsonb_build_object('brand', brand, 'model', model, 'year', year))
      FROM matched WHERE brand IS NOT NULL LIMIT 20
    ), '[]'::jsonb),
    'engine_codes', COALESCE((
      SELECT jsonb_agg(DISTINCT engine_code) FROM matched WHERE engine_code IS NOT NULL
    ), '[]'::jsonb),
    'supplier_brands', COALESCE((
      SELECT jsonb_agg(DISTINCT brand) FROM matched WHERE brand IS NOT NULL
    ), '[]'::jsonb),
    'categories', COALESCE((
      SELECT jsonb_agg(DISTINCT category) FROM matched WHERE category IS NOT NULL
    ), '[]'::jsonb),
    'total', (SELECT COUNT(*) FROM matched)
  ) INTO result;
  RETURN result;
END$$;

GRANT EXECUTE ON FUNCTION public.oem_landing_extras(text) TO anon, authenticated;

-- 5) Category landing
CREATE OR REPLACE FUNCTION public.category_landing(_category text, _limit int DEFAULT 12)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  result jsonb;
BEGIN
  WITH cat AS (
    SELECT * FROM public.parts
    WHERE status='approved' AND stock_quantity > 0
      AND lower(category) = lower(_category)
  ),
  views30 AS (
    SELECT part_id, COUNT(*)::bigint AS vc FROM public.part_views
    WHERE created_at >= now() - interval '30 days' GROUP BY part_id
  )
  SELECT jsonb_build_object(
    'total', (SELECT COUNT(*) FROM cat),
    'top_products', COALESCE((
      SELECT jsonb_agg(row_to_json(t)) FROM (
        SELECT c.id, c.title, c.seo_slug, c.brand, c.model, c.year, c.oem_code,
               c.price, c.city, c.photos, c.has_photos
        FROM cat c LEFT JOIN views30 v ON v.part_id = c.id
        ORDER BY COALESCE(v.vc,0) DESC, c.has_photos DESC, c.created_at DESC
        LIMIT _limit
      ) t
    ), '[]'::jsonb),
    'recent_products', COALESCE((
      SELECT jsonb_agg(row_to_json(t)) FROM (
        SELECT c.id, c.title, c.seo_slug, c.brand, c.model, c.year, c.oem_code,
               c.price, c.city, c.photos, c.has_photos
        FROM cat c
        ORDER BY c.created_at DESC
        LIMIT _limit
      ) t
    ), '[]'::jsonb),
    'popular_oems', COALESCE((
      SELECT jsonb_agg(t.oem) FROM (
        SELECT oem_code AS oem, COUNT(*) c FROM cat
        WHERE oem_code IS NOT NULL AND length(oem_code) >= 3
        GROUP BY oem_code ORDER BY c DESC LIMIT 20
      ) t
    ), '[]'::jsonb),
    'brands', COALESCE((
      SELECT jsonb_agg(t.brand) FROM (
        SELECT brand, COUNT(*) c FROM cat
        WHERE brand IS NOT NULL GROUP BY brand ORDER BY c DESC LIMIT 20
      ) t
    ), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END$$;

GRANT EXECUTE ON FUNCTION public.category_landing(text,int) TO anon, authenticated;

-- 6) IndexNow trigger on parts
CREATE OR REPLACE FUNCTION public.enqueue_indexnow_for_part()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  base text := 'https://tasitsan.com.tr';
  slug text;
  url  text;
BEGIN
  -- Only enqueue when relevant fields changed (or insert) and approved+in stock
  IF TG_OP = 'UPDATE' AND
     NEW.status = OLD.status AND
     NEW.stock_quantity = OLD.stock_quantity AND
     NEW.price IS NOT DISTINCT FROM OLD.price AND
     NEW.photos = OLD.photos AND
     NEW.seo_slug IS NOT DISTINCT FROM OLD.seo_slug
  THEN
    RETURN NEW;
  END IF;

  IF NEW.status <> 'approved' OR NEW.stock_quantity IS NULL OR NEW.stock_quantity <= 0 THEN
    RETURN NEW;
  END IF;

  slug := COALESCE(NEW.seo_slug, NEW.id::text);
  url := base || '/parts/' || slug;

  INSERT INTO public.indexnow_queue (url) VALUES (url)
  ON CONFLICT (url) WHERE status='pending' DO NOTHING;

  -- enqueue OEM landing if applicable
  IF NEW.oem_code IS NOT NULL AND length(NEW.oem_code) >= 3 THEN
    INSERT INTO public.indexnow_queue (url)
    VALUES (base || '/oem/' || lower(regexp_replace(NEW.oem_code,'[^A-Za-z0-9]','-','g')))
    ON CONFLICT (url) WHERE status='pending' DO NOTHING;
  END IF;

  RETURN NEW;
END$$;

DROP TRIGGER IF EXISTS trg_parts_indexnow ON public.parts;
CREATE TRIGGER trg_parts_indexnow
  AFTER INSERT OR UPDATE ON public.parts
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_indexnow_for_part();

-- 7) Stats RPC for admin panel
CREATE OR REPLACE FUNCTION public.indexnow_stats()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'pending', (SELECT COUNT(*) FROM public.indexnow_queue WHERE status='pending'),
    'sent_today', (SELECT COUNT(*) FROM public.indexnow_queue WHERE status='sent' AND sent_at >= current_date),
    'failed', (SELECT COUNT(*) FROM public.indexnow_queue WHERE status='failed'),
    'sent_total', (SELECT COUNT(*) FROM public.indexnow_queue WHERE status='sent')
  );
$$;

GRANT EXECUTE ON FUNCTION public.indexnow_stats() TO authenticated;
