
-- ============================================================
-- SEO 3.1 — Slug + History + Audit RPCs
-- ============================================================

-- 1) parts kolonları
ALTER TABLE public.parts
  ADD COLUMN IF NOT EXISTS seo_slug TEXT,
  ADD COLUMN IF NOT EXISTS auto_description TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS parts_seo_slug_unique_idx
  ON public.parts (seo_slug) WHERE seo_slug IS NOT NULL;

-- 2) Slug history (eski slug → yeni canonical, 301 için)
CREATE TABLE IF NOT EXISTS public.parts_slug_history (
  slug TEXT PRIMARY KEY,
  part_id UUID NOT NULL REFERENCES public.parts(id) ON DELETE CASCADE,
  replaced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS parts_slug_history_part_idx ON public.parts_slug_history(part_id);

GRANT SELECT ON public.parts_slug_history TO anon, authenticated;
GRANT ALL ON public.parts_slug_history TO service_role;
ALTER TABLE public.parts_slug_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "slug_history_public_read" ON public.parts_slug_history;
CREATE POLICY "slug_history_public_read" ON public.parts_slug_history FOR SELECT USING (true);

-- 3) Slug slugify (Türkçe karakter dönüşümü) — SQL içinde immutable
CREATE OR REPLACE FUNCTION public._seo_slugify(input TEXT)
RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  s TEXT;
BEGIN
  IF input IS NULL THEN RETURN ''; END IF;
  s := input;
  s := translate(s,
    'çÇğĞıIİöÖşŞüÜâÂîÎûÛ',
    'cCgGiIIoOsSuUaAiIuU');
  s := lower(s);
  s := regexp_replace(s, '[^a-z0-9]+', '-', 'g');
  s := regexp_replace(s, '^-+|-+$', '', 'g');
  IF length(s) > 80 THEN
    s := regexp_replace(substr(s, 1, 80), '-[^-]*$', '');
  END IF;
  RETURN s;
END;
$$;

-- 4) Slug üretici — çakışırsa marka/model/yıl ekler, hâlâ çakışırsa -2,-3...
CREATE OR REPLACE FUNCTION public.generate_part_seo_slug(_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p RECORD;
  base TEXT;
  candidate TEXT;
  suffix TEXT;
  i INT := 2;
  oem_part TEXT;
  title_part TEXT;
  brand_part TEXT;
  model_part TEXT;
  year_part TEXT;
  primary_oem TEXT;
BEGIN
  SELECT id, title, brand, model, year, oem_code, oem_codes
    INTO p FROM public.parts WHERE id = _id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  primary_oem := COALESCE(
    NULLIF(p.oem_code, ''),
    (SELECT c FROM unnest(COALESCE(p.oem_codes, ARRAY[]::TEXT[])) AS c WHERE c IS NOT NULL AND c <> '' LIMIT 1)
  );
  oem_part := public._seo_slugify(COALESCE(primary_oem, ''));
  title_part := public._seo_slugify(COALESCE(p.title, ''));
  brand_part := public._seo_slugify(COALESCE(p.brand, ''));
  model_part := public._seo_slugify(COALESCE(p.model, ''));
  year_part := CASE WHEN p.year IS NOT NULL THEN p.year::TEXT ELSE '' END;

  base := NULLIF(trim(both '-' FROM concat_ws('-', NULLIF(oem_part, ''), NULLIF(title_part, ''))), '');
  IF base IS NULL THEN base := 'parca-' || left(replace(p.id::TEXT, '-', ''), 8); END IF;

  candidate := base;
  -- ilk denemede aynısı zaten bu parta aitse koru
  IF EXISTS (SELECT 1 FROM public.parts WHERE seo_slug = candidate AND id <> _id)
     OR EXISTS (SELECT 1 FROM public.parts_slug_history WHERE slug = candidate AND part_id <> _id) THEN
    -- marka ekle
    suffix := NULLIF(brand_part, '');
    IF suffix IS NOT NULL THEN candidate := base || '-' || suffix; END IF;
  END IF;

  IF candidate <> base AND (
       EXISTS (SELECT 1 FROM public.parts WHERE seo_slug = candidate AND id <> _id)
    OR EXISTS (SELECT 1 FROM public.parts_slug_history WHERE slug = candidate AND part_id <> _id)
  ) THEN
    suffix := NULLIF(model_part, '');
    IF suffix IS NOT NULL THEN candidate := candidate || '-' || suffix; END IF;
  END IF;

  IF (
       EXISTS (SELECT 1 FROM public.parts WHERE seo_slug = candidate AND id <> _id)
    OR EXISTS (SELECT 1 FROM public.parts_slug_history WHERE slug = candidate AND part_id <> _id)
  ) AND year_part <> '' THEN
    candidate := candidate || '-' || year_part;
  END IF;

  -- hâlâ çakışıyorsa numerik ek
  WHILE EXISTS (SELECT 1 FROM public.parts WHERE seo_slug = candidate AND id <> _id)
     OR EXISTS (SELECT 1 FROM public.parts_slug_history WHERE slug = candidate AND part_id <> _id)
  LOOP
    candidate := base || '-' || i::TEXT;
    i := i + 1;
    IF i > 200 THEN
      candidate := base || '-' || left(replace(p.id::TEXT, '-', ''), 6);
      EXIT;
    END IF;
  END LOOP;

  RETURN candidate;
END;
$$;

-- 5) Trigger: insert / title/oem/brand/model/year değişiminde slug üret/güncelle, eskiyi history'e at
CREATE OR REPLACE FUNCTION public._tg_part_seo_slug()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_slug TEXT;
  must_regen BOOLEAN := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    must_regen := NEW.seo_slug IS NULL;
  ELSE
    IF NEW.seo_slug IS NULL THEN
      must_regen := true;
    ELSIF COALESCE(NEW.title,'') <> COALESCE(OLD.title,'')
       OR COALESCE(NEW.oem_code,'') <> COALESCE(OLD.oem_code,'')
       OR COALESCE(NEW.brand,'') <> COALESCE(OLD.brand,'')
       OR COALESCE(NEW.model,'') <> COALESCE(OLD.model,'')
       OR COALESCE(NEW.year,0) <> COALESCE(OLD.year,0)
       OR COALESCE(NEW.oem_codes::TEXT,'') <> COALESCE(OLD.oem_codes::TEXT,'') THEN
      must_regen := true;
    END IF;
  END IF;

  IF must_regen THEN
    new_slug := public.generate_part_seo_slug(NEW.id);
    IF TG_OP = 'UPDATE' AND OLD.seo_slug IS NOT NULL AND OLD.seo_slug <> new_slug THEN
      INSERT INTO public.parts_slug_history(slug, part_id) VALUES (OLD.seo_slug, NEW.id)
      ON CONFLICT (slug) DO NOTHING;
    END IF;
    NEW.seo_slug := new_slug;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_parts_seo_slug ON public.parts;
CREATE TRIGGER trg_parts_seo_slug
BEFORE INSERT OR UPDATE ON public.parts
FOR EACH ROW EXECUTE FUNCTION public._tg_part_seo_slug();

-- 6) Backfill — büyük tablo, batchsiz tek seferde
DO $$
DECLARE r RECORD; n TEXT;
BEGIN
  FOR r IN SELECT id FROM public.parts WHERE seo_slug IS NULL LOOP
    n := public.generate_part_seo_slug(r.id);
    BEGIN
      UPDATE public.parts SET seo_slug = n WHERE id = r.id;
    EXCEPTION WHEN unique_violation THEN
      -- nadir: yeniden dene, suffix güncellendiğinden çakışmaz
      UPDATE public.parts SET seo_slug = public.generate_part_seo_slug(r.id) WHERE id = r.id;
    END;
  END LOOP;
END $$;

-- 7) Slug resolver — input UUID, current slug, history slug ya da "{slug}-{uuid}" olabilir
CREATE OR REPLACE FUNCTION public.resolve_part_slug(_input TEXT)
RETURNS TABLE(part_id UUID, current_slug TEXT, redirected BOOLEAN)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uuid UUID;
  v_part_id UUID;
  v_slug TEXT;
  v_clean TEXT;
  m TEXT;
BEGIN
  IF _input IS NULL OR length(_input) < 1 THEN RETURN; END IF;
  v_clean := lower(_input);

  -- Tam UUID
  BEGIN v_uuid := v_clean::UUID; EXCEPTION WHEN OTHERS THEN v_uuid := NULL; END;
  IF v_uuid IS NOT NULL THEN
    SELECT id, seo_slug INTO v_part_id, v_slug FROM public.parts WHERE id = v_uuid;
    IF v_part_id IS NOT NULL THEN
      RETURN QUERY SELECT v_part_id, v_slug, true; RETURN;
    END IF;
  END IF;

  -- Sonu UUID olan eski slug (slug-uuid)
  m := substring(v_clean FROM '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$');
  IF m IS NOT NULL THEN
    BEGIN v_uuid := m::UUID; EXCEPTION WHEN OTHERS THEN v_uuid := NULL; END;
    IF v_uuid IS NOT NULL THEN
      SELECT id, seo_slug INTO v_part_id, v_slug FROM public.parts WHERE id = v_uuid;
      IF v_part_id IS NOT NULL THEN
        RETURN QUERY SELECT v_part_id, v_slug, (v_clean <> COALESCE(v_slug, '')); RETURN;
      END IF;
    END IF;
  END IF;

  -- Mevcut seo_slug
  SELECT id, seo_slug INTO v_part_id, v_slug FROM public.parts WHERE seo_slug = v_clean;
  IF v_part_id IS NOT NULL THEN
    RETURN QUERY SELECT v_part_id, v_slug, false; RETURN;
  END IF;

  -- History
  SELECT p.id, p.seo_slug INTO v_part_id, v_slug
  FROM public.parts_slug_history h JOIN public.parts p ON p.id = h.part_id
  WHERE h.slug = v_clean LIMIT 1;
  IF v_part_id IS NOT NULL THEN
    RETURN QUERY SELECT v_part_id, v_slug, true; RETURN;
  END IF;

  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_part_slug(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_part_seo_slug(UUID) TO service_role;

-- 8) SEO kalite puanı (0-100, 12 kriter, kriter başına ~8 puan)
CREATE OR REPLACE FUNCTION public.seo_quality_score(_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE p RECORD; score INT := 0;
BEGIN
  SELECT * INTO p FROM public.parts WHERE id = _id;
  IF NOT FOUND THEN RETURN 0; END IF;
  IF p.title IS NOT NULL AND length(p.title) >= 10 THEN score := score + 9; END IF;
  IF p.description IS NOT NULL AND length(p.description) >= 80 THEN score := score + 9; END IF;
  IF p.oem_code IS NOT NULL OR (p.oem_codes IS NOT NULL AND array_length(p.oem_codes,1) > 0) THEN score := score + 12; END IF;
  IF p.seo_slug IS NOT NULL THEN score := score + 8; END IF;
  IF p.brand IS NOT NULL THEN score := score + 6; END IF;
  IF p.model IS NOT NULL THEN score := score + 6; END IF;
  IF p.year IS NOT NULL THEN score := score + 4; END IF;
  IF p.photos IS NOT NULL AND array_length(p.photos,1) > 0 THEN score := score + 12; END IF;
  IF p.price IS NOT NULL AND p.price > 0 THEN score := score + 6; END IF;
  IF p.category IS NOT NULL THEN score := score + 6; END IF;
  IF p.city IS NOT NULL THEN score := score + 4; END IF;
  IF p.status = 'approved' AND COALESCE(p.stock_quantity,0) > 0 THEN score := score + 18; END IF;
  IF score > 100 THEN score := 100; END IF;
  RETURN score;
END;
$$;
GRANT EXECUTE ON FUNCTION public.seo_quality_score(UUID) TO anon, authenticated, service_role;

-- 9) Admin raporları
CREATE OR REPLACE FUNCTION public.seo_progress_report()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE j JSONB;
BEGIN
  WITH base AS (
    SELECT * FROM public.parts WHERE status = 'approved' AND COALESCE(stock_quantity,0) > 0
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM base),
    'with_seo_slug', (SELECT count(*) FROM base WHERE seo_slug IS NOT NULL),
    'with_oem', (SELECT count(*) FROM base WHERE oem_code IS NOT NULL OR (oem_codes IS NOT NULL AND array_length(oem_codes,1) > 0)),
    'with_photo', (SELECT count(*) FROM base WHERE photos IS NOT NULL AND array_length(photos,1) > 0),
    'with_description', (SELECT count(*) FROM base WHERE description IS NOT NULL AND length(description) >= 80),
    'avg_score', COALESCE((SELECT round(avg(public.seo_quality_score(id))::numeric, 1) FROM base), 0),
    'updated_30d', (SELECT count(*) FROM base WHERE updated_at >= now() - interval '30 days'),
    'distinct_oems', (SELECT count(DISTINCT upper(regexp_replace(coalesce(oem_code,''), '[\s\-./_]+','','g')))
                      FROM base WHERE oem_code IS NOT NULL),
    'history_redirects', (SELECT count(*) FROM public.parts_slug_history)
  ) INTO j;
  RETURN j;
END;
$$;
GRANT EXECUTE ON FUNCTION public.seo_progress_report() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.seo_pending_index_pages(_limit INT DEFAULT 100)
RETURNS TABLE(
  part_id UUID, seo_slug TEXT, title TEXT, oem_code TEXT,
  score INT, description_length INT, photo_count INT, updated_at TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.seo_slug, p.title, p.oem_code,
         public.seo_quality_score(p.id) AS score,
         COALESCE(length(p.description), 0),
         COALESCE(array_length(p.photos,1), 0),
         p.updated_at
  FROM public.parts p
  WHERE p.status = 'approved' AND COALESCE(p.stock_quantity,0) > 0
  ORDER BY public.seo_quality_score(p.id) ASC, p.updated_at DESC
  LIMIT GREATEST(1, LEAST(_limit, 500));
$$;
GRANT EXECUTE ON FUNCTION public.seo_pending_index_pages(INT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.seo_duplicate_titles(_limit INT DEFAULT 50)
RETURNS TABLE(title TEXT, count BIGINT) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT lower(title), count(*) FROM public.parts
  WHERE status = 'approved' AND COALESCE(stock_quantity,0) > 0 AND title IS NOT NULL
  GROUP BY lower(title) HAVING count(*) > 1
  ORDER BY count(*) DESC LIMIT GREATEST(1, LEAST(_limit, 500));
$$;
GRANT EXECUTE ON FUNCTION public.seo_duplicate_titles(INT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.seo_thin_content(_limit INT DEFAULT 100)
RETURNS TABLE(part_id UUID, seo_slug TEXT, title TEXT, description_length INT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, seo_slug, title, COALESCE(length(description),0)
  FROM public.parts
  WHERE status = 'approved' AND COALESCE(stock_quantity,0) > 0
    AND COALESCE(length(description),0) < 80
  ORDER BY COALESCE(length(description),0) ASC
  LIMIT GREATEST(1, LEAST(_limit, 500));
$$;
GRANT EXECUTE ON FUNCTION public.seo_thin_content(INT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.seo_url_conflicts(_limit INT DEFAULT 50)
RETURNS TABLE(slug TEXT, part_ids UUID[]) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT seo_slug, array_agg(id) FROM public.parts
  WHERE seo_slug IS NOT NULL GROUP BY seo_slug HAVING count(*) > 1
  LIMIT GREATEST(1, LEAST(_limit, 200));
$$;
GRANT EXECUTE ON FUNCTION public.seo_url_conflicts(INT) TO authenticated, service_role;

-- 10) İlişkili ürünler (iç linkleme için)
CREATE OR REPLACE FUNCTION public.related_parts_for(_id UUID, _limit INT DEFAULT 12)
RETURNS TABLE(
  id UUID, title TEXT, seo_slug TEXT, brand TEXT, model TEXT, year INT,
  oem_code TEXT, price NUMERIC, photos TEXT[], city TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE p RECORD;
BEGIN
  SELECT * INTO p FROM public.parts WHERE id = _id;
  IF NOT FOUND THEN RETURN; END IF;
  RETURN QUERY
  WITH cands AS (
    SELECT pp.id, pp.title, pp.seo_slug, pp.brand, pp.model, pp.year, pp.oem_code, pp.price, pp.photos, pp.city,
      (CASE WHEN pp.oem_code = p.oem_code AND p.oem_code IS NOT NULL THEN 5 ELSE 0 END
      + CASE WHEN pp.brand = p.brand AND p.brand IS NOT NULL THEN 2 ELSE 0 END
      + CASE WHEN pp.model = p.model AND p.model IS NOT NULL THEN 2 ELSE 0 END
      + CASE WHEN pp.category = p.category AND p.category IS NOT NULL THEN 1 ELSE 0 END
      + CASE WHEN pp.engine_code = p.engine_code AND p.engine_code IS NOT NULL THEN 2 ELSE 0 END) AS score
    FROM public.parts pp
    WHERE pp.id <> _id AND pp.status = 'approved' AND COALESCE(pp.stock_quantity,0) > 0
  )
  SELECT id, title, seo_slug, brand, model, year, oem_code, price, photos, city
  FROM cands WHERE score > 0
  ORDER BY score DESC, photos NULLS LAST LIMIT GREATEST(1, LEAST(_limit, 30));
END;
$$;
GRANT EXECUTE ON FUNCTION public.related_parts_for(UUID, INT) TO anon, authenticated, service_role;
