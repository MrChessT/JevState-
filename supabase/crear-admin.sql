-- Crea la agencia y te hace ADMINISTRADOR del backoffice (/admin y /admin/crm).
-- Antes: regístrate en la web (/cuenta/entrar) con tu email y abre el enlace que te llega.
-- Después: cambia los 4 valores de abajo, pégalo en Supabase → SQL Editor → Run.
-- Se puede repetir sin problema (no duplica nada).
do $$
declare
  v_email    text := 'tu@email.com';                -- el email con el que te registraste
  v_nombre   text := 'Tu nombre';                   -- como aparecerás en el backoffice
  v_agencia  text := 'Nombre de tu inmobiliaria';
  v_slug     text := 'mi-inmobiliaria';             -- minúsculas, números y guiones
  v_user uuid;
  v_agency uuid;
begin
  select id into v_user from auth.users where lower(email) = lower(v_email);
  if v_user is null then
    raise exception 'No hay ningún usuario con el email %. Regístrate primero en la web (/cuenta/entrar) y confirma el enlace del email.', v_email;
  end if;
  insert into public.agencies (slug, name) values (v_slug, v_agencia)
  on conflict (slug) do update set name = excluded.name
  returning id into v_agency;
  insert into public.agents (agency_id, user_id, role, display_name, public_email)
  values (v_agency, v_user, 'admin', v_nombre, v_email)
  on conflict (agency_id, user_id) do update set role = 'admin', active = true, display_name = excluded.display_name;
  raise notice 'Listo: % es administrador de %', v_email, v_agencia;
end $$;
