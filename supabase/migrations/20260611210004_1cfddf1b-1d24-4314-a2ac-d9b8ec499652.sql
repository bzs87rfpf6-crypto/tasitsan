
-- Storage policies: sellers can upload/read/delete their own XML files
CREATE POLICY "sellers can upload xml to own folder"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'xml-uploads'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "sellers can read own xml"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'xml-uploads'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "sellers can delete own xml"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'xml-uploads'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Track uploaded-file feeds
ALTER TABLE public.xml_feeds
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'url',
  ADD COLUMN IF NOT EXISTS uploaded_path text;

ALTER TABLE public.xml_feeds
  DROP CONSTRAINT IF EXISTS xml_feeds_source_type_check;
ALTER TABLE public.xml_feeds
  ADD CONSTRAINT xml_feeds_source_type_check
  CHECK (source_type IN ('url','file'));

-- URL is now optional when source is a file
ALTER TABLE public.xml_feeds ALTER COLUMN url DROP NOT NULL;
