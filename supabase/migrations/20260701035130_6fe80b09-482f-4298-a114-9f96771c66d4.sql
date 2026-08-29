
-- 1) Fix parts_normalize_oem so an admin edit that changes only oem_code
--    doesn't get silently reverted by the trigger overwriting it with
--    oem_codes[1]. When oem_code is explicitly changed and oem_codes is
--    unchanged, promote the new value into oem_codes as the primary.
CREATE OR REPLACE FUNCTION public.parts_normalize_oem()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  cleaned TEXT[];
  new_primary TEXT;
BEGIN
  IF NEW.oem_codes IS NULL THEN
    NEW.oem_codes := '{}';
  END IF;

  -- Detect explicit oem_code edit (admin dialog case)
  IF TG_OP = 'UPDATE'
     AND NEW.oem_code IS DISTINCT FROM OLD.oem_code
     AND NEW.oem_codes IS NOT DISTINCT FROM OLD.oem_codes
     AND NEW.oem_code IS NOT NULL
     AND trim(NEW.oem_code) <> ''
  THEN
    new_primary := upper(trim(NEW.oem_code));
    -- Rebuild oem_codes: new primary first, then remaining unique codes.
    NEW.oem_codes := ARRAY(
      SELECT c FROM (
        SELECT new_primary AS c, 0 AS ord
        UNION ALL
        SELECT DISTINCT upper(trim(x)) AS c, 1 AS ord
        FROM unnest(COALESCE(NEW.oem_codes, '{}')) x
        WHERE x IS NOT NULL AND trim(x) <> '' AND upper(trim(x)) <> new_primary
      ) s ORDER BY ord
    );
  END IF;

  SELECT COALESCE(array_agg(DISTINCT upper(trim(c)) ORDER BY upper(trim(c))), '{}')
    INTO cleaned
  FROM unnest(NEW.oem_codes) AS c
  WHERE c IS NOT NULL AND trim(c) <> '';

  -- Preserve primary-first ordering: move new_primary (if set) to slot 0
  IF new_primary IS NOT NULL AND new_primary = ANY(cleaned) THEN
    cleaned := ARRAY[new_primary] || ARRAY(SELECT x FROM unnest(cleaned) x WHERE x <> new_primary);
  END IF;

  NEW.oem_codes := cleaned;

  IF array_length(cleaned, 1) IS NULL THEN
    IF NEW.oem_code IS NOT NULL AND trim(NEW.oem_code) <> '' THEN
      NEW.oem_codes := ARRAY[upper(trim(NEW.oem_code))];
      NEW.oem_code := upper(trim(NEW.oem_code));
    ELSE
      NEW.oem_code := NULL;
    END IF;
  ELSE
    NEW.oem_code := cleaned[1];
  END IF;

  IF NEW.engine_code IS NOT NULL THEN
    NEW.engine_code := upper(trim(NEW.engine_code));
    IF NEW.engine_code = '' THEN NEW.engine_code := NULL; END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- 2) Indexes to keep search fast at 100k+ scale
CREATE INDEX IF NOT EXISTS parts_oem_code_trgm_idx
  ON public.parts USING gin (oem_code gin_trgm_ops);
CREATE INDEX IF NOT EXISTS parts_oem_codes_gin_idx
  ON public.parts USING gin (oem_codes);
CREATE INDEX IF NOT EXISTS parts_seller_created_idx
  ON public.parts (seller_id, created_at DESC);

-- 3) Server-side seller search RPC. Scales past the client 1000 limit and
--    supports OEM / title / brand / model / engine_code / part number search.
CREATE OR REPLACE FUNCTION public.search_my_parts(
  _q text DEFAULT '',
  _limit int DEFAULT 50,
  _offset int DEFAULT 0
) RETURNS SETOF public.parts
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH q AS (
    SELECT nullif(trim(_q), '') AS raw,
           upper(regexp_replace(coalesce(_q,''), '[\s\-./]', '', 'g')) AS oem_can
  )
  SELECT p.*
  FROM public.parts p, q
  WHERE p.seller_id = auth.uid()
    AND (
      q.raw IS NULL
      OR p.title ILIKE '%'||q.raw||'%'
      OR coalesce(p.brand,'') ILIKE '%'||q.raw||'%'
      OR coalesce(p.model,'') ILIKE '%'||q.raw||'%'
      OR coalesce(p.category,'') ILIKE '%'||q.raw||'%'
      OR coalesce(p.engine_code,'') ILIKE '%'||q.raw||'%'
      OR coalesce(p.oem_code,'') ILIKE '%'||q.raw||'%'
      OR EXISTS (
        SELECT 1 FROM unnest(coalesce(p.oem_codes,'{}')) c
        WHERE upper(regexp_replace(c,'[\s\-./]','','g')) ILIKE '%'||q.oem_can||'%'
      )
    )
  ORDER BY p.created_at DESC
  LIMIT greatest(1, least(_limit, 200))
  OFFSET greatest(0, _offset);
$$;

GRANT EXECUTE ON FUNCTION public.search_my_parts(text,int,int) TO authenticated;

-- 4) admin_update_part: SECURITY DEFINER RPC. Verifies admin, updates every
--    editable column, writes to admin_audit_log (old + new + diff), returns row.
CREATE OR REPLACE FUNCTION public.admin_update_part(
  _id uuid,
  _patch jsonb
) RETURNS public.parts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- Build diff of actually changed columns
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
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_part(uuid, jsonb) TO authenticated;
