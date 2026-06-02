-- Add approval column to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_approved boolean NOT NULL DEFAULT false;

-- Existing users grandfathered as approved so we don't lock anyone out
UPDATE public.profiles SET is_approved = true WHERE created_at < now();

-- Admins should always be considered approved
UPDATE public.profiles p SET is_approved = true
  WHERE EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = p.id AND r.role = 'admin');

-- Tighten parts insert: only approved sellers (or admins) can create listings
DROP POLICY IF EXISTS "Authenticated users insert parts" ON public.parts;
CREATE POLICY "Approved users insert parts"
  ON public.parts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = seller_id
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.is_approved = true
      )
    )
  );
