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
