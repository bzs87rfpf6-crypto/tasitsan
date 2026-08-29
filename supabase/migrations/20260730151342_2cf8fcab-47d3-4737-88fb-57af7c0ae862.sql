-- 1) Pin search_path on all project-defined functions that were missing it
ALTER FUNCTION public._parts_sync_oem_families() SET search_path = public, pg_temp;
ALTER FUNCTION public._seo_slugify(text) SET search_path = public, pg_temp;
ALTER FUNCTION public.is_meaningful_query(text) SET search_path = public, pg_temp;
ALTER FUNCTION public.normalize_oem_code(text) SET search_path = public, pg_temp;
ALTER FUNCTION public.normalize_oem_family(text) SET search_path = public, pg_temp;
ALTER FUNCTION public.normalize_oem_strict(text) SET search_path = public, pg_temp;
ALTER FUNCTION public.normalize_oem(text) SET search_path = public, pg_temp;
ALTER FUNCTION public.tg_product_seo_meta_touch() SET search_path = public, pg_temp;
ALTER FUNCTION public.tr_city_normalize(text) SET search_path = public, pg_temp;
ALTER FUNCTION public.tr_lower_ascii(text) SET search_path = public, pg_temp;
ALTER FUNCTION public.tr_query_stem(text) SET search_path = public, pg_temp;

-- 2) View must run with caller privileges (was implicitly SECURITY DEFINER)
ALTER VIEW public.parts_needing_embedding SET (security_invoker = on);
REVOKE ALL ON public.parts_needing_embedding FROM anon;
REVOKE ALL ON public.parts_needing_embedding FROM authenticated;
GRANT SELECT ON public.parts_needing_embedding TO service_role;

-- 3) favorites: no anonymous access to user_id/part_id pairs
DROP POLICY IF EXISTS "Anyone can read favorite counts" ON public.favorites;
REVOKE ALL ON public.favorites FROM anon;
GRANT SELECT, INSERT, DELETE ON public.favorites TO authenticated;
GRANT ALL ON public.favorites TO service_role;

-- 4) review_helpful: no public read of who voted (counts live on seller_reviews.helpful_count)
DROP POLICY IF EXISTS "Public read helpful votes" ON public.review_helpful;
REVOKE ALL ON public.review_helpful FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.review_helpful TO authenticated;
GRANT ALL ON public.review_helpful TO service_role;

-- 5) live chat: remove unscoped anonymous access. Guests now go through
--    server functions that verify their visitor token before any read/write.
DROP POLICY IF EXISTS "conv guest select" ON public.live_chat_conversations;
DROP POLICY IF EXISTS "conv guest update" ON public.live_chat_conversations;
DROP POLICY IF EXISTS "conv guest insert" ON public.live_chat_conversations;
DROP POLICY IF EXISTS "msg guest select" ON public.live_chat_messages;
DROP POLICY IF EXISTS "msg guest insert" ON public.live_chat_messages;
DROP POLICY IF EXISTS "msg guest update" ON public.live_chat_messages;

REVOKE ALL ON public.live_chat_conversations FROM anon;
REVOKE ALL ON public.live_chat_messages FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.live_chat_conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.live_chat_messages TO authenticated;
GRANT ALL ON public.live_chat_conversations TO service_role;
GRANT ALL ON public.live_chat_messages TO service_role;

-- 6) storage: stop bucket-wide listing/reading of chat attachments
DROP POLICY IF EXISTS "live_chat_read_all" ON storage.objects;
DROP POLICY IF EXISTS "live_chat_upload_anon" ON storage.objects;
DROP POLICY IF EXISTS "live_chat_upload_auth" ON storage.objects;

CREATE POLICY "live_chat_scoped_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'live-chat-attachments'
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR EXISTS (
        SELECT 1 FROM public.live_chat_conversations c
        WHERE c.id::text = (storage.foldername(name))[1]
          AND c.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "live_chat_scoped_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'live-chat-attachments'
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR EXISTS (
        SELECT 1 FROM public.live_chat_conversations c
        WHERE c.id::text = (storage.foldername(name))[1]
          AND c.user_id = auth.uid()
          AND c.status <> 'closed'::public.live_chat_status
      )
    )
  );

-- 7) storage: OEM image library files stay reachable through their public URLs,
--    but the bucket can no longer be enumerated/listed by visitors.
DROP POLICY IF EXISTS "oem_lib_public_read" ON storage.objects;