
ALTER TABLE public.oem_image_library
  ADD COLUMN IF NOT EXISTS last_used_at timestamptz,
  ADD COLUMN IF NOT EXISTS use_count int NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS oem_image_library_use_count_idx
  ON public.oem_image_library (use_count DESC, last_used_at DESC NULLS LAST);

CREATE OR REPLACE FUNCTION public.touch_oem_image(_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.oem_image_library
     SET use_count = use_count + 1,
         last_used_at = now()
   WHERE id = _id;
$$;

GRANT EXECUTE ON FUNCTION public.touch_oem_image(uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_oem_cache_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total int;
  v_added_24h int;
  v_total_hits bigint;
  v_top jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT count(*) INTO v_total FROM public.oem_image_library;
  SELECT count(*) INTO v_added_24h
    FROM public.oem_image_library
   WHERE created_at > now() - interval '24 hours';
  SELECT coalesce(sum(use_count), 0) INTO v_total_hits FROM public.oem_image_library;

  SELECT coalesce(jsonb_agg(t), '[]'::jsonb) INTO v_top FROM (
    SELECT id, oem, brand, image_url, use_count, last_used_at
      FROM public.oem_image_library
     WHERE use_count > 0
     ORDER BY use_count DESC, last_used_at DESC NULLS LAST
     LIMIT 10
  ) t;

  RETURN jsonb_build_object(
    'total', v_total,
    'added_24h', v_added_24h,
    'total_hits', v_total_hits,
    'hit_rate', CASE WHEN (v_total_hits + v_added_24h) > 0
                     THEN round((v_total_hits::numeric / (v_total_hits + v_added_24h)::numeric) * 100, 1)
                     ELSE 0 END,
    'top_used', v_top
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_oem_cache_stats() TO authenticated, service_role;
