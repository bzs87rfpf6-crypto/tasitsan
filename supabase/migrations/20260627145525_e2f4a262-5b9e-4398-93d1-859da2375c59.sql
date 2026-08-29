
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

  SELECT coalesce(jsonb_agg(DISTINCT upper(regexp_replace(equivalent_code, '[\s\-./_]+', '', 'g'))), '[]'::jsonb)
    INTO _equivalents
  FROM public.oem_cross_reference
  WHERE oem_normalized = _norm
    AND equivalent_code IS NOT NULL
    AND length(equivalent_code) >= 4
    AND upper(regexp_replace(equivalent_code, '[\s\-./_]+', '', 'g')) <> _norm;

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
