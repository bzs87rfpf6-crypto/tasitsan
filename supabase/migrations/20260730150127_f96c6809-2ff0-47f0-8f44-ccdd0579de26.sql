ALTER TABLE public.part_requests
  ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS source_part_id uuid,
  ADD COLUMN IF NOT EXISTS notified_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_part_requests_oem_active
  ON public.part_requests (oem_code)
  WHERE is_active AND deleted_at IS NULL;

-- OEM eşdeğerleri dahil, bekleyen talep sayısı
CREATE OR REPLACE FUNCTION public.count_pending_requests_for_oem(_oem text)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(COUNT(*), 0)::int
  FROM public.part_requests r
  WHERE r.is_active
    AND r.deleted_at IS NULL
    AND r.status IN ('new','open','pending')
    AND r.oem_code IS NOT NULL
    AND public.normalize_oem(r.oem_code) = public.normalize_oem(_oem);
$$;

REVOKE ALL ON FUNCTION public.count_pending_requests_for_oem(text) FROM public;
GRANT EXECUTE ON FUNCTION public.count_pending_requests_for_oem(text) TO authenticated, service_role;

-- Yeni ürün eklenince eşleşen talep sahiplerine bildirim
CREATE OR REPLACE FUNCTION public.notify_pending_requests_for_part(_part_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_part   public.parts%ROWTYPE;
  v_codes  text[];
  v_count  int := 0;
BEGIN
  SELECT * INTO v_part FROM public.parts WHERE id = _part_id;
  IF v_part.id IS NULL THEN RETURN 0; END IF;

  SELECT ARRAY(
    SELECT DISTINCT public.normalize_oem(c)
    FROM unnest(
      COALESCE(v_part.oem_codes, '{}'::text[]) ||
      CASE WHEN v_part.oem_code IS NULL THEN '{}'::text[] ELSE ARRAY[v_part.oem_code] END
    ) AS c
    WHERE c IS NOT NULL AND length(trim(c)) > 0
  ) INTO v_codes;

  IF v_codes IS NULL OR array_length(v_codes, 1) IS NULL THEN RETURN 0; END IF;

  WITH matched AS (
    UPDATE public.part_requests r
       SET notified_at = now(), updated_at = now()
     WHERE r.is_active
       AND r.deleted_at IS NULL
       AND r.status IN ('new','open','pending')
       AND r.buyer_id IS NOT NULL
       AND r.oem_code IS NOT NULL
       AND public.normalize_oem(r.oem_code) = ANY(v_codes)
       AND (r.notified_at IS NULL OR r.notified_at < now() - interval '1 day')
     RETURNING r.id, r.buyer_id, r.part_name, r.oem_code
  ), ins AS (
    INSERT INTO public.user_notifications (user_id, kind, title, body, link, related_id)
    SELECT m.buyer_id,
           'part_request_match',
           'Aradığınız parça sisteme eklendi',
           COALESCE(m.part_name, v_part.title) || ' (OEM: ' || COALESCE(m.oem_code, '-') || ') için yeni bir ilan yayınlandı.',
           '/parts/' || COALESCE(v_part.seo_slug, v_part.id::text),
           v_part.id
    FROM matched m
    RETURNING 1
  )
  SELECT COUNT(*)::int INTO v_count FROM ins;

  RETURN COALESCE(v_count, 0);
END $$;

REVOKE ALL ON FUNCTION public.notify_pending_requests_for_part(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.notify_pending_requests_for_part(uuid) TO authenticated, service_role;

-- Admin: bekleyen talepler özeti
CREATE OR REPLACE FUNCTION public.admin_pending_part_requests()
RETURNS TABLE(
  oem_code text,
  part_name text,
  brand text,
  model text,
  request_count bigint,
  total_quantity bigint,
  first_request_at timestamptz,
  last_request_at timestamptz,
  notified_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(public.normalize_oem(r.oem_code), '-')            AS oem_code,
    (array_agg(r.part_name ORDER BY r.created_at DESC))[1]      AS part_name,
    (array_agg(r.brand ORDER BY r.created_at DESC))[1]          AS brand,
    (array_agg(r.model ORDER BY r.created_at DESC))[1]          AS model,
    COUNT(*)                                                     AS request_count,
    COALESCE(SUM(r.quantity), COUNT(*))                          AS total_quantity,
    MIN(r.created_at)                                            AS first_request_at,
    MAX(r.created_at)                                            AS last_request_at,
    COUNT(*) FILTER (WHERE r.notified_at IS NOT NULL)            AS notified_count
  FROM public.part_requests r
  WHERE r.is_active
    AND r.deleted_at IS NULL
    AND r.status IN ('new','open','pending')
    AND public.has_role(auth.uid(), 'admin')
  GROUP BY 1
  ORDER BY COUNT(*) DESC, MAX(r.created_at) DESC;
$$;

REVOKE ALL ON FUNCTION public.admin_pending_part_requests() FROM public;
GRANT EXECUTE ON FUNCTION public.admin_pending_part_requests() TO authenticated, service_role;