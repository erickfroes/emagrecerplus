create table if not exists docs.document_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants (id) on delete cascade,
  unit_id uuid references platform.units (id) on delete set null,
  legacy_document_template_id text unique,
  current_version_id uuid,
  template_kind text not null default 'custom' check (
    template_kind in ('report', 'consent', 'prescription', 'orientation', 'exam_request', 'certificate', 'custom')
  ),
  template_scope text not null default 'tenant' check (
    template_scope in ('global', 'tenant', 'unit')
  ),
  status text not null default 'draft' check (
    status in ('draft', 'active', 'archived')
  ),
  title text not null,
  description text,
  created_by_profile_id uuid references identity.profiles (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists docs.document_template_versions (
  id uuid primary key default gen_random_uuid(),
  document_template_id uuid not null references docs.document_templates (id) on delete cascade,
  legacy_document_template_version_id text unique,
  version_number integer not null check (version_number > 0),
  status text not null default 'draft' check (
    status in ('draft', 'published', 'archived')
  ),
  title text not null,
  summary text,
  content jsonb not null default '{}'::jsonb,
  render_schema jsonb not null default '{}'::jsonb,
  effective_from date not null default current_date,
  effective_to date,
  published_at timestamptz,
  created_by_profile_id uuid references identity.profiles (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_template_versions_effective_window check (
    effective_to is null or effective_to >= effective_from
  ),
  constraint document_template_versions_unique_number unique (document_template_id, version_number)
);

alter table docs.document_templates
  drop constraint if exists document_templates_current_version_id_fkey;

alter table docs.document_templates
  add constraint document_templates_current_version_id_fkey
  foreign key (current_version_id)
  references docs.document_template_versions (id)
  on delete set null;

create table if not exists docs.patient_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants (id) on delete cascade,
  unit_id uuid references platform.units (id) on delete set null,
  patient_id uuid not null references patients.patients (id) on delete cascade,
  encounter_id uuid references clinical.encounters (id) on delete set null,
  document_template_id uuid references docs.document_templates (id) on delete set null,
  current_version_id uuid,
  legacy_patient_document_id text unique,
  document_type text not null default 'custom' check (
    document_type in ('report', 'consent', 'prescription', 'orientation', 'exam_request', 'certificate', 'custom')
  ),
  status text not null default 'draft' check (
    status in ('draft', 'issued', 'signed', 'revoked', 'archived')
  ),
  title text not null,
  summary text,
  document_number text,
  issued_at timestamptz,
  expires_at timestamptz,
  signed_at timestamptz,
  revoked_at timestamptz,
  created_by_profile_id uuid references identity.profiles (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists docs.document_versions (
  id uuid primary key default gen_random_uuid(),
  patient_document_id uuid not null references docs.patient_documents (id) on delete cascade,
  legacy_document_version_id text unique,
  version_number integer not null check (version_number > 0),
  status text not null default 'draft' check (
    status in ('draft', 'issued', 'signed', 'superseded', 'archived')
  ),
  title text not null,
  summary text,
  content jsonb not null default '{}'::jsonb,
  rendered_html text,
  storage_object_path text,
  signed_storage_object_path text,
  checksum text,
  issued_at timestamptz,
  signed_at timestamptz,
  created_by_profile_id uuid references identity.profiles (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_versions_unique_number unique (patient_document_id, version_number)
);

alter table docs.patient_documents
  drop constraint if exists patient_documents_current_version_id_fkey;

alter table docs.patient_documents
  add constraint patient_documents_current_version_id_fkey
  foreign key (current_version_id)
  references docs.document_versions (id)
  on delete set null;

create table if not exists docs.signature_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants (id) on delete cascade,
  patient_document_id uuid not null references docs.patient_documents (id) on delete cascade,
  document_version_id uuid references docs.document_versions (id) on delete set null,
  patient_id uuid not null references patients.patients (id) on delete cascade,
  legacy_signature_request_id text unique,
  signer_type text not null default 'patient' check (
    signer_type in ('patient', 'professional', 'guardian', 'witness', 'other')
  ),
  signer_name text,
  signer_email text,
  signer_profile_id uuid references identity.profiles (id) on delete set null,
  provider_code text not null default 'internal',
  request_status text not null default 'pending' check (
    request_status in ('pending', 'sent', 'viewed', 'signed', 'declined', 'expired', 'cancelled')
  ),
  external_request_id text unique,
  requested_at timestamptz not null default now(),
  expires_at timestamptz,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists docs.signature_events (
  id uuid primary key default gen_random_uuid(),
  signature_request_id uuid not null references docs.signature_requests (id) on delete cascade,
  legacy_signature_event_id text unique,
  external_event_id text unique,
  event_type text not null,
  source text not null default 'internal',
  event_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists docs.printable_artifacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants (id) on delete cascade,
  patient_document_id uuid not null references docs.patient_documents (id) on delete cascade,
  document_version_id uuid references docs.document_versions (id) on delete set null,
  legacy_printable_artifact_id text unique,
  artifact_kind text not null default 'preview' check (
    artifact_kind in ('preview', 'html', 'pdf', 'print_package')
  ),
  render_status text not null default 'pending' check (
    render_status in ('pending', 'rendered', 'failed')
  ),
  storage_object_path text,
  checksum text,
  rendered_at timestamptz,
  failure_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists clinical.prescription_items (
  id uuid primary key default gen_random_uuid(),
  prescription_record_id uuid not null references clinical.prescription_records (id) on delete cascade,
  legacy_prescription_item_id text unique,
  item_type text not null default 'other' check (
    item_type in ('medication', 'supplement', 'orientation', 'exam', 'compound', 'other')
  ),
  title text not null,
  dosage text,
  frequency text,
  route text,
  duration_days integer check (duration_days is null or duration_days > 0),
  quantity numeric(12,2),
  unit text,
  instructions text,
  position integer not null default 1 check (position > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_docs_document_templates_scope
  on docs.document_templates (tenant_id, unit_id, template_kind, status)
  where deleted_at is null;

create index if not exists idx_docs_document_template_versions_effective
  on docs.document_template_versions (
    document_template_id,
    status,
    effective_from desc,
    effective_to asc nulls last,
    version_number desc
  );

create index if not exists idx_docs_patient_documents_patient_status
  on docs.patient_documents (patient_id, status, issued_at desc nulls last, created_at desc)
  where deleted_at is null;

create unique index if not exists idx_docs_patient_documents_number
  on docs.patient_documents (tenant_id, document_number)
  where document_number is not null;

create index if not exists idx_docs_document_versions_document_status
  on docs.document_versions (patient_document_id, status, version_number desc, created_at desc);

create index if not exists idx_docs_signature_requests_document_status
  on docs.signature_requests (patient_document_id, request_status, requested_at desc);

create index if not exists idx_docs_signature_events_request_event_at
  on docs.signature_events (signature_request_id, event_at desc);

create index if not exists idx_docs_printable_artifacts_document_status
  on docs.printable_artifacts (patient_document_id, render_status, created_at desc);

create index if not exists idx_clinical_prescription_items_record_position
  on clinical.prescription_items (prescription_record_id, position asc, created_at asc);

drop trigger if exists set_docs_document_templates_updated_at on docs.document_templates;
create trigger set_docs_document_templates_updated_at
before update on docs.document_templates
for each row execute function private.set_current_timestamp_updated_at();

drop trigger if exists set_docs_document_template_versions_updated_at on docs.document_template_versions;
create trigger set_docs_document_template_versions_updated_at
before update on docs.document_template_versions
for each row execute function private.set_current_timestamp_updated_at();

drop trigger if exists set_docs_patient_documents_updated_at on docs.patient_documents;
create trigger set_docs_patient_documents_updated_at
before update on docs.patient_documents
for each row execute function private.set_current_timestamp_updated_at();

drop trigger if exists set_docs_document_versions_updated_at on docs.document_versions;
create trigger set_docs_document_versions_updated_at
before update on docs.document_versions
for each row execute function private.set_current_timestamp_updated_at();

drop trigger if exists set_docs_signature_requests_updated_at on docs.signature_requests;
create trigger set_docs_signature_requests_updated_at
before update on docs.signature_requests
for each row execute function private.set_current_timestamp_updated_at();

drop trigger if exists set_docs_printable_artifacts_updated_at on docs.printable_artifacts;
create trigger set_docs_printable_artifacts_updated_at
before update on docs.printable_artifacts
for each row execute function private.set_current_timestamp_updated_at();

drop trigger if exists set_clinical_prescription_items_updated_at on clinical.prescription_items;
create trigger set_clinical_prescription_items_updated_at
before update on clinical.prescription_items
for each row execute function private.set_current_timestamp_updated_at();

grant select, insert, update, delete on table
  docs.document_templates,
  docs.document_template_versions,
  docs.patient_documents,
  docs.document_versions,
  docs.signature_requests,
  docs.signature_events,
  docs.printable_artifacts,
  clinical.prescription_items
to authenticated, service_role;

alter table docs.document_templates enable row level security;
alter table docs.document_template_versions enable row level security;
alter table docs.patient_documents enable row level security;
alter table docs.document_versions enable row level security;
alter table docs.signature_requests enable row level security;
alter table docs.signature_events enable row level security;
alter table docs.printable_artifacts enable row level security;
alter table clinical.prescription_items enable row level security;

create or replace function private.refresh_document_template_current_version(
  p_document_template_id uuid,
  p_reference_date date default current_date
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_reference_date date := coalesce(p_reference_date, current_date);
  v_current_version_id uuid;
begin
  if p_document_template_id is null then
    return null;
  end if;

  select document_template_versions.id
  into v_current_version_id
  from docs.document_template_versions as document_template_versions
  where document_template_versions.document_template_id = p_document_template_id
    and document_template_versions.status = 'published'
    and document_template_versions.effective_from <= v_reference_date
    and (
      document_template_versions.effective_to is null
      or document_template_versions.effective_to >= v_reference_date
    )
  order by
    document_template_versions.effective_from desc,
    document_template_versions.version_number desc,
    document_template_versions.created_at desc
  limit 1;

  if v_current_version_id is null then
    select document_template_versions.id
    into v_current_version_id
    from docs.document_template_versions as document_template_versions
    where document_template_versions.document_template_id = p_document_template_id
      and document_template_versions.status in ('published', 'draft')
    order by
      case when document_template_versions.status = 'published' then 0 else 1 end,
      document_template_versions.version_number desc,
      document_template_versions.created_at desc
    limit 1;
  end if;

  update docs.document_templates
  set current_version_id = v_current_version_id
  where id = p_document_template_id
    and current_version_id is distinct from v_current_version_id;

  return v_current_version_id;
end;
$$;

create or replace function private.refresh_parent_document_template_current_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_document_template_id uuid := coalesce(new.document_template_id, old.document_template_id);
begin
  if v_document_template_id is not null then
    perform private.refresh_document_template_current_version(v_document_template_id, current_date);
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists refresh_parent_document_template_current_version on docs.document_template_versions;
create trigger refresh_parent_document_template_current_version
after insert or update or delete on docs.document_template_versions
for each row execute function private.refresh_parent_document_template_current_version();

create or replace function private.refresh_patient_document_current_version(
  p_patient_document_id uuid
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_current_version_id uuid;
begin
  if p_patient_document_id is null then
    return null;
  end if;

  select document_versions.id
  into v_current_version_id
  from docs.document_versions as document_versions
  where document_versions.patient_document_id = p_patient_document_id
    and document_versions.status in ('issued', 'signed', 'draft')
  order by
    case
      when document_versions.status = 'signed' then 0
      when document_versions.status = 'issued' then 1
      else 2
    end,
    document_versions.version_number desc,
    document_versions.created_at desc
  limit 1;

  update docs.patient_documents
  set current_version_id = v_current_version_id
  where id = p_patient_document_id
    and current_version_id is distinct from v_current_version_id;

  return v_current_version_id;
end;
$$;

create or replace function private.refresh_parent_patient_document_current_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_patient_document_id uuid := coalesce(new.patient_document_id, old.patient_document_id);
begin
  if v_patient_document_id is not null then
    perform private.refresh_patient_document_current_version(v_patient_document_id);
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists refresh_parent_patient_document_current_version on docs.document_versions;
create trigger refresh_parent_patient_document_current_version
after insert or update or delete on docs.document_versions
for each row execute function private.refresh_parent_patient_document_current_version();

revoke all on function private.refresh_document_template_current_version(uuid, date) from public, anon, authenticated;
revoke all on function private.refresh_parent_document_template_current_version() from public, anon, authenticated;
revoke all on function private.refresh_patient_document_current_version(uuid) from public, anon, authenticated;
revoke all on function private.refresh_parent_patient_document_current_version() from public, anon, authenticated;

grant execute on function private.refresh_document_template_current_version(uuid, date) to authenticated, service_role;
grant execute on function private.refresh_parent_document_template_current_version() to authenticated, service_role;
grant execute on function private.refresh_patient_document_current_version(uuid) to authenticated, service_role;
grant execute on function private.refresh_parent_patient_document_current_version() to authenticated, service_role;

drop policy if exists document_templates_select_current_scope on docs.document_templates;
create policy document_templates_select_current_scope
on docs.document_templates
for select
to authenticated
using (
  private.can_read_clinical_domain(tenant_id, unit_id)
);

drop policy if exists document_templates_manage_current_scope on docs.document_templates;
create policy document_templates_manage_current_scope
on docs.document_templates
for all
to authenticated
using (
  private.can_manage_clinical_domain(tenant_id, unit_id)
)
with check (
  private.can_manage_clinical_domain(tenant_id, unit_id)
);

drop policy if exists document_template_versions_select_current_scope on docs.document_template_versions;
create policy document_template_versions_select_current_scope
on docs.document_template_versions
for select
to authenticated
using (
  exists (
    select 1
    from docs.document_templates as document_templates
    where document_templates.id = document_template_versions.document_template_id
      and private.can_read_clinical_domain(document_templates.tenant_id, document_templates.unit_id)
  )
);

drop policy if exists document_template_versions_manage_current_scope on docs.document_template_versions;
create policy document_template_versions_manage_current_scope
on docs.document_template_versions
for all
to authenticated
using (
  exists (
    select 1
    from docs.document_templates as document_templates
    where document_templates.id = document_template_versions.document_template_id
      and private.can_manage_clinical_domain(document_templates.tenant_id, document_templates.unit_id)
  )
)
with check (
  exists (
    select 1
    from docs.document_templates as document_templates
    where document_templates.id = document_template_versions.document_template_id
      and private.can_manage_clinical_domain(document_templates.tenant_id, document_templates.unit_id)
  )
);

drop policy if exists patient_documents_select_current_scope on docs.patient_documents;
create policy patient_documents_select_current_scope
on docs.patient_documents
for select
to authenticated
using (
  private.can_read_clinical_domain(tenant_id, unit_id)
  and private.can_access_patient(patient_id)
);

drop policy if exists patient_documents_manage_current_scope on docs.patient_documents;
create policy patient_documents_manage_current_scope
on docs.patient_documents
for all
to authenticated
using (
  private.can_manage_clinical_domain(tenant_id, unit_id)
  and private.can_access_patient(patient_id)
)
with check (
  private.can_manage_clinical_domain(tenant_id, unit_id)
  and private.can_access_patient(patient_id)
);

drop policy if exists document_versions_select_current_scope on docs.document_versions;
create policy document_versions_select_current_scope
on docs.document_versions
for select
to authenticated
using (
  exists (
    select 1
    from docs.patient_documents as patient_documents
    where patient_documents.id = document_versions.patient_document_id
      and private.can_read_clinical_domain(patient_documents.tenant_id, patient_documents.unit_id)
      and private.can_access_patient(patient_documents.patient_id)
  )
);

drop policy if exists document_versions_manage_current_scope on docs.document_versions;
create policy document_versions_manage_current_scope
on docs.document_versions
for all
to authenticated
using (
  exists (
    select 1
    from docs.patient_documents as patient_documents
    where patient_documents.id = document_versions.patient_document_id
      and private.can_manage_clinical_domain(patient_documents.tenant_id, patient_documents.unit_id)
      and private.can_access_patient(patient_documents.patient_id)
  )
)
with check (
  exists (
    select 1
    from docs.patient_documents as patient_documents
    where patient_documents.id = document_versions.patient_document_id
      and private.can_manage_clinical_domain(patient_documents.tenant_id, patient_documents.unit_id)
      and private.can_access_patient(patient_documents.patient_id)
  )
);

drop policy if exists signature_requests_select_current_scope on docs.signature_requests;
create policy signature_requests_select_current_scope
on docs.signature_requests
for select
to authenticated
using (
  exists (
    select 1
    from docs.patient_documents as patient_documents
    where patient_documents.id = signature_requests.patient_document_id
      and private.can_read_clinical_domain(patient_documents.tenant_id, patient_documents.unit_id)
      and private.can_access_patient(patient_documents.patient_id)
  )
);

drop policy if exists signature_requests_manage_current_scope on docs.signature_requests;
create policy signature_requests_manage_current_scope
on docs.signature_requests
for all
to authenticated
using (
  exists (
    select 1
    from docs.patient_documents as patient_documents
    where patient_documents.id = signature_requests.patient_document_id
      and private.can_manage_clinical_domain(patient_documents.tenant_id, patient_documents.unit_id)
      and private.can_access_patient(patient_documents.patient_id)
  )
)
with check (
  exists (
    select 1
    from docs.patient_documents as patient_documents
    where patient_documents.id = signature_requests.patient_document_id
      and private.can_manage_clinical_domain(patient_documents.tenant_id, patient_documents.unit_id)
      and private.can_access_patient(patient_documents.patient_id)
  )
);

drop policy if exists signature_events_select_current_scope on docs.signature_events;
create policy signature_events_select_current_scope
on docs.signature_events
for select
to authenticated
using (
  exists (
    select 1
    from docs.signature_requests as signature_requests
    inner join docs.patient_documents as patient_documents
      on patient_documents.id = signature_requests.patient_document_id
    where signature_requests.id = signature_events.signature_request_id
      and private.can_read_clinical_domain(patient_documents.tenant_id, patient_documents.unit_id)
      and private.can_access_patient(patient_documents.patient_id)
  )
);

drop policy if exists signature_events_manage_current_scope on docs.signature_events;
create policy signature_events_manage_current_scope
on docs.signature_events
for all
to authenticated
using (
  exists (
    select 1
    from docs.signature_requests as signature_requests
    inner join docs.patient_documents as patient_documents
      on patient_documents.id = signature_requests.patient_document_id
    where signature_requests.id = signature_events.signature_request_id
      and private.can_manage_clinical_domain(patient_documents.tenant_id, patient_documents.unit_id)
      and private.can_access_patient(patient_documents.patient_id)
  )
)
with check (
  exists (
    select 1
    from docs.signature_requests as signature_requests
    inner join docs.patient_documents as patient_documents
      on patient_documents.id = signature_requests.patient_document_id
    where signature_requests.id = signature_events.signature_request_id
      and private.can_manage_clinical_domain(patient_documents.tenant_id, patient_documents.unit_id)
      and private.can_access_patient(patient_documents.patient_id)
  )
);

drop policy if exists printable_artifacts_select_current_scope on docs.printable_artifacts;
create policy printable_artifacts_select_current_scope
on docs.printable_artifacts
for select
to authenticated
using (
  exists (
    select 1
    from docs.patient_documents as patient_documents
    where patient_documents.id = printable_artifacts.patient_document_id
      and private.can_read_clinical_domain(patient_documents.tenant_id, patient_documents.unit_id)
      and private.can_access_patient(patient_documents.patient_id)
  )
);

drop policy if exists printable_artifacts_manage_current_scope on docs.printable_artifacts;
create policy printable_artifacts_manage_current_scope
on docs.printable_artifacts
for all
to authenticated
using (
  exists (
    select 1
    from docs.patient_documents as patient_documents
    where patient_documents.id = printable_artifacts.patient_document_id
      and private.can_manage_clinical_domain(patient_documents.tenant_id, patient_documents.unit_id)
      and private.can_access_patient(patient_documents.patient_id)
  )
)
with check (
  exists (
    select 1
    from docs.patient_documents as patient_documents
    where patient_documents.id = printable_artifacts.patient_document_id
      and private.can_manage_clinical_domain(patient_documents.tenant_id, patient_documents.unit_id)
      and private.can_access_patient(patient_documents.patient_id)
  )
);

drop policy if exists prescription_items_select_current_scope on clinical.prescription_items;
create policy prescription_items_select_current_scope
on clinical.prescription_items
for select
to authenticated
using (
  exists (
    select 1
    from clinical.prescription_records as prescription_records
    inner join clinical.encounters as encounters
      on encounters.id = prescription_records.encounter_id
    where prescription_records.id = prescription_items.prescription_record_id
      and private.can_read_clinical_domain(encounters.tenant_id, encounters.unit_id)
  )
);

drop policy if exists prescription_items_manage_current_scope on clinical.prescription_items;
create policy prescription_items_manage_current_scope
on clinical.prescription_items
for all
to authenticated
using (
  exists (
    select 1
    from clinical.prescription_records as prescription_records
    inner join clinical.encounters as encounters
      on encounters.id = prescription_records.encounter_id
    where prescription_records.id = prescription_items.prescription_record_id
      and private.can_manage_clinical_domain(encounters.tenant_id, encounters.unit_id)
  )
)
with check (
  exists (
    select 1
    from clinical.prescription_records as prescription_records
    inner join clinical.encounters as encounters
      on encounters.id = prescription_records.encounter_id
    where prescription_records.id = prescription_items.prescription_record_id
      and private.can_manage_clinical_domain(encounters.tenant_id, encounters.unit_id)
  )
);
