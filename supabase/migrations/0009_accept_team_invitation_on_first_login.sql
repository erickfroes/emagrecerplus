create or replace function api.accept_team_invitation_for_auth_user(
  p_auth_user_id uuid,
  p_email text,
  p_full_name text default null,
  p_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_full_name text;
  v_invitation identity.invitation_tokens%rowtype;
  v_role identity.roles%rowtype;
  v_membership_id uuid;
  v_unit_id uuid;
  v_unit_ids uuid[] := '{}'::uuid[];
  v_primary_unit_id uuid;
  v_access_level text;
  v_has_active_membership boolean := false;
begin
  if p_auth_user_id is null then
    raise exception 'p_auth_user_id is required';
  end if;

  if auth.uid() is not null and auth.uid() <> p_auth_user_id then
    raise exception 'O convite so pode ser aceito pelo proprio usuario autenticado.';
  end if;

  v_email := nullif(lower(trim(coalesce(p_email, ''))), '');

  if v_email is null then
    raise exception 'p_email is required';
  end if;

  v_full_name := coalesce(
    nullif(trim(coalesce(p_full_name, '')), ''),
    split_part(v_email, '@', 1)
  );

  update identity.invitation_tokens
  set status = 'expired'
  where email = v_email
    and status = 'pending'
    and expires_at <= now();

  select *
  into v_invitation
  from identity.invitation_tokens as invitations
  where invitations.email = v_email
    and invitations.status = 'pending'
    and invitations.expires_at > now()
  order by invitations.created_at desc
  limit 1
  for update;

  if v_invitation.id is null then
    return jsonb_build_object(
      'accepted', false,
      'reason', 'invitation_not_found'
    );
  end if;

  select *
  into v_role
  from identity.roles as roles
  where roles.id = v_invitation.role_id
    and roles.status = 'active'
  limit 1;

  if v_role.id is null then
    select *
    into v_role
    from identity.roles as roles
    where roles.id = private.resolve_active_role_id(
      v_invitation.tenant_id,
      coalesce(v_invitation.metadata ->> 'role_code', 'assistant')
    )
    limit 1;
  end if;

  if v_role.id is null then
    raise exception 'Role do convite nao encontrada ou inativa.';
  end if;

  select coalesce(
    array_agg(units.id order by units.is_default desc, units.created_at asc),
    '{}'::uuid[]
  )
  into v_unit_ids
  from platform.units as units
  where units.tenant_id = v_invitation.tenant_id
    and units.deleted_at is null
    and units.status = 'active'
    and (
      units.id in (
        select nullif(unit_id, '')::uuid
        from jsonb_array_elements_text(
          coalesce(v_invitation.metadata -> 'unit_ids', '[]'::jsonb)
        ) as unit_id
      )
      or jsonb_array_length(coalesce(v_invitation.metadata -> 'unit_ids', '[]'::jsonb)) = 0
    );

  if coalesce(array_length(v_unit_ids, 1), 0) = 0 then
    raise exception 'Convite sem unidades validas para aceite.';
  end if;

  v_primary_unit_id := v_unit_ids[1];
  v_access_level := private.access_level_for_app_role(v_role.app_role_code);

  perform 1
  from identity.profiles as profiles
  where profiles.email = v_email
    and profiles.id <> p_auth_user_id
  limit 1;

  if found then
    raise exception 'Ja existe outro perfil vinculado a este e-mail.';
  end if;

  select exists(
    select 1
    from identity.memberships as memberships
    where memberships.profile_id = p_auth_user_id
      and memberships.status = 'active'
  )
  into v_has_active_membership;

  insert into identity.profiles as profiles (
    id,
    email,
    full_name,
    display_name,
    phone,
    status,
    default_tenant_id,
    default_unit_id,
    last_seen_at,
    metadata
  )
  values (
    p_auth_user_id,
    v_email,
    v_full_name,
    v_full_name,
    nullif(trim(coalesce(p_phone, '')), ''),
    'active',
    case when not v_has_active_membership then v_invitation.tenant_id else null end,
    case when not v_has_active_membership then v_primary_unit_id else null end,
    now(),
    jsonb_build_object(
      'accepted_invitation_id', v_invitation.id,
      'source', 'team_invitation_acceptance'
    )
  )
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = excluded.full_name,
    display_name = excluded.display_name,
    phone = coalesce(excluded.phone, profiles.phone),
    status = 'active',
    default_tenant_id = case
      when not v_has_active_membership or profiles.default_tenant_id is null
        then excluded.default_tenant_id
      else profiles.default_tenant_id
    end,
    default_unit_id = case
      when not v_has_active_membership or profiles.default_unit_id is null
        then excluded.default_unit_id
      else profiles.default_unit_id
    end,
    last_seen_at = now(),
    metadata = coalesce(profiles.metadata, '{}'::jsonb) || excluded.metadata;

  if not v_has_active_membership then
    update identity.memberships
    set is_default = false
    where profile_id = p_auth_user_id
      and status = 'active'
      and is_default = true;
  end if;

  insert into identity.memberships as memberships (
    profile_id,
    tenant_id,
    role_id,
    status,
    is_default,
    invited_by_profile_id,
    joined_at,
    last_seen_at,
    metadata
  )
  values (
    p_auth_user_id,
    v_invitation.tenant_id,
    v_role.id,
    'active',
    not v_has_active_membership,
    v_invitation.invited_by_profile_id,
    now(),
    now(),
    jsonb_build_object(
      'accepted_invitation_id', v_invitation.id,
      'source', 'team_invitation_acceptance'
    )
  )
  on conflict (profile_id, tenant_id) do update
  set
    role_id = excluded.role_id,
    status = 'active',
    is_default = case
      when not v_has_active_membership then true
      else memberships.is_default
    end,
    invited_by_profile_id = coalesce(memberships.invited_by_profile_id, excluded.invited_by_profile_id),
    joined_at = coalesce(memberships.joined_at, excluded.joined_at),
    last_seen_at = excluded.last_seen_at,
    revoked_at = null,
    metadata = coalesce(memberships.metadata, '{}'::jsonb) || excluded.metadata
  returning id into v_membership_id;

  update identity.unit_memberships
  set
    status = 'inactive',
    is_primary = false,
    updated_at = now()
  where membership_id = v_membership_id;

  foreach v_unit_id in array v_unit_ids
  loop
    insert into identity.unit_memberships as unit_memberships (
      membership_id,
      unit_id,
      access_level,
      status,
      is_primary
    )
    values (
      v_membership_id,
      v_unit_id,
      v_access_level,
      'active',
      v_unit_id = v_primary_unit_id
    )
    on conflict (membership_id, unit_id) do update
    set
      access_level = excluded.access_level,
      status = 'active',
      is_primary = excluded.is_primary,
      updated_at = now();
  end loop;

  update identity.invitation_tokens
  set
    status = 'accepted',
    accepted_profile_id = p_auth_user_id,
    accepted_at = now(),
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'accepted_by_auth_user_id', p_auth_user_id,
      'accepted_from', 'first_login'
    )
  where id = v_invitation.id;

  perform private.record_audit_event(
    v_invitation.tenant_id,
    v_primary_unit_id,
    null,
    'profile',
    p_auth_user_id,
    'identity.invitation.accepted',
    'accept',
    'identity',
    'invitation_tokens',
    v_invitation.id,
    jsonb_build_object(
      'email', v_email,
      'membershipId', v_membership_id,
      'roleCode', v_role.code,
      'appRoleCode', v_role.app_role_code,
      'unitIds', to_jsonb(v_unit_ids)
    ),
    null,
    null
  );

  return jsonb_build_object(
    'accepted', true,
    'invitationId', v_invitation.id,
    'tenantId', v_invitation.tenant_id,
    'membershipId', v_membership_id,
    'roleCode', v_role.code,
    'appRoleCode', v_role.app_role_code,
    'unitIds', to_jsonb(v_unit_ids)
  );
end;
$$;

create or replace function public.accept_team_invitation_for_auth_user(
  p_auth_user_id uuid,
  p_email text,
  p_full_name text default null,
  p_phone text default null
)
returns jsonb
language sql
set search_path = ''
as $$
  select api.accept_team_invitation_for_auth_user(
    p_auth_user_id,
    p_email,
    p_full_name,
    p_phone
  )
$$;

revoke all on function api.accept_team_invitation_for_auth_user(uuid, text, text, text) from public, anon;
revoke all on function public.accept_team_invitation_for_auth_user(uuid, text, text, text) from public, anon;

grant execute on function api.accept_team_invitation_for_auth_user(uuid, text, text, text) to authenticated, service_role;
grant execute on function public.accept_team_invitation_for_auth_user(uuid, text, text, text) to authenticated, service_role;
