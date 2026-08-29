CREATE OR REPLACE FUNCTION public.home_new_pool(_vehicle_class text DEFAULT NULL::text, _pool integer DEFAULT 500)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _vc text := NULLIF(_vehicle_class, '');
  _lim integer := least(greatest(coalesce(_pool, 500), 30), 500);
  _rows jsonb;
BEGIN
  IF _vc IS NOT NULL AND _vc NOT IN ('automobile','heavy_vehicle','construction','agriculture') THEN
    _vc := NULL;
  END IF;

  WITH base AS (
    SELECT id,seo_slug,title,brand,model,year,price,city,photos,condition,category,stock_quantity,oem_code,oem_codes,seller_id,part_type,is_sold,delivery_options,urgent_delivery,created_at
    FROM parts
    WHERE status='approved'
      AND has_photos = true
      AND coalesce(is_sold, false) = false
      AND coalesce(stock_quantity, 1) > 0
      AND (_vc IS NULL OR vehicle_class = _vc)
    ORDER BY created_at DESC
    LIMIT _lim
  )
  SELECT coalesce(jsonb_agg(row_to_json(t) ORDER BY t.created_at DESC), '[]'::jsonb) FROM base t INTO _rows;

  RETURN jsonb_build_object('items', _rows);
END;
$function$;

REVOKE ALL ON FUNCTION public.home_new_pool(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.home_new_pool(text, integer) TO anon, authenticated, service_role;