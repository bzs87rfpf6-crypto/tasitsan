CREATE OR REPLACE FUNCTION public.admin_price_brand_stats(_actor uuid)
 RETURNS TABLE(brand text, total_products bigint, priced_products bigint, avg_price numeric, stock_value numeric, last_price_update timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (public.has_role(_actor, 'admin') OR public.has_role(_actor, 'super_admin')) THEN
    RAISE EXCEPTION 'Yetkisiz';
  END IF;
  RETURN QUERY
  WITH norm AS (
    SELECT
      lower(COALESCE(NULLIF(btrim(p.brand), ''), 'Belirtilmemiş')) AS bkey,
      COALESCE(NULLIF(btrim(p.brand), ''), 'Belirtilmemiş') AS blabel,
      p.price, p.stock_quantity, p.updated_at
    FROM public.parts p
  ), labels AS (
    SELECT DISTINCT ON (bkey) bkey, blabel
    FROM (SELECT bkey, blabel, count(*) c FROM norm GROUP BY 1,2) t
    ORDER BY bkey, c DESC, blabel
  )
  SELECT
    l.blabel,
    count(*)::bigint,
    count(*) FILTER (WHERE n.price IS NOT NULL AND n.price > 0)::bigint,
    round(COALESCE(avg(n.price) FILTER (WHERE n.price IS NOT NULL AND n.price > 0), 0), 2),
    round(COALESCE(sum(n.price * GREATEST(COALESCE(n.stock_quantity, 1), 1)) FILTER (WHERE n.price IS NOT NULL AND n.price > 0), 0), 2),
    max(n.updated_at)
  FROM norm n
  JOIN labels l ON l.bkey = n.bkey
  GROUP BY l.blabel
  ORDER BY 2 DESC;
END;
$function$;

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

  CREATE TEMP TABLE _prev ON COMMIT DROP AS
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
    AND ((_filters->>'has_photos') IS NULL OR COALESCE(p.has_photos, false) = (_filters->>'has_photos')::boolean);

  SELECT count(*), round(COALESCE(sum(old_price),0),2), round(COALESCE(sum(new_price),0),2)
    INTO _cnt, _old, _new FROM _prev;

  SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) INTO _sample FROM (
    SELECT id, title, oem_code, old_price, new_price FROM _prev ORDER BY old_price DESC LIMIT _sample_limit
  ) x;

  DROP TABLE _prev;

  RETURN jsonb_build_object(
    'count', _cnt, 'old_total', _old, 'new_total', _new,
    'diff_total', round(_new - _old, 2), 'sample', _sample
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_price_bulk_apply(_actor uuid, _actor_email text, _brand text, _operation text, _percent numeric, _filters jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _factor numeric;
  _op_id uuid;
  _cnt bigint;
  _old numeric;
  _new numeric;
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

  INSERT INTO public.price_bulk_operations (brand, operation_type, percent, filters, actor_id, actor_email, status)
  VALUES (_brand, _operation, _percent, COALESCE(_filters, '{}'::jsonb), _actor, _actor_email, 'success')
  RETURNING id INTO _op_id;

  WITH target AS (
    SELECT p.id, p.price AS old_price, round(p.price * _factor, 2) AS new_price
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
    FOR UPDATE
  ), ins AS (
    INSERT INTO public.price_bulk_operation_items (operation_id, part_id, old_price, new_price)
    SELECT _op_id, id, old_price, new_price FROM target
    WHERE new_price > 0
    RETURNING part_id, old_price, new_price
  ), upd AS (
    UPDATE public.parts p SET price = i.new_price, updated_at = now()
    FROM ins i WHERE p.id = i.part_id
    RETURNING i.old_price, i.new_price
  )
  SELECT count(*), round(COALESCE(sum(old_price),0),2), round(COALESCE(sum(new_price),0),2)
    INTO _cnt, _old, _new FROM upd;

  IF _cnt = 0 THEN
    RAISE EXCEPTION 'Güncellenecek ürün bulunamadı';
  END IF;

  UPDATE public.price_bulk_operations
     SET affected_count = _cnt, old_total = _old, new_total = _new, diff_total = round(_new - _old, 2)
   WHERE id = _op_id;

  RETURN jsonb_build_object('operation_id', _op_id, 'count', _cnt, 'old_total', _old, 'new_total', _new, 'diff_total', round(_new - _old, 2));
END;
$function$;