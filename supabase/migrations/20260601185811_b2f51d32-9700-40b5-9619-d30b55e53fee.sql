
DROP VIEW IF EXISTS public.open_part_requests;
CREATE VIEW public.open_part_requests
WITH (security_invoker = true) AS
SELECT
  id, part_name, search_query, oem_code, brand, model, year, category,
  description, message, photos, status, created_at
FROM public.part_requests
WHERE status IN ('new','in_progress');

GRANT SELECT ON public.open_part_requests TO authenticated;
