CREATE OR REPLACE FUNCTION public.home_new_feed(_vehicle_class text DEFAULT NULL::text, _limit integer DEFAULT 24, _offset integer DEFAULT 0)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _vc text := NULLIF(_vehicle_class, '');
  _lim integer := least(greatest(coalesce(_limit, 24), 1), 60);
  _off integer := greatest(coalesce(_offset, 0), 0);
  _rows jsonb;
  _total bigint;
BEGIN
  IF _vc IS NOT NULL AND _vc NOT IN ('automobile','heavy_vehicle','construction','agriculture') THEN
    _vc := NULL;
  END IF;

  SELECT count(*) INTO _total
  FROM parts
  WHERE status='approved'
    AND has_photos = true
    AND coalesce(is_sold, false) = false
    AND coalesce(stock_quantity, 1) > 0
    AND (_vc IS NULL OR vehicle_class = _vc);

  WITH base AS (
    SELECT id,seo_slug,title,brand,model,year,price,city,photos,condition,category,stock_quantity,oem_code,oem_codes,seller_id,part_type,is_sold,delivery_options,urgent_delivery,created_at
    FROM parts
    WHERE status='approved'
      AND has_photos = true
      AND coalesce(is_sold, false) = false
      AND coalesce(stock_quantity, 1) > 0
      AND (_vc IS NULL OR vehicle_class = _vc)
    ORDER BY created_at DESC, id DESC
    OFFSET _off
    LIMIT _lim
  )
  SELECT coalesce(jsonb_agg(row_to_json(t) ORDER BY t.created_at DESC), '[]'::jsonb) FROM base t INTO _rows;

  RETURN jsonb_build_object('items', _rows, 'total', _total);
END;
$function$;

REVOKE ALL ON FUNCTION public.home_new_feed(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.home_new_feed(text, integer, integer) TO anon, authenticated, service_role;