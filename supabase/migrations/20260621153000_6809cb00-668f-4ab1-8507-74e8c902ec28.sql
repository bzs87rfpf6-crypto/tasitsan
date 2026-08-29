CREATE OR REPLACE FUNCTION public.enqueue_oem_scan(_scope text, _brand text DEFAULT NULL::text, _oem text DEFAULT NULL::text, _limit integer DEFAULT 5000)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inserted integer := 0;
  v_adhoc_exists boolean;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  WITH candidates AS (
    SELECT p.id AS part_id, p.oem_code AS oem, p.brand, p.title
    FROM public.parts p
    WHERE p.oem_code IS NOT NULL AND length(trim(p.oem_code)) > 0
      AND (_scope <> 'no_images' OR p.photos IS NULL OR jsonb_array_length(COALESCE(p.photos, '[]'::jsonb)) = 0)
      AND (_scope <> 'brand' OR lower(p.brand) = lower(_brand))
      AND (_scope <> 'oem' OR normalize_oem(p.oem_code) = normalize_oem(_oem))
    LIMIT _limit
  ),
  ins AS (
    INSERT INTO public.oem_scan_queue (part_id, oem, brand, title, scope)
    SELECT c.part_id, c.oem, c.brand, c.title, _scope
    FROM candidates c
    ON CONFLICT (part_id) WHERE status IN ('pending','processing') DO NOTHING
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_inserted FROM ins;

  -- Ad-hoc OEM enqueue: kullanıcı sistemde olmayan bir OEM aratabilir.
  -- Hiç eşleşen parça yoksa, yine de havuza görsel kazandırmak için ad-hoc iş ekle.
  IF v_inserted = 0 AND _scope = 'oem' AND _oem IS NOT NULL AND length(trim(_oem)) > 0 THEN
    SELECT EXISTS (
      SELECT 1 FROM public.oem_scan_queue
      WHERE part_id IS NULL
        AND normalize_oem(oem) = normalize_oem(_oem)
        AND COALESCE(lower(brand),'') = COALESCE(lower(_brand),'')
        AND status IN ('pending','processing')
    ) INTO v_adhoc_exists;

    IF NOT v_adhoc_exists THEN
      INSERT INTO public.oem_scan_queue (part_id, oem, brand, title, scope)
      VALUES (NULL, _oem, _brand, NULL, 'oem');
      v_inserted := 1;
    END IF;
  END IF;

  RETURN v_inserted;
END;
$function$;