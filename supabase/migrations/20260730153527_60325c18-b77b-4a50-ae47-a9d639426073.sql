-- 1) PROFILES: column-level lockdown ------------------------------------
REVOKE ALL ON public.profiles FROM anon;
REVOKE ALL ON public.profiles FROM authenticated;

GRANT SELECT (
  id, display_name, city, district, created_at, updated_at, is_active, is_approved,
  avatar_url, is_verified, phone_verified_at, company_name, verification_status,
  verified_at, user_verified, seller_verified, user_badges, seller_badges, trusted_seller
) ON public.profiles TO anon;

GRANT SELECT (
  id, display_name, city, district, created_at, updated_at, is_active, is_approved,
  avatar_url, is_verified, phone_verified_at, company_name, verification_status,
  verified_at, user_verified, seller_verified, user_badges, seller_badges, trusted_seller,
  whatsapp, verified_phone, latitude, longitude, location_source, location_updated_at,
  suspended_at, last_sign_in_at, verified_by
) ON public.profiles TO authenticated;

GRANT INSERT, UPDATE ON public.profiles TO authenticated;
GRANT DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

DROP POLICY IF EXISTS "Profiles readable by everyone (column-restricted)" ON public.profiles;
CREATE POLICY "Public profile fields readable by anon"
  ON public.profiles FOR SELECT TO anon
  USING (true);
CREATE POLICY "Profiles readable by authenticated"
  ON public.profiles FOR SELECT TO authenticated
  USING (true);

-- 2) ORDER ITEMS: no direct client inserts --------------------------------
DROP POLICY IF EXISTS order_items_insert_any ON public.order_items;
REVOKE ALL ON public.order_items FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.order_items FROM authenticated;
GRANT SELECT ON public.order_items TO authenticated;
GRANT ALL ON public.order_items TO service_role;

REVOKE ALL ON public.orders FROM anon;
GRANT SELECT, UPDATE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
DROP POLICY IF EXISTS orders_insert_any ON public.orders;

-- 3) SEARCH LOGS: owner-scoped -------------------------------------------
DROP POLICY IF EXISTS "Update own recent search log" ON public.search_logs;
DROP POLICY IF EXISTS "Anyone can insert search log" ON public.search_logs;

REVOKE ALL ON public.search_logs FROM anon;
REVOKE ALL ON public.search_logs FROM authenticated;
GRANT INSERT ON public.search_logs TO anon;
GRANT INSERT, SELECT, UPDATE ON public.search_logs TO authenticated;
GRANT ALL ON public.search_logs TO service_role;

CREATE POLICY "Anyone can insert search log"
  ON public.search_logs FOR INSERT TO anon, authenticated
  WITH CHECK (
    (user_id IS NULL OR user_id = auth.uid())
    AND ((query IS NULL) OR (length(query) <= 200))
    AND ((brand IS NULL) OR (length(brand) <= 80))
    AND ((model IS NULL) OR (length(model) <= 80))
    AND ((city IS NULL) OR (length(city) <= 80))
    AND ((oem IS NULL) OR (length(oem) <= 80))
  );

CREATE POLICY "Users read own search logs"
  ON public.search_logs FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users update own search logs"
  ON public.search_logs FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Controlled click attribution for anonymous visitors.
CREATE OR REPLACE FUNCTION public.log_search_click(_log_id uuid, _part_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.search_logs
     SET clicked_part_id = _part_id
   WHERE id = _log_id
     AND clicked_part_id IS NULL
     AND created_at > now() - interval '30 minutes'
     AND (user_id IS NULL OR user_id = auth.uid());
$$;

REVOKE ALL ON FUNCTION public.log_search_click(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.log_search_click(uuid, uuid) TO anon, authenticated, service_role;