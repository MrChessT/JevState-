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
