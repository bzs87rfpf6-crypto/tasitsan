CREATE OR REPLACE FUNCTION public.trust_list_users(_filter text DEFAULT 'pending'::text)
 RETURNS TABLE(id uuid, display_name text, avatar_url text, email text, company_name text, city text, verified_phone text, phone_verified_at timestamp with time zone, created_at timestamp with time zone, last_sign_in_at timestamp with time zone, verification_status text, user_verified boolean, seller_verified boolean, user_badges text[], seller_badges text[], verification_notes text, verification_documents jsonb, is_admin boolean, is_seller boolean, parts_count bigint, reviews_count bigint, trust_score numeric, sv_id uuid, sv_account_type text, sv_tax_number text, sv_contact_person text, sv_phone text, sv_notes text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Yetkisiz';
  END IF;

  RETURN QUERY
  SELECT
    p.id, p.display_name, p.avatar_url, p.email, p.company_name, p.city,
    p.verified_phone, p.phone_verified_at, p.created_at,
    (SELECT au.last_sign_in_at FROM auth.users au WHERE au.id = p.id) AS last_sign_in_at,
    p.verification_status, p.user_verified, p.seller_verified,
    p.user_badges, p.seller_badges, p.verification_notes, p.verification_documents,
    EXISTS(SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role='admin') AS is_admin,
    EXISTS(SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role='seller') AS is_seller,
    COALESCE((SELECT count(*) FROM public.parts pa WHERE pa.seller_id = p.id AND pa.status='approved'), 0)::bigint AS parts_count,
    COALESCE((SELECT count(*) FROM public.seller_reviews sr WHERE sr.seller_id = p.id), 0)::bigint AS reviews_count,
    (SELECT ss.trust_score::numeric FROM public.seller_scores ss WHERE ss.seller_id = p.id) AS trust_score,
    sv.id AS sv_id, sv.account_type AS sv_account_type, sv.tax_number AS sv_tax_number,
    sv.contact_person AS sv_contact_person, sv.phone AS sv_phone, sv.notes AS sv_notes
  FROM public.profiles p
  LEFT JOIN LATERAL (
    SELECT * FROM public.seller_verifications sv2
    WHERE sv2.user_id = p.id
    ORDER BY sv2.created_at DESC LIMIT 1
  ) sv ON TRUE
  WHERE
    CASE _filter
      WHEN 'pending' THEN p.verification_status = 'pending' OR EXISTS(SELECT 1 FROM public.seller_verifications svp WHERE svp.user_id = p.id AND svp.status='pending')
      WHEN 'verified_users' THEN p.user_verified = true AND p.seller_verified = false
      WHEN 'verified_sellers' THEN p.seller_verified = true
      WHEN 'rejected' THEN p.verification_status = 'rejected'
      WHEN 'suspended' THEN p.verification_status = 'suspended'
      WHEN 'all' THEN true
      ELSE false
    END
  ORDER BY p.created_at DESC
  LIMIT 500;
END $function$;