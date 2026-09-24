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
