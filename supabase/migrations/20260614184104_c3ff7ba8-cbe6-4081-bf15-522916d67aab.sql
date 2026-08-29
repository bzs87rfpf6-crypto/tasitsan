
-- 1) Soft-delete + active columns
ALTER TABLE public.part_requests
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid;

ALTER TABLE public.request_quotes
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid;

CREATE INDEX IF NOT EXISTS part_requests_visibility_idx
  ON public.part_requests (deleted_at, is_active);
CREATE INDEX IF NOT EXISTS request_quotes_visibility_idx
  ON public.request_quotes (deleted_at, is_active);

-- 2) Update public-facing view
CREATE OR REPLACE VIEW public.open_part_requests AS
  SELECT id, part_name, search_query, oem_code, brand, model, year, category,
         description, message, photos, status, city, engine_code, created_at
  FROM public.part_requests
  WHERE status = ANY (ARRAY['new','in_progress'])
    AND deleted_at IS NULL
    AND is_active = true;

-- 3) Tighten RLS: hide deleted/inactive from non-admin readers.
DROP POLICY IF EXISTS "Buyers see own part requests" ON public.part_requests;
CREATE POLICY "Buyers see own part requests"
  ON public.part_requests FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR (auth.uid() = buyer_id AND deleted_at IS NULL)
  );

-- request_quotes: rebuild SELECT policies to exclude deleted/inactive for non-admins
DROP POLICY IF EXISTS "Sellers see own quotes" ON public.request_quotes;
DROP POLICY IF EXISTS "Buyers see approved quotes for own requests" ON public.request_quotes;

CREATE POLICY "Sellers see own quotes"
  ON public.request_quotes FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR (auth.uid() = seller_id AND deleted_at IS NULL)
  );

CREATE POLICY "Buyers see approved quotes for own requests"
  ON public.request_quotes FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR (
      deleted_at IS NULL
      AND is_active = true
      AND status = 'approved'
      AND EXISTS (
        SELECT 1 FROM public.part_requests pr
        WHERE pr.id = request_quotes.request_id
          AND pr.buyer_id = auth.uid()
          AND pr.deleted_at IS NULL
      )
    )
  );

-- 4) Admin moderation RPC: soft delete, restore, set active, with audit log
CREATE OR REPLACE FUNCTION public.admin_moderate_record(
  _table text,
  _id uuid,
  _action text   -- 'delete' | 'restore' | 'deactivate' | 'activate' | 'hard_delete'
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_actor uuid := auth.uid();
  v_old jsonb;
BEGIN
  IF NOT public.has_role(v_actor, 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _table NOT IN ('part_requests','request_quotes') THEN
    RAISE EXCEPTION 'invalid table';
  END IF;
  IF _action NOT IN ('delete','restore','deactivate','activate','hard_delete') THEN
    RAISE EXCEPTION 'invalid action';
  END IF;

  IF _table = 'part_requests' THEN
    SELECT to_jsonb(pr.*) INTO v_old FROM public.part_requests pr WHERE id = _id;
    IF v_old IS NULL THEN RAISE EXCEPTION 'not found'; END IF;
    IF _action = 'delete' THEN
      UPDATE public.part_requests
        SET deleted_at = now(), deleted_by = v_actor, is_active = false
        WHERE id = _id;
    ELSIF _action = 'restore' THEN
      UPDATE public.part_requests
        SET deleted_at = NULL, deleted_by = NULL, is_active = true
        WHERE id = _id;
    ELSIF _action = 'deactivate' THEN
      UPDATE public.part_requests SET is_active = false WHERE id = _id;
    ELSIF _action = 'activate' THEN
      UPDATE public.part_requests SET is_active = true WHERE id = _id;
    ELSIF _action = 'hard_delete' THEN
      DELETE FROM public.part_requests WHERE id = _id;
    END IF;
  ELSE
    SELECT to_jsonb(rq.*) INTO v_old FROM public.request_quotes rq WHERE id = _id;
    IF v_old IS NULL THEN RAISE EXCEPTION 'not found'; END IF;
    IF _action = 'delete' THEN
      UPDATE public.request_quotes
        SET deleted_at = now(), deleted_by = v_actor, is_active = false
        WHERE id = _id;
    ELSIF _action = 'restore' THEN
      UPDATE public.request_quotes
        SET deleted_at = NULL, deleted_by = NULL, is_active = true
        WHERE id = _id;
    ELSIF _action = 'deactivate' THEN
      UPDATE public.request_quotes SET is_active = false WHERE id = _id;
    ELSIF _action = 'activate' THEN
      UPDATE public.request_quotes SET is_active = true WHERE id = _id;
    ELSIF _action = 'hard_delete' THEN
      DELETE FROM public.request_quotes WHERE id = _id;
    END IF;
  END IF;

  INSERT INTO public.admin_audit_log (actor_id, action, metadata, old_value)
  VALUES (
    v_actor,
    'moderate_' || _action,
    jsonb_build_object('table', _table, 'id', _id),
    v_old
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.admin_moderate_record(text, uuid, text) TO authenticated;

-- 5) Moderation stats
CREATE OR REPLACE FUNCTION public.admin_moderation_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE v jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT jsonb_build_object(
    'requests', jsonb_build_object(
      'active',  (SELECT count(*) FROM part_requests WHERE deleted_at IS NULL AND is_active = true),
      'passive', (SELECT count(*) FROM part_requests WHERE deleted_at IS NULL AND is_active = false),
      'deleted', (SELECT count(*) FROM part_requests WHERE deleted_at IS NOT NULL),
      'total',   (SELECT count(*) FROM part_requests)
    ),
    'quotes', jsonb_build_object(
      'active',  (SELECT count(*) FROM request_quotes WHERE deleted_at IS NULL AND is_active = true),
      'passive', (SELECT count(*) FROM request_quotes WHERE deleted_at IS NULL AND is_active = false),
      'deleted', (SELECT count(*) FROM request_quotes WHERE deleted_at IS NOT NULL),
      'total',   (SELECT count(*) FROM request_quotes)
    )
  ) INTO v;
  RETURN v;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.admin_moderation_stats() TO authenticated;
