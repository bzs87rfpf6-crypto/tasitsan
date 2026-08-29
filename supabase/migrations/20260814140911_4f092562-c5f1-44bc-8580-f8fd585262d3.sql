-- 1) Import batches
CREATE TABLE public.import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  mode text NOT NULL DEFAULT 'insert',
  source text NOT NULL DEFAULT 'excel',
  file_name text,
  total_rows integer NOT NULL DEFAULT 0,
  success_count integer NOT NULL DEFAULT 0,
  fail_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'running',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_batches TO authenticated;
GRANT ALL ON public.import_batches TO service_role;
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own batches select" ON public.import_batches FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "own batches insert" ON public.import_batches FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "own batches update" ON public.import_batches FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "own batches delete" ON public.import_batches FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_import_batches_user ON public.import_batches (user_id, created_at DESC);

CREATE TRIGGER trg_import_batches_updated_at
  BEFORE UPDATE ON public.import_batches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Batch items (insert vs update ayrımı)
CREATE TABLE public.import_batch_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.import_batches(id) ON DELETE CASCADE,
  part_id uuid NOT NULL REFERENCES public.parts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  action text NOT NULL DEFAULT 'insert',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_id, part_id)
);
GRANT SELECT, INSERT, DELETE ON public.import_batch_items TO authenticated;
GRANT ALL ON public.import_batch_items TO service_role;
ALTER TABLE public.import_batch_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own batch items select" ON public.import_batch_items FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "own batch items insert" ON public.import_batch_items FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.import_batches b WHERE b.id = batch_id AND b.user_id = auth.uid()));
CREATE POLICY "own batch items delete" ON public.import_batch_items FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_import_batch_items_batch ON public.import_batch_items (batch_id);
CREATE INDEX idx_import_batch_items_part ON public.import_batch_items (part_id);

-- 3) parts.import_batch_id
ALTER TABLE public.parts ADD COLUMN IF NOT EXISTS import_batch_id uuid REFERENCES public.import_batches(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_parts_import_batch ON public.parts (import_batch_id);

-- 4) Silme logu
CREATE TABLE public.part_delete_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,
  actor_is_admin boolean NOT NULL DEFAULT false,
  owner_user_ids uuid[] NOT NULL DEFAULT '{}',
  batch_id uuid,
  requested_count integer NOT NULL DEFAULT 0,
  deleted_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  operation text NOT NULL DEFAULT 'bulk_delete',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.part_delete_log TO authenticated;
GRANT ALL ON public.part_delete_log TO service_role;
ALTER TABLE public.part_delete_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read delete log" ON public.part_delete_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin') OR actor_id = auth.uid());

CREATE INDEX idx_part_delete_log_created ON public.part_delete_log (created_at DESC);

-- 5) Güvenli toplu silme
CREATE OR REPLACE FUNCTION public.bulk_delete_parts(
  p_part_ids uuid[] DEFAULT NULL,
  p_batch_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_admin boolean;
  v_requested integer := 0;
  v_found integer := 0;
  v_deleted integer := 0;
  v_owners uuid[] := '{}';
  v_photos text[] := '{}';
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Yetkisiz işlem';
  END IF;
  IF p_part_ids IS NULL AND p_batch_id IS NULL THEN
    RAISE EXCEPTION 'Silinecek ürün belirtilmedi';
  END IF;

  v_admin := public.has_role(v_actor, 'admin') OR public.has_role(v_actor, 'super_admin');

  CREATE TEMP TABLE _bd_targets ON COMMIT DROP AS
  SELECT p.id, p.seller_id, COALESCE(p.photos, '{}'::text[]) AS photos
  FROM public.parts p
  WHERE (
      (p_part_ids IS NOT NULL AND p.id = ANY (p_part_ids))
      OR (p_batch_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.import_batch_items i
            WHERE i.batch_id = p_batch_id AND i.part_id = p.id AND i.action = 'insert'
          ))
    );

  SELECT count(*) INTO v_found FROM _bd_targets;
  v_requested := CASE WHEN p_part_ids IS NOT NULL THEN COALESCE(array_length(p_part_ids, 1), 0) ELSE v_found END;

  -- Yetki filtresi: admin değilse yalnızca kendi ürünleri
  IF NOT v_admin THEN
    DELETE FROM _bd_targets WHERE seller_id IS DISTINCT FROM v_actor;
  END IF;

  SELECT COALESCE(array_agg(DISTINCT seller_id) FILTER (WHERE seller_id IS NOT NULL), '{}')
    INTO v_owners FROM _bd_targets;

  -- Sadece silinenlere ait ve başka üründe kullanılmayan görseller
  SELECT COALESCE(array_agg(DISTINCT url), '{}') INTO v_photos
  FROM (
    SELECT unnest(photos) AS url FROM _bd_targets
  ) s
  WHERE NOT EXISTS (
    SELECT 1 FROM public.parts p2
    WHERE p2.id NOT IN (SELECT id FROM _bd_targets)
      AND p2.photos @> ARRAY[s.url]
  );

  DELETE FROM public.parts p USING _bd_targets t WHERE p.id = t.id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  INSERT INTO public.part_delete_log (
    actor_id, actor_is_admin, owner_user_ids, batch_id,
    requested_count, deleted_count, failed_count, operation, details
  ) VALUES (
    v_actor, v_admin, v_owners, p_batch_id,
    v_requested, v_deleted, GREATEST(v_requested - v_deleted, 0),
    CASE WHEN p_batch_id IS NOT NULL THEN 'batch_delete' ELSE 'bulk_delete' END,
    jsonb_build_object('found', v_found)
  );

  DROP TABLE IF EXISTS _bd_targets;

  RETURN jsonb_build_object(
    'requested', v_requested,
    'found', v_found,
    'deleted', v_deleted,
    'failed', GREATEST(v_requested - v_deleted, 0),
    'owners', to_jsonb(v_owners),
    'orphan_photos', to_jsonb(v_photos)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_delete_parts(uuid[], uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.bulk_delete_parts(uuid[], uuid) TO authenticated, service_role;