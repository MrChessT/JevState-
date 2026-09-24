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
