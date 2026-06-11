
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verified_phone TEXT;

CREATE TABLE IF NOT EXISTS public.phone_otp_verifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  phone TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ,
  last_sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_phone_otp_user ON public.phone_otp_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_phone_otp_phone ON public.phone_otp_verifications(phone);

GRANT SELECT ON public.phone_otp_verifications TO authenticated;
GRANT ALL ON public.phone_otp_verifications TO service_role;

ALTER TABLE public.phone_otp_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own otp rows"
ON public.phone_otp_verifications
FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins manage otp rows"
ON public.phone_otp_verifications
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
