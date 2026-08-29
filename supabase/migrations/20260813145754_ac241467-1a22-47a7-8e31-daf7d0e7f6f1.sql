CREATE OR REPLACE FUNCTION public.admin_price_bulk_preview(_actor uuid, _brand text, _operation text, _percent numeric, _filters jsonb DEFAULT '{}'::jsonb, _sample_limit integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _factor numeric;
  _cnt bigint;
  _old numeric;
  _new numeric;
  _sample jsonb;
BEGIN
  IF NOT (public.has_role(_actor, 'admin') OR public.has_role(_actor, 'super_admin')) THEN
    RAISE EXCEPTION 'Yetkisiz';
  END IF;
  IF _percent IS NULL OR _percent <= 0 THEN
    RAISE EXCEPTION 'Geçersiz yüzde';
  END IF;
  IF _operation = 'increase' THEN
    _factor := 1 + (_percent / 100.0);
  ELSIF _operation = 'decrease' THEN
    IF _percent >= 100 THEN RAISE EXCEPTION 'İndirim oranı %% 100 veya üzeri olamaz'; END IF;
    _factor := 1 - (_percent / 100.0);
  ELSE
    RAISE EXCEPTION 'Geçersiz işlem türü';
  END IF;

  WITH prev AS (
    SELECT p.id, p.title, p.oem_code, p.price AS old_price,
           round(p.price * _factor, 2) AS new_price
    FROM public.parts p
    WHERE lower(COALESCE(NULLIF(btrim(p.brand), ''), 'Belirtilmemiş')) = lower(btrim(_brand))
      AND p.price IS NOT NULL AND p.price > 0
      AND (NOT COALESCE((_filters->>'in_stock')::boolean, false) OR COALESCE(p.stock_quantity, 0) > 0)
      AND ((_filters->>'min_price') IS NULL OR p.price >= (_filters->>'min_price')::numeric)
      AND ((_filters->>'max_price') IS NULL OR p.price <= (_filters->>'max_price')::numeric)
      AND ((_filters->>'category') IS NULL OR p.category = (_filters->>'category'))
      AND ((_filters->>'oem') IS NULL OR p.oem_code ILIKE '%' || (_filters->>'oem') || '%'
           OR EXISTS (SELECT 1 FROM unnest(COALESCE(p.oem_codes, '{}')) o WHERE o ILIKE '%' || (_filters->>'oem') || '%'))
      AND ((_filters->>'has_photos') IS NULL OR COALESCE(p.has_photos, false) = (_filters->>'has_photos')::boolean)
  ), agg AS (
    SELECT count(*) AS cnt,
           round(COALESCE(sum(old_price),0),2) AS old_total,
           round(COALESCE(sum(new_price),0),2) AS new_total
    FROM prev
  ), smp AS (
    SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) AS sample FROM (
      SELECT id, title, oem_code, old_price, new_price
      FROM prev ORDER BY old_price DESC LIMIT _sample_limit
    ) x
  )
  SELECT agg.cnt, agg.old_total, agg.new_total, smp.sample
    INTO _cnt, _old, _new, _sample
  FROM agg, smp;

  RETURN jsonb_build_object(
    'count', _cnt, 'old_total', _old, 'new_total', _new,
    'diff_total', round(_new - _old, 2), 'sample', _sample
  );
END;
$function$;