revoke create on schema public from public;
revoke create on schema public from anon;
revoke create on schema public from authenticated;
revoke create on schema public from service_role;

grant usage on schema public to authenticated;
grant usage on schema public to service_role;

comment on schema public is 'Compatibility-only facade for RPC wrappers and extensions. No business relations should live here.';

do $$
begin
  if exists (
    select 1
    from pg_class as classes
    join pg_namespace as namespaces
      on namespaces.oid = classes.relnamespace
    where namespaces.nspname = 'public'
      and classes.relkind in ('r', 'v', 'm', 'S', 'f', 'p')
  ) then
    raise exception 'public schema must not contain business relations';
  end if;
end;
$$;
