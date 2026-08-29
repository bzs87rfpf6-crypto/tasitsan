CREATE OR REPLACE FUNCTION public.record_part_view(_part_id uuid, _viewer_key text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count bigint;
  v_recent boolean;
  v_seller uuid;
BEGIN
  IF _viewer_key IS NULL OR length(_viewer_key) < 8 OR length(_viewer_key) > 200 THEN
    SELECT count(*) INTO v_count FROM public.part_views WHERE part_id = _part_id;
    RETURN v_count;
  END IF;

  SELECT seller_id INTO v_seller FROM public.parts WHERE id = _part_id AND status = 'approved';
  IF v_seller IS NULL THEN
    SELECT count(*) INTO v_count FROM public.part_views WHERE part_id = _part_id;
    RETURN v_count;
  END IF;

  -- Skip self-views: when the authenticated viewer is the seller, return the existing count without inserting.
  IF v_seller::text = _viewer_key THEN
    SELECT count(*) INTO v_count FROM public.part_views WHERE part_id = _part_id;
    RETURN v_count;
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.part_views
     WHERE part_id = _part_id AND viewer_key = _viewer_key
       AND created_at > now() - interval '30 minutes'
  ) INTO v_recent;

  IF NOT v_recent THEN
    INSERT INTO public.part_views (part_id, viewer_key) VALUES (_part_id, _viewer_key)
    ON CONFLICT (part_id, viewer_key, view_date) DO NOTHING;
  END IF;

  SELECT count(*) INTO v_count FROM public.part_views WHERE part_id = _part_id;
  RETURN v_count;
END $function$;