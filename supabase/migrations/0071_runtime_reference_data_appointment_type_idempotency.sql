-- Make appointment type reference-data projection idempotent when a runtime
-- type already exists for the same tenant/code but is missing the current
-- legacy binding.

create or replace function private.ensure_appointment_type(
  p_runtime_tenant_id uuid,
  p_appointment_type_id uuid,
  p_legacy_appointment_type_id text,
  p_name text,
  p_code text,
  p_default_duration_minutes integer,
  p_requires_professional boolean,
  p_requires_resource boolean,
  p_generates_encounter boolean,
  p_allows_telehealth boolean,
  p_active boolean,
  p_metadata jsonb,
  p_created_at timestamptz,
  p_updated_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appointment_type_id uuid;
  v_legacy_appointment_type_id text := nullif(btrim(coalesce(p_legacy_appointment_type_id, '')), '');
  v_code text;
  v_name text;
  v_metadata jsonb;
begin
  if p_runtime_tenant_id is null then
    raise exception 'runtime tenant id is required';
  end if;

  if v_legacy_appointment_type_id is null then
    raise exception 'legacy appointment type id is required';
  end if;

  v_code := lower(
    coalesce(
      nullif(btrim(p_code), ''),
      format('legacy-%s', v_legacy_appointment_type_id)
    )
  );
  v_name := coalesce(nullif(btrim(p_name), ''), v_code);
  v_metadata := coalesce(p_metadata, '{}'::jsonb)
    || jsonb_build_object(
      'source', 'legacy_prisma',
      'legacy_appointment_type_id', v_legacy_appointment_type_id
    );

  perform pg_advisory_xact_lock(
    hashtextextended(
      format(
        'appointment_type:%s:%s:%s',
        p_runtime_tenant_id::text,
        v_legacy_appointment_type_id,
        v_code
      ),
      0
    )
  );

  select appointment_types.id
  into v_appointment_type_id
  from scheduling.appointment_types as appointment_types
  where appointment_types.tenant_id = p_runtime_tenant_id
    and (
      appointment_types.legacy_appointment_type_id = v_legacy_appointment_type_id
      or appointment_types.metadata @> jsonb_build_object(
        'legacy_appointment_type_id',
        v_legacy_appointment_type_id
      )
      or appointment_types.metadata @> jsonb_build_object(
        'legacyAppointmentTypeId',
        v_legacy_appointment_type_id
      )
    )
  order by
    case
      when appointment_types.legacy_appointment_type_id = v_legacy_appointment_type_id then 0
      else 1
    end,
    appointment_types.created_at asc,
    appointment_types.id asc
  limit 1;

  if v_appointment_type_id is null then
    select appointment_types.id
    into v_appointment_type_id
    from scheduling.appointment_types as appointment_types
    where appointment_types.tenant_id = p_runtime_tenant_id
      and appointment_types.code = v_code
    order by appointment_types.created_at asc, appointment_types.id asc
    limit 1;
  end if;

  if v_appointment_type_id is not null then
    update scheduling.appointment_types as appointment_types
    set
      legacy_appointment_type_id = case
        when appointment_types.legacy_appointment_type_id = v_legacy_appointment_type_id
          then appointment_types.legacy_appointment_type_id
        when not exists (
          select 1
          from scheduling.appointment_types as conflicting
          where conflicting.legacy_appointment_type_id = v_legacy_appointment_type_id
            and conflicting.id <> appointment_types.id
        ) then v_legacy_appointment_type_id
        else appointment_types.legacy_appointment_type_id
      end,
      name = v_name,
      code = case
        when appointment_types.code = v_code then appointment_types.code
        when not exists (
          select 1
          from scheduling.appointment_types as conflicting
          where conflicting.tenant_id = p_runtime_tenant_id
            and conflicting.code = v_code
            and conflicting.id <> appointment_types.id
        ) then v_code
        else appointment_types.code
      end,
      default_duration_minutes = greatest(
        coalesce(p_default_duration_minutes, appointment_types.default_duration_minutes, 30),
        1
      ),
      requires_professional = coalesce(
        p_requires_professional,
        appointment_types.requires_professional
      ),
      requires_resource = coalesce(p_requires_resource, appointment_types.requires_resource),
      generates_encounter = coalesce(
        p_generates_encounter,
        appointment_types.generates_encounter
      ),
      allows_telehealth = coalesce(p_allows_telehealth, appointment_types.allows_telehealth),
      active = coalesce(p_active, appointment_types.active),
      metadata = coalesce(appointment_types.metadata, '{}'::jsonb)
        || jsonb_strip_nulls(
          jsonb_build_object(
            'previous_legacy_appointment_type_id',
            case
              when appointment_types.legacy_appointment_type_id is distinct from v_legacy_appointment_type_id
              then appointment_types.legacy_appointment_type_id
              else null
            end
          )
        )
        || v_metadata,
      updated_at = greatest(
        coalesce(appointment_types.updated_at, '-infinity'::timestamptz),
        coalesce(p_updated_at, now())
      )
    where appointment_types.id = v_appointment_type_id
    returning appointment_types.id into v_appointment_type_id;

    return v_appointment_type_id;
  end if;

  insert into scheduling.appointment_types as appointment_types (
    id,
    tenant_id,
    legacy_appointment_type_id,
    name,
    code,
    default_duration_minutes,
    requires_professional,
    requires_resource,
    generates_encounter,
    allows_telehealth,
    active,
    metadata,
    created_at,
    updated_at
  )
  values (
    coalesce(p_appointment_type_id, gen_random_uuid()),
    p_runtime_tenant_id,
    v_legacy_appointment_type_id,
    v_name,
    v_code,
    greatest(coalesce(p_default_duration_minutes, 30), 1),
    coalesce(p_requires_professional, true),
    coalesce(p_requires_resource, false),
    coalesce(p_generates_encounter, true),
    coalesce(p_allows_telehealth, false),
    coalesce(p_active, true),
    v_metadata,
    coalesce(p_created_at, now()),
    coalesce(p_updated_at, coalesce(p_created_at, now()))
  )
  on conflict (tenant_id, code) do update
  set
    legacy_appointment_type_id = case
      when appointment_types.legacy_appointment_type_id = excluded.legacy_appointment_type_id
        then appointment_types.legacy_appointment_type_id
      when not exists (
        select 1
        from scheduling.appointment_types as conflicting
        where conflicting.legacy_appointment_type_id = excluded.legacy_appointment_type_id
          and conflicting.id <> appointment_types.id
      ) then excluded.legacy_appointment_type_id
      else appointment_types.legacy_appointment_type_id
    end,
    name = excluded.name,
    default_duration_minutes = excluded.default_duration_minutes,
    requires_professional = excluded.requires_professional,
    requires_resource = excluded.requires_resource,
    generates_encounter = excluded.generates_encounter,
    allows_telehealth = excluded.allows_telehealth,
    active = excluded.active,
    metadata = coalesce(appointment_types.metadata, '{}'::jsonb)
      || jsonb_strip_nulls(
        jsonb_build_object(
          'previous_legacy_appointment_type_id',
          case
            when appointment_types.legacy_appointment_type_id is distinct from excluded.legacy_appointment_type_id
            then appointment_types.legacy_appointment_type_id
            else null
          end
        )
      )
      || coalesce(excluded.metadata, '{}'::jsonb),
    updated_at = greatest(
      coalesce(appointment_types.updated_at, '-infinity'::timestamptz),
      coalesce(excluded.updated_at, now())
    )
  returning appointment_types.id into v_appointment_type_id;

  return v_appointment_type_id;
end;
$$;

create or replace function private.runtime_appointment_type_id_by_legacy_appointment_type_id(
  p_runtime_tenant_id uuid,
  p_legacy_appointment_type_id text
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select appointment_types.id
  from scheduling.appointment_types as appointment_types
  where appointment_types.tenant_id = p_runtime_tenant_id
    and (
      appointment_types.legacy_appointment_type_id = nullif(btrim(coalesce(p_legacy_appointment_type_id, '')), '')
      or appointment_types.metadata @> jsonb_build_object(
        'legacy_appointment_type_id',
        nullif(btrim(coalesce(p_legacy_appointment_type_id, '')), '')
      )
      or appointment_types.metadata @> jsonb_build_object(
        'legacyAppointmentTypeId',
        nullif(btrim(coalesce(p_legacy_appointment_type_id, '')), '')
      )
    )
  order by
    case
      when appointment_types.legacy_appointment_type_id = nullif(btrim(coalesce(p_legacy_appointment_type_id, '')), '')
      then 0
      else 1
    end,
    appointment_types.created_at asc,
    appointment_types.id asc
  limit 1
$$;

create or replace function api.backfill_runtime_reference_data(
  p_runtime_tenant_id uuid,
  p_tags jsonb default '[]'::jsonb,
  p_professionals jsonb default '[]'::jsonb,
  p_appointment_types jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tags_count integer := 0;
  v_professionals_count integer := 0;
  v_appointment_types_count integer := 0;
  v_appointment_type_row record;
begin
  if p_runtime_tenant_id is null then
    raise exception 'p_runtime_tenant_id is required';
  end if;

  with rows as (
    select *
    from jsonb_to_recordset(coalesce(p_tags, '[]'::jsonb)) as x(
      id uuid,
      legacy_tag_id text,
      name text,
      code text,
      color text,
      status text,
      metadata jsonb,
      created_at timestamptz,
      updated_at timestamptz
    )
  )
  insert into patients.tags (
    id,
    tenant_id,
    legacy_tag_id,
    name,
    code,
    color,
    status,
    metadata,
    created_at,
    updated_at
  )
  select
    rows.id,
    p_runtime_tenant_id,
    rows.legacy_tag_id,
    rows.name,
    rows.code,
    rows.color,
    lower(coalesce(rows.status, 'active')),
    coalesce(rows.metadata, '{}'::jsonb),
    coalesce(rows.created_at, now()),
    coalesce(rows.updated_at, coalesce(rows.created_at, now()))
  from rows
  where rows.id is not null
    and nullif(trim(coalesce(rows.name, '')), '') is not null
    and nullif(trim(coalesce(rows.code, '')), '') is not null
  on conflict (id) do update
  set
    tenant_id = excluded.tenant_id,
    legacy_tag_id = excluded.legacy_tag_id,
    name = excluded.name,
    code = excluded.code,
    color = excluded.color,
    status = excluded.status,
    metadata = coalesce(patients.tags.metadata, '{}'::jsonb) || coalesce(excluded.metadata, '{}'::jsonb),
    updated_at = excluded.updated_at;

  get diagnostics v_tags_count = row_count;

  with rows as (
    select *
    from jsonb_to_recordset(coalesce(p_professionals, '[]'::jsonb)) as x(
      id uuid,
      legacy_professional_id text,
      legacy_user_id text,
      professional_type text,
      license_number text,
      display_name text,
      color_hex text,
      is_schedulable boolean,
      metadata jsonb,
      created_at timestamptz,
      updated_at timestamptz,
      deleted_at timestamptz
    )
  )
  insert into scheduling.professionals (
    id,
    tenant_id,
    profile_id,
    legacy_professional_id,
    professional_type,
    license_number,
    display_name,
    color_hex,
    is_schedulable,
    metadata,
    created_at,
    updated_at,
    deleted_at
  )
  select
    rows.id,
    p_runtime_tenant_id,
    private.runtime_profile_id_by_legacy_user_id(rows.legacy_user_id),
    rows.legacy_professional_id,
    lower(coalesce(rows.professional_type, 'other')),
    rows.license_number,
    rows.display_name,
    rows.color_hex,
    coalesce(rows.is_schedulable, true),
    coalesce(rows.metadata, '{}'::jsonb),
    coalesce(rows.created_at, now()),
    coalesce(rows.updated_at, coalesce(rows.created_at, now())),
    rows.deleted_at
  from rows
  where rows.id is not null
    and nullif(trim(coalesce(rows.display_name, '')), '') is not null
  on conflict (id) do update
  set
    tenant_id = excluded.tenant_id,
    profile_id = excluded.profile_id,
    legacy_professional_id = excluded.legacy_professional_id,
    professional_type = excluded.professional_type,
    license_number = excluded.license_number,
    display_name = excluded.display_name,
    color_hex = excluded.color_hex,
    is_schedulable = excluded.is_schedulable,
    metadata = coalesce(scheduling.professionals.metadata, '{}'::jsonb) || coalesce(excluded.metadata, '{}'::jsonb),
    updated_at = excluded.updated_at,
    deleted_at = excluded.deleted_at;

  get diagnostics v_professionals_count = row_count;

  for v_appointment_type_row in
    select *
    from jsonb_to_recordset(coalesce(p_appointment_types, '[]'::jsonb)) as x(
      id uuid,
      legacy_appointment_type_id text,
      name text,
      code text,
      default_duration_minutes integer,
      requires_professional boolean,
      requires_resource boolean,
      generates_encounter boolean,
      allows_telehealth boolean,
      active boolean,
      metadata jsonb,
      created_at timestamptz,
      updated_at timestamptz
    )
  loop
    if v_appointment_type_row.id is null
      or nullif(trim(coalesce(v_appointment_type_row.name, '')), '') is null
      or nullif(trim(coalesce(v_appointment_type_row.code, '')), '') is null
    then
      continue;
    end if;

    perform private.ensure_appointment_type(
      p_runtime_tenant_id,
      v_appointment_type_row.id,
      v_appointment_type_row.legacy_appointment_type_id,
      v_appointment_type_row.name,
      v_appointment_type_row.code,
      v_appointment_type_row.default_duration_minutes,
      v_appointment_type_row.requires_professional,
      v_appointment_type_row.requires_resource,
      v_appointment_type_row.generates_encounter,
      v_appointment_type_row.allows_telehealth,
      v_appointment_type_row.active,
      v_appointment_type_row.metadata,
      v_appointment_type_row.created_at,
      v_appointment_type_row.updated_at
    );

    v_appointment_types_count := v_appointment_types_count + 1;
  end loop;

  return jsonb_build_object(
    'tags', v_tags_count,
    'professionals', v_professionals_count,
    'appointmentTypes', v_appointment_types_count
  );
end;
$$;

revoke all on function private.ensure_appointment_type(
  uuid,
  uuid,
  text,
  text,
  text,
  integer,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  jsonb,
  timestamptz,
  timestamptz
) from public, anon, authenticated;
grant execute on function private.ensure_appointment_type(
  uuid,
  uuid,
  text,
  text,
  text,
  integer,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  jsonb,
  timestamptz,
  timestamptz
) to service_role;

revoke all on function private.runtime_appointment_type_id_by_legacy_appointment_type_id(uuid, text)
from public, anon, authenticated;
grant execute on function private.runtime_appointment_type_id_by_legacy_appointment_type_id(uuid, text)
to service_role;

revoke all on function api.backfill_runtime_reference_data(uuid, jsonb, jsonb, jsonb)
from public, anon, authenticated;
grant execute on function api.backfill_runtime_reference_data(uuid, jsonb, jsonb, jsonb)
to service_role;
