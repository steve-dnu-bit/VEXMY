-- Broaden uploads UPDATE/DELETE policies to work even when `owner` is NULL on storage.objects.
-- Keeps access scoped to object keys that include the authenticated user's id.

DROP POLICY IF EXISTS "Authenticated users can update own uploads" ON storage.objects;
CREATE POLICY "Authenticated users can update own uploads"
ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'uploads'
  AND (
    owner = auth.uid()
    OR name LIKE ('avatars/' || auth.uid()::text || '-%')
    OR name LIKE ('avatars/' || auth.uid()::text || '.%')
    OR name LIKE ('artist_portal_bg/' || auth.uid()::text || '-%')
    OR name LIKE ('consent_uploads/' || auth.uid()::text || '/%')
  )
)
WITH CHECK (
  bucket_id = 'uploads'
  AND (
    owner = auth.uid()
    OR name LIKE ('avatars/' || auth.uid()::text || '-%')
    OR name LIKE ('avatars/' || auth.uid()::text || '.%')
    OR name LIKE ('artist_portal_bg/' || auth.uid()::text || '-%')
    OR name LIKE ('consent_uploads/' || auth.uid()::text || '/%')
  )
);

DROP POLICY IF EXISTS "Authenticated users can delete own uploads" ON storage.objects;
CREATE POLICY "Authenticated users can delete own uploads"
ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'uploads'
  AND (
    owner = auth.uid()
    OR name LIKE ('avatars/' || auth.uid()::text || '-%')
    OR name LIKE ('avatars/' || auth.uid()::text || '.%')
    OR name LIKE ('artist_portal_bg/' || auth.uid()::text || '-%')
    OR name LIKE ('consent_uploads/' || auth.uid()::text || '/%')
  )
);
