
DROP FUNCTION IF EXISTS public.normalize_oem(TEXT) CASCADE;

CREATE OR REPLACE FUNCTION public.normalize_oem(_raw TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE
AS $$ SELECT UPPER(regexp_replace(COALESCE(_raw, ''), '[^A-Za-z0-9]', '', 'g')); $$;

CREATE TABLE IF NOT EXISTS public.oem_image_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  oem TEXT NOT NULL,
  oem_normalized TEXT GENERATED ALWAYS AS (public.normalize_oem(oem)) STORED,
  brand TEXT,
  image_url TEXT NOT NULL,
  image_hash TEXT,
  source_type TEXT NOT NULL CHECK (source_type IN (
    'manufacturer_catalog','supplier_catalog','user_upload','shared_oem','firecrawl','manual'
  )),
  source_name TEXT,
  source_part_id UUID,
  confidence INTEGER NOT NULL DEFAULT 50 CHECK (confidence BETWEEN 0 AND 100),
  verified BOOLEAN NOT NULL DEFAULT false,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS oem_image_library_oem_norm_idx ON public.oem_image_library(oem_normalized);
CREATE INDEX IF NOT EXISTS oem_image_library_brand_idx ON public.oem_image_library(brand);
CREATE INDEX IF NOT EXISTS oem_image_library_verified_idx ON public.oem_image_library(verified, oem_normalized);
CREATE UNIQUE INDEX IF NOT EXISTS oem_image_library_unique_url ON public.oem_image_library(oem_normalized, image_url);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.oem_image_library TO authenticated;
GRANT SELECT ON public.oem_image_library TO anon;
GRANT ALL ON public.oem_image_library TO service_role;
ALTER TABLE public.oem_image_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "verified_public_read" ON public.oem_image_library FOR SELECT TO anon, authenticated USING (verified = true);
CREATE POLICY "admin_read_all" ON public.oem_image_library FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "own_uploads_read" ON public.oem_image_library FOR SELECT TO authenticated USING (uploaded_by = auth.uid());
CREATE POLICY "admin_insert" ON public.oem_image_library FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin_update" ON public.oem_image_library FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin_delete" ON public.oem_image_library FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER set_oem_image_library_updated_at
  BEFORE UPDATE ON public.oem_image_library
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.oem_image_rejections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  oem_normalized TEXT NOT NULL,
  image_url TEXT NOT NULL,
  rejected_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS oem_image_rejections_unique ON public.oem_image_rejections(oem_normalized, image_url);
GRANT SELECT, INSERT ON public.oem_image_rejections TO authenticated;
GRANT ALL ON public.oem_image_rejections TO service_role;
ALTER TABLE public.oem_image_rejections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_only_rejections" ON public.oem_image_rejections FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.lookup_oem_images(_oem TEXT, _limit INTEGER DEFAULT 10)
RETURNS TABLE (id UUID, oem TEXT, brand TEXT, image_url TEXT, source_type TEXT, confidence INTEGER, verified BOOLEAN, is_primary BOOLEAN)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT l.id, l.oem, l.brand, l.image_url, l.source_type, l.confidence, l.verified, l.is_primary
  FROM public.oem_image_library l
  WHERE l.oem_normalized = public.normalize_oem(_oem) AND l.verified = true
    AND NOT EXISTS (SELECT 1 FROM public.oem_image_rejections r WHERE r.oem_normalized = l.oem_normalized AND r.image_url = l.image_url)
  ORDER BY l.is_primary DESC, l.confidence DESC, l.created_at DESC LIMIT _limit;
$$;
GRANT EXECUTE ON FUNCTION public.lookup_oem_images TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.lookup_shared_oem_part_photos(_oem TEXT, _limit INTEGER DEFAULT 5)
RETURNS TABLE (image_url TEXT, part_id UUID)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT photo AS image_url, p.id AS part_id
  FROM public.parts p CROSS JOIN LATERAL unnest(p.photos) AS photo
  WHERE p.status = 'approved' AND p.photos IS NOT NULL AND array_length(p.photos, 1) > 0
    AND EXISTS (SELECT 1 FROM unnest(p.oem_codes) AS oc WHERE public.normalize_oem(oc) = public.normalize_oem(_oem))
    AND NOT EXISTS (SELECT 1 FROM public.oem_image_rejections r WHERE r.oem_normalized = public.normalize_oem(_oem) AND r.image_url = photo)
  LIMIT _limit;
$$;
GRANT EXECUTE ON FUNCTION public.lookup_shared_oem_part_photos TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.oem_library_stats()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'total_images', (SELECT COUNT(*) FROM public.oem_image_library),
    'verified_images', (SELECT COUNT(*) FROM public.oem_image_library WHERE verified),
    'pending_images', (SELECT COUNT(*) FROM public.oem_image_library WHERE NOT verified),
    'unique_oems', (SELECT COUNT(DISTINCT oem_normalized) FROM public.oem_image_library WHERE verified),
    'by_brand', (SELECT COALESCE(jsonb_object_agg(brand, cnt), '{}'::jsonb) FROM (SELECT COALESCE(brand, 'Bilinmiyor') AS brand, COUNT(*) AS cnt FROM public.oem_image_library WHERE verified GROUP BY brand ORDER BY cnt DESC LIMIT 20) t),
    'by_source', (SELECT COALESCE(jsonb_object_agg(source_type, cnt), '{}'::jsonb) FROM (SELECT source_type, COUNT(*) AS cnt FROM public.oem_image_library WHERE verified GROUP BY source_type) t)
  );
$$;
GRANT EXECUTE ON FUNCTION public.oem_library_stats TO authenticated;

CREATE OR REPLACE FUNCTION public.oem_library_missing(_limit INTEGER DEFAULT 200)
RETURNS TABLE (oem TEXT, brand TEXT, part_count BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH oem_parts AS (
    SELECT public.normalize_oem(oc) AS oem_norm, MIN(oc) AS oem_raw, MIN(p.brand) AS brand,
           COUNT(DISTINCT p.id) AS part_count
    FROM public.parts p CROSS JOIN LATERAL unnest(p.oem_codes) AS oc
    WHERE p.status = 'approved' AND p.oem_codes IS NOT NULL
    GROUP BY public.normalize_oem(oc)
  )
  SELECT op.oem_raw, op.brand, op.part_count
  FROM oem_parts op
  WHERE NOT EXISTS (SELECT 1 FROM public.oem_image_library l WHERE l.oem_normalized = op.oem_norm AND l.verified)
  ORDER BY op.part_count DESC LIMIT _limit;
$$;
GRANT EXECUTE ON FUNCTION public.oem_library_missing TO authenticated;
