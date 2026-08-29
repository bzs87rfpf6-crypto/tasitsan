-- Fix COALESCE type mismatch: parts.photos is text[], not jsonb
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
      AND (_scope <> 'no_images' OR p.photos IS NULL OR cardinality(COALESCE(p.photos, ARRAY[]::text[])) = 0)
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

CREATE OR REPLACE FUNCTION public.oem_scanner_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v jsonb;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT jsonb_build_object(
    'parts_total', (SELECT count(*) FROM public.parts WHERE oem_code IS NOT NULL),
    'parts_with_photo', (SELECT count(*) FROM public.parts WHERE oem_code IS NOT NULL AND photos IS NOT NULL AND cardinality(COALESCE(photos, ARRAY[]::text[])) > 0),
    'parts_without_photo', (SELECT count(*) FROM public.parts WHERE oem_code IS NOT NULL AND (photos IS NULL OR cardinality(COALESCE(photos, ARRAY[]::text[])) = 0)),
    'library_total', (SELECT count(*) FROM public.oem_image_library),
    'library_verified', (SELECT count(*) FROM public.oem_image_library WHERE verified = true),
    'library_unique_oems', (SELECT count(DISTINCT oem_normalized) FROM public.oem_image_library),
    'today_found', (SELECT count(*) FROM public.oem_image_library WHERE created_at >= now() - interval '1 day'),
    'queue_pending', (SELECT count(*) FROM public.oem_scan_queue WHERE status = 'pending'),
    'queue_processing', (SELECT count(*) FROM public.oem_scan_queue WHERE status = 'processing'),
    'queue_done', (SELECT count(*) FROM public.oem_scan_queue WHERE status = 'done'),
    'queue_error', (SELECT count(*) FROM public.oem_scan_queue WHERE status = 'error'),
    'failed_searches', (SELECT count(*) FROM public.oem_failed_searches),
    'success_rate', (
      SELECT CASE WHEN count(*) = 0 THEN 0
        ELSE round(100.0 * count(*) FILTER (WHERE result_count > 0) / count(*))::integer END
      FROM public.oem_scan_queue WHERE status = 'done'
    )
  ) INTO v;
  RETURN v;
END;
$$;