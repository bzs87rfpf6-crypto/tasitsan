CREATE OR REPLACE FUNCTION public.count_distinct_oem_library()
RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COUNT(DISTINCT oem_normalized)::bigint
  FROM public.oem_image_library
  WHERE oem_normalized IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.count_parts_matching_oem_library()
RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COUNT(DISTINCT p.id)::bigint
  FROM public.parts p
  WHERE p.oem_norm IS NOT NULL
    AND array_length(p.oem_norm, 1) > 0
    AND EXISTS (
      SELECT 1 FROM public.oem_image_library l
      WHERE l.oem_normalized = ANY(p.oem_norm)
    );
$$;

REVOKE ALL ON FUNCTION public.count_distinct_oem_library() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.count_parts_matching_oem_library() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.count_distinct_oem_library() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.count_parts_matching_oem_library() TO authenticated, service_role;