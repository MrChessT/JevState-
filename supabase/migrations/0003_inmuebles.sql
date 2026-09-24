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
