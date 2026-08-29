
-- Add 'seller' to app_role enum
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel='seller' AND enumtypid='public.app_role'::regtype) THEN
    ALTER TYPE public.app_role ADD VALUE 'seller';
  END IF;
END $$;

-- Extend profiles with Trust Center fields
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verified_by UUID,
  ADD COLUMN IF NOT EXISTS user_verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS seller_verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS user_badges TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS seller_badges TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS verification_notes TEXT,
  ADD COLUMN IF NOT EXISTS verification_documents JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_sign_in_at TIMESTAMPTZ;

-- Backfill from existing seller_verifications data (approved => seller_verified)
UPDATE public.profiles p
SET seller_verified = true,
    verification_status = 'verified',
    verified_at = COALESCE(p.verified_at, sv.reviewed_at, now()),
    verified_by = COALESCE(p.verified_by, sv.reviewed_by),
    seller_badges = CASE WHEN 'seller_verified' = ANY(p.seller_badges) THEN p.seller_badges ELSE array_append(p.seller_badges, 'seller_verified') END
FROM public.seller_verifications sv
WHERE sv.user_id = p.id AND sv.status = 'approved';

UPDATE public.profiles p
SET verification_status = 'pending'
FROM public.seller_verifications sv
WHERE sv.user_id = p.id AND sv.status = 'pending' AND p.verification_status = 'none';

UPDATE public.profiles p
SET verification_status = 'rejected'
FROM public.seller_verifications sv
WHERE sv.user_id = p.id AND sv.status = 'rejected' AND p.verification_status = 'none';

-- If phone_verified_at is set, mark user_verified
UPDATE public.profiles
SET user_verified = true,
    user_badges = CASE WHEN 'user_verified' = ANY(user_badges) THEN user_badges ELSE array_append(user_badges, 'user_verified') END
WHERE phone_verified_at IS NOT NULL;

-- Column-level GRANT on public badge fields to anon for public product/profile pages
GRANT SELECT (id, display_name, avatar_url, city, company_name,
              is_verified, user_verified, seller_verified,
              user_badges, seller_badges, verification_status, verified_at,
              created_at)
  ON public.profiles TO anon;

-- Trust Center admin RPC: apply verification action
CREATE OR REPLACE FUNCTION public.trust_apply_action(
  _user_id UUID,
  _action TEXT,          -- verify_user | verify_seller | grant_badge | revoke_badge | suspend | unsuspend | reject | reset
  _badge TEXT DEFAULT NULL,
  _notes TEXT DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _admin UUID := auth.uid();
BEGIN
  IF _admin IS NULL OR NOT public.has_role(_admin, 'admin') THEN
    RAISE EXCEPTION 'Yetkisiz';
  END IF;

  IF _action = 'verify_user' THEN
    UPDATE public.profiles SET
      user_verified = true,
      verification_status = 'verified',
      verified_at = now(),
      verified_by = _admin,
      verification_notes = COALESCE(_notes, verification_notes),
      user_badges = CASE WHEN 'user_verified' = ANY(user_badges) THEN user_badges ELSE array_append(user_badges, 'user_verified') END
    WHERE id = _user_id;

  ELSIF _action = 'verify_seller' THEN
    UPDATE public.profiles SET
      seller_verified = true,
      user_verified = true,
      verification_status = 'verified',
      verified_at = now(),
      verified_by = _admin,
      verification_notes = COALESCE(_notes, verification_notes),
      seller_badges = CASE WHEN 'seller_verified' = ANY(seller_badges) THEN seller_badges ELSE array_append(seller_badges, 'seller_verified') END,
      user_badges = CASE WHEN 'user_verified' = ANY(user_badges) THEN user_badges ELSE array_append(user_badges, 'user_verified') END
    WHERE id = _user_id;
    -- also assign seller role
    INSERT INTO public.user_roles (user_id, role) VALUES (_user_id, 'seller')
      ON CONFLICT (user_id, role) DO NOTHING;
    -- keep seller_verifications in sync if a row exists
    UPDATE public.seller_verifications
      SET status = 'approved', reviewed_by = _admin, reviewed_at = now()
      WHERE user_id = _user_id AND status <> 'approved';

  ELSIF _action = 'grant_badge' THEN
    IF _badge IS NULL THEN RAISE EXCEPTION 'Rozet gerekli'; END IF;
    IF _badge IN ('seller_verified','premium_seller','elite_seller','trusted_seller') THEN
      UPDATE public.profiles SET
        seller_badges = CASE WHEN _badge = ANY(seller_badges) THEN seller_badges ELSE array_append(seller_badges, _badge) END,
        seller_verified = true
      WHERE id = _user_id;
    ELSE
      UPDATE public.profiles SET
        user_badges = CASE WHEN _badge = ANY(user_badges) THEN user_badges ELSE array_append(user_badges, _badge) END
      WHERE id = _user_id;
    END IF;

  ELSIF _action = 'revoke_badge' THEN
    IF _badge IS NULL THEN RAISE EXCEPTION 'Rozet gerekli'; END IF;
    UPDATE public.profiles SET
      seller_badges = array_remove(seller_badges, _badge),
      user_badges = array_remove(user_badges, _badge)
    WHERE id = _user_id;

  ELSIF _action = 'suspend' THEN
    UPDATE public.profiles SET
      verification_status = 'suspended',
      suspended_at = now(),
      verification_notes = COALESCE(_notes, verification_notes)
    WHERE id = _user_id;

  ELSIF _action = 'unsuspend' THEN
    UPDATE public.profiles SET
      verification_status = CASE WHEN seller_verified OR user_verified THEN 'verified' ELSE 'none' END,
      suspended_at = NULL
    WHERE id = _user_id;

  ELSIF _action = 'reject' THEN
    UPDATE public.profiles SET
      verification_status = 'rejected',
      verified_at = NULL,
      verified_by = _admin,
      verification_notes = COALESCE(_notes, verification_notes)
    WHERE id = _user_id;
    UPDATE public.seller_verifications
      SET status = 'rejected', admin_notes = COALESCE(_notes, admin_notes), reviewed_by = _admin, reviewed_at = now()
      WHERE user_id = _user_id AND status = 'pending';

  ELSIF _action = 'reset' THEN
    UPDATE public.profiles SET
      verification_status = 'none',
      user_verified = false,
      seller_verified = false,
      verified_at = NULL,
      verified_by = NULL,
      user_badges = '{}',
      seller_badges = '{}'
    WHERE id = _user_id;
    DELETE FROM public.user_roles WHERE user_id = _user_id AND role = 'seller';

  ELSE
    RAISE EXCEPTION 'Bilinmeyen aksiyon: %', _action;
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.trust_apply_action(UUID, TEXT, TEXT, TEXT) TO authenticated;

-- Trust Center listing RPC (admin only) — returns rich rows
CREATE OR REPLACE FUNCTION public.trust_list_users(_filter TEXT DEFAULT 'pending')
RETURNS TABLE (
  id UUID,
  display_name TEXT,
  avatar_url TEXT,
  email TEXT,
  company_name TEXT,
  city TEXT,
  verified_phone TEXT,
  phone_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  last_sign_in_at TIMESTAMPTZ,
  verification_status TEXT,
  user_verified BOOLEAN,
  seller_verified BOOLEAN,
  user_badges TEXT[],
  seller_badges TEXT[],
  verification_notes TEXT,
  verification_documents JSONB,
  is_admin BOOLEAN,
  is_seller BOOLEAN,
  parts_count BIGINT,
  reviews_count BIGINT,
  trust_score NUMERIC,
  sv_id UUID,
  sv_account_type TEXT,
  sv_tax_number TEXT,
  sv_contact_person TEXT,
  sv_phone TEXT,
  sv_notes TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    COALESCE((SELECT count(*) FROM public.parts pa WHERE pa.seller_id = p.id AND pa.status='approved'), 0) AS parts_count,
    COALESCE((SELECT count(*) FROM public.seller_reviews sr WHERE sr.seller_id = p.id), 0) AS reviews_count,
    (SELECT ss.trust_score FROM public.seller_scores ss WHERE ss.seller_id = p.id) AS trust_score,
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
END $$;

GRANT EXECUTE ON FUNCTION public.trust_list_users(TEXT) TO authenticated;

-- Trust Center counters (for tab badges)
CREATE OR REPLACE FUNCTION public.trust_counts()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Yetkisiz';
  END IF;
  RETURN jsonb_build_object(
    'pending', (SELECT count(*) FROM public.profiles WHERE verification_status = 'pending')
              + (SELECT count(*) FROM public.seller_verifications WHERE status='pending'
                  AND user_id NOT IN (SELECT id FROM public.profiles WHERE verification_status='pending')),
    'verified_users', (SELECT count(*) FROM public.profiles WHERE user_verified AND NOT seller_verified),
    'verified_sellers', (SELECT count(*) FROM public.profiles WHERE seller_verified),
    'rejected', (SELECT count(*) FROM public.profiles WHERE verification_status='rejected'),
    'suspended', (SELECT count(*) FROM public.profiles WHERE verification_status='suspended')
  );
END $$;

GRANT EXECUTE ON FUNCTION public.trust_counts() TO authenticated;
