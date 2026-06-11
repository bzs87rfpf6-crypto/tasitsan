
-- Add approval workflow to parts
ALTER TABLE public.parts ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE public.parts ADD COLUMN IF NOT EXISTS admin_notes TEXT;
ALTER TABLE public.parts ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.parts ADD COLUMN IF NOT EXISTS reviewed_by UUID;

-- Existing rows assumed valid -> mark approved so they stay visible
UPDATE public.parts SET status = 'approved' WHERE status = 'pending' AND created_at < now();

CREATE INDEX IF NOT EXISTS idx_parts_status ON public.parts(status);

-- Replace public SELECT policy: only approved parts are public.
DROP POLICY IF EXISTS "Parts viewable by everyone" ON public.parts;

CREATE POLICY "Approved parts viewable by everyone"
ON public.parts FOR SELECT
TO public
USING (status = 'approved');

CREATE POLICY "Sellers see own parts any status"
ON public.parts FOR SELECT
TO authenticated
USING (auth.uid() = seller_id);

CREATE POLICY "Admins see all parts"
ON public.parts FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update any part"
ON public.parts FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete any part"
ON public.parts FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
