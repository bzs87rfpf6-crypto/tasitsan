
-- 1) xml_feeds
CREATE TABLE public.xml_feeds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) BETWEEN 2 AND 120),
  url text NOT NULL CHECK (length(url) BETWEEN 10 AND 2000 AND url ~* '^https?://'),
  status text NOT NULL DEFAULT 'pending_approval'
    CHECK (status IN ('pending_approval', 'active', 'paused', 'disabled', 'rejected')),
  sync_interval text NOT NULL DEFAULT 'daily'
    CHECK (sync_interval IN ('hourly', '6h', '12h', 'daily', 'weekly')),
  missing_item_action text NOT NULL DEFAULT 'set_zero'
    CHECK (missing_item_action IN ('set_zero', 'deactivate', 'ignore')),
  template text NOT NULL DEFAULT 'generic'
    CHECK (template IN ('generic', 'logo', 'basbug', 'dinamik', 'motor_asin')),
  notes text,
  rejection_reason text,
  -- runtime state
  last_sync_at timestamptz,
  next_sync_at timestamptz,
  last_status text CHECK (last_status IS NULL OR last_status IN ('success', 'failed', 'partial', 'running')),
  last_error text,
  total_products integer NOT NULL DEFAULT 0,
  consecutive_failures integer NOT NULL DEFAULT 0,
  -- approval audit
  approved_at timestamptz,
  approved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (seller_id, url)
);

CREATE INDEX xml_feeds_seller_idx ON public.xml_feeds (seller_id);
CREATE INDEX xml_feeds_status_idx ON public.xml_feeds (status);
CREATE INDEX xml_feeds_next_sync_idx ON public.xml_feeds (next_sync_at)
  WHERE status = 'active';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.xml_feeds TO authenticated;
GRANT ALL ON public.xml_feeds TO service_role;

ALTER TABLE public.xml_feeds ENABLE ROW LEVEL SECURITY;

-- Seller can read own feeds; admins read all
CREATE POLICY "xml_feeds_select_own_or_admin" ON public.xml_feeds
  FOR SELECT TO authenticated
  USING (seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

-- Seller can insert their own (always pending_approval); admins can insert any
CREATE POLICY "xml_feeds_insert_own" ON public.xml_feeds
  FOR INSERT TO authenticated
  WITH CHECK (
    seller_id = auth.uid()
    AND status = 'pending_approval'
  );

-- Seller may only edit basic fields & pause/unpause their feed; admins may edit anything
CREATE POLICY "xml_feeds_update_own_limited" ON public.xml_feeds
  FOR UPDATE TO authenticated
  USING (seller_id = auth.uid() AND status <> 'rejected')
  WITH CHECK (
    seller_id = auth.uid()
    -- Sellers cannot self-approve: status may go to paused/active from active/paused only,
    -- and never to pending_approval->active without admin (enforced via trigger below).
  );

CREATE POLICY "xml_feeds_admin_all" ON public.xml_feeds
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "xml_feeds_delete_own" ON public.xml_feeds
  FOR DELETE TO authenticated
  USING (seller_id = auth.uid());

-- Guardrails: sellers can't elevate status, only flip active<->paused
CREATE OR REPLACE FUNCTION public.xml_feeds_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  -- Admin bypass
  IF public.has_role(auth.uid(), 'admin'::app_role) THEN
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Sellers may only toggle between active <-> paused, and only after admin approval.
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NOT (
        (OLD.status = 'active' AND NEW.status = 'paused')
        OR (OLD.status = 'paused' AND NEW.status = 'active')
      ) THEN
        RAISE EXCEPTION 'Bu durum geçişi sadece yönetici tarafından yapılabilir';
      END IF;
    END IF;
    -- Sellers cannot touch approval audit / counters
    NEW.approved_at := OLD.approved_at;
    NEW.approved_by := OLD.approved_by;
    NEW.last_sync_at := OLD.last_sync_at;
    NEW.next_sync_at := OLD.next_sync_at;
    NEW.last_status := OLD.last_status;
    NEW.last_error := OLD.last_error;
    NEW.total_products := OLD.total_products;
    NEW.consecutive_failures := OLD.consecutive_failures;
    NEW.rejection_reason := OLD.rejection_reason;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END $$;

CREATE TRIGGER xml_feeds_guard_trg
  BEFORE INSERT OR UPDATE ON public.xml_feeds
  FOR EACH ROW EXECUTE FUNCTION public.xml_feeds_guard();

-- 2) xml_sync_runs
CREATE TABLE public.xml_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_id uuid NOT NULL REFERENCES public.xml_feeds(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL,
  triggered_by text NOT NULL DEFAULT 'cron'
    CHECK (triggered_by IN ('cron', 'manual', 'admin')),
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'success', 'failed', 'partial')),
  items_total integer NOT NULL DEFAULT 0,
  items_added integer NOT NULL DEFAULT 0,
  items_updated integer NOT NULL DEFAULT 0,
  items_deactivated integer NOT NULL DEFAULT 0,
  items_failed integer NOT NULL DEFAULT 0,
  duration_ms integer,
  error text,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE INDEX xml_sync_runs_feed_idx ON public.xml_sync_runs (feed_id, started_at DESC);
CREATE INDEX xml_sync_runs_seller_idx ON public.xml_sync_runs (seller_id, started_at DESC);

GRANT SELECT ON public.xml_sync_runs TO authenticated;
GRANT ALL ON public.xml_sync_runs TO service_role;

ALTER TABLE public.xml_sync_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "xml_sync_runs_select_own_or_admin" ON public.xml_sync_runs
  FOR SELECT TO authenticated
  USING (seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

-- 3) parts: add source_feed_id and external_sku for upsert key
ALTER TABLE public.parts
  ADD COLUMN IF NOT EXISTS source_feed_id uuid REFERENCES public.xml_feeds(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS external_sku text,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;

CREATE INDEX IF NOT EXISTS parts_source_feed_idx ON public.parts (source_feed_id) WHERE source_feed_id IS NOT NULL;
-- Unique key per seller+feed+sku (when sku exists) to prevent dup imports
CREATE UNIQUE INDEX IF NOT EXISTS parts_feed_sku_unique
  ON public.parts (source_feed_id, external_sku)
  WHERE source_feed_id IS NOT NULL AND external_sku IS NOT NULL;

-- 4) Helper: list feeds due for sync (used by cron worker)
CREATE OR REPLACE FUNCTION public.xml_feeds_due_for_sync(_limit integer DEFAULT 10)
RETURNS SETOF public.xml_feeds
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT *
  FROM public.xml_feeds
  WHERE status = 'active'
    AND (next_sync_at IS NULL OR next_sync_at <= now())
    AND consecutive_failures < 10
  ORDER BY COALESCE(next_sync_at, '1970-01-01'::timestamptz) ASC
  LIMIT GREATEST(1, LEAST(_limit, 50));
$$;

REVOKE ALL ON FUNCTION public.xml_feeds_due_for_sync(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.xml_feeds_due_for_sync(integer) TO service_role;

-- 5) Admin overview helper
CREATE OR REPLACE FUNCTION public.xml_admin_overview()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'admin only';
  END IF;
  SELECT jsonb_build_object(
    'active', (SELECT count(*) FROM public.xml_feeds WHERE status='active'),
    'pending', (SELECT count(*) FROM public.xml_feeds WHERE status='pending_approval'),
    'paused', (SELECT count(*) FROM public.xml_feeds WHERE status='paused'),
    'failed_last24h', (
      SELECT count(*) FROM public.xml_sync_runs
       WHERE status='failed' AND started_at >= now() - interval '24 hours'
    ),
    'runs_last24h', (
      SELECT count(*) FROM public.xml_sync_runs
       WHERE started_at >= now() - interval '24 hours'
    ),
    'items_imported_last24h', (
      SELECT COALESCE(sum(items_added + items_updated), 0)::int
        FROM public.xml_sync_runs
       WHERE started_at >= now() - interval '24 hours'
    ),
    'top_feeds', (
      SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) FROM (
        SELECT f.id, f.name, f.seller_id,
               (SELECT display_name FROM public.profiles WHERE id = f.seller_id) AS seller_name,
               f.total_products, f.last_sync_at, f.last_status
          FROM public.xml_feeds f
         WHERE f.status='active'
         ORDER BY f.total_products DESC NULLS LAST
         LIMIT 10
      ) t
    )
  ) INTO v;
  RETURN v;
END $$;

REVOKE ALL ON FUNCTION public.xml_admin_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.xml_admin_overview() TO authenticated;
