
ALTER TABLE public.parts
  ADD COLUMN IF NOT EXISTS oem_family text GENERATED ALWAYS AS (public.normalize_oem_family(oem_code)) STORED;

CREATE INDEX IF NOT EXISTS idx_parts_oem_family ON public.parts(oem_family) WHERE oem_family IS NOT NULL AND oem_family <> '';

ALTER TABLE public.parts
  ADD COLUMN IF NOT EXISTS oem_families text[];

CREATE INDEX IF NOT EXISTS idx_parts_oem_families ON public.parts USING gin (oem_families);

CREATE OR REPLACE FUNCTION public._parts_sync_oem_families()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_norm text;
  v_fam text;
  v_set text[] := '{}';
BEGIN
  IF NEW.oem_norm IS NOT NULL THEN
    FOREACH v_norm IN ARRAY NEW.oem_norm LOOP
      v_fam := public.normalize_oem_family(v_norm);
      IF v_fam IS NOT NULL AND length(v_fam) >= 4 AND NOT (v_fam = ANY(v_set)) THEN
        v_set := array_append(v_set, v_fam);
      END IF;
    END LOOP;
  END IF;
  IF NEW.oem_code IS NOT NULL THEN
    v_fam := public.normalize_oem_family(NEW.oem_code);
    IF v_fam IS NOT NULL AND length(v_fam) >= 4 AND NOT (v_fam = ANY(v_set)) THEN
      v_set := array_append(v_set, v_fam);
    END IF;
  END IF;
  NEW.oem_families := NULLIF(v_set, '{}');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_parts_sync_oem_families ON public.parts;
CREATE TRIGGER trg_parts_sync_oem_families
  BEFORE INSERT OR UPDATE OF oem_code, oem_norm ON public.parts
  FOR EACH ROW EXECUTE FUNCTION public._parts_sync_oem_families();

UPDATE public.parts SET oem_code = oem_code WHERE oem_families IS NULL;

CREATE OR REPLACE FUNCTION public.parts_oem_image_coverage()
RETURNS TABLE (
  total_parts bigint,
  with_photo bigint,
  with_oem bigint,
  matched_in_library bigint,
  unmatched bigint,
  coverage_pct numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total bigint := 0;
  v_photo bigint := 0;
  v_oem bigint := 0;
  v_matched bigint := 0;
BEGIN
  SELECT
    count(*),
    count(*) FILTER (WHERE p.photos IS NOT NULL AND array_length(p.photos,1) > 0),
    count(*) FILTER (WHERE p.oem_families IS NOT NULL AND array_length(p.oem_families,1) > 0),
    count(*) FILTER (
      WHERE p.oem_families IS NOT NULL AND array_length(p.oem_families,1) > 0
        AND EXISTS (
          SELECT 1 FROM public.oem_image_library l
          WHERE l.verified = true AND l.oem_family = ANY(p.oem_families)
        )
    )
  INTO v_total, v_photo, v_oem, v_matched
  FROM public.parts p
  WHERE p.status = 'active';

  total_parts := v_total;
  with_photo := v_photo;
  with_oem := v_oem;
  matched_in_library := v_matched;
  unmatched := GREATEST(v_oem - v_matched, 0);
  coverage_pct := CASE WHEN v_oem = 0 THEN 0
                       ELSE ROUND(v_matched::numeric / v_oem::numeric * 100, 2) END;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.parts_oem_image_coverage() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.parts_missing_oem_images(_limit int DEFAULT 500)
RETURNS TABLE (
  oem_family text,
  part_count bigint,
  sample_brand text,
  sample_title text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH expanded AS (
    SELECT p.id, p.brand, p.title, unnest(p.oem_families) AS fam
    FROM public.parts p
    WHERE p.status = 'active' AND p.oem_families IS NOT NULL
  ),
  missing AS (
    SELECT e.fam, e.brand, e.title
    FROM expanded e
    WHERE NOT EXISTS (
      SELECT 1 FROM public.oem_image_library l
      WHERE l.verified = true AND l.oem_family = e.fam
    )
  )
  SELECT
    fam,
    count(*)::bigint,
    (array_agg(brand))[1],
    (array_agg(title))[1]
  FROM missing
  GROUP BY fam
  ORDER BY count(*) DESC
  LIMIT GREATEST(_limit, 1);
$$;

GRANT EXECUTE ON FUNCTION public.parts_missing_oem_images(int) TO authenticated, service_role;
