CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE OR REPLACE FUNCTION public.catalog_normalize_oem(_s text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT regexp_replace(upper(coalesce(_s, '')), '[^A-Z0-9]+', '', 'g')
$$;

CREATE OR REPLACE FUNCTION public.catalog_normalize_name(_s text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT btrim(regexp_replace(
    regexp_replace(
      lower(translate(coalesce(_s, ''), 'ÇĞİIÖŞÜçğıiöşüÂÎÛâîû', 'CGIIOSUcgiiosuAIUaiu')),
      '[^a-z0-9]+', ' ', 'g'),
    '\s+', ' ', 'g'))
$$;

CREATE TABLE IF NOT EXISTS public.oem_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  part_name text NOT NULL,
  normalized_part_name text NOT NULL,
  oem_no text NOT NULL,
  normalized_oem text NOT NULL,
  brand text,
  vehicle_model text,
  vehicle_year text,
  alternative_oems text[] NOT NULL DEFAULT '{}',
  normalized_alternative_oems text[] NOT NULL DEFAULT '{}',
  source_catalog text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.oem_catalog TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oem_catalog TO authenticated;
GRANT ALL ON public.oem_catalog TO service_role;

ALTER TABLE public.oem_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "oem_catalog_public_read" ON public.oem_catalog
  FOR SELECT USING (true);

CREATE POLICY "oem_catalog_admin_write" ON public.oem_catalog
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE UNIQUE INDEX IF NOT EXISTS oem_catalog_uniq
  ON public.oem_catalog (normalized_oem, normalized_part_name);
CREATE INDEX IF NOT EXISTS oem_catalog_name_trgm
  ON public.oem_catalog USING gin (normalized_part_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS oem_catalog_oem_idx ON public.oem_catalog (normalized_oem);
CREATE INDEX IF NOT EXISTS oem_catalog_brand_idx ON public.oem_catalog (brand);
CREATE INDEX IF NOT EXISTS oem_catalog_source_idx ON public.oem_catalog (source_catalog);

CREATE OR REPLACE FUNCTION public.oem_catalog_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.normalized_part_name := public.catalog_normalize_name(NEW.part_name);
  NEW.normalized_oem := public.catalog_normalize_oem(NEW.oem_no);
  NEW.normalized_alternative_oems := (
    SELECT coalesce(array_agg(DISTINCT public.catalog_normalize_oem(x))
             FILTER (WHERE public.catalog_normalize_oem(x) <> ''), '{}')
    FROM unnest(coalesce(NEW.alternative_oems, '{}')) AS x
  );
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS oem_catalog_touch_trg ON public.oem_catalog;
CREATE TRIGGER oem_catalog_touch_trg
  BEFORE INSERT OR UPDATE ON public.oem_catalog
  FOR EACH ROW EXECUTE FUNCTION public.oem_catalog_touch();

CREATE OR REPLACE FUNCTION public.catalog_search(_q text, _tokens text[] DEFAULT '{}', _limit int DEFAULT 50)
RETURNS TABLE (
  id uuid,
  part_name text,
  oem_no text,
  normalized_oem text,
  brand text,
  vehicle_model text,
  vehicle_year text,
  alternative_oems text[],
  source_catalog text,
  score real
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH q AS (
    SELECT public.catalog_normalize_name(_q) AS nq,
           (SELECT coalesce(array_agg(t), '{}') FROM unnest(coalesce(_tokens, '{}')) t WHERE length(t) >= 2) AS toks
  )
  SELECT c.id, c.part_name, c.oem_no, c.normalized_oem, c.brand, c.vehicle_model,
         c.vehicle_year, c.alternative_oems, c.source_catalog,
         (0.55 * (
            SELECT count(*)::real FROM unnest(q.toks) t
            WHERE c.normalized_part_name LIKE '%' || t || '%'
               OR coalesce(c.brand, '') ILIKE '%' || t || '%'
               OR coalesce(c.vehicle_model, '') ILIKE '%' || t || '%'
          ) / greatest(coalesce(array_length(q.toks, 1), 1), 1)
          + 0.45 * similarity(c.normalized_part_name, q.nq))::real AS score
  FROM public.oem_catalog c, q
  WHERE q.nq <> ''
    AND (
      c.normalized_part_name % q.nq
      OR EXISTS (
        SELECT 1 FROM unnest(q.toks) t
        WHERE c.normalized_part_name LIKE '%' || t || '%'
           OR coalesce(c.brand, '') ILIKE '%' || t || '%'
           OR coalesce(c.vehicle_model, '') ILIKE '%' || t || '%'
      )
    )
  ORDER BY score DESC, c.part_name ASC
  LIMIT greatest(least(coalesce(_limit, 50), 200), 1)
$$;

GRANT EXECUTE ON FUNCTION public.catalog_search(text, text[], int) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.catalog_stats()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'total_records', (SELECT count(*) FROM public.oem_catalog),
    'total_oems', (SELECT count(DISTINCT normalized_oem) FROM public.oem_catalog),
    'total_brands', (SELECT count(DISTINCT brand) FROM public.oem_catalog WHERE brand IS NOT NULL AND brand <> ''),
    'matched_in_parts', (
      SELECT count(DISTINCT c.normalized_oem) FROM public.oem_catalog c
      WHERE EXISTS (SELECT 1 FROM public.parts p WHERE public.catalog_normalize_oem(p.oem_code) = c.normalized_oem)
    ),
    'last_upload', (SELECT max(created_at) FROM public.oem_catalog),
    'catalogs', coalesce((
      SELECT jsonb_agg(x ORDER BY x->>'source_catalog')
      FROM (
        SELECT jsonb_build_object(
          'source_catalog', source_catalog,
          'records', count(*),
          'last_upload', max(created_at)
        ) AS x
        FROM public.oem_catalog GROUP BY source_catalog
      ) s
    ), '[]'::jsonb)
  )
$$;

GRANT EXECUTE ON FUNCTION public.catalog_stats() TO authenticated, service_role;