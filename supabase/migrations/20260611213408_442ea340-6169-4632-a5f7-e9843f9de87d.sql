
-- 1) realtime.messages: restrict admin_notifications topic to admin role
DROP POLICY IF EXISTS "Admin notifications topic admin only" ON realtime.messages;
CREATE POLICY "Admin notifications topic admin only"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  CASE
    WHEN realtime.topic() ILIKE '%admin_notifications%'
      THEN public.has_role(auth.uid(),'admin'::public.app_role)
    ELSE true
  END
);

-- 2) part_requests: drop the broad open-request policy (anon+authenticated browsing PII)
DROP POLICY IF EXISTS "Open part requests readable (non-PII via grants)" ON public.part_requests;

-- Lock anon out of the table entirely; public browsing now goes through the open_part_requests view
REVOKE ALL ON public.part_requests FROM anon;

-- Ensure the public view used by browsing is reachable
GRANT SELECT ON public.open_part_requests TO anon, authenticated;

-- 3) parts.whatsapp: hide from anonymous visitors via column-level grants
REVOKE SELECT ON public.parts FROM anon;
GRANT SELECT (
  id, seller_id, title, description, brand, model, year, category, condition, price,
  city, photos, created_at, updated_at, oem_code, stock_quantity, status,
  reviewed_at, reviewed_by, oem_codes, engine_code, part_type, search_doc,
  source_feed_id, external_sku, last_synced_at
) ON public.parts TO anon;
-- authenticated keeps full table grants from defaults; explicit re-grant for clarity
GRANT SELECT, INSERT, UPDATE, DELETE ON public.parts TO authenticated;
GRANT ALL ON public.parts TO service_role;

-- 4) profiles: hide whatsapp/verified_phone/email from anonymous visitors
REVOKE SELECT ON public.profiles FROM anon;
GRANT SELECT (
  id, display_name, city, avatar_url, is_verified, is_approved, is_active,
  phone_verified_at, created_at, updated_at
) ON public.profiles TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
