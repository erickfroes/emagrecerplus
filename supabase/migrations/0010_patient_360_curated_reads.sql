create or replace function private.legacy_patient_schema_available()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    to_regclass('patients.patients') is not null
    and to_regclass('clinical.encounters') is not null
    and to_regclass('scheduling.appointments') is not null
$$;

create or replace function api.patient_longitudinal_feed(
  p_patient_id text,
  p_current_legacy_unit_id text default null,
  p_limit integer default 12
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select '[]'::jsonb
$$;

create or replace function api.patient_adherence_summary(p_patient_id text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'adherence', 'Leitura curada pendente da migracao do schema legado para o Supabase.',
    'habits', '[]'::jsonb
  )
$$;

create or replace function api.patient_operational_alerts(
  p_patient_id text,
  p_current_legacy_unit_id text default null
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select '[]'::jsonb
$$;

create or replace function api.patient_commercial_context(p_patient_id text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'hasCommercialContext', false
  )
$$;

create or replace function api.patient_360(
  p_patient_id text,
  p_current_legacy_unit_id text default null
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'ready', false,
    'patientId', p_patient_id,
    'currentLegacyUnitId', p_current_legacy_unit_id,
    'schemaReady', private.legacy_patient_schema_available(),
    'source', 'supabase_scaffold',
    'reason', 'Os schemas legados de paciente, agenda e clinico ainda nao foram migrados para o Supabase runtime.',
    'timeline', api.patient_longitudinal_feed(p_patient_id, p_current_legacy_unit_id, 12),
    'habits', coalesce(api.patient_adherence_summary(p_patient_id) -> 'habits', '[]'::jsonb),
    'operationalAlerts', api.patient_operational_alerts(p_patient_id, p_current_legacy_unit_id),
    'commercialContext', api.patient_commercial_context(p_patient_id)
  )
$$;

create or replace function public.patient_longitudinal_feed(
  p_patient_id text,
  p_current_legacy_unit_id text default null,
  p_limit integer default 12
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select api.patient_longitudinal_feed(
    p_patient_id,
    p_current_legacy_unit_id,
    p_limit
  )
$$;

create or replace function public.patient_adherence_summary(p_patient_id text)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select api.patient_adherence_summary(p_patient_id)
$$;

create or replace function public.patient_operational_alerts(
  p_patient_id text,
  p_current_legacy_unit_id text default null
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select api.patient_operational_alerts(
    p_patient_id,
    p_current_legacy_unit_id
  )
$$;

create or replace function public.patient_commercial_context(p_patient_id text)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select api.patient_commercial_context(p_patient_id)
$$;

create or replace function public.patient_360(
  p_patient_id text,
  p_current_legacy_unit_id text default null
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select api.patient_360(
    p_patient_id,
    p_current_legacy_unit_id
  )
$$;

revoke all on function private.legacy_patient_schema_available() from public, anon;
revoke all on function api.patient_longitudinal_feed(text, text, integer) from public, anon;
revoke all on function api.patient_adherence_summary(text) from public, anon;
revoke all on function api.patient_operational_alerts(text, text) from public, anon;
revoke all on function api.patient_commercial_context(text) from public, anon;
revoke all on function api.patient_360(text, text) from public, anon;
revoke all on function public.patient_longitudinal_feed(text, text, integer) from public, anon;
revoke all on function public.patient_adherence_summary(text) from public, anon;
revoke all on function public.patient_operational_alerts(text, text) from public, anon;
revoke all on function public.patient_commercial_context(text) from public, anon;
revoke all on function public.patient_360(text, text) from public, anon;

grant execute on function private.legacy_patient_schema_available() to authenticated, service_role;
grant execute on function api.patient_longitudinal_feed(text, text, integer) to authenticated, service_role;
grant execute on function api.patient_adherence_summary(text) to authenticated, service_role;
grant execute on function api.patient_operational_alerts(text, text) to authenticated, service_role;
grant execute on function api.patient_commercial_context(text) to authenticated, service_role;
grant execute on function api.patient_360(text, text) to authenticated, service_role;
grant execute on function public.patient_longitudinal_feed(text, text, integer) to authenticated, service_role;
grant execute on function public.patient_adherence_summary(text) to authenticated, service_role;
grant execute on function public.patient_operational_alerts(text, text) to authenticated, service_role;
grant execute on function public.patient_commercial_context(text) to authenticated, service_role;
grant execute on function public.patient_360(text, text) to authenticated, service_role;
