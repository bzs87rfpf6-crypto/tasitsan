CREATE OR REPLACE FUNCTION public.admin_update_part(_id uuid, _patch jsonb)
 RETURNS parts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  before_row public.parts;
  after_row  public.parts;
  diff jsonb := '{}'::jsonb;
  k text;
  v jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Yetkisiz' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO before_row FROM public.parts WHERE id = _id FOR UPDATE;
  IF before_row.id IS NULL THEN
    RAISE EXCEPTION 'Kayıt bulunamadı' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.parts SET
    title          = COALESCE(_patch->>'title', title),
    description    = CASE WHEN _patch ? 'description' THEN NULLIF(_patch->>'description','') ELSE description END,
    brand          = CASE WHEN _patch ? 'brand'       THEN NULLIF(_patch->>'brand','')       ELSE brand END,
    model          = CASE WHEN _patch ? 'model'       THEN NULLIF(_patch->>'model','')       ELSE model END,
    year           = CASE WHEN _patch ? 'year'        THEN NULLIF(_patch->>'year','')::int   ELSE year END,
    oem_code       = CASE WHEN _patch ? 'oem_code'    THEN NULLIF(upper(trim(_patch->>'oem_code')),'') ELSE oem_code END,
    oem_codes      = CASE WHEN _patch ? 'oem_codes'
                          THEN COALESCE(ARRAY(SELECT jsonb_array_elements_text(_patch->'oem_codes')), '{}')
                          ELSE oem_codes END,
    engine_code    = CASE WHEN _patch ? 'engine_code' THEN NULLIF(_patch->>'engine_code','') ELSE engine_code END,
    category       = CASE WHEN _patch ? 'category'    THEN NULLIF(_patch->>'category','')    ELSE category END,
    part_type      = CASE WHEN _patch ? 'part_type'   THEN NULLIF(_patch->>'part_type','')   ELSE part_type END,
    vehicle_class  = CASE WHEN _patch ? 'vehicle_class' THEN NULLIF(_patch->>'vehicle_class','') ELSE vehicle_class END,
    condition      = CASE WHEN _patch ? 'condition'   THEN NULLIF(_patch->>'condition','')   ELSE condition END,
    price          = CASE WHEN _patch ? 'price'       THEN NULLIF(_patch->>'price','')::numeric ELSE price END,
    stock_quantity = CASE WHEN _patch ? 'stock_quantity' THEN NULLIF(_patch->>'stock_quantity','')::int ELSE stock_quantity END,
    supplier_stock = CASE WHEN _patch ? 'supplier_stock' THEN COALESCE((_patch->>'supplier_stock')::boolean, false) ELSE supplier_stock END,
    minimum_order_amount = CASE WHEN _patch ? 'minimum_order_amount' THEN NULLIF(_patch->>'minimum_order_amount','')::numeric ELSE minimum_order_amount END,
    single_shipment_allowed = CASE WHEN _patch ? 'single_shipment_allowed' THEN COALESCE((_patch->>'single_shipment_allowed')::boolean, true) ELSE single_shipment_allowed END,
    procurement_days = CASE WHEN _patch ? 'procurement_days' THEN NULLIF(_patch->>'procurement_days','')::int ELSE procurement_days END,
    city           = CASE WHEN _patch ? 'city'        THEN NULLIF(_patch->>'city','')        ELSE city END,
    photos         = CASE WHEN _patch ? 'photos'
                          THEN COALESCE(ARRAY(SELECT jsonb_array_elements_text(_patch->'photos')), '{}')
                          ELSE photos END,
    tags           = CASE WHEN _patch ? 'tags'
                          THEN COALESCE(ARRAY(SELECT jsonb_array_elements_text(_patch->'tags')), '{}')
                          ELSE tags END,
    status         = CASE WHEN _patch ? 'status'      THEN _patch->>'status' ELSE status END,
    reviewed_at    = CASE WHEN _patch ? 'status'      THEN now() ELSE reviewed_at END,
    reviewed_by    = CASE WHEN _patch ? 'status'      THEN auth.uid() ELSE reviewed_by END,
    updated_at     = now()
  WHERE id = _id
  RETURNING * INTO after_row;

  FOR k, v IN SELECT key, value FROM jsonb_each(to_jsonb(after_row)) LOOP
    IF to_jsonb(before_row)->k IS DISTINCT FROM v THEN
      diff := diff || jsonb_build_object(k, jsonb_build_object('old', to_jsonb(before_row)->k, 'new', v));
    END IF;
  END LOOP;

  IF diff <> '{}'::jsonb THEN
    INSERT INTO public.admin_audit_log(actor_id, target_user_id, action, old_value, new_value, metadata)
    VALUES (
      auth.uid(),
      before_row.seller_id,
      'update_part',
      to_jsonb(before_row),
      to_jsonb(after_row),
      jsonb_build_object('part_id', _id, 'diff', diff)
    );
  END IF;

  RETURN after_row;
END;
$function$;