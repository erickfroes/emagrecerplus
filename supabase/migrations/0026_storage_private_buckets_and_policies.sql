create or replace function private.storage_folder_segment(
  object_name text,
  segment_position integer
)
returns text
language sql
immutable
set search_path = ''
as $$
  select (storage.foldername(object_name))[segment_position]
$$;

create or replace function private.storage_folder_uuid(
  object_name text,
  segment_position integer
)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_segment text;
begin
  v_segment := private.storage_folder_segment(object_name, segment_position);

  if v_segment is null or v_segment !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return null;
  end if;

  return v_segment::uuid;
end;
$$;

create or replace function private.can_read_storage_object(
  target_bucket_id text,
  object_name text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_current_tenant_id uuid := private.current_tenant_id();
  v_current_profile_id uuid := private.current_profile_id();
  v_path_tenant_id uuid;
  v_path_profile_id uuid;
  v_path_patient_id uuid;
  v_path_encounter_id uuid;
begin
  if target_bucket_id is null or object_name is null or v_current_tenant_id is null then
    return false;
  end if;

  if private.storage_folder_segment(object_name, 1) <> 'tenant' then
    return false;
  end if;

  v_path_tenant_id := private.storage_folder_uuid(object_name, 2);

  if v_path_tenant_id is distinct from v_current_tenant_id then
    return false;
  end if;

  case target_bucket_id
    when 'brand-assets' then
      return private.storage_folder_segment(object_name, 3) = 'branding'
        and (
          private.can_manage_tenant_settings()
          or private.has_permission('settings.read')
          or private.has_permission('platform.read')
        );

    when 'profile-avatars' then
      v_path_profile_id := private.storage_folder_uuid(object_name, 4);

      return private.storage_folder_segment(object_name, 3) = 'profiles'
        and v_path_profile_id is not null
        and (
          v_path_profile_id = v_current_profile_id
          or private.has_permission('users.read')
          or private.has_permission('users.write')
          or private.has_permission('settings.read')
          or private.has_permission('settings.write')
        );

    when 'patient-documents' then
      v_path_patient_id := private.storage_folder_uuid(object_name, 4);

      return private.storage_folder_segment(object_name, 3) = 'patients'
        and private.storage_folder_segment(object_name, 5) = 'documents'
        and v_path_patient_id is not null
        and private.can_access_patient(v_path_patient_id)
        and (
          private.has_permission('documents.read')
          or private.has_permission('documents.write')
          or private.has_permission('clinical.read')
          or private.has_permission('clinical.write')
          or private.has_permission('clinical.read.all')
        );

    when 'clinical-attachments' then
      v_path_patient_id := private.storage_folder_uuid(object_name, 4);
      v_path_encounter_id := private.storage_folder_uuid(object_name, 6);

      return private.storage_folder_segment(object_name, 3) = 'patients'
        and private.storage_folder_segment(object_name, 5) = 'encounters'
        and v_path_patient_id is not null
        and v_path_encounter_id is not null
        and private.can_access_patient(v_path_patient_id)
        and (
          private.has_permission('documents.read')
          or private.has_permission('documents.write')
          or private.has_permission('clinical.read')
          or private.has_permission('clinical.write')
          or private.has_permission('clinical.read.all')
        );

    else
      return false;
  end case;
end;
$$;

create or replace function private.can_manage_storage_object(
  target_bucket_id text,
  object_name text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_current_tenant_id uuid := private.current_tenant_id();
  v_current_profile_id uuid := private.current_profile_id();
  v_path_tenant_id uuid;
  v_path_profile_id uuid;
  v_path_patient_id uuid;
  v_path_encounter_id uuid;
begin
  if target_bucket_id is null or object_name is null or v_current_tenant_id is null then
    return false;
  end if;

  if private.storage_folder_segment(object_name, 1) <> 'tenant' then
    return false;
  end if;

  v_path_tenant_id := private.storage_folder_uuid(object_name, 2);

  if v_path_tenant_id is distinct from v_current_tenant_id then
    return false;
  end if;

  case target_bucket_id
    when 'brand-assets' then
      return private.storage_folder_segment(object_name, 3) = 'branding'
        and private.can_manage_tenant_settings();

    when 'profile-avatars' then
      v_path_profile_id := private.storage_folder_uuid(object_name, 4);

      return private.storage_folder_segment(object_name, 3) = 'profiles'
        and v_path_profile_id is not null
        and (
          v_path_profile_id = v_current_profile_id
          or private.has_permission('users.write')
          or private.has_permission('settings.write')
        );

    when 'patient-documents' then
      v_path_patient_id := private.storage_folder_uuid(object_name, 4);

      return private.storage_folder_segment(object_name, 3) = 'patients'
        and private.storage_folder_segment(object_name, 5) = 'documents'
        and v_path_patient_id is not null
        and private.can_access_patient(v_path_patient_id)
        and (
          private.has_permission('documents.write')
          or private.has_permission('clinical.write')
          or private.has_permission('patients.write')
        );

    when 'clinical-attachments' then
      v_path_patient_id := private.storage_folder_uuid(object_name, 4);
      v_path_encounter_id := private.storage_folder_uuid(object_name, 6);

      return private.storage_folder_segment(object_name, 3) = 'patients'
        and private.storage_folder_segment(object_name, 5) = 'encounters'
        and v_path_patient_id is not null
        and v_path_encounter_id is not null
        and private.can_access_patient(v_path_patient_id)
        and (
          private.has_permission('documents.write')
          or private.has_permission('clinical.write')
        );

    else
      return false;
  end case;
end;
$$;

revoke all on function private.storage_folder_segment(text, integer) from public, anon;
revoke all on function private.storage_folder_uuid(text, integer) from public, anon;
revoke all on function private.can_read_storage_object(text, text) from public, anon;
revoke all on function private.can_manage_storage_object(text, text) from public, anon;

grant execute on function private.storage_folder_segment(text, integer) to authenticated, service_role;
grant execute on function private.storage_folder_uuid(text, integer) to authenticated, service_role;
grant execute on function private.can_read_storage_object(text, text) to authenticated, service_role;
grant execute on function private.can_manage_storage_object(text, text) to authenticated, service_role;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types,
  avif_autodetection,
  type
)
values
  (
    'brand-assets',
    'brand-assets',
    false,
    5242880,
    array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']::text[],
    false,
    'STANDARD'
  ),
  (
    'profile-avatars',
    'profile-avatars',
    false,
    5242880,
    array['image/png', 'image/jpeg', 'image/webp']::text[],
    false,
    'STANDARD'
  ),
  (
    'patient-documents',
    'patient-documents',
    false,
    20971520,
    array['application/pdf', 'image/png', 'image/jpeg', 'image/webp']::text[],
    false,
    'STANDARD'
  ),
  (
    'clinical-attachments',
    'clinical-attachments',
    false,
    20971520,
    array['application/pdf', 'image/png', 'image/jpeg', 'image/webp']::text[],
    false,
    'STANDARD'
  )
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types,
  avif_autodetection = excluded.avif_autodetection,
  type = excluded.type,
  updated_at = now();

drop policy if exists runtime_private_buckets_select on storage.buckets;
create policy runtime_private_buckets_select
on storage.buckets
for select
to authenticated
using (
  id in ('brand-assets', 'profile-avatars', 'patient-documents', 'clinical-attachments')
);

drop policy if exists runtime_private_objects_select on storage.objects;
create policy runtime_private_objects_select
on storage.objects
for select
to authenticated
using (
  (select private.can_read_storage_object(bucket_id, name))
);

drop policy if exists runtime_private_objects_insert on storage.objects;
create policy runtime_private_objects_insert
on storage.objects
for insert
to authenticated
with check (
  (select private.can_manage_storage_object(bucket_id, name))
);

drop policy if exists runtime_private_objects_update on storage.objects;
create policy runtime_private_objects_update
on storage.objects
for update
to authenticated
using (
  (select private.can_manage_storage_object(bucket_id, name))
)
with check (
  (select private.can_manage_storage_object(bucket_id, name))
);

drop policy if exists runtime_private_objects_delete on storage.objects;
create policy runtime_private_objects_delete
on storage.objects
for delete
to authenticated
using (
  (select private.can_manage_storage_object(bucket_id, name))
);
