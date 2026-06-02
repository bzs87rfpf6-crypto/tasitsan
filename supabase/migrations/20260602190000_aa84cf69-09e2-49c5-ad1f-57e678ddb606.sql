
-- Add verified flag to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false;

-- Verification applications
CREATE TABLE IF NOT EXISTS public.seller_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  account_type text NOT NULL DEFAULT 'individual',
  company_name text,
  tax_number text,
  contact_person text,
  city text,
  phone text,
  notes text,
  status text NOT NULL DEFAULT 'pending',
  admin_notes text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seller_verifications_status_chk CHECK (status IN ('pending','approved','rejected')),
  CONSTRAINT seller_verifications_type_chk CHECK (account_type IN ('individual','business'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.seller_verifications TO authenticated;
GRANT ALL ON public.seller_verifications TO service_role;

ALTER TABLE public.seller_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own verification"
ON public.seller_verifications FOR SELECT TO authenticated
USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users insert own verification"
ON public.seller_verifications FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own pending verification"
ON public.seller_verifications FOR UPDATE TO authenticated
USING (auth.uid() = user_id AND status = 'pending')
WITH CHECK (auth.uid() = user_id AND status = 'pending');

CREATE POLICY "Admins update any verification"
ON public.seller_verifications FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins delete verifications"
ON public.seller_verifications FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- updated_at trigger
CREATE TRIGGER set_seller_verifications_updated_at
BEFORE UPDATE ON public.seller_verifications
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Sync profile.is_verified based on verification status
CREATE OR REPLACE FUNCTION public.sync_profile_verified()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.profiles SET is_verified = false WHERE id = OLD.user_id;
    RETURN OLD;
  END IF;
  UPDATE public.profiles
    SET is_verified = (NEW.status = 'approved')
    WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sync_profile_verified_aiud
AFTER INSERT OR UPDATE OF status OR DELETE ON public.seller_verifications
FOR EACH ROW EXECUTE FUNCTION public.sync_profile_verified();

CREATE INDEX IF NOT EXISTS idx_seller_verifications_status ON public.seller_verifications(status);
