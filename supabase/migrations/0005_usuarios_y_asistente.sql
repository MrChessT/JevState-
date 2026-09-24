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
