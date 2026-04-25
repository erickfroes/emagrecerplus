update storage.buckets
set
  allowed_mime_types = array[
    'application/pdf',
    'application/zip',
    'application/x-zip-compressed',
    'image/png',
    'image/jpeg',
    'image/webp',
    'text/html'
  ]::text[],
  updated_at = now()
where id = 'patient-documents';
