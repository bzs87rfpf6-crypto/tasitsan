-- Revoke anon access to seller contact columns; keep authenticated read.
REVOKE SELECT (whatsapp, verified_phone) ON public.profiles FROM anon;
-- Email was never granted to anon; ensure that stays so.
REVOKE SELECT (email) ON public.profiles FROM anon;