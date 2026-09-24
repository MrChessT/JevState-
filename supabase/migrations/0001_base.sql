-- 0001 · Base: extensiones, tipos, agencias, agentes (roles), perfiles y auditoría.
--
-- Convenciones (docs/ARQUITECTURA.md §Datos):
--   · agency_id en todas las tablas de negocio (una agencia hoy, SaaS mañana).
--   · RLS activada en TODAS las tablas de public (un test lo comprueba).
--   · Funciones auxiliares en el esquema `app`, SECURITY DEFINER con search_path vacío.
--   · Las migraciones se pueden repetir sin error.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists postgis with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

create schema if not exists app;
grant usage on schema app to anon, authenticated, service_role;

-- Tipos ---------------------------------------------------------------------------

do $$ begin
  create type public.rol_agencia as enum ('admin', 'agente', 'editor');
exception when duplicate_object then null; end $$;

-- Texto normalizado para búsqueda difusa (sin tildes, minúsculas). IMMUTABLE para poder indexar.
create or replace function app.normalizar(texto text) returns text
language sql immutable parallel safe
set search_path = ''
as $$ select lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(texto, ''))) $$;

create or replace function app.touch() returns trigger
language plpgsql
set search_path = ''
as $$ begin new.updated_at := now(); return new; end $$;

-- Agencias, agentes y perfiles ------------------------------------------------------------

create table if not exists public.agencies (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.agents (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  role public.rol_agencia not null default 'agente',
  display_name text not null,
  -- Datos de contacto PÚBLICOS del agente (los de la ficha). Nada personal privado aquí.
  public_email text,
  public_phone text,
  bio_es text,
  bio_en text,
  photo_path text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agency_id, user_id)
);
create index if not exists agents_user_idx on public.agents(user_id) where active;
drop trigger if exists agents_touch on public.agents;
create trigger agents_touch before update on public.agents for each row execute function app.touch();

-- Perfil del usuario del portal (cuenta opcional con magic link).
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  locale text not null default 'es' check (locale ~ '^[a-z]{2}$'),
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles for each row execute function app.touch();

-- Funciones de permisos (RLS) ---------------------------------------------------------------

-- ¿El usuario actual es miembro activo de la agencia con alguno de los roles?
create or replace function app.es_miembro(agencia uuid, roles public.rol_agencia[] default null) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.agents a
    where a.agency_id = agencia
      and a.user_id = (select auth.uid())
      and a.active
      and (roles is null or a.role = any(roles))
  )
$$;

create or replace function app.mis_agencias() returns setof uuid
language sql stable security definer
set search_path = ''
as $$ select a.agency_id from public.agents a where a.user_id = (select auth.uid()) and a.active $$;

revoke all on function app.es_miembro(uuid, public.rol_agencia[]) from public;
revoke all on function app.mis_agencias() from public;
grant execute on function app.es_miembro(uuid, public.rol_agencia[]) to anon, authenticated, service_role;
grant execute on function app.mis_agencias() to authenticated, service_role;
grant execute on function app.normalizar(text) to anon, authenticated, service_role;

-- Auditoría: quién cambió qué ---------------------------------------------------------------

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  agency_id uuid references public.agencies(id) on delete cascade,
  actor uuid,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  table_name text not null,
  row_id text,
  before jsonb,
  after jsonb,
  at timestamptz not null default now()
);
create index if not exists audit_log_agency_at_idx on public.audit_log(agency_id, at desc);

create or replace function app.auditar() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  fila jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  insert into public.audit_log(agency_id, actor, action, table_name, row_id, before, after)
  values (
    nullif(fila ->> 'agency_id', '')::uuid,
    (select auth.uid()),
    tg_op,
    tg_table_name,
    coalesce(fila ->> 'id', fila ->> 'listing_id'),
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end
  );
  return null;
end $$;

drop trigger if exists agents_audit on public.agents;
create trigger agents_audit after insert or update or delete on public.agents for each row execute function app.auditar();

-- RLS -----------------------------------------------------------------------------------

alter table public.agencies enable row level security;
alter table public.agents enable row level security;
alter table public.profiles enable row level security;
alter table public.audit_log enable row level security;

-- Agencias: públicas (nombre y slug aparecen en el portal).
drop policy if exists agencies_select on public.agencies;
create policy agencies_select on public.agencies for select to anon, authenticated using (true);
drop policy if exists agencies_update on public.agencies;
create policy agencies_update on public.agencies for update to authenticated
  using (app.es_miembro(id, array['admin']::public.rol_agencia[])) with check (app.es_miembro(id, array['admin']::public.rol_agencia[]));

-- Agentes: la ficha pública del equipo es visible para todos (solo activos); la gestión, del admin.
drop policy if exists agents_select_public on public.agents;
create policy agents_select_public on public.agents for select to anon, authenticated using (active);
drop policy if exists agents_select_staff on public.agents;
create policy agents_select_staff on public.agents for select to authenticated using (app.es_miembro(agency_id));
drop policy if exists agents_admin_write on public.agents;
create policy agents_admin_write on public.agents for all to authenticated
  using (app.es_miembro(agency_id, array['admin']::public.rol_agencia[]))
  with check (app.es_miembro(agency_id, array['admin']::public.rol_agencia[]));

-- Perfil: cada usuario el suyo.
drop policy if exists profiles_own on public.profiles;
create policy profiles_own on public.profiles for all to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Auditoría: solo la leen los admin de la agencia; nadie la escribe directamente (solo el trigger).
drop policy if exists audit_log_admin_select on public.audit_log;
create policy audit_log_admin_select on public.audit_log for select to authenticated
  using (app.es_miembro(agency_id, array['admin']::public.rol_agencia[]));

-- Permisos de tabla explícitos (RLS decide las filas).
grant select on public.agencies to anon;
grant select, update on public.agencies to authenticated;
-- La ficha pública del agente nunca expone user_id (enlace a la cuenta): permiso por columnas.
revoke select on public.agents from anon, authenticated;
grant select (id, agency_id, role, display_name, public_email, public_phone, bio_es, bio_en, photo_path, active, created_at, updated_at)
  on public.agents to anon, authenticated;
grant insert, update, delete on public.agents to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select on public.audit_log to authenticated;
grant all on all tables in schema public to service_role;
