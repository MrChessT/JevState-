-- GENERADO con `npm run db:sql-unico`: no editar a mano (se edita supabase/migrations/).
-- Pegar entero en Supabase → SQL Editor → Run. Se puede repetir sin error.

-- ===== 0001_base.sql =====
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

-- Membresías del usuario actual (para el backoffice). user_id no es legible por columnas, así que
-- se expone solo lo del propio usuario mediante esta función.
create or replace function public.mis_membresias()
returns table (agency_id uuid, agent_id uuid, role public.rol_agencia, display_name text)
language sql stable security definer
set search_path = ''
as $$
  select a.agency_id, a.id, a.role, a.display_name
  from public.agents a
  where a.user_id = (select auth.uid()) and a.active
  order by a.created_at
$$;
revoke all on function public.mis_membresias() from public, anon;
grant execute on function public.mis_membresias() to authenticated, service_role;

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

-- ===== 0002_zonas_y_pois.sql =====
-- 0002 · Zonas (municipio > distrito > barrio, alias, geometría y colindancias) y puntos de interés.
--
-- Las zonas y los POI son datos geográficos abiertos y compartidos: no llevan agency_id (D-011).
-- El contenido SEO de cada zona sí es de la agencia (zone_content).

do $$ begin
  create type public.nivel_zona as enum ('municipio', 'distrito', 'barrio');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.categoria_poi as enum ('playa', 'colegio', 'transporte', 'sanidad', 'comercio');
exception when duplicate_object then null; end $$;

create table if not exists public.zones (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.zones(id) on delete restrict,
  level public.nivel_zona not null,
  -- Ruta de slugs para URLs limpias: «murcia», «murcia/centro».
  path text not null unique check (path ~ '^[a-z0-9-]+(/[a-z0-9-]+)*$'),
  slug text not null check (slug ~ '^[a-z0-9-]+$'),
  name text not null,
  -- Alias y erratas frecuentes («cartajena», «mar menor» → varios municipios se resuelve en código).
  aliases text[] not null default '{}',
  ine_code text,
  geom extensions.geography(MultiPolygon, 4326),
  centroid extensions.geography(Point, 4326),
  -- Texto normalizado (nombre + alias) para la búsqueda difusa con pg_trgm. Lo mantiene un trigger.
  search_text text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((level = 'municipio') = (parent_id is null))
);
create index if not exists zones_parent_idx on public.zones(parent_id);
create index if not exists zones_geom_idx on public.zones using gist (geom);
create index if not exists zones_search_trgm_idx on public.zones using gin (search_text extensions.gin_trgm_ops);

create or replace function app.zonas_texto() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.search_text := app.normalizar(new.name || ' ' || array_to_string(new.aliases, ' '));
  if new.centroid is null and new.geom is not null then
    new.centroid := extensions.st_centroid(new.geom::extensions.geometry)::extensions.geography;
  end if;
  return new;
end $$;
drop trigger if exists zones_texto on public.zones;
create trigger zones_texto before insert or update of name, aliases, geom on public.zones for each row execute function app.zonas_texto();
drop trigger if exists zones_touch on public.zones;
create trigger zones_touch before update on public.zones for each row execute function app.touch();

create table if not exists public.zone_adjacency (
  zone_id uuid not null references public.zones(id) on delete cascade,
  neighbor_id uuid not null references public.zones(id) on delete cascade,
  primary key (zone_id, neighbor_id),
  check (zone_id <> neighbor_id)
);

create table if not exists public.zone_content (
  agency_id uuid not null references public.agencies(id) on delete cascade,
  zone_id uuid not null references public.zones(id) on delete cascade,
  locale text not null check (locale ~ '^[a-z]{2}$'),
  title text not null,
  body_md text not null default '',
  published boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (agency_id, zone_id, locale)
);
drop trigger if exists zone_content_touch on public.zone_content;
create trigger zone_content_touch before update on public.zone_content for each row execute function app.touch();

create table if not exists public.pois (
  id uuid primary key default gen_random_uuid(),
  category public.categoria_poi not null,
  subcategory text,
  name text,
  geom extensions.geography(Point, 4326) not null,
  osm_id bigint unique,
  source text not null default 'osm',
  updated_at timestamptz not null default now()
);
create index if not exists pois_geom_idx on public.pois using gist (geom);
create index if not exists pois_category_idx on public.pois(category);

-- Búsqueda difusa de zonas (erratas y alias) para el asistente: candidatas ordenadas por similitud.
create or replace function public.buscar_zonas(texto text, limite int default 5)
returns table (id uuid, path text, name text, level public.nivel_zona, similitud real)
language sql stable
set search_path = ''
as $$
  select z.id, z.path, z.name, z.level,
         greatest(extensions.similarity(z.search_text, app.normalizar(texto)),
                  extensions.word_similarity(app.normalizar(texto), z.search_text)) as similitud
  from public.zones z
  where z.search_text operator(extensions.%) app.normalizar(texto)
     or app.normalizar(texto) operator(extensions.<%) z.search_text
  order by similitud desc, z.level
  limit least(greatest(limite, 1), 20)
$$;
grant execute on function public.buscar_zonas(text, int) to anon, authenticated, service_role;

alter table public.zones enable row level security;
alter table public.zone_adjacency enable row level security;
alter table public.zone_content enable row level security;
alter table public.pois enable row level security;

-- Geografía: lectura pública; la escriben solo los procesos de carga (service_role, que salta RLS).
drop policy if exists zones_select on public.zones;
create policy zones_select on public.zones for select to anon, authenticated using (true);
drop policy if exists zone_adjacency_select on public.zone_adjacency;
create policy zone_adjacency_select on public.zone_adjacency for select to anon, authenticated using (true);
drop policy if exists pois_select on public.pois;
create policy pois_select on public.pois for select to anon, authenticated using (true);

-- Contenido SEO: público si está publicado; lo editan admin y editor de la agencia.
drop policy if exists zone_content_select on public.zone_content;
create policy zone_content_select on public.zone_content for select to anon, authenticated using (published);
drop policy if exists zone_content_staff on public.zone_content;
create policy zone_content_staff on public.zone_content for all to authenticated
  using (app.es_miembro(agency_id, array['admin', 'editor']::public.rol_agencia[]))
  with check (app.es_miembro(agency_id, array['admin', 'editor']::public.rol_agencia[]));

grant select on public.zones, public.zone_adjacency, public.pois, public.zone_content to anon, authenticated;
grant insert, update, delete on public.zone_content to authenticated;
grant all on all tables in schema public to service_role;

-- ===== 0003_inmuebles.sql =====
-- 0003 · Inmuebles: ficha, campos canónicos con confianza, evidencias, medios, historial de precio,
-- traducciones, distancias a POI y datos privados (propietario, comisión, notas).

do $$ begin
  create type public.estado_inmueble as enum ('borrador', 'publicado', 'reservado', 'vendido', 'alquilado', 'retirado');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.operacion_inmueble as enum ('venta', 'alquiler', 'alquiler_vacacional');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.estado_campo as enum ('confirmado', 'probable', 'no_consta', 'revisar');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.metodo_campo as enum ('mini', 'verify', 'reasoning', 'manual');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.fuente_evidencia as enum ('feed', 'jsonld', 'meta', 'features_table', 'visible_text', 'manual', 'csv', 'geocode');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.tipo_medio as enum ('foto', 'plano', 'video', 'tour');
exception when duplicate_object then null; end $$;

create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  ref text not null check (ref ~ '^[A-Za-z0-9-]{1,32}$'),
  slug text not null check (slug ~ '^[a-z0-9-]+$'),
  status public.estado_inmueble not null default 'borrador',
  operation public.operacion_inmueble not null,
  agent_id uuid references public.agents(id) on delete set null,
  zone_id uuid references public.zones(id) on delete set null,
  -- Ubicación PÚBLICA aproximada (la exacta está en listing_private).
  location_public extensions.geography(Point, 4326),
  -- JSON canónico vigente (validado con zod en la aplicación antes de escribirse) y su versión.
  canonical jsonb not null default '{}'::jsonb,
  canonical_version int not null default 0,
  catalog_version text,
  -- Columnas derivadas del canónico para filtrar e indexar (las escribe el pipeline).
  price numeric(14, 2) check (price is null or price >= 0),
  currency char(3) not null default 'EUR',
  area_m2 numeric(10, 2) check (area_m2 is null or area_m2 > 0),
  bedrooms smallint check (bedrooms is null or bedrooms between 0 and 50),
  bathrooms smallint check (bathrooms is null or bathrooms between 0 and 50),
  property_type text,
  -- Origen e idempotencia de la ingesta.
  source text not null default 'manual' check (source in ('feed', 'manual', 'csv')),
  source_id text,
  content_hash text,
  -- Datos ficticios de desarrollo: nunca se mezclan con reales (D-014).
  is_fictitious boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agency_id, ref),
  unique (agency_id, source, source_id)
);
create index if not exists listings_search_idx on public.listings(agency_id, status, operation, zone_id, price);
create index if not exists listings_location_idx on public.listings using gist (location_public);
create index if not exists listings_ref_trgm_idx on public.listings using gin (lower(ref) extensions.gin_trgm_ops);
drop trigger if exists listings_touch on public.listings;
create trigger listings_touch before update on public.listings for each row execute function app.touch();
drop trigger if exists listings_audit on public.listings;
create trigger listings_audit after insert or update or delete on public.listings for each row execute function app.auditar();

-- Un inmueble publicado lleva fecha de publicación.
create or replace function app.inmueble_publicacion() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'publicado' and new.published_at is null then new.published_at := now(); end if;
  return new;
end $$;
drop trigger if exists listings_publicacion on public.listings;
create trigger listings_publicacion before insert or update of status on public.listings for each row execute function app.inmueble_publicacion();

-- Estados visibles en el portal.
create or replace function app.estado_visible(s public.estado_inmueble) returns boolean
language sql immutable parallel safe
set search_path = ''
as $$ select s in ('publicado', 'reservado') $$;

-- Datos internos: solo admin y agente de la agencia. Nunca llegan al portal ni al asistente.
create table if not exists public.listing_private (
  listing_id uuid primary key references public.listings(id) on delete cascade,
  agency_id uuid not null references public.agencies(id) on delete cascade,
  address_exact text,
  location_exact extensions.geography(Point, 4326),
  cadastral_ref text,
  owner_name text,
  owner_contact text,
  commission_pct numeric(5, 2),
  agent_notes text,
  updated_at timestamptz not null default now()
);
drop trigger if exists listing_private_touch on public.listing_private;
create trigger listing_private_touch before update on public.listing_private for each row execute function app.touch();

-- Evidencias deterministas (sección 3.2).
create table if not exists public.listing_evidence (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  agency_id uuid not null references public.agencies(id) on delete cascade,
  source public.fuente_evidencia not null,
  path text not null,
  raw text not null,
  parsed jsonb,
  source_weight numeric(4, 3) not null check (source_weight between 0 and 1),
  captured_at timestamptz not null default now(),
  content_hash text not null,
  unique (listing_id, source, path, content_hash)
);
create index if not exists listing_evidence_listing_idx on public.listing_evidence(listing_id);

-- Un campo del JSON canónico con su confianza, estado, método y evidencias (sección 3.3).
create table if not exists public.listing_fields (
  listing_id uuid not null references public.listings(id) on delete cascade,
  agency_id uuid not null references public.agencies(id) on delete cascade,
  field_id text not null check (field_id ~ '^[a-z][a-z0-9_]*$'),
  value jsonb,
  confidence numeric(4, 3) check (confidence between 0 and 1),
  status public.estado_campo not null,
  method public.metodo_campo not null,
  evidence_ids uuid[] not null default '{}',
  catalog_version text not null,
  -- Copia de la columna `public` del catálogo en el momento de escribir (para RLS).
  is_public boolean not null default false,
  -- Valores perdedores de una adjudicación y su motivo (auditoría).
  adjudication jsonb,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  primary key (listing_id, field_id),
  check (status <> 'no_consta' or value is null),
  check (method <> 'manual' or updated_by is not null)
);
create index if not exists listing_fields_review_idx on public.listing_fields(agency_id, status) where status in ('revisar', 'no_consta');

-- Las correcciones manuales siempre ganan: el pipeline no puede sobrescribirlas (sección 3.3).
create or replace function app.proteger_manual() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.method = 'manual' and new.method <> 'manual' then
    raise exception 'El campo % del inmueble % tiene una corrección manual y no se puede sobrescribir', old.field_id, old.listing_id
      using errcode = 'P0001', hint = 'correccion_manual';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists listing_fields_manual on public.listing_fields;
create trigger listing_fields_manual before update on public.listing_fields for each row execute function app.proteger_manual();
drop trigger if exists listing_fields_audit on public.listing_fields;
create trigger listing_fields_audit after insert or update or delete on public.listing_fields for each row execute function app.auditar();

create table if not exists public.listing_media (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  agency_id uuid not null references public.agencies(id) on delete cascade,
  kind public.tipo_medio not null default 'foto',
  storage_path text,
  url text,
  width int,
  height int,
  position int not null default 0,
  alt_es text,
  alt_en text,
  is_cover boolean not null default false,
  created_at timestamptz not null default now(),
  check (storage_path is not null or url is not null)
);
create index if not exists listing_media_listing_idx on public.listing_media(listing_id, position);
create unique index if not exists listing_media_one_cover on public.listing_media(listing_id) where is_cover;

create table if not exists public.listing_price_history (
  id bigint generated always as identity primary key,
  listing_id uuid not null references public.listings(id) on delete cascade,
  agency_id uuid not null references public.agencies(id) on delete cascade,
  price numeric(14, 2) not null check (price >= 0),
  currency char(3) not null default 'EUR',
  changed_at timestamptz not null default now()
);
create index if not exists listing_price_history_idx on public.listing_price_history(listing_id, changed_at desc);

-- Cada cambio de precio queda en el historial.
create or replace function app.historial_precio() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.price is not null and (tg_op = 'INSERT' or new.price is distinct from old.price) then
    insert into public.listing_price_history(listing_id, agency_id, price, currency) values (new.id, new.agency_id, new.price, new.currency);
  end if;
  return null;
end $$;
drop trigger if exists listings_precio on public.listings;
create trigger listings_precio after insert or update of price on public.listings for each row execute function app.historial_precio();

-- Textos del anuncio por idioma. Los traducidos por máquina se marcan (sección 2.1).
create table if not exists public.listing_translations (
  listing_id uuid not null references public.listings(id) on delete cascade,
  agency_id uuid not null references public.agencies(id) on delete cascade,
  locale text not null check (locale ~ '^[a-z]{2}$'),
  title text not null,
  description text not null default '',
  machine_translated boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (listing_id, locale)
);

create table if not exists public.listing_poi_distances (
  listing_id uuid not null references public.listings(id) on delete cascade,
  poi_id uuid not null references public.pois(id) on delete cascade,
  category public.categoria_poi not null,
  distance_m int not null check (distance_m >= 0),
  walk_min int,
  primary key (listing_id, poi_id)
);
create index if not exists listing_poi_distances_cat_idx on public.listing_poi_distances(listing_id, category, distance_m);

-- RLS -----------------------------------------------------------------------------------

alter table public.listings enable row level security;
alter table public.listing_private enable row level security;
alter table public.listing_evidence enable row level security;
alter table public.listing_fields enable row level security;
alter table public.listing_media enable row level security;
alter table public.listing_price_history enable row level security;
alter table public.listing_translations enable row level security;
alter table public.listing_poi_distances enable row level security;

-- Portal: solo publicados y reservados. Equipo: todos los de su agencia.
drop policy if exists listings_select_public on public.listings;
create policy listings_select_public on public.listings for select to anon, authenticated using (app.estado_visible(status));
drop policy if exists listings_select_staff on public.listings;
create policy listings_select_staff on public.listings for select to authenticated using (app.es_miembro(agency_id));
drop policy if exists listings_write_staff on public.listings;
create policy listings_write_staff on public.listings for all to authenticated
  using (app.es_miembro(agency_id, array['admin', 'agente', 'editor']::public.rol_agencia[]))
  with check (app.es_miembro(agency_id, array['admin', 'agente', 'editor']::public.rol_agencia[]));

drop policy if exists listing_private_staff on public.listing_private;
create policy listing_private_staff on public.listing_private for all to authenticated
  using (app.es_miembro(agency_id, array['admin', 'agente']::public.rol_agencia[]))
  with check (app.es_miembro(agency_id, array['admin', 'agente']::public.rol_agencia[]));

drop policy if exists listing_evidence_staff on public.listing_evidence;
create policy listing_evidence_staff on public.listing_evidence for select to authenticated using (app.es_miembro(agency_id));

-- Campos: en el portal solo los públicos de inmuebles visibles; el equipo ve y corrige todo.
drop policy if exists listing_fields_select_public on public.listing_fields;
create policy listing_fields_select_public on public.listing_fields for select to anon, authenticated
  using (is_public and exists (select 1 from public.listings l where l.id = listing_fields.listing_id and app.estado_visible(l.status)));
drop policy if exists listing_fields_staff on public.listing_fields;
create policy listing_fields_staff on public.listing_fields for all to authenticated
  using (app.es_miembro(agency_id, array['admin', 'agente', 'editor']::public.rol_agencia[]))
  with check (app.es_miembro(agency_id, array['admin', 'agente', 'editor']::public.rol_agencia[]));

-- Medios, historial, traducciones y distancias: visibles si el inmueble lo es.
do $$
declare t text;
begin
  foreach t in array array['listing_media', 'listing_price_history', 'listing_translations'] loop
    execute format('drop policy if exists %1$s_select_public on public.%1$s', t);
    execute format('create policy %1$s_select_public on public.%1$s for select to anon, authenticated
      using (exists (select 1 from public.listings l where l.id = %1$s.listing_id and app.estado_visible(l.status)))', t);
    execute format('drop policy if exists %1$s_staff on public.%1$s', t);
    execute format('create policy %1$s_staff on public.%1$s for all to authenticated
      using (app.es_miembro(agency_id, array[''admin'', ''agente'', ''editor'']::public.rol_agencia[]))
      with check (app.es_miembro(agency_id, array[''admin'', ''agente'', ''editor'']::public.rol_agencia[]))', t);
  end loop;
end $$;

drop policy if exists listing_poi_distances_select on public.listing_poi_distances;
create policy listing_poi_distances_select on public.listing_poi_distances for select to anon, authenticated
  using (exists (select 1 from public.listings l where l.id = listing_poi_distances.listing_id and (app.estado_visible(l.status) or app.es_miembro(l.agency_id))));

grant select on public.listings, public.listing_fields, public.listing_media, public.listing_price_history, public.listing_translations, public.listing_poi_distances to anon;
grant select, insert, update, delete on public.listings, public.listing_private, public.listing_fields, public.listing_media, public.listing_translations to authenticated;
grant select on public.listing_evidence, public.listing_price_history, public.listing_poi_distances to authenticated;
grant all on all tables in schema public to service_role;

-- ===== 0004_mercado_y_valoracion.sql =====
-- 0004 · Fuentes de datos (con base legal), comparables de mercado y valoraciones (sección 5).

do $$ begin
  create type public.tipo_precio as enum ('oferta', 'cierre');
exception when duplicate_object then null; end $$;

-- Cada adaptador de datos externos declara si hay licencia o permiso y su base legal (sección 3.1).
-- No se hace scraping de portales de terceros sin autorización.
create table if not exists public.data_sources (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid references public.agencies(id) on delete cascade,
  code text not null unique check (code ~ '^[a-z0-9_]+$'),
  name text not null,
  kind text not null check (kind in ('propia', 'datos_abiertos', 'licencia', 'web_autorizada')),
  legal_ok boolean not null default false,
  legal_basis text not null,
  robots_respected boolean,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  -- Una fuente sin base legal nunca puede estar activa.
  check (not active or legal_ok),
  check (kind <> 'web_autorizada' or robots_respected is true or not active)
);

create table if not exists public.market_comparables (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  source_id uuid not null references public.data_sources(id) on delete restrict,
  listing_id uuid references public.listings(id) on delete set null,
  zone_id uuid references public.zones(id) on delete set null,
  location extensions.geography(Point, 4326),
  property_type text not null,
  area_m2 numeric(10, 2) not null check (area_m2 > 0),
  price numeric(14, 2) not null check (price > 0),
  -- Siempre se distingue precio de oferta de precio de cierre, y se dice cuál se usa.
  price_kind public.tipo_precio not null,
  operation public.operacion_inmueble not null default 'venta',
  observed_at date not null,
  attributes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists market_comparables_zone_idx on public.market_comparables(agency_id, zone_id, property_type, observed_at desc);
create index if not exists market_comparables_location_idx on public.market_comparables using gist (location);

-- Solo se admiten comparables de fuentes con base legal.
create or replace function app.comparable_legal() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.data_sources s where s.id = new.source_id and s.legal_ok) then
    raise exception 'La fuente % no tiene base legal (legal_ok = false)', new.source_id using errcode = 'P0001', hint = 'fuente_sin_base_legal';
  end if;
  return new;
end $$;
drop trigger if exists market_comparables_legal on public.market_comparables;
create trigger market_comparables_legal before insert or update of source_id on public.market_comparables for each row execute function app.comparable_legal();

create table if not exists public.valuations (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  -- Sesión anónima (hash de la cookie; nunca la cookie en claro).
  session_hash text,
  input jsonb not null,
  result jsonb not null,
  low numeric(14, 2),
  high numeric(14, 2),
  comparables_n int not null default 0,
  price_kind public.tipo_precio not null,
  method text not null default 'comparables' check (method in ('comparables', 'modelo')),
  catalog_version text,
  created_at timestamptz not null default now(),
  check (low is null or high is null or low <= high)
);

alter table public.data_sources enable row level security;
alter table public.market_comparables enable row level security;
alter table public.valuations enable row level security;

drop policy if exists data_sources_staff on public.data_sources;
create policy data_sources_staff on public.data_sources for select to authenticated using (agency_id is null or app.es_miembro(agency_id));
drop policy if exists data_sources_admin on public.data_sources;
create policy data_sources_admin on public.data_sources for all to authenticated
  using (app.es_miembro(agency_id, array['admin']::public.rol_agencia[]))
  with check (app.es_miembro(agency_id, array['admin']::public.rol_agencia[]));

drop policy if exists market_comparables_staff on public.market_comparables;
create policy market_comparables_staff on public.market_comparables for select to authenticated using (app.es_miembro(agency_id));

drop policy if exists valuations_own on public.valuations;
create policy valuations_own on public.valuations for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists valuations_staff on public.valuations;
create policy valuations_staff on public.valuations for select to authenticated using (app.es_miembro(agency_id, array['admin', 'agente']::public.rol_agencia[]));

grant select on public.data_sources, public.market_comparables, public.valuations to authenticated;
grant insert, update, delete on public.data_sources to authenticated;
grant all on all tables in schema public to service_role;

-- ===== 0005_usuarios_y_asistente.sql =====
-- 0005 · Cuenta del portal (favoritos, búsquedas, alertas), asistente (conversaciones, mensajes,
-- ficha de búsqueda, decisiones de Jev) y consentimientos (RGPD).

do $$ begin
  create type public.resultado_puerta as enum ('actuar', 'confirmar', 'preguntar');
exception when duplicate_object then null; end $$;

create table if not exists public.favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  agency_id uuid not null references public.agencies(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

create table if not exists public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  agency_id uuid not null references public.agencies(id) on delete cascade,
  name text not null,
  -- Ficha de búsqueda (validada con zod en la aplicación).
  search_state jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists saved_searches_user_idx on public.saved_searches(user_id);

-- Alertas: con cuenta o solo con email, siempre con doble opt-in.
create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  email text not null,
  locale text not null default 'es' check (locale ~ '^[a-z]{2}$'),
  criteria jsonb not null,
  frequency text not null default 'diaria' check (frequency in ('inmediata', 'diaria', 'semanal')),
  confirm_token_hash text,
  confirmed_at timestamptz,
  unsubscribed_at timestamptz,
  last_sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists alerts_active_idx on public.alerts(agency_id) where confirmed_at is not null and unsubscribed_at is null;

-- Conversaciones del asistente. Las anónimas se identifican por el hash de la cookie de sesión y
-- se borran al caducar (retención configurable, sección 9).
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  session_hash text,
  locale text not null default 'es',
  started_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  expires_at timestamptz,
  summary jsonb,
  check (user_id is not null or session_hash is not null)
);
create index if not exists conversations_session_idx on public.conversations(session_hash) where session_hash is not null;
create index if not exists conversations_expiry_idx on public.conversations(expires_at) where expires_at is not null;

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  agency_id uuid not null references public.agencies(id) on delete cascade,
  role text not null check (role in ('usuario', 'asistente')),
  content text not null,
  -- Tarjetas, chips, borradores… (lo que se pintó), sin datos personales.
  payload jsonb,
  created_at timestamptz not null default now()
);
create index if not exists messages_conversation_idx on public.messages(conversation_id, created_at);

-- Ficha de búsqueda vigente (sección 4.5).
create table if not exists public.search_states (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  state jsonb not null,
  version int not null default 1,
  updated_at timestamptz not null default now(),
  check (conversation_id is not null or user_id is not null)
);
create unique index if not exists search_states_conversation_idx on public.search_states(conversation_id) where conversation_id is not null;

-- Auditoría de decisiones de Jev (principio 5).
create table if not exists public.jev_decisions (
  id bigint generated always as identity primary key,
  agency_id uuid not null references public.agencies(id) on delete cascade,
  purpose text not null,
  conversation_id uuid references public.conversations(id) on delete cascade,
  message_id uuid references public.messages(id) on delete set null,
  listing_id uuid references public.listings(id) on delete cascade,
  question_id text not null,
  question_type text not null check (question_type in ('choice', 'noul', 'score')),
  instructions jsonb,
  options jsonb,
  answer jsonb not null,
  chosen jsonb,
  gate_key text not null,
  gate jsonb not null,
  outcome public.resultado_puerta not null,
  catalog_version text not null,
  model text not null,
  cached boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists jev_decisions_conversation_idx on public.jev_decisions(conversation_id, created_at) where conversation_id is not null;
create index if not exists jev_decisions_listing_idx on public.jev_decisions(listing_id, created_at) where listing_id is not null;
create index if not exists jev_decisions_gate_idx on public.jev_decisions(agency_id, gate_key, created_at desc);

-- Consentimientos: registro inmutable (sección 9).
create table if not exists public.consents (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  -- Hash del email de quien consiente (sin cuenta); nunca el email en claro aquí.
  subject_hash text,
  purpose text not null check (purpose in ('contacto', 'visita', 'alertas', 'valoracion', 'cookies_analitica', 'marketing')),
  legal_basis text not null check (legal_basis in ('consentimiento', 'contrato', 'interes_legitimo', 'obligacion_legal')),
  granted boolean not null,
  text_version text not null,
  locale text not null default 'es',
  ip_hash text,
  created_at timestamptz not null default now(),
  check (user_id is not null or subject_hash is not null)
);

create or replace function app.inmutable() returns trigger
language plpgsql
set search_path = ''
as $$ begin raise exception 'La tabla % es de solo inserción', tg_table_name using errcode = 'P0001'; end $$;
drop trigger if exists consents_inmutable on public.consents;
create trigger consents_inmutable before update or delete on public.consents for each row execute function app.inmutable();

-- Retención: borra las conversaciones anónimas caducadas (lo llama el cron con service_role).
create or replace function app.purgar_conversaciones() returns int
language plpgsql security definer
set search_path = ''
as $$
declare n int;
begin
  delete from public.conversations where user_id is null and expires_at is not null and expires_at < now();
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function app.purgar_conversaciones() from public, anon, authenticated;
grant execute on function app.purgar_conversaciones() to service_role;

-- RLS -----------------------------------------------------------------------------------

alter table public.favorites enable row level security;
alter table public.saved_searches enable row level security;
alter table public.alerts enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.search_states enable row level security;
alter table public.jev_decisions enable row level security;
alter table public.consents enable row level security;

-- Lo del usuario, solo para el usuario.
drop policy if exists favorites_own on public.favorites;
create policy favorites_own on public.favorites for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists saved_searches_own on public.saved_searches;
create policy saved_searches_own on public.saved_searches for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists alerts_own on public.alerts;
create policy alerts_own on public.alerts for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists alerts_own_update on public.alerts;
create policy alerts_own_update on public.alerts for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists conversations_own on public.conversations;
create policy conversations_own on public.conversations for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists conversations_own_delete on public.conversations;
create policy conversations_own_delete on public.conversations for delete to authenticated using (user_id = (select auth.uid()));
drop policy if exists messages_own on public.messages;
create policy messages_own on public.messages for select to authenticated
  using (exists (select 1 from public.conversations c where c.id = messages.conversation_id and c.user_id = (select auth.uid())));
drop policy if exists search_states_own on public.search_states;
create policy search_states_own on public.search_states for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists consents_own on public.consents;
create policy consents_own on public.consents for select to authenticated using (user_id = (select auth.uid()));

-- Equipo: los admin ven conversaciones y decisiones (auditoría); los agentes, las alertas de su agencia.
drop policy if exists conversations_admin on public.conversations;
create policy conversations_admin on public.conversations for select to authenticated using (app.es_miembro(agency_id, array['admin']::public.rol_agencia[]));
drop policy if exists messages_admin on public.messages;
create policy messages_admin on public.messages for select to authenticated using (app.es_miembro(agency_id, array['admin']::public.rol_agencia[]));
drop policy if exists jev_decisions_admin on public.jev_decisions;
create policy jev_decisions_admin on public.jev_decisions for select to authenticated using (app.es_miembro(agency_id, array['admin']::public.rol_agencia[]));
drop policy if exists alerts_staff on public.alerts;
create policy alerts_staff on public.alerts for select to authenticated using (app.es_miembro(agency_id, array['admin', 'agente']::public.rol_agencia[]));
drop policy if exists consents_admin on public.consents;
create policy consents_admin on public.consents for select to authenticated using (app.es_miembro(agency_id, array['admin']::public.rol_agencia[]));

grant select, insert, delete on public.favorites to authenticated;
grant select, insert, update, delete on public.saved_searches to authenticated;
grant select, update on public.alerts to authenticated;
grant select, delete on public.conversations to authenticated;
grant select on public.messages, public.search_states, public.jev_decisions, public.consents to authenticated;
grant all on all tables in schema public to service_role;

-- ===== 0006_crm.sql =====
-- 0006 · CRM ligero: leads, visitas, franjas de los agentes, tareas y notas (sección 2.3).

do $$ begin
  create type public.estado_lead as enum ('nuevo', 'contactado', 'cualificado', 'visita', 'oferta', 'cerrado', 'descartado');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.estado_visita as enum ('solicitada', 'confirmada', 'realizada', 'cancelada', 'no_presentado');
exception when duplicate_object then null; end $$;

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  listing_id uuid references public.listings(id) on delete set null,
  agent_id uuid references public.agents(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  consent_id uuid references public.consents(id) on delete restrict,
  origin text not null check (origin in ('asistente', 'formulario', 'valoracion', 'telefono', 'crm_externo', 'manual')),
  kind text not null default 'contacto' check (kind in ('contacto', 'visita', 'pregunta_no_consta', 'valoracion', 'captacion')),
  status public.estado_lead not null default 'nuevo',
  name text,
  email text,
  phone text,
  message text,
  -- Pregunta sin dato en la ficha («¿tiene ascensor?» → no consta): alimenta la cola de revisión.
  asked_field text,
  search_criteria jsonb,
  -- Resumen de la conversación generado con plantillas (nunca texto libre de un modelo).
  conversation_summary text,
  score int check (score between 0 and 100),
  external_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Sin consentimiento registrado no hay datos de contacto (RGPD).
  check (consent_id is not null or (email is null and phone is null) or origin in ('telefono', 'manual', 'crm_externo'))
);
create index if not exists leads_agency_status_idx on public.leads(agency_id, status, created_at desc);
drop trigger if exists leads_touch on public.leads;
create trigger leads_touch before update on public.leads for each row execute function app.touch();
drop trigger if exists leads_audit on public.leads;
create trigger leads_audit after insert or update or delete on public.leads for each row execute function app.auditar();

create table if not exists public.agent_slots (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists agent_slots_agent_idx on public.agent_slots(agent_id, starts_at);

create table if not exists public.visits (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  agent_id uuid references public.agents(id) on delete set null,
  slot_id uuid references public.agent_slots(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.estado_visita not null default 'solicitada',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists visits_agent_idx on public.visits(agent_id, starts_at);
-- Una franja solo admite una visita viva.
create unique index if not exists visits_slot_unique on public.visits(slot_id) where slot_id is not null and status in ('solicitada', 'confirmada');
drop trigger if exists visits_touch on public.visits;
create trigger visits_touch before update on public.visits for each row execute function app.touch();
drop trigger if exists visits_audit on public.visits;
create trigger visits_audit after insert or update or delete on public.visits for each row execute function app.auditar();

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  assigned_to uuid references public.agents(id) on delete set null,
  lead_id uuid references public.leads(id) on delete cascade,
  listing_id uuid references public.listings(id) on delete cascade,
  title text not null,
  due_at timestamptz,
  done_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  author_id uuid references public.agents(id) on delete set null,
  lead_id uuid references public.leads(id) on delete cascade,
  listing_id uuid references public.listings(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  check (lead_id is not null or listing_id is not null)
);

alter table public.leads enable row level security;
alter table public.agent_slots enable row level security;
alter table public.visits enable row level security;
alter table public.tasks enable row level security;
alter table public.notes enable row level security;

-- CRM: admin y agentes de la agencia (el editor no ve datos personales).
do $$
declare t text;
begin
  foreach t in array array['leads', 'agent_slots', 'visits', 'tasks', 'notes'] loop
    execute format('drop policy if exists %1$s_staff on public.%1$s', t);
    execute format('create policy %1$s_staff on public.%1$s for all to authenticated
      using (app.es_miembro(agency_id, array[''admin'', ''agente'']::public.rol_agencia[]))
      with check (app.es_miembro(agency_id, array[''admin'', ''agente'']::public.rol_agencia[]))', t);
  end loop;
end $$;

-- El usuario con cuenta ve sus propias visitas y peticiones (derecho de acceso).
drop policy if exists leads_own on public.leads;
create policy leads_own on public.leads for select to authenticated using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.leads, public.agent_slots, public.visits, public.tasks, public.notes to authenticated;
grant all on all tables in schema public to service_role;

-- ===== 0007_operacion.sql =====
-- 0007 · Operación: cola de revisión del enriquecimiento, etiquetas de evaluación, versiones del
-- catálogo y cola de trabajos en segundo plano (ingesta y enriquecimiento nunca en la petición).

do $$ begin
  create type public.motivo_revision as enum ('campo_dudoso', 'conflicto', 'no_consta_preguntado');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.estado_revision as enum ('pendiente', 'confirmado', 'corregido', 'descartado');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.estado_trabajo as enum ('pendiente', 'en_curso', 'hecho', 'fallido');
exception when duplicate_object then null; end $$;

create table if not exists public.review_queue (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  field_id text not null,
  reason public.motivo_revision not null,
  proposed jsonb,
  confidence numeric(4, 3),
  evidence_ids uuid[] not null default '{}',
  -- Veces que usuarios han preguntado por este dato sin respuesta («campos más preguntados sin dato»).
  asked_count int not null default 0,
  status public.estado_revision not null default 'pendiente',
  resolution jsonb,
  resolved_by uuid,
  resolved_at timestamptz,
  catalog_version text,
  created_at timestamptz not null default now()
);
create unique index if not exists review_queue_pending_unique on public.review_queue(listing_id, field_id, reason) where status = 'pendiente';
create index if not exists review_queue_agency_idx on public.review_queue(agency_id, status, asked_count desc, created_at);

-- Cada corrección de la cola se guarda como etiqueta para la evaluación (sección 2.3).
create table if not exists public.eval_labels (
  id bigint generated always as identity primary key,
  agency_id uuid not null references public.agencies(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  field_id text not null,
  value jsonb,
  proposed jsonb,
  was_correct boolean not null,
  review_id uuid references public.review_queue(id) on delete set null,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.catalog_versions (
  version text primary key,
  kind text not null check (kind in ('datos', 'asistente')),
  hash text not null,
  compiled jsonb,
  eval_summary jsonb,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.jobs (
  id bigint generated always as identity primary key,
  agency_id uuid references public.agencies(id) on delete cascade,
  kind text not null check (kind ~ '^[a-z_.]+$'),
  payload jsonb not null default '{}'::jsonb,
  status public.estado_trabajo not null default 'pendiente',
  attempts int not null default 0,
  max_attempts int not null default 5 check (max_attempts between 1 and 20),
  run_after timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  -- Idempotencia: el mismo trabajo (p. ej. «enriquecer inmueble X con hash H») no se encola dos veces.
  dedupe_key text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists jobs_ready_idx on public.jobs(kind, run_after) where status = 'pendiente';
drop trigger if exists jobs_touch on public.jobs;
create trigger jobs_touch before update on public.jobs for each row execute function app.touch();

-- Reserva trabajos listos sin bloquear a otros workers. Los bloqueados más de 15 min se liberan.
create or replace function app.reservar_trabajos(tipo text, cuantos int, worker text)
returns setof public.jobs
language plpgsql security definer
set search_path = ''
as $$
begin
  update public.jobs set status = 'pendiente', locked_at = null, locked_by = null
  where status = 'en_curso' and locked_at < now() - interval '15 minutes';

  return query
  update public.jobs j set status = 'en_curso', locked_at = now(), locked_by = worker, attempts = j.attempts + 1
  where j.id in (
    select id from public.jobs
    where kind = tipo and status = 'pendiente' and run_after <= now()
    order by run_after, id
    limit greatest(1, least(cuantos, 100))
    for update skip locked
  )
  returning j.*;
end $$;

-- Cierra un trabajo: hecho, o reintento con backoff exponencial hasta max_attempts.
create or replace function app.terminar_trabajo(trabajo bigint, error text default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if error is null then
    update public.jobs set status = 'hecho', locked_at = null, last_error = null where id = trabajo;
  else
    update public.jobs set
      status = case when attempts >= max_attempts then 'fallido'::public.estado_trabajo else 'pendiente'::public.estado_trabajo end,
      run_after = now() + make_interval(secs => least(3600, 10 * power(2, attempts))),
      locked_at = null, locked_by = null, last_error = left(error, 2000)
    where id = trabajo;
  end if;
end $$;

revoke all on function app.reservar_trabajos(text, int, text) from public, anon, authenticated;
revoke all on function app.terminar_trabajo(bigint, text) from public, anon, authenticated;
grant execute on function app.reservar_trabajos(text, int, text) to service_role;
grant execute on function app.terminar_trabajo(bigint, text) to service_role;

alter table public.review_queue enable row level security;
alter table public.eval_labels enable row level security;
alter table public.catalog_versions enable row level security;
alter table public.jobs enable row level security;

drop policy if exists review_queue_staff on public.review_queue;
create policy review_queue_staff on public.review_queue for all to authenticated
  using (app.es_miembro(agency_id, array['admin', 'agente', 'editor']::public.rol_agencia[]))
  with check (app.es_miembro(agency_id, array['admin', 'agente', 'editor']::public.rol_agencia[]));
drop policy if exists eval_labels_staff on public.eval_labels;
create policy eval_labels_staff on public.eval_labels for select to authenticated using (app.es_miembro(agency_id));
drop policy if exists eval_labels_insert on public.eval_labels;
create policy eval_labels_insert on public.eval_labels for insert to authenticated
  with check (app.es_miembro(agency_id, array['admin', 'agente', 'editor']::public.rol_agencia[]) and created_by = (select auth.uid()));
-- Versiones del catálogo: lectura para el equipo (la escritura es del despliegue, con service_role).
drop policy if exists catalog_versions_staff on public.catalog_versions;
create policy catalog_versions_staff on public.catalog_versions for select to authenticated using (exists (select 1 from app.mis_agencias()));
-- jobs: sin políticas para anon/authenticated → solo service_role.

grant select, insert, update on public.review_queue to authenticated;
grant select, insert on public.eval_labels to authenticated;
grant select on public.catalog_versions to authenticated;
grant all on all tables in schema public to service_role;

-- ===== 0008_zonas_region_murcia.sql =====
-- 0008 · Datos de referencia: municipios y barrios de la Región de Murcia.
-- ARCHIVO GENERADO por `npm run zonas:sql` desde src/zonas/datos.ts. No editar a mano.
-- Centroides y colindancias APROXIMADOS hasta cargar las geometrías del CNIG (docs/DECISIONES.md, D-111).

insert into public.zones (level, path, slug, name, aliases, ine_code, centroid)
select 'municipio', v.path, v.slug, v.name, v.aliases, v.ine, v.centroid
from (values
  ('abanilla', 'abanilla', 'Abanilla', '{}'::text[], '30001', extensions.st_setsrid(extensions.st_makepoint(-1.041, 38.206), 4326)::extensions.geography),
  ('abaran', 'abaran', 'Abarán', '{}'::text[], '30002', extensions.st_setsrid(extensions.st_makepoint(-1.4, 38.204), 4326)::extensions.geography),
  ('aguilas', 'aguilas', 'Águilas', '{}'::text[], '30003', extensions.st_setsrid(extensions.st_makepoint(-1.5829, 37.4063), 4326)::extensions.geography),
  ('albudeite', 'albudeite', 'Albudeite', '{}'::text[], '30004', extensions.st_setsrid(extensions.st_makepoint(-1.386, 38.029), 4326)::extensions.geography),
  ('alcantarilla', 'alcantarilla', 'Alcantarilla', '{}'::text[], '30005', extensions.st_setsrid(extensions.st_makepoint(-1.217, 37.9694), 4326)::extensions.geography),
  ('aledo', 'aledo', 'Aledo', '{}'::text[], '30006', extensions.st_setsrid(extensions.st_makepoint(-1.573, 37.796), 4326)::extensions.geography),
  ('alguazas', 'alguazas', 'Alguazas', '{}'::text[], '30007', extensions.st_setsrid(extensions.st_makepoint(-1.242, 38.052), 4326)::extensions.geography),
  ('alhama-de-murcia', 'alhama-de-murcia', 'Alhama de Murcia', array['alhama']::text[], '30008', extensions.st_setsrid(extensions.st_makepoint(-1.4253, 37.8519), 4326)::extensions.geography),
  ('archena', 'archena', 'Archena', '{}'::text[], '30009', extensions.st_setsrid(extensions.st_makepoint(-1.3, 38.116), 4326)::extensions.geography),
  ('beniel', 'beniel', 'Beniel', '{}'::text[], '30010', extensions.st_setsrid(extensions.st_makepoint(-1.001, 38.046), 4326)::extensions.geography),
  ('blanca', 'blanca', 'Blanca', '{}'::text[], '30011', extensions.st_setsrid(extensions.st_makepoint(-1.374, 38.179), 4326)::extensions.geography),
  ('bullas', 'bullas', 'Bullas', '{}'::text[], '30012', extensions.st_setsrid(extensions.st_makepoint(-1.67, 38.046), 4326)::extensions.geography),
  ('calasparra', 'calasparra', 'Calasparra', '{}'::text[], '30013', extensions.st_setsrid(extensions.st_makepoint(-1.699, 38.23), 4326)::extensions.geography),
  ('campos-del-rio', 'campos-del-rio', 'Campos del Río', '{}'::text[], '30014', extensions.st_setsrid(extensions.st_makepoint(-1.355, 38.039), 4326)::extensions.geography),
  ('caravaca-de-la-cruz', 'caravaca-de-la-cruz', 'Caravaca de la Cruz', array['caravaca']::text[], '30015', extensions.st_setsrid(extensions.st_makepoint(-1.862, 38.106), 4326)::extensions.geography),
  ('cartagena', 'cartagena', 'Cartagena', array['cartajena', 'ctg']::text[], '30016', extensions.st_setsrid(extensions.st_makepoint(-0.9966, 37.6257), 4326)::extensions.geography),
  ('cehegin', 'cehegin', 'Cehegín', '{}'::text[], '30017', extensions.st_setsrid(extensions.st_makepoint(-1.799, 38.092), 4326)::extensions.geography),
  ('ceuti', 'ceuti', 'Ceutí', '{}'::text[], '30018', extensions.st_setsrid(extensions.st_makepoint(-1.273, 38.079), 4326)::extensions.geography),
  ('cieza', 'cieza', 'Cieza', '{}'::text[], '30019', extensions.st_setsrid(extensions.st_makepoint(-1.4189, 38.2394), 4326)::extensions.geography),
  ('fortuna', 'fortuna', 'Fortuna', '{}'::text[], '30020', extensions.st_setsrid(extensions.st_makepoint(-1.125, 38.181), 4326)::extensions.geography),
  ('fuente-alamo-de-murcia', 'fuente-alamo-de-murcia', 'Fuente Álamo de Murcia', array['fuente alamo']::text[], '30021', extensions.st_setsrid(extensions.st_makepoint(-1.169, 37.723), 4326)::extensions.geography),
  ('jumilla', 'jumilla', 'Jumilla', '{}'::text[], '30022', extensions.st_setsrid(extensions.st_makepoint(-1.329, 38.475), 4326)::extensions.geography),
  ('librilla', 'librilla', 'Librilla', '{}'::text[], '30023', extensions.st_setsrid(extensions.st_makepoint(-1.356, 37.887), 4326)::extensions.geography),
  ('lorca', 'lorca', 'Lorca', '{}'::text[], '30024', extensions.st_setsrid(extensions.st_makepoint(-1.7003, 37.6771), 4326)::extensions.geography),
  ('lorqui', 'lorqui', 'Lorquí', '{}'::text[], '30025', extensions.st_setsrid(extensions.st_makepoint(-1.251, 38.082), 4326)::extensions.geography),
  ('mazarron', 'mazarron', 'Mazarrón', array['mazaron']::text[], '30026', extensions.st_setsrid(extensions.st_makepoint(-1.3149, 37.599), 4326)::extensions.geography),
  ('molina-de-segura', 'molina-de-segura', 'Molina de Segura', array['molina']::text[], '30027', extensions.st_setsrid(extensions.st_makepoint(-1.2076, 38.0546), 4326)::extensions.geography),
  ('moratalla', 'moratalla', 'Moratalla', '{}'::text[], '30028', extensions.st_setsrid(extensions.st_makepoint(-1.891, 38.189), 4326)::extensions.geography),
  ('mula', 'mula', 'Mula', '{}'::text[], '30029', extensions.st_setsrid(extensions.st_makepoint(-1.49, 38.042), 4326)::extensions.geography),
  ('murcia', 'murcia', 'Murcia', array['murcia capital', 'murcia ciudad']::text[], '30030', extensions.st_setsrid(extensions.st_makepoint(-1.1307, 37.9922), 4326)::extensions.geography),
  ('ojos', 'ojos', 'Ojós', '{}'::text[], '30031', extensions.st_setsrid(extensions.st_makepoint(-1.344, 38.148), 4326)::extensions.geography),
  ('pliego', 'pliego', 'Pliego', '{}'::text[], '30032', extensions.st_setsrid(extensions.st_makepoint(-1.501, 37.99), 4326)::extensions.geography),
  ('puerto-lumbreras', 'puerto-lumbreras', 'Puerto Lumbreras', '{}'::text[], '30033', extensions.st_setsrid(extensions.st_makepoint(-1.809, 37.563), 4326)::extensions.geography),
  ('ricote', 'ricote', 'Ricote', '{}'::text[], '30034', extensions.st_setsrid(extensions.st_makepoint(-1.365, 38.153), 4326)::extensions.geography),
  ('san-javier', 'san-javier', 'San Javier', '{}'::text[], '30035', extensions.st_setsrid(extensions.st_makepoint(-0.8375, 37.8063), 4326)::extensions.geography),
  ('san-pedro-del-pinatar', 'san-pedro-del-pinatar', 'San Pedro del Pinatar', array['san pedro', 'pinatar']::text[], '30036', extensions.st_setsrid(extensions.st_makepoint(-0.791, 37.835), 4326)::extensions.geography),
  ('torre-pacheco', 'torre-pacheco', 'Torre-Pacheco', array['torre pacheco', 'pacheco']::text[], '30037', extensions.st_setsrid(extensions.st_makepoint(-0.9533, 37.7431), 4326)::extensions.geography),
  ('las-torres-de-cotillas', 'las-torres-de-cotillas', 'Las Torres de Cotillas', array['torres de cotillas']::text[], '30038', extensions.st_setsrid(extensions.st_makepoint(-1.241, 38.028), 4326)::extensions.geography),
  ('totana', 'totana', 'Totana', '{}'::text[], '30039', extensions.st_setsrid(extensions.st_makepoint(-1.5003, 37.7689), 4326)::extensions.geography),
  ('ulea', 'ulea', 'Ulea', '{}'::text[], '30040', extensions.st_setsrid(extensions.st_makepoint(-1.329, 38.141), 4326)::extensions.geography),
  ('la-union', 'la-union', 'La Unión', array['la union']::text[], '30041', extensions.st_setsrid(extensions.st_makepoint(-0.877, 37.619), 4326)::extensions.geography),
  ('villanueva-del-rio-segura', 'villanueva-del-rio-segura', 'Villanueva del Río Segura', array['villanueva del segura']::text[], '30042', extensions.st_setsrid(extensions.st_makepoint(-1.323, 38.136), 4326)::extensions.geography),
  ('yecla', 'yecla', 'Yecla', '{}'::text[], '30043', extensions.st_setsrid(extensions.st_makepoint(-1.115, 38.6135), 4326)::extensions.geography),
  ('santomera', 'santomera', 'Santomera', '{}'::text[], '30044', extensions.st_setsrid(extensions.st_makepoint(-1.049, 38.061), 4326)::extensions.geography),
  ('los-alcazares', 'los-alcazares', 'Los Alcázares', array['alcazares']::text[], '30045', extensions.st_setsrid(extensions.st_makepoint(-0.8505, 37.7442), 4326)::extensions.geography)
) as v(path, slug, name, aliases, ine, centroid)
on conflict (path) do update set name = excluded.name, aliases = excluded.aliases, ine_code = excluded.ine_code, centroid = excluded.centroid;

insert into public.zones (level, parent_id, path, slug, name, aliases, centroid)
select 'barrio', p.id, v.path, v.slug, v.name, v.aliases, v.centroid
from (values
  ('murcia', 'murcia/centro', 'centro', 'Centro', array['casco antiguo', 'centro historico', 'catedral', 'santa catalina', 'san bartolome', 'san nicolas', 'san pedro murcia', 'plaza circular', 'gran via']::text[], extensions.st_setsrid(extensions.st_makepoint(-1.1285, 37.984), 4326)::extensions.geography),
  ('murcia', 'murcia/el-carmen', 'el-carmen', 'El Carmen', array['barrio del carmen', 'carmen']::text[], extensions.st_setsrid(extensions.st_makepoint(-1.13, 37.978), 4326)::extensions.geography),
  ('murcia', 'murcia/la-flota', 'la-flota', 'La Flota', array['flota']::text[], extensions.st_setsrid(extensions.st_makepoint(-1.126, 37.9985), 4326)::extensions.geography),
  ('murcia', 'murcia/vistalegre', 'vistalegre', 'Vistalegre', array['vista alegre']::text[], extensions.st_setsrid(extensions.st_makepoint(-1.119, 38), 4326)::extensions.geography),
  ('murcia', 'murcia/santa-maria-de-gracia', 'santa-maria-de-gracia', 'Santa María de Gracia', '{}'::text[], extensions.st_setsrid(extensions.st_makepoint(-1.137, 37.997), 4326)::extensions.geography),
  ('murcia', 'murcia/el-ranero', 'el-ranero', 'El Ranero', array['ranero']::text[], extensions.st_setsrid(extensions.st_makepoint(-1.137, 38.005), 4326)::extensions.geography),
  ('murcia', 'murcia/juan-carlos-i', 'juan-carlos-i', 'Juan Carlos I', array['zona norte', 'juan carlos primero']::text[], extensions.st_setsrid(extensions.st_makepoint(-1.127, 38.01), 4326)::extensions.geography),
  ('murcia', 'murcia/infante-juan-manuel', 'infante-juan-manuel', 'Infante Juan Manuel', array['infante']::text[], extensions.st_setsrid(extensions.st_makepoint(-1.125, 37.975), 4326)::extensions.geography),
  ('murcia', 'murcia/santiago-el-mayor', 'santiago-el-mayor', 'Santiago el Mayor', '{}'::text[], extensions.st_setsrid(extensions.st_makepoint(-1.14, 37.976), 4326)::extensions.geography),
  ('murcia', 'murcia/espinardo', 'espinardo', 'Espinardo', '{}'::text[], extensions.st_setsrid(extensions.st_makepoint(-1.157, 38.011), 4326)::extensions.geography),
  ('murcia', 'murcia/el-palmar', 'el-palmar', 'El Palmar', array['palmar']::text[], extensions.st_setsrid(extensions.st_makepoint(-1.16, 37.938), 4326)::extensions.geography),
  ('murcia', 'murcia/la-alberca', 'la-alberca', 'La Alberca', array['alberca']::text[], extensions.st_setsrid(extensions.st_makepoint(-1.133, 37.94), 4326)::extensions.geography),
  ('murcia', 'murcia/churra', 'churra', 'Churra', '{}'::text[], extensions.st_setsrid(extensions.st_makepoint(-1.145, 38.025), 4326)::extensions.geography),
  ('murcia', 'murcia/cabezo-de-torres', 'cabezo-de-torres', 'Cabezo de Torres', '{}'::text[], extensions.st_setsrid(extensions.st_makepoint(-1.119, 38.029), 4326)::extensions.geography),
  ('murcia', 'murcia/puente-tocinos', 'puente-tocinos', 'Puente Tocinos', '{}'::text[], extensions.st_setsrid(extensions.st_makepoint(-1.096, 37.987), 4326)::extensions.geography),
  ('murcia', 'murcia/guadalupe', 'guadalupe', 'Guadalupe', '{}'::text[], extensions.st_setsrid(extensions.st_makepoint(-1.165, 38.002), 4326)::extensions.geography),
  ('murcia', 'murcia/beniajan', 'beniajan', 'Beniaján', '{}'::text[], extensions.st_setsrid(extensions.st_makepoint(-1.066, 37.979), 4326)::extensions.geography),
  ('murcia', 'murcia/algezares', 'algezares', 'Algezares', '{}'::text[], extensions.st_setsrid(extensions.st_makepoint(-1.111, 37.951), 4326)::extensions.geography),
  ('murcia', 'murcia/sangonera-la-verde', 'sangonera-la-verde', 'Sangonera la Verde', array['sangonera']::text[], extensions.st_setsrid(extensions.st_makepoint(-1.201, 37.936), 4326)::extensions.geography),
  ('murcia', 'murcia/torreaguera', 'torreaguera', 'Torreagüera', '{}'::text[], extensions.st_setsrid(extensions.st_makepoint(-1.055, 37.979), 4326)::extensions.geography),
  ('cartagena', 'cartagena/casco-antiguo', 'casco-antiguo', 'Casco Antiguo', array['centro', 'casco historico']::text[], extensions.st_setsrid(extensions.st_makepoint(-0.984, 37.599), 4326)::extensions.geography),
  ('cartagena', 'cartagena/ensanche', 'ensanche', 'Ensanche', array['ensanche almarjal', 'almarjal']::text[], extensions.st_setsrid(extensions.st_makepoint(-0.98, 37.609), 4326)::extensions.geography),
  ('cartagena', 'cartagena/barrio-peral', 'barrio-peral', 'Barrio Peral', array['peral']::text[], extensions.st_setsrid(extensions.st_makepoint(-0.992, 37.616), 4326)::extensions.geography),
  ('cartagena', 'cartagena/san-anton', 'san-anton', 'San Antón', '{}'::text[], extensions.st_setsrid(extensions.st_makepoint(-0.974, 37.613), 4326)::extensions.geography),
  ('cartagena', 'cartagena/los-dolores', 'los-dolores', 'Los Dolores', '{}'::text[], extensions.st_setsrid(extensions.st_makepoint(-0.993, 37.625), 4326)::extensions.geography),
  ('cartagena', 'cartagena/santa-lucia', 'santa-lucia', 'Santa Lucía', '{}'::text[], extensions.st_setsrid(extensions.st_makepoint(-0.971, 37.597), 4326)::extensions.geography),
  ('cartagena', 'cartagena/cabo-de-palos', 'cabo-de-palos', 'Cabo de Palos', '{}'::text[], extensions.st_setsrid(extensions.st_makepoint(-0.693, 37.632), 4326)::extensions.geography),
  ('cartagena', 'cartagena/la-manga', 'la-manga', 'La Manga (Cartagena)', array['la manga', 'la manga del mar menor', 'manga']::text[], extensions.st_setsrid(extensions.st_makepoint(-0.715, 37.64), 4326)::extensions.geography),
  ('cartagena', 'cartagena/playa-honda', 'playa-honda', 'Playa Honda', '{}'::text[], extensions.st_setsrid(extensions.st_makepoint(-0.755, 37.639), 4326)::extensions.geography),
  ('cartagena', 'cartagena/mar-de-cristal', 'mar-de-cristal', 'Mar de Cristal', '{}'::text[], extensions.st_setsrid(extensions.st_makepoint(-0.747, 37.65), 4326)::extensions.geography),
  ('cartagena', 'cartagena/los-belones', 'los-belones', 'Los Belones', '{}'::text[], extensions.st_setsrid(extensions.st_makepoint(-0.776, 37.62), 4326)::extensions.geography),
  ('cartagena', 'cartagena/los-urrutias', 'los-urrutias', 'Los Urrutias', '{}'::text[], extensions.st_setsrid(extensions.st_makepoint(-0.833, 37.677), 4326)::extensions.geography),
  ('cartagena', 'cartagena/los-nietos', 'los-nietos', 'Los Nietos', '{}'::text[], extensions.st_setsrid(extensions.st_makepoint(-0.793, 37.651), 4326)::extensions.geography),
  ('cartagena', 'cartagena/islas-menores', 'islas-menores', 'Islas Menores', '{}'::text[], extensions.st_setsrid(extensions.st_makepoint(-0.803, 37.645), 4326)::extensions.geography),
  ('cartagena', 'cartagena/el-algar', 'el-algar', 'El Algar', array['algar']::text[], extensions.st_setsrid(extensions.st_makepoint(-0.871, 37.649), 4326)::extensions.geography),
  ('cartagena', 'cartagena/pozo-estrecho', 'pozo-estrecho', 'Pozo Estrecho', '{}'::text[], extensions.st_setsrid(extensions.st_makepoint(-0.995, 37.705), 4326)::extensions.geography),
  ('cartagena', 'cartagena/la-aljorra', 'la-aljorra', 'La Aljorra', array['aljorra']::text[], extensions.st_setsrid(extensions.st_makepoint(-1.062, 37.689), 4326)::extensions.geography),
  ('cartagena', 'cartagena/isla-plana', 'isla-plana', 'Isla Plana', '{}'::text[], extensions.st_setsrid(extensions.st_makepoint(-1.192, 37.578), 4326)::extensions.geography),
  ('cartagena', 'cartagena/canteras', 'canteras', 'Canteras', '{}'::text[], extensions.st_setsrid(extensions.st_makepoint(-1.035, 37.613), 4326)::extensions.geography),
  ('san-javier', 'san-javier/centro', 'centro', 'San Javier centro', array['centro']::text[], extensions.st_setsrid(extensions.st_makepoint(-0.8375, 37.8063), 4326)::extensions.geography),
  ('san-javier', 'san-javier/santiago-de-la-ribera', 'santiago-de-la-ribera', 'Santiago de la Ribera', array['la ribera', 'santiago ribera', 'ribera']::text[], extensions.st_setsrid(extensions.st_makepoint(-0.807, 37.797), 4326)::extensions.geography),
  ('san-javier', 'san-javier/la-manga', 'la-manga', 'La Manga (San Javier)', array['la manga', 'la manga del mar menor', 'manga']::text[], extensions.st_setsrid(extensions.st_makepoint(-0.752, 37.72), 4326)::extensions.geography),
  ('san-javier', 'san-javier/el-mirador', 'el-mirador', 'El Mirador', '{}'::text[], extensions.st_setsrid(extensions.st_makepoint(-0.821, 37.817), 4326)::extensions.geography),
  ('san-javier', 'san-javier/roda', 'roda', 'Roda', '{}'::text[], extensions.st_setsrid(extensions.st_makepoint(-0.872, 37.803), 4326)::extensions.geography),
  ('san-pedro-del-pinatar', 'san-pedro-del-pinatar/centro', 'centro', 'San Pedro del Pinatar centro', array['centro']::text[], extensions.st_setsrid(extensions.st_makepoint(-0.791, 37.835), 4326)::extensions.geography),
  ('san-pedro-del-pinatar', 'san-pedro-del-pinatar/lo-pagan', 'lo-pagan', 'Lo Pagán', array['lo pagan']::text[], extensions.st_setsrid(extensions.st_makepoint(-0.78, 37.819), 4326)::extensions.geography),
  ('san-pedro-del-pinatar', 'san-pedro-del-pinatar/los-cuarteros', 'los-cuarteros', 'Los Cuarteros', '{}'::text[], extensions.st_setsrid(extensions.st_makepoint(-0.808, 37.842), 4326)::extensions.geography),
  ('los-alcazares', 'los-alcazares/centro', 'centro', 'Los Alcázares centro', array['centro']::text[], extensions.st_setsrid(extensions.st_makepoint(-0.8505, 37.7442), 4326)::extensions.geography),
  ('los-alcazares', 'los-alcazares/los-narejos', 'los-narejos', 'Los Narejos', array['narejos']::text[], extensions.st_setsrid(extensions.st_makepoint(-0.842, 37.755), 4326)::extensions.geography),
  ('torre-pacheco', 'torre-pacheco/centro', 'centro', 'Torre-Pacheco centro', array['centro']::text[], extensions.st_setsrid(extensions.st_makepoint(-0.9533, 37.7431), 4326)::extensions.geography),
  ('torre-pacheco', 'torre-pacheco/roldan', 'roldan', 'Roldán', '{}'::text[], extensions.st_setsrid(extensions.st_makepoint(-0.972, 37.771), 4326)::extensions.geography),
  ('torre-pacheco', 'torre-pacheco/balsicas', 'balsicas', 'Balsicas', '{}'::text[], extensions.st_setsrid(extensions.st_makepoint(-0.954, 37.813), 4326)::extensions.geography),
  ('torre-pacheco', 'torre-pacheco/dolores-de-pacheco', 'dolores-de-pacheco', 'Dolores de Pacheco', array['dolores']::text[], extensions.st_setsrid(extensions.st_makepoint(-0.934, 37.778), 4326)::extensions.geography),
  ('mazarron', 'mazarron/centro', 'centro', 'Mazarrón centro', array['centro', 'mazarron pueblo']::text[], extensions.st_setsrid(extensions.st_makepoint(-1.3149, 37.599), 4326)::extensions.geography),
  ('mazarron', 'mazarron/puerto-de-mazarron', 'puerto-de-mazarron', 'Puerto de Mazarrón', array['el puerto', 'puerto mazarron']::text[], extensions.st_setsrid(extensions.st_makepoint(-1.256, 37.565), 4326)::extensions.geography),
  ('mazarron', 'mazarron/bolnuevo', 'bolnuevo', 'Bolnuevo', '{}'::text[], extensions.st_setsrid(extensions.st_makepoint(-1.298, 37.56), 4326)::extensions.geography),
  ('mazarron', 'mazarron/camposol', 'camposol', 'Camposol', '{}'::text[], extensions.st_setsrid(extensions.st_makepoint(-1.402, 37.597), 4326)::extensions.geography),
  ('aguilas', 'aguilas/centro', 'centro', 'Águilas centro', array['centro']::text[], extensions.st_setsrid(extensions.st_makepoint(-1.5829, 37.4063), 4326)::extensions.geography),
  ('aguilas', 'aguilas/calabardina', 'calabardina', 'Calabardina', '{}'::text[], extensions.st_setsrid(extensions.st_makepoint(-1.53, 37.43), 4326)::extensions.geography),
  ('lorca', 'lorca/centro', 'centro', 'Lorca centro', array['centro']::text[], extensions.st_setsrid(extensions.st_makepoint(-1.7003, 37.6771), 4326)::extensions.geography),
  ('lorca', 'lorca/la-hoya', 'la-hoya', 'La Hoya', '{}'::text[], extensions.st_setsrid(extensions.st_makepoint(-1.644, 37.739), 4326)::extensions.geography),
  ('lorca', 'lorca/ramonete', 'ramonete', 'Ramonete', '{}'::text[], extensions.st_setsrid(extensions.st_makepoint(-1.499, 37.556), 4326)::extensions.geography),
  ('molina-de-segura', 'molina-de-segura/centro', 'centro', 'Molina de Segura centro', array['centro']::text[], extensions.st_setsrid(extensions.st_makepoint(-1.2076, 38.0546), 4326)::extensions.geography),
  ('molina-de-segura', 'molina-de-segura/altorreal', 'altorreal', 'Altorreal', '{}'::text[], extensions.st_setsrid(extensions.st_makepoint(-1.229, 38.085), 4326)::extensions.geography),
  ('molina-de-segura', 'molina-de-segura/la-alcayna', 'la-alcayna', 'La Alcayna', array['alcayna']::text[], extensions.st_setsrid(extensions.st_makepoint(-1.241, 38.088), 4326)::extensions.geography)
) as v(parent_path, path, slug, name, aliases, centroid)
join public.zones p on p.path = v.parent_path
on conflict (path) do update set parent_id = excluded.parent_id, name = excluded.name, aliases = excluded.aliases, centroid = excluded.centroid;

insert into public.zone_adjacency (zone_id, neighbor_id)
select a.id, b.id
from (values
  ('abanilla', 'jumilla'),
  ('abanilla', 'molina-de-segura'),
  ('abanilla', 'santomera'),
  ('abaran', 'blanca'),
  ('abaran', 'cieza'),
  ('aguilas', 'lorca'),
  ('aguilas', 'puerto-lumbreras'),
  ('albudeite', 'campos-del-rio'),
  ('albudeite', 'mula'),
  ('alcantarilla', 'las-torres-de-cotillas'),
  ('alcantarilla', 'murcia'),
  ('aledo', 'lorca'),
  ('aledo', 'totana'),
  ('alguazas', 'campos-del-rio'),
  ('alguazas', 'ceuti'),
  ('alguazas', 'las-torres-de-cotillas'),
  ('alguazas', 'molina-de-segura'),
  ('alhama-de-murcia', 'fuente-alamo-de-murcia'),
  ('alhama-de-murcia', 'librilla'),
  ('alhama-de-murcia', 'mula'),
  ('alhama-de-murcia', 'murcia'),
  ('alhama-de-murcia', 'totana'),
  ('archena', 'blanca'),
  ('archena', 'ceuti'),
  ('archena', 'fortuna'),
  ('archena', 'lorqui'),
  ('archena', 'molina-de-segura'),
  ('archena', 'ulea'),
  ('archena', 'villanueva-del-rio-segura'),
  ('beniel', 'murcia'),
  ('blanca', 'abaran'),
  ('blanca', 'archena'),
  ('blanca', 'cieza'),
  ('blanca', 'ojos'),
  ('blanca', 'ricote'),
  ('blanca', 'ulea'),
  ('bullas', 'cehegin'),
  ('bullas', 'mula'),
  ('calasparra', 'caravaca-de-la-cruz'),
  ('calasparra', 'cehegin'),
  ('calasparra', 'cieza'),
  ('campos-del-rio', 'albudeite'),
  ('campos-del-rio', 'alguazas'),
  ('campos-del-rio', 'las-torres-de-cotillas'),
  ('campos-del-rio', 'mula'),
  ('caravaca-de-la-cruz', 'calasparra'),
  ('caravaca-de-la-cruz', 'cehegin'),
  ('caravaca-de-la-cruz', 'lorca'),
  ('caravaca-de-la-cruz', 'moratalla'),
  ('cartagena', 'fuente-alamo-de-murcia'),
  ('cartagena', 'la-union'),
  ('cartagena', 'los-alcazares'),
  ('cartagena', 'mazarron'),
  ('cartagena', 'murcia'),
  ('cartagena', 'san-javier'),
  ('cartagena', 'torre-pacheco'),
  ('cehegin', 'bullas'),
  ('cehegin', 'calasparra'),
  ('cehegin', 'caravaca-de-la-cruz'),
  ('cehegin', 'lorca'),
  ('cehegin', 'mula'),
  ('ceuti', 'alguazas'),
  ('ceuti', 'archena'),
  ('ceuti', 'lorqui'),
  ('ceuti', 'molina-de-segura'),
  ('cieza', 'abaran'),
  ('cieza', 'blanca'),
  ('cieza', 'calasparra'),
  ('cieza', 'fortuna'),
  ('cieza', 'jumilla'),
  ('cieza', 'moratalla'),
  ('cieza', 'ricote'),
  ('fortuna', 'archena'),
  ('fortuna', 'cieza'),
  ('fortuna', 'jumilla'),
  ('fortuna', 'molina-de-segura'),
  ('fortuna', 'santomera'),
  ('fuente-alamo-de-murcia', 'alhama-de-murcia'),
  ('fuente-alamo-de-murcia', 'cartagena'),
  ('fuente-alamo-de-murcia', 'mazarron'),
  ('fuente-alamo-de-murcia', 'murcia'),
  ('fuente-alamo-de-murcia', 'torre-pacheco'),
  ('jumilla', 'abanilla'),
  ('jumilla', 'cieza'),
  ('jumilla', 'fortuna'),
  ('jumilla', 'yecla'),
  ('librilla', 'alhama-de-murcia'),
  ('librilla', 'mula'),
  ('librilla', 'murcia'),
  ('lorca', 'aguilas'),
  ('lorca', 'aledo'),
  ('lorca', 'caravaca-de-la-cruz'),
  ('lorca', 'cehegin'),
  ('lorca', 'mazarron'),
  ('lorca', 'mula'),
  ('lorca', 'puerto-lumbreras'),
  ('lorca', 'totana'),
  ('lorqui', 'archena'),
  ('lorqui', 'ceuti'),
  ('lorqui', 'molina-de-segura'),
  ('mazarron', 'cartagena'),
  ('mazarron', 'fuente-alamo-de-murcia'),
  ('mazarron', 'lorca'),
  ('mazarron', 'totana'),
  ('molina-de-segura', 'abanilla'),
  ('molina-de-segura', 'alguazas'),
  ('molina-de-segura', 'archena'),
  ('molina-de-segura', 'ceuti'),
  ('molina-de-segura', 'fortuna'),
  ('molina-de-segura', 'las-torres-de-cotillas'),
  ('molina-de-segura', 'lorqui'),
  ('molina-de-segura', 'murcia'),
  ('moratalla', 'caravaca-de-la-cruz'),
  ('moratalla', 'cieza'),
  ('mula', 'albudeite'),
  ('mula', 'alhama-de-murcia'),
  ('mula', 'bullas'),
  ('mula', 'campos-del-rio'),
  ('mula', 'cehegin'),
  ('mula', 'librilla'),
  ('mula', 'lorca'),
  ('mula', 'pliego'),
  ('mula', 'totana'),
  ('murcia', 'alcantarilla'),
  ('murcia', 'alhama-de-murcia'),
  ('murcia', 'beniel'),
  ('murcia', 'cartagena'),
  ('murcia', 'fuente-alamo-de-murcia'),
  ('murcia', 'las-torres-de-cotillas'),
  ('murcia', 'librilla'),
  ('murcia', 'molina-de-segura'),
  ('murcia', 'san-javier'),
  ('murcia', 'santomera'),
  ('murcia', 'torre-pacheco'),
  ('ojos', 'blanca'),
  ('ojos', 'ricote'),
  ('ojos', 'ulea'),
  ('pliego', 'mula'),
  ('puerto-lumbreras', 'aguilas'),
  ('puerto-lumbreras', 'lorca'),
  ('ricote', 'blanca'),
  ('ricote', 'cieza'),
  ('ricote', 'ojos'),
  ('ricote', 'ulea'),
  ('san-javier', 'cartagena'),
  ('san-javier', 'los-alcazares'),
  ('san-javier', 'murcia'),
  ('san-javier', 'san-pedro-del-pinatar'),
  ('san-javier', 'torre-pacheco'),
  ('san-pedro-del-pinatar', 'san-javier'),
  ('torre-pacheco', 'cartagena'),
  ('torre-pacheco', 'fuente-alamo-de-murcia'),
  ('torre-pacheco', 'la-union'),
  ('torre-pacheco', 'los-alcazares'),
  ('torre-pacheco', 'murcia'),
  ('torre-pacheco', 'san-javier'),
  ('las-torres-de-cotillas', 'alcantarilla'),
  ('las-torres-de-cotillas', 'alguazas'),
  ('las-torres-de-cotillas', 'campos-del-rio'),
  ('las-torres-de-cotillas', 'molina-de-segura'),
  ('las-torres-de-cotillas', 'murcia'),
  ('totana', 'aledo'),
  ('totana', 'alhama-de-murcia'),
  ('totana', 'lorca'),
  ('totana', 'mazarron'),
  ('totana', 'mula'),
  ('ulea', 'archena'),
  ('ulea', 'blanca'),
  ('ulea', 'ojos'),
  ('ulea', 'ricote'),
  ('ulea', 'villanueva-del-rio-segura'),
  ('la-union', 'cartagena'),
  ('la-union', 'torre-pacheco'),
  ('villanueva-del-rio-segura', 'archena'),
  ('villanueva-del-rio-segura', 'ulea'),
  ('yecla', 'jumilla'),
  ('santomera', 'abanilla'),
  ('santomera', 'fortuna'),
  ('santomera', 'murcia'),
  ('los-alcazares', 'cartagena'),
  ('los-alcazares', 'san-javier'),
  ('los-alcazares', 'torre-pacheco')
) as v(a, b)
join public.zones a on a.path = v.a
join public.zones b on b.path = v.b
on conflict do nothing;

-- Con geometrías oficiales cargadas, las colindancias se recalculan a partir de ellas.
create or replace function app.recalcular_colindancias() returns int
language plpgsql security definer
set search_path = ''
as $$
declare n int;
begin
  insert into public.zone_adjacency (zone_id, neighbor_id)
  select a.id, b.id from public.zones a join public.zones b
    on a.id <> b.id and a.level = b.level and a.geom is not null and b.geom is not null
   and extensions.st_touches(a.geom::extensions.geometry, b.geom::extensions.geometry)
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function app.recalcular_colindancias() from public, anon, authenticated;
grant execute on function app.recalcular_colindancias() to service_role;

-- ===== 0009_sde_persistencia.sql =====
-- 0009 · Persistencia del pipeline SDE y cola de trabajos accesible por la API (solo service_role).
--
-- sde_guardar() escribe en UNA transacción todo lo que produce el enriquecimiento de un inmueble:
-- ficha, datos privados, evidencias, campos canónicos (sin tocar las correcciones manuales),
-- cola de revisión, decisiones de Jev, traducciones, medios y distancias a POI.

create or replace function public.sde_contexto(p_agency uuid, p_source text, p_source_id text)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'listing_id', l.id,
    'content_hash', l.content_hash,
    'manuales', coalesce((
      select jsonb_object_agg(f.field_id, jsonb_build_object(
        'value', f.value, 'confidence', f.confidence, 'status', f.status, 'method', f.method,
        'evidenceIds', to_jsonb(f.evidence_ids), 'catalogVersion', f.catalog_version))
      from public.listing_fields f where f.listing_id = l.id and f.method = 'manual'), '{}'::jsonb)
  )
  from public.listings l
  where l.agency_id = p_agency and l.source = p_source and l.source_id = p_source_id
$$;

create or replace function public.sde_guardar(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_agency uuid := (p ->> 'agency_id')::uuid;
  v_l jsonb := p -> 'listing';
  v_id uuid;
  v_prev jsonb;
  v_version int;
  v_cambio boolean;
  v_zone uuid;
begin
  select id into v_zone from public.zones where path = v_l ->> 'zone_path';

  select id, canonical, canonical_version into v_id, v_prev, v_version
  from public.listings
  where agency_id = v_agency and source = v_l ->> 'source' and source_id = v_l ->> 'source_id'
  for update;

  v_cambio := v_prev is null or v_prev is distinct from (v_l -> 'canonical');

  if v_id is null then
    insert into public.listings (agency_id, ref, slug, status, operation, zone_id, location_public, canonical, canonical_version,
      catalog_version, price, currency, area_m2, bedrooms, bathrooms, property_type, source, source_id, content_hash, is_fictitious)
    values (v_agency, v_l ->> 'ref', v_l ->> 'slug', coalesce((v_l ->> 'status')::public.estado_inmueble, 'borrador'),
      (v_l ->> 'operation')::public.operacion_inmueble, v_zone,
      case when v_l ? 'lat' then extensions.st_setsrid(extensions.st_makepoint((v_l ->> 'lon')::float8, (v_l ->> 'lat')::float8), 4326)::extensions.geography end,
      v_l -> 'canonical', 1, v_l ->> 'catalog_version', (v_l ->> 'price')::numeric, coalesce(v_l ->> 'currency', 'EUR'),
      (v_l ->> 'area_m2')::numeric, (v_l ->> 'bedrooms')::smallint, (v_l ->> 'bathrooms')::smallint, v_l ->> 'property_type',
      v_l ->> 'source', v_l ->> 'source_id', v_l ->> 'content_hash', coalesce((v_l ->> 'is_fictitious')::boolean, false))
    returning id, canonical_version into v_id, v_version;
  else
    -- El estado lo gestiona el equipo: el pipeline no lo cambia en inmuebles existentes.
    update public.listings set
      slug = v_l ->> 'slug', operation = (v_l ->> 'operation')::public.operacion_inmueble, zone_id = v_zone,
      location_public = case when v_l ? 'lat' then extensions.st_setsrid(extensions.st_makepoint((v_l ->> 'lon')::float8, (v_l ->> 'lat')::float8), 4326)::extensions.geography else location_public end,
      canonical = v_l -> 'canonical',
      canonical_version = canonical_version + case when v_cambio then 1 else 0 end,
      catalog_version = v_l ->> 'catalog_version', price = (v_l ->> 'price')::numeric, area_m2 = (v_l ->> 'area_m2')::numeric,
      bedrooms = (v_l ->> 'bedrooms')::smallint, bathrooms = (v_l ->> 'bathrooms')::smallint, property_type = v_l ->> 'property_type',
      content_hash = v_l ->> 'content_hash'
    where id = v_id
    returning canonical_version into v_version;
  end if;

  if p ? 'private' then
    insert into public.listing_private (listing_id, agency_id, address_exact, location_exact, cadastral_ref)
    values (v_id, v_agency, p -> 'private' ->> 'address_exact',
      case when (p -> 'private') ? 'lat' then extensions.st_setsrid(extensions.st_makepoint((p -> 'private' ->> 'lon')::float8, (p -> 'private' ->> 'lat')::float8), 4326)::extensions.geography end,
      p -> 'private' ->> 'cadastral_ref')
    on conflict (listing_id) do update set
      address_exact = coalesce(excluded.address_exact, public.listing_private.address_exact),
      location_exact = coalesce(excluded.location_exact, public.listing_private.location_exact),
      cadastral_ref = coalesce(excluded.cadastral_ref, public.listing_private.cadastral_ref);
  end if;

  insert into public.listing_evidence (id, listing_id, agency_id, source, path, raw, parsed, source_weight, captured_at, content_hash)
  select (e ->> 'id')::uuid, v_id, v_agency, (e ->> 'source')::public.fuente_evidencia, e ->> 'path', e ->> 'raw', e -> 'parsed',
    (e ->> 'sourceWeight')::numeric, (e ->> 'capturedAt')::timestamptz, md5(e ->> 'raw')
  from jsonb_array_elements(coalesce(p -> 'evidence', '[]'::jsonb)) e
  on conflict do nothing;

  -- Campos: las correcciones manuales nunca se sobrescriben (se saltan, sin error).
  insert into public.listing_fields (listing_id, agency_id, field_id, value, confidence, status, method, evidence_ids, catalog_version, is_public, adjudication)
  select v_id, v_agency, f ->> 'field_id', f -> 'value', (f ->> 'confidence')::numeric, (f ->> 'status')::public.estado_campo,
    (f ->> 'method')::public.metodo_campo,
    array(select jsonb_array_elements_text(coalesce(f -> 'evidence_ids', '[]'::jsonb)))::uuid[],
    f ->> 'catalog_version', coalesce((f ->> 'is_public')::boolean, false), f -> 'adjudication'
  from jsonb_array_elements(coalesce(p -> 'fields', '[]'::jsonb)) f
  where f ->> 'method' <> 'manual'
  on conflict (listing_id, field_id) do update set
    value = excluded.value, confidence = excluded.confidence, status = excluded.status, method = excluded.method,
    evidence_ids = excluded.evidence_ids, catalog_version = excluded.catalog_version, is_public = excluded.is_public,
    adjudication = excluded.adjudication
  where public.listing_fields.method <> 'manual';

  insert into public.review_queue (agency_id, listing_id, field_id, reason, proposed, confidence, evidence_ids, catalog_version)
  select v_agency, v_id, r ->> 'field_id', (r ->> 'reason')::public.motivo_revision, r -> 'proposed', (r ->> 'confidence')::numeric,
    array(select jsonb_array_elements_text(coalesce(r -> 'evidence_ids', '[]'::jsonb)))::uuid[], r ->> 'catalog_version'
  from jsonb_array_elements(coalesce(p -> 'reviews', '[]'::jsonb)) r
  where not exists (select 1 from public.listing_fields lf where lf.listing_id = v_id and lf.field_id = r ->> 'field_id' and lf.method = 'manual')
  on conflict (listing_id, field_id, reason) where status = 'pendiente' do update set
    proposed = excluded.proposed, confidence = excluded.confidence, evidence_ids = excluded.evidence_ids, catalog_version = excluded.catalog_version;

  insert into public.jev_decisions (agency_id, purpose, listing_id, question_id, question_type, instructions, options, answer, chosen, gate_key, gate, outcome, catalog_version, model, cached, created_at)
  select v_agency, d ->> 'purpose', v_id, d ->> 'questionId', d ->> 'questionType', d -> 'instructions', d -> 'options', d -> 'answer', d -> 'chosen',
    d ->> 'gateKey', d -> 'gate', (d ->> 'outcome')::public.resultado_puerta, d ->> 'catalogVersion', d ->> 'model', coalesce((d ->> 'cached')::boolean, false),
    coalesce((d ->> 'createdAt')::timestamptz, now())
  from jsonb_array_elements(coalesce(p -> 'decisions', '[]'::jsonb)) d;

  insert into public.listing_translations (listing_id, agency_id, locale, title, description, machine_translated)
  select v_id, v_agency, t ->> 'locale', t ->> 'title', coalesce(t ->> 'description', ''), coalesce((t ->> 'machine_translated')::boolean, false)
  from jsonb_array_elements(coalesce(p -> 'translations', '[]'::jsonb)) t
  on conflict (listing_id, locale) do update set title = excluded.title, description = excluded.description, machine_translated = excluded.machine_translated, updated_at = now();

  if p ? 'media' then
    delete from public.listing_media where listing_id = v_id and storage_path is null;
    insert into public.listing_media (listing_id, agency_id, kind, url, position, is_cover)
    select v_id, v_agency, 'foto', m ->> 'url', (m ->> 'position')::int, (m ->> 'position')::int = 0
    from jsonb_array_elements(p -> 'media') m;
  end if;

  if p ? 'poi_distances' then
    delete from public.listing_poi_distances where listing_id = v_id;
    insert into public.listing_poi_distances (listing_id, poi_id, category, distance_m, walk_min)
    select v_id, (d ->> 'poi_id')::uuid, (d ->> 'category')::public.categoria_poi, (d ->> 'distance_m')::int, (d ->> 'walk_min')::int
    from jsonb_array_elements(p -> 'poi_distances') d
    where exists (select 1 from public.pois where id = (d ->> 'poi_id')::uuid);
  end if;

  return jsonb_build_object('listing_id', v_id, 'canonical_version', v_version, 'cambio', v_cambio);
end $$;

-- Cola de trabajos por la API: envoltorios de app.* solo para service_role.
create or replace function public.trabajos_encolar(p_kind text, p_payload jsonb, p_dedupe text default null, p_agency uuid default null, p_max_attempts int default 5)
returns bigint
language sql security definer
set search_path = ''
as $$
  insert into public.jobs (agency_id, kind, payload, dedupe_key, max_attempts)
  values (p_agency, p_kind, p_payload, p_dedupe, p_max_attempts)
  on conflict (dedupe_key) do nothing
  returning id
$$;

create or replace function public.trabajos_reservar(p_kind text, p_n int, p_worker text)
returns setof public.jobs
language sql security definer
set search_path = ''
as $$ select * from app.reservar_trabajos(p_kind, p_n, p_worker) $$;

create or replace function public.trabajos_terminar(p_id bigint, p_error text default null)
returns void
language sql security definer
set search_path = ''
as $$ select app.terminar_trabajo(p_id, p_error) $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.sde_contexto(uuid, text, text)', 'public.sde_guardar(jsonb)',
    'public.trabajos_encolar(text, jsonb, text, uuid, int)', 'public.trabajos_reservar(text, int, text)', 'public.trabajos_terminar(bigint, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- ===== 0010_portal_lectura.sql =====
-- 0010 · Lectura del portal: búsqueda con filtros, facetas y ficha. SECURITY INVOKER: RLS decide
-- qué ve cada cual (el portal solo ve publicados/reservados y campos públicos).

create index if not exists listing_fields_rasgo_idx on public.listing_fields(field_id, listing_id) where status in ('confirmado', 'probable');

-- Posición de la planta en el resumen (el asistente permite «sin bajos»).
create or replace function public.inmueble_planta(l public.listings) returns text
language sql stable
set search_path = ''
as $$ select f.value #>> '{}' from public.listing_fields f where f.listing_id = l.id and f.field_id = 'planta_tipo' and f.status in ('confirmado', 'probable') $$;
grant execute on function public.inmueble_planta(public.listings) to anon, authenticated, service_role;

-- Qué valor de cada campo cuenta como «tener el rasgo». Generado desde src/portal/rasgos.ts
-- (un test comprueba que coinciden).
create or replace function public.es_rasgo(f public.listing_fields) returns boolean
language sql immutable
set search_path = ''
as $$ select
    -- rasgos:inicio
    (f.field_id = 'terraza' and f.value = 'true'::jsonb)
    or (f.field_id = 'balcon' and f.value = 'true'::jsonb)
    or (f.field_id = 'ascensor' and f.value = 'true'::jsonb)
    or (f.field_id = 'garaje' and f.value #>> '{}' in ('incluido', 'opcional'))
    or (f.field_id = 'piscina' and f.value #>> '{}' in ('privada', 'comunitaria'))
    or (f.field_id = 'trastero' and f.value = 'true'::jsonb)
    or (f.field_id = 'aire_acondicionado' and f.value = 'true'::jsonb)
    or (f.field_id = 'calefaccion' and f.value = 'true'::jsonb)
    or (f.field_id = 'exterior' and f.value #>> '{}' in ('exterior'))
    or (f.field_id = 'amueblado' and f.value = 'true'::jsonb)
    or (f.field_id = 'accesible' and f.value = 'true'::jsonb)
    or (f.field_id = 'vistas' and f.value #>> '{}' in ('mar', 'montana', 'ciudad', 'jardin'))
    or (f.field_id = 'luminosidad' and f.value #>> '{}' in ('luminoso', 'muy_luminoso'))
    or (f.field_id = 'ruido' and f.value #>> '{}' in ('tranquilo', 'muy_tranquilo'))
    or (f.field_id = 'estado' and f.value #>> '{}' in ('reformado', 'a_estrenar'))
    -- rasgos:fin
$$;
grant execute on function public.es_rasgo(public.listing_fields) to anon, authenticated, service_role;

-- Resumen de un inmueble para tarjetas y mapa.
create or replace function public.inmueble_resumen(l public.listings)
returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', l.id, 'ref', l.ref, 'slug', l.slug, 'operacion', l.operation, 'tipo', l.property_type,
    'titulo', coalesce((select t.title from public.listing_translations t where t.listing_id = l.id and t.locale = 'es'), l.ref),
    'zonaPath', z.path, 'zonaNombre', z.name, 'municipioNombre', coalesce(m.name, z.name),
    'precio', l.price, 'precioAnterior', (select (f.value #>> '{}')::numeric from public.listing_fields f where f.listing_id = l.id and f.field_id = 'precio_anterior' and f.value is not null),
    'superficie', l.area_m2, 'habitaciones', l.bedrooms, 'banos', l.bathrooms, 'plantaTipo', public.inmueble_planta(l),
    'lat', extensions.st_y(l.location_public::extensions.geometry), 'lon', extensions.st_x(l.location_public::extensions.geometry),
    'foto', (select coalesce(md.url, md.storage_path) from public.listing_media md where md.listing_id = l.id order by md.is_cover desc, md.position limit 1),
    'rasgos', coalesce((select jsonb_agg(jsonb_build_object('campo', f.field_id, 'status', f.status))
                        from public.listing_fields f
                        where f.listing_id = l.id and f.is_public and f.status in ('confirmado', 'probable')
                          and public.es_rasgo(f)), '[]'::jsonb),
    'publicadoEn', coalesce(l.published_at, l.created_at), 'ficticio', l.is_fictitious)
  from public.zones z left join public.zones m on m.id = z.parent_id
  where z.id = l.zone_id
$$;

create or replace function public.buscar_inmuebles(f jsonb)
returns jsonb
language plpgsql stable
set search_path = ''
as $$
declare
  v_zona text := f ->> 'zona';
  v_pagina int := greatest(1, coalesce((f ->> 'pagina')::int, 1));
  v_por int := least(48, greatest(1, coalesce((f ->> 'porPagina')::int, 12)));
  v_con text[] := array(select jsonb_array_elements_text(coalesce(f -> 'con', '[]'::jsonb)));
  v_tipos text[] := array(select jsonb_array_elements_text(coalesce(f -> 'tipos', '[]'::jsonb)));
  resultado jsonb;
begin
  with base as (
    select l.* from public.listings l
    left join public.zones z on z.id = l.zone_id
    where l.status in ('publicado', 'reservado')
      and (l.operation::text = f ->> 'operacion' or (f ->> 'operacion' = 'alquiler' and l.operation = 'alquiler_vacacional' and false))
      and (v_zona is null or z.path = v_zona or z.path like v_zona || '/%')
      and ((f ->> 'precioMin') is null or l.price >= (f ->> 'precioMin')::numeric)
      and ((f ->> 'precioMax') is null or l.price <= (f ->> 'precioMax')::numeric)
      and ((f ->> 'habMin') is null or coalesce(l.bedrooms, 0) >= (f ->> 'habMin')::int)
      and ((f ->> 'banosMin') is null or coalesce(l.bathrooms, 0) >= (f ->> 'banosMin')::int)
      and ((f ->> 'm2Min') is null or coalesce(l.area_m2, 0) >= (f ->> 'm2Min')::numeric)
      and not exists (
        select 1 from unnest(v_con) c(campo)
        where not exists (select 1 from public.listing_fields lf where lf.listing_id = l.id and lf.field_id = c.campo and lf.status in ('confirmado', 'probable')
                           and lf.is_public and public.es_rasgo(lf)))
  ), filtrados as (
    select * from base where cardinality(v_tipos) = 0 or property_type = any(v_tipos)
  ), ordenados as (
    select b.id, row_number() over (order by
      case when f ->> 'orden' = 'precio_asc' then b.price end asc nulls last,
      case when f ->> 'orden' = 'precio_desc' then b.price end desc nulls last,
      case when f ->> 'orden' = 'm2_precio_asc' then b.price / nullif(b.area_m2, 0) end asc nulls last,
      case when f ->> 'orden' = 'superficie_desc' then b.area_m2 end desc nulls last,
      coalesce(b.published_at, b.created_at) desc, b.ref) as n
    from filtrados b
  )
  select jsonb_build_object(
    'total', (select count(*) from filtrados),
    'items', coalesce((select jsonb_agg(public.inmueble_resumen(l) order by o.n) from ordenados o join public.listings l on l.id = o.id where o.n > (v_pagina - 1) * v_por and o.n <= v_pagina * v_por), '[]'::jsonb),
    'puntos', coalesce((select jsonb_agg(jsonb_build_object('ref', ref, 'precio', price, 'lat', extensions.st_y(location_public::extensions.geometry), 'lon', extensions.st_x(location_public::extensions.geometry))) from filtrados where location_public is not null), '[]'::jsonb),
    'facetas', jsonb_build_object(
      'tipos', coalesce((select jsonb_agg(jsonb_build_object('valor', t, 'n', n) order by n desc) from (select coalesce(property_type, 'otro') t, count(*) n from base group by 1) x), '[]'::jsonb),
      'zonas', coalesce((select jsonb_agg(jsonb_build_object('valor', t, 'n', n) order by n desc) from (select split_part(z.path, '/', 1) t, count(*) n from filtrados b join public.zones z on z.id = b.zone_id group by 1) x), '[]'::jsonb))
  ) into resultado;
  return resultado;
end $$;

create or replace function public.ficha_inmueble(p_operacion text, p_slug text)
returns jsonb
language sql stable
set search_path = ''
as $$
  select public.inmueble_resumen(l) || jsonb_build_object(
    'descripcion', coalesce((select t.description from public.listing_translations t where t.listing_id = l.id and t.locale = 'es'), ''),
    'descripcionTraducida', false,
    'campos', coalesce((select jsonb_object_agg(f.field_id, jsonb_build_object('value', f.value, 'confidence', f.confidence, 'status', f.status, 'evidenceIds', to_jsonb(f.evidence_ids), 'method', f.method, 'catalogVersion', f.catalog_version)) from public.listing_fields f where f.listing_id = l.id), '{}'::jsonb),
    'fotos', coalesce((select jsonb_agg(coalesce(md.url, md.storage_path) order by md.is_cover desc, md.position) from public.listing_media md where md.listing_id = l.id), '[]'::jsonb),
    'distancias', coalesce((select jsonb_agg(jsonb_build_object('categoria', d.category, 'nombre', p.name, 'metros', d.distance_m, 'minutos', d.walk_min) order by d.category, d.distance_m) from public.listing_poi_distances d join public.pois p on p.id = d.poi_id where d.listing_id = l.id), '[]'::jsonb),
    'agente', (select jsonb_build_object('nombre', a.display_name, 'telefono', a.public_phone, 'email', a.public_email) from public.agents a where a.id = l.agent_id))
  from public.listings l
  where l.slug = p_slug and (l.operation::text = p_operacion or (p_operacion = 'alquiler' and l.operation = 'alquiler_vacacional'))
  limit 1
$$;

grant execute on function public.inmueble_resumen(public.listings), public.buscar_inmuebles(jsonb), public.ficha_inmueble(text, text) to anon, authenticated, service_role;

-- ===== 0011_rendimiento.sql =====
-- 0011 · Rendimiento de lectura del portal.
-- · Índices para la ficha (por slug), los listados «recientes» y el prefijo de zona.
-- · Una sola llamada para toda la oferta publicada (antes: páginas de 48 en bucle).
-- · Resúmenes y fichas por referencia (favoritos y comparador) sin descargar toda la oferta.
-- · Estadística de zona calculada en SQL con TODA la muestra (antes: solo los 48 primeros).

create index if not exists listings_slug_idx on public.listings(slug);
create index if not exists listings_publicados_idx on public.listings(operation, published_at desc) where status in ('publicado', 'reservado');
create index if not exists zones_path_prefix_idx on public.zones(path text_pattern_ops);

-- Toda la oferta publicada, en una llamada (RLS decide qué ve cada cual).
create or replace function public.inmuebles_publicados()
returns jsonb
language sql stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(public.inmueble_resumen(l) order by l.published_at desc nulls last, l.ref), '[]'::jsonb)
  from public.listings l
  where l.status in ('publicado', 'reservado')
$$;

-- Resúmenes por referencia, en el orden pedido (máximo 50).
create or replace function public.inmuebles_por_ref(p_refs text[])
returns jsonb
language sql stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(public.inmueble_resumen(l) order by array_position(p_refs, l.ref)), '[]'::jsonb)
  from public.listings l
  where l.ref = any (p_refs[1:50]) and l.status in ('publicado', 'reservado')
$$;

-- Fichas completas por referencia (comparador, máximo 3).
create or replace function public.fichas_por_ref(p_refs text[])
returns jsonb
language sql stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(public.ficha_inmueble(case when l.operation = 'venta' then 'venta' else 'alquiler' end, l.slug) order by array_position(p_refs, l.ref)), '[]'::jsonb)
  from public.listings l
  where l.ref = any (p_refs[1:3]) and l.status in ('publicado', 'reservado')
$$;

-- Mediana y cuartiles de €/m² de una zona (y sus barrios), con toda la muestra. Misma semántica
-- que estadisticaZona() en TypeScript: interpolación lineal, redondeo a entero, mínimo 3.
create or replace function public.estadistica_zona(p_path text, p_operacion text)
returns jsonb
language sql stable
set search_path = ''
as $$
  with m as (
    select l.price / l.area_m2 as m2
    from public.listings l
    join public.zones z on z.id = l.zone_id
    where l.status in ('publicado', 'reservado')
      and l.operation::text = p_operacion
      and (z.path = p_path or z.path like p_path || '/%')
      and l.price > 0 and l.area_m2 > 0
  ), c as (
    select count(*) as n,
           percentile_cont(0.5) within group (order by m2) as p50,
           percentile_cont(0.25) within group (order by m2) as p25,
           percentile_cont(0.75) within group (order by m2) as p75
    from m
  )
  select jsonb_build_object(
    'path', p_path,
    'n', n,
    'medianaM2', case when n >= 3 then round(p50::numeric)::text end,
    'p25M2', case when n >= 3 then round(p25::numeric)::text end,
    'p75M2', case when n >= 3 then round(p75::numeric)::text end)
  from c
$$;

grant execute on function public.inmuebles_publicados(), public.inmuebles_por_ref(text[]), public.fichas_por_ref(text[]), public.estadistica_zona(text, text) to anon, authenticated, service_role;

-- ===== 0012_contacto.sql =====
-- 0012 · Conversión: registrar una petición de contacto o de visita desde la web o el asistente.
-- Una sola función, invocable SOLO desde el servidor (service_role): valida, guarda el
-- consentimiento RGPD, crea el lead y, si se pidió visita con fecha, la visita «solicitada».
-- Todo en una transacción: o se guarda completo o no se guarda nada.

create or replace function public.registrar_contacto(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_listing public.listings;
  v_agency uuid;
  v_consent uuid;
  v_lead uuid;
  v_tipo text := coalesce(p ->> 'tipo', 'contacto');
  v_email text := nullif(lower(trim(p ->> 'email')), '');
  v_telefono text := nullif(trim(p ->> 'telefono'), '');
  v_fecha date := nullif(p ->> 'fecha', '')::date;
  v_franja text := coalesce(p ->> 'franja', 'indiferente');
  v_inicio timestamptz;
begin
  if v_tipo not in ('contacto', 'visita', 'pregunta_no_consta') then
    raise exception 'tipo no válido: %', v_tipo using errcode = '22023';
  end if;
  if v_email is null and v_telefono is null then
    raise exception 'hace falta un email o un teléfono' using errcode = '22023';
  end if;
  if coalesce((p ->> 'consentimiento')::boolean, false) is not true then
    raise exception 'sin consentimiento no se guardan datos de contacto' using errcode = '22023';
  end if;
  if coalesce(p ->> 'sujeto_hash', '') = '' then
    raise exception 'falta sujeto_hash' using errcode = '22023';
  end if;

  if p ? 'ref' and p ->> 'ref' <> '' then
    select l.* into v_listing from public.listings l
    where l.ref = p ->> 'ref' and l.status in ('publicado', 'reservado')
    limit 1;
    if v_listing.id is null then
      raise exception 'inmueble no disponible: %', p ->> 'ref' using errcode = '22023';
    end if;
    v_agency := v_listing.agency_id;
  else
    select a.id into v_agency from public.agencies a order by a.created_at limit 1;
  end if;
  if v_agency is null then
    raise exception 'no hay agencia configurada' using errcode = '22023';
  end if;

  insert into public.consents (agency_id, subject_hash, purpose, legal_basis, granted, text_version, locale, ip_hash)
  values (v_agency, p ->> 'sujeto_hash', case when v_tipo = 'visita' then 'visita' else 'contacto' end, 'consentimiento', true,
          coalesce(p ->> 'texto_version', 'v1'), coalesce(p ->> 'locale', 'es'), nullif(p ->> 'ip_hash', ''))
  returning id into v_consent;

  insert into public.leads (agency_id, listing_id, agent_id, consent_id, origin, kind, name, email, phone, message, asked_field, search_criteria, conversation_summary)
  values (v_agency, v_listing.id, v_listing.agent_id, v_consent,
          case when p ->> 'origen' = 'asistente' then 'asistente' else 'formulario' end,
          v_tipo, nullif(trim(p ->> 'nombre'), ''), v_email, v_telefono, nullif(trim(p ->> 'mensaje'), ''),
          nullif(p ->> 'campo', ''),
          case when p ? 'busqueda' then p -> 'busqueda' else null end,
          nullif(p ->> 'resumen', ''))
  returning id into v_lead;

  -- Visita con fecha: franja orientativa (mañana 10-13 h, tarde 17-20 h). El agente la confirma.
  if v_tipo = 'visita' and v_fecha is not null and v_listing.id is not null then
    v_inicio := (v_fecha + case when v_franja = 'tarde' then time '17:00' else time '10:00' end) at time zone 'Europe/Madrid';
    insert into public.visits (agency_id, lead_id, listing_id, agent_id, starts_at, ends_at, status, notes)
    values (v_agency, v_lead, v_listing.id, v_listing.agent_id, v_inicio, v_inicio + interval '3 hours', 'solicitada',
            'Franja preferida: ' || v_franja);
  end if;

  return v_lead;
end;
$$;

revoke all on function public.registrar_contacto(jsonb) from public, anon, authenticated;
grant execute on function public.registrar_contacto(jsonb) to service_role;

-- Bandeja del CRM: leads con su inmueble y su visita, para admin y agentes (RLS de leads).
create or replace view public.crm_bandeja
with (security_invoker = true) as
select
  ld.id, ld.agency_id, ld.created_at, ld.updated_at, ld.status, ld.kind, ld.origin,
  ld.name, ld.email, ld.phone, ld.message, ld.asked_field,
  l.ref as listing_ref, l.slug as listing_slug, l.operation as listing_operation, z.path as listing_zona_path,
  v.starts_at as visita_inicio, v.status as visita_estado
from public.leads ld
left join public.listings l on l.id = ld.listing_id
left join public.zones z on z.id = l.zone_id
left join lateral (
  select vi.starts_at, vi.status from public.visits vi where vi.lead_id = ld.id order by vi.created_at desc limit 1
) v on true;

grant select on public.crm_bandeja to authenticated;
