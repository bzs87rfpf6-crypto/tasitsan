
CREATE TABLE public.price_bulk_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand text NOT NULL,
  operation_type text NOT NULL CHECK (operation_type IN ('increase','decrease')),
  percent numeric NOT NULL CHECK (percent > 0),
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  affected_count integer NOT NULL DEFAULT 0,
  old_total numeric NOT NULL DEFAULT 0,
  new_total numeric NOT NULL DEFAULT 0,
  diff_total numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'success',
  error_message text,
  actor_id uuid,
  actor_email text,
  reverted_at timestamptz,
  reverted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.price_bulk_operations TO authenticated;
GRANT ALL ON public.price_bulk_operations TO service_role;
ALTER TABLE public.price_bulk_operations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view price operations"
  ON public.price_bulk_operations FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.price_bulk_operation_items (
  id bigserial PRIMARY KEY,
  operation_id uuid NOT NULL REFERENCES public.price_bulk_operations(id) ON DELETE CASCADE,
  part_id uuid NOT NULL,
  old_price numeric NOT NULL,
  new_price numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_price_bulk_items_op ON public.price_bulk_operation_items(operation_id);

GRANT SELECT ON public.price_bulk_operation_items TO authenticated;
GRANT ALL ON public.price_bulk_operation_items TO service_role;
ALTER TABLE public.price_bulk_operation_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view price operation items"
  ON public.price_bulk_operation_items FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_price_bulk_operations_updated_at
  BEFORE UPDATE ON public.price_bulk_operations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Brand statistics
CREATE OR REPLACE FUNCTION public.admin_price_brand_stats(_actor uuid)
RETURNS TABLE (
  brand text,
  total_products bigint,
  priced_products bigint,
  avg_price numeric,
  stock_value numeric,
  last_price_update timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(_actor, 'admin') THEN
    RAISE EXCEPTION 'Yetkisiz';
  END IF;
  RETURN QUERY
  SELECT
    COALESCE(NULLIF(btrim(p.brand), ''), 'Belirtilmemiş') AS brand,
    count(*)::bigint,
    count(*) FILTER (WHERE p.price IS NOT NULL AND p.price > 0)::bigint,
    round(COALESCE(avg(p.price) FILTER (WHERE p.price IS NOT NULL AND p.price > 0), 0), 2),
    round(COALESCE(sum(p.price * GREATEST(COALESCE(p.stock_quantity, 1), 1)) FILTER (WHERE p.price IS NOT NULL AND p.price > 0), 0), 2),
    max(p.updated_at)
  FROM public.parts p
  GROUP BY 1
  ORDER BY 2 DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_price_brand_stats(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_price_brand_stats(uuid) TO service_role;

-- Preview
CREATE OR REPLACE FUNCTION public.admin_price_bulk_preview(
  _actor uuid,
  _brand text,
  _operation text,
  _percent numeric,
  _filters jsonb DEFAULT '{}'::jsonb,
  _sample_limit integer DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _factor numeric;
  _cnt bigint;
  _old numeric;
  _new numeric;
  _sample jsonb;
BEGIN
  IF NOT public.has_role(_actor, 'admin') THEN
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
  WHERE COALESCE(NULLIF(btrim(p.brand), ''), 'Belirtilmemiş') = _brand
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
$$;

REVOKE ALL ON FUNCTION public.admin_price_bulk_preview(uuid, text, text, numeric, jsonb, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_price_bulk_preview(uuid, text, text, numeric, jsonb, integer) TO service_role;

-- Apply
CREATE OR REPLACE FUNCTION public.admin_price_bulk_apply(
  _actor uuid,
  _actor_email text,
  _brand text,
  _operation text,
  _percent numeric,
  _filters jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _factor numeric;
  _op_id uuid;
  _cnt bigint;
  _old numeric;
  _new numeric;
BEGIN
  IF NOT public.has_role(_actor, 'admin') THEN
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
    WHERE COALESCE(NULLIF(btrim(p.brand), ''), 'Belirtilmemiş') = _brand
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
$$;

REVOKE ALL ON FUNCTION public.admin_price_bulk_apply(uuid, text, text, text, numeric, jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_price_bulk_apply(uuid, text, text, text, numeric, jsonb) TO service_role;

-- Undo
CREATE OR REPLACE FUNCTION public.admin_price_bulk_undo(_actor uuid, _operation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cnt bigint;
BEGIN
  IF NOT public.has_role(_actor, 'admin') THEN
    RAISE EXCEPTION 'Yetkisiz';
  END IF;
  IF EXISTS (SELECT 1 FROM public.price_bulk_operations WHERE id = _operation_id AND reverted_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Bu işlem zaten geri alınmış';
  END IF;

  WITH upd AS (
    UPDATE public.parts p
       SET price = i.old_price, updated_at = now()
      FROM public.price_bulk_operation_items i
     WHERE i.operation_id = _operation_id
       AND p.id = i.part_id
       AND p.price = i.new_price
    RETURNING p.id
  )
  SELECT count(*) INTO _cnt FROM upd;

  UPDATE public.price_bulk_operations
     SET reverted_at = now(), reverted_by = _actor, status = 'reverted'
   WHERE id = _operation_id;

  RETURN jsonb_build_object('reverted_count', _cnt);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_price_bulk_undo(uuid, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_price_bulk_undo(uuid, uuid) TO service_role;
