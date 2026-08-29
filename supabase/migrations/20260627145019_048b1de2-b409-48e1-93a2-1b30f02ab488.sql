
-- Distinct OEM codes (union of oem_code + oem_codes[]) from approved, in-stock parts.
CREATE OR REPLACE FUNCTION public.count_distinct_oems()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*) FROM (
    SELECT DISTINCT upper(regexp_replace(oem, '[\s\-./_]+', '', 'g')) AS oem
    FROM (
      SELECT unnest(coalesce(oem_codes, ARRAY[]::text[]) ||
                    CASE WHEN oem_code IS NOT NULL AND oem_code <> '' THEN ARRAY[oem_code] ELSE ARRAY[]::text[] END) AS oem
      FROM public.parts
      WHERE status = 'approved' AND coalesce(stock_quantity, 0) > 0
    ) t
    WHERE oem IS NOT NULL AND length(oem) >= 4
  ) u;
$$;

CREATE OR REPLACE FUNCTION public.list_distinct_oems(_offset int, _limit int)
RETURNS TABLE(oem text, listing_count bigint, last_updated timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    upper(regexp_replace(o.oem, '[\s\-./_]+', '', 'g')) AS oem,
    count(DISTINCT o.part_id) AS listing_count,
    max(o.updated_at) AS last_updated
  FROM (
    SELECT p.id AS part_id, p.updated_at,
           unnest(coalesce(p.oem_codes, ARRAY[]::text[]) ||
                  CASE WHEN p.oem_code IS NOT NULL AND p.oem_code <> '' THEN ARRAY[p.oem_code] ELSE ARRAY[]::text[] END) AS oem
    FROM public.parts p
    WHERE p.status = 'approved' AND coalesce(p.stock_quantity, 0) > 0
  ) o
  WHERE o.oem IS NOT NULL AND length(o.oem) >= 4
  GROUP BY 1
  ORDER BY 1
  OFFSET greatest(_offset, 0)
  LIMIT least(greatest(_limit, 1), 10000);
$$;

-- Listing page for /oem/{code}: parts matching that OEM (normalized) + cross-reference equivalents.
CREATE OR REPLACE FUNCTION public.oem_listing_page(_oem text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _norm text := upper(regexp_replace(coalesce(_oem, ''), '[\s\-./_]+', '', 'g'));
  _parts jsonb;
  _equivalents jsonb;
  _vehicles jsonb;
BEGIN
  IF length(_norm) < 4 THEN
    RETURN jsonb_build_object('parts', '[]'::jsonb, 'equivalents', '[]'::jsonb, 'vehicles', '[]'::jsonb, 'normalized', _norm);
  END IF;

  SELECT coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb) INTO _parts
  FROM (
    SELECT p.id, p.title, p.brand, p.model, p.year, p.price, p.city, p.photos,
           p.condition, p.part_type, p.stock_quantity, p.oem_code, p.oem_codes,
           p.updated_at
    FROM public.parts p
    WHERE p.status = 'approved' AND coalesce(p.stock_quantity, 0) > 0
      AND (
        upper(regexp_replace(coalesce(p.oem_code, ''), '[\s\-./_]+', '', 'g')) = _norm
        OR EXISTS (
          SELECT 1 FROM unnest(coalesce(p.oem_codes, ARRAY[]::text[])) c
          WHERE upper(regexp_replace(c, '[\s\-./_]+', '', 'g')) = _norm
        )
      )
    ORDER BY (p.photos IS NOT NULL AND array_length(p.photos, 1) > 0) DESC, p.updated_at DESC
    LIMIT 60
  ) x;

  SELECT coalesce(jsonb_agg(DISTINCT upper(regexp_replace(c.code, '[\s\-./_]+', '', 'g'))), '[]'::jsonb) INTO _equivalents
  FROM (
    SELECT unnest(coalesce(equivalent_codes, ARRAY[]::text[])) AS code
    FROM public.oem_cross_reference
    WHERE upper(regexp_replace(coalesce(oem_code, ''), '[\s\-./_]+', '', 'g')) = _norm
  ) c
  WHERE c.code IS NOT NULL AND length(c.code) >= 4
    AND upper(regexp_replace(c.code, '[\s\-./_]+', '', 'g')) <> _norm;

  SELECT coalesce(jsonb_agg(DISTINCT v), '[]'::jsonb) INTO _vehicles
  FROM (
    SELECT trim(both ' ' from concat_ws(' ', brand, model)) AS v
    FROM public.parts p
    WHERE p.status = 'approved'
      AND (brand IS NOT NULL OR model IS NOT NULL)
      AND (
        upper(regexp_replace(coalesce(p.oem_code, ''), '[\s\-./_]+', '', 'g')) = _norm
        OR EXISTS (
          SELECT 1 FROM unnest(coalesce(p.oem_codes, ARRAY[]::text[])) c
          WHERE upper(regexp_replace(c, '[\s\-./_]+', '', 'g')) = _norm
        )
      )
    LIMIT 20
  ) t
  WHERE v <> '';

  RETURN jsonb_build_object(
    'normalized', _norm,
    'parts', _parts,
    'equivalents', _equivalents,
    'vehicles', _vehicles
  );
END;
$$;

-- Audit: approved + in-stock OEM-bearing parts vs. SEO completeness.
CREATE OR REPLACE FUNCTION public.oem_seo_audit()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'total_approved', (SELECT count(*) FROM public.parts WHERE status='approved' AND coalesce(stock_quantity,0)>0),
    'with_oem', (SELECT count(*) FROM public.parts
                  WHERE status='approved' AND coalesce(stock_quantity,0)>0
                    AND (oem_code IS NOT NULL OR (oem_codes IS NOT NULL AND array_length(oem_codes,1) > 0))),
    'missing_oem', (SELECT count(*) FROM public.parts
                     WHERE status='approved' AND coalesce(stock_quantity,0)>0
                       AND (oem_code IS NULL OR oem_code = '')
                       AND (oem_codes IS NULL OR array_length(oem_codes,1) IS NULL)),
    'missing_photo', (SELECT count(*) FROM public.parts
                       WHERE status='approved' AND coalesce(stock_quantity,0)>0
                         AND (photos IS NULL OR array_length(photos,1) IS NULL)),
    'thin_description', (SELECT count(*) FROM public.parts
                          WHERE status='approved' AND coalesce(stock_quantity,0)>0
                            AND (description IS NULL OR length(trim(description)) < 20)),
    'distinct_oems', (SELECT public.count_distinct_oems())
  );
$$;

GRANT EXECUTE ON FUNCTION public.count_distinct_oems() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_distinct_oems(int, int) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.oem_listing_page(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.oem_seo_audit() TO authenticated, service_role;
