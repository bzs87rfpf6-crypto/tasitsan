
-- 1. Recreate open_part_requests with security_invoker
DROP VIEW IF EXISTS public.open_part_requests;
CREATE VIEW public.open_part_requests
WITH (security_invoker = true) AS
SELECT id, part_name, search_query, oem_code, brand, model, year, category,
       description, message, photos, status, city, engine_code, created_at
FROM public.part_requests
WHERE status = ANY (ARRAY['new'::text, 'in_progress'::text]);
GRANT SELECT ON public.open_part_requests TO anon, authenticated;

-- 2. PROFILES: drop overly-permissive policy; restrict PII columns to non-anon
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Profiles readable by everyone (column-restricted)"
  ON public.profiles FOR SELECT TO anon, authenticated USING (true);

REVOKE SELECT ON public.profiles FROM anon, authenticated, PUBLIC;
GRANT SELECT (id, display_name, city, avatar_url, is_verified, is_active, is_approved, created_at, updated_at)
  ON public.profiles TO anon;
GRANT SELECT ON public.profiles TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

-- 3. PARTS: hide whatsapp column from anonymous viewers
REVOKE SELECT ON public.parts FROM anon, authenticated, PUBLIC;
GRANT SELECT (id, seller_id, title, description, brand, model, year, category, condition,
              price, city, photos, created_at, updated_at, oem_code, stock_quantity, status,
              admin_notes, reviewed_at, reviewed_by, oem_codes, engine_code)
  ON public.parts TO anon;
GRANT SELECT ON public.parts TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.parts TO authenticated;
GRANT ALL ON public.parts TO service_role;

-- 4. PART_REQUESTS: hide PII from anon and from other authenticated sellers
DROP POLICY IF EXISTS "Public sees open part requests" ON public.part_requests;
DROP POLICY IF EXISTS "Sellers see open part requests" ON public.part_requests;

CREATE POLICY "Open part requests readable (non-PII via grants)"
  ON public.part_requests FOR SELECT TO anon, authenticated
  USING (status = ANY (ARRAY['new'::text, 'in_progress'::text]));

REVOKE SELECT ON public.part_requests FROM anon, authenticated, PUBLIC;
GRANT SELECT (id, part_name, search_query, oem_code, brand, model, year, category,
              description, message, photos, status, city, engine_code, created_at,
              updated_at, is_urgent, notes, buyer_id, admin_notes)
  ON public.part_requests TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.part_requests TO authenticated;
GRANT ALL ON public.part_requests TO service_role;

-- 5. SITE_SETTINGS: admin-only direct reads; expose safe fields via RPC
DROP POLICY IF EXISTS "Site settings readable by everyone" ON public.site_settings;

CREATE OR REPLACE FUNCTION public.get_public_site_settings()
RETURNS TABLE (
  contact_phone text,
  contact_email text,
  contact_address text,
  ga4_measurement_id text,
  gsc_verification_code text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT contact_phone, contact_email, contact_address, ga4_measurement_id, gsc_verification_code
  FROM public.site_settings
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.get_public_site_settings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_site_settings() TO anon, authenticated;

-- 6. Helper RPC: caller fetches own private profile fields
CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS TABLE (
  id uuid,
  display_name text,
  whatsapp text,
  city text,
  avatar_url text,
  is_verified boolean,
  is_approved boolean,
  is_active boolean,
  email text,
  phone_verified_at timestamptz,
  verified_phone text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, display_name, whatsapp, city, avatar_url, is_verified, is_approved, is_active,
         email, phone_verified_at, verified_phone, created_at, updated_at
  FROM public.profiles
  WHERE id = auth.uid()
$$;
REVOKE ALL ON FUNCTION public.get_my_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;
