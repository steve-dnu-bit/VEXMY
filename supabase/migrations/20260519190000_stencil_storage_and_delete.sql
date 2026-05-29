-- Stencil uploads under stencils/{user_id}/... and allow users to delete their records.

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
    OR name LIKE ('stencils/' || auth.uid()::text || '/%')
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
    OR name LIKE ('stencils/' || auth.uid()::text || '/%')
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
    OR name LIKE ('stencils/' || auth.uid()::text || '/%')
  )
);

DROP POLICY IF EXISTS "Users can delete own stencils" ON public.stencils;
CREATE POLICY "Users can delete own stencils"
  ON public.stencils
  FOR DELETE
  TO authenticated
  USING (auth.uid() = created_by);
