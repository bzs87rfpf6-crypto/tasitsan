-- Restore table grants. Anon gets only non-sensitive columns; authenticated gets all.
GRANT SELECT (id, display_name, city, avatar_url, is_verified, is_approved, is_active, created_at, updated_at, phone_verified_at)
  ON public.profiles TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;