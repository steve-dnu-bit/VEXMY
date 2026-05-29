-- Allow authenticated users to replace their own objects in the public `uploads` bucket.
-- Without UPDATE policies, `storage.objects` upserts can fail with:
-- "new row violates row-level security policy" when the object key already exists.

DROP POLICY IF EXISTS "Authenticated users can update own uploads" ON storage.objects;
CREATE POLICY "Authenticated users can update own uploads"
ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'uploads'
  AND owner = auth.uid()
)
WITH CHECK (
  bucket_id = 'uploads'
  AND owner = auth.uid()
);

DROP POLICY IF EXISTS "Authenticated users can delete own uploads" ON storage.objects;
CREATE POLICY "Authenticated users can delete own uploads"
ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'uploads'
  AND owner = auth.uid()
);
