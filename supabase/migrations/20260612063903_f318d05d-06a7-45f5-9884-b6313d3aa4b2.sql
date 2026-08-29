
-- 1) Performance indexes
CREATE INDEX IF NOT EXISTS idx_parts_approved_created_at
  ON public.parts (created_at DESC)
  WHERE status = 'approved';

CREATE INDEX IF NOT EXISTS idx_parts_status_created_at
  ON public.parts (status, created_at DESC);

-- 2) Public RPC: home_showcase
CREATE OR REPLACE FUNCTION public.home_showcase()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _stats jsonb;
  _recent_24h jsonb;
  _recent_7d jsonb;
  _latest jsonb;
BEGIN
  SELECT jsonb_build_object(
    'total_parts', (SELECT count(*) FROM parts WHERE status='approved'),
    'total_oem', (SELECT count(DISTINCT oem_code) FROM parts WHERE status='approved' AND oem_code IS NOT NULL AND oem_code <> ''),
    'today_count', (SELECT count(*) FROM parts WHERE status='approved' AND created_at >= now() - interval '24 hours'),
    'week_count', (SELECT count(*) FROM parts WHERE status='approved' AND created_at >= now() - interval '7 days'),
    'total_sellers', (SELECT count(DISTINCT seller_id) FROM parts WHERE status='approved'),
    'total_cities', (SELECT count(DISTINCT city) FROM parts WHERE status='approved' AND city IS NOT NULL AND city <> '')
  ) INTO _stats;

  SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO _recent_24h FROM (
    SELECT id,title,brand,model,year,price,city,photos,condition,category,stock_quantity,oem_code,seller_id,part_type,created_at
    FROM parts
    WHERE status='approved' AND created_at >= now() - interval '24 hours'
    ORDER BY created_at DESC
    LIMIT 12
  ) t;

  SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO _recent_7d FROM (
    SELECT id,title,brand,model,year,price,city,photos,condition,category,stock_quantity,oem_code,seller_id,part_type,created_at
    FROM parts
    WHERE status='approved' AND created_at >= now() - interval '7 days'
    ORDER BY created_at DESC
    LIMIT 24
  ) t;

  SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO _latest FROM (
    SELECT id,title,brand,model,year,price,city,photos,condition,category,stock_quantity,oem_code,seller_id,part_type,created_at
    FROM parts
    WHERE status='approved'
    ORDER BY created_at DESC
    LIMIT 24
  ) t;

  RETURN jsonb_build_object(
    'stats', _stats,
    'recent_24h', _recent_24h,
    'recent_7d', _recent_7d,
    'latest', _latest
  );
END;
$$;

REVOKE ALL ON FUNCTION public.home_showcase() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.home_showcase() TO anon, authenticated, service_role;

-- 3) Admin RPC: admin_product_reports
CREATE OR REPLACE FUNCTION public.admin_product_reports()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _counts jsonb;
  _most_viewed jsonb;
  _active_sellers jsonb;
  _top_oems jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'last_24h', (SELECT count(*) FROM parts WHERE created_at >= now() - interval '24 hours'),
    'last_7d',  (SELECT count(*) FROM parts WHERE created_at >= now() - interval '7 days'),
    'pending',  (SELECT count(*) FROM parts WHERE status='pending'),
    'approved', (SELECT count(*) FROM parts WHERE status='approved')
  ) INTO _counts;

  SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO _most_viewed FROM (
    SELECT p.id, p.title, p.brand, p.model, coalesce(v.view_count, 0) AS view_count
    FROM parts p
    LEFT JOIN (
      SELECT part_id, count(*) AS view_count
      FROM part_views
      WHERE created_at >= now() - interval '30 days'
      GROUP BY part_id
    ) v ON v.part_id = p.id
    WHERE p.status='approved'
    ORDER BY coalesce(v.view_count, 0) DESC, p.created_at DESC
    LIMIT 10
  ) t;

  SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO _active_sellers FROM (
    SELECT pr.id AS seller_id, pr.display_name, count(p.id) AS active_parts
    FROM profiles pr
    JOIN parts p ON p.seller_id = pr.id AND p.status='approved'
    GROUP BY pr.id, pr.display_name
    ORDER BY count(p.id) DESC
    LIMIT 10
  ) t;

  SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO _top_oems FROM (
    SELECT oem, count(*) AS search_count
    FROM oem_searches
    WHERE created_at >= now() - interval '30 days'
    GROUP BY oem
    ORDER BY count(*) DESC
    LIMIT 10
  ) t;

  RETURN jsonb_build_object(
    'counts', _counts,
    'most_viewed', _most_viewed,
    'active_sellers', _active_sellers,
    'top_oems', _top_oems
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_product_reports() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_product_reports() TO authenticated, service_role;

-- 4) New-part admin notification trigger
CREATE OR REPLACE FUNCTION public.tg_notify_admin_new_part()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _just_approved boolean := false;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'approved' THEN
    _just_approved := true;
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
    _just_approved := true;
  END IF;

  IF _just_approved THEN
    INSERT INTO public.admin_notifications (kind, priority, title, body, link, related_id, actor_user_id)
    VALUES (
      'new_listing',
      'normal',
      'Yeni ürün eklendi: ' || coalesce(NEW.title, '—'),
      coalesce(NEW.brand, '') || ' ' || coalesce(NEW.model, '') ||
        CASE WHEN NEW.oem_code IS NOT NULL THEN ' · OEM: ' || NEW.oem_code ELSE '' END,
      '/parts/' || NEW.id::text,
      NEW.id,
      NEW.seller_id
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_admin_new_part ON public.parts;
CREATE TRIGGER trg_notify_admin_new_part
  AFTER INSERT OR UPDATE OF status ON public.parts
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_notify_admin_new_part();
