
CREATE POLICY "Buyers update own part requests"
  ON public.part_requests
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = buyer_id)
  WITH CHECK (auth.uid() = buyer_id);

CREATE POLICY "Buyers delete own part requests"
  ON public.part_requests
  FOR DELETE
  TO authenticated
  USING (auth.uid() = buyer_id);
