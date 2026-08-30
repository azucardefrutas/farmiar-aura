-- Batallas de Aura: esquema inicial para torneo, solicitudes, votos y tiempo real.
-- La evolución de producción posterior a este esquema base está versionada en
-- supabase/migrations/20260830013000_complete_tournament_flow.sql.

create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (char_length(nombre) between 3 and 100),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  status text not null default 'draft' check (status in ('draft', 'registration', 'ready', 'live', 'finished', 'archived')),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table public.participant_registrations (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  submitter_id uuid not null,
  nombre text not null check (char_length(nombre) between 2 and 60),
  apellidos text not null check (char_length(apellidos) between 2 and 80),
  carrera text not null check (char_length(carrera) between 2 and 100),
  grupo text not null check (char_length(grupo) between 1 and 40),
  alias text check (alias is null or char_length(alias) between 2 and 50),
  instagram text check (instagram is null or instagram ~ '^@?[A-Za-z0-9._]{1,30}$'),
  foto_url text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  revisado_por uuid,
  revisado_en timestamptz,
  creado_en timestamptz not null default now(),
  unique (tournament_id, submitter_id)
);

create table public.contestants (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  registration_id uuid unique references public.participant_registrations(id) on delete set null,
  nombre text not null check (char_length(nombre) between 2 and 100),
  carrera text not null check (char_length(carrera) between 2 and 100),
  foto_url text,
  status text not null default 'approved' check (status in ('approved', 'withdrawn')),
  creado_en timestamptz not null default now()
);

create table public.rounds (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  round_number integer not null check (round_number > 0),
  nombre text not null check (char_length(nombre) between 2 and 50),
  creado_en timestamptz not null default now(),
  unique (tournament_id, round_number)
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  round_id uuid not null references public.rounds(id) on delete cascade,
  round_number integer not null check (round_number > 0),
  bracket_position integer not null check (bracket_position > 0),
  contestant_a_id uuid references public.contestants(id) on delete restrict,
  contestant_b_id uuid references public.contestants(id) on delete restrict,
  status text not null default 'scheduled' check (status in ('scheduled', 'live', 'paused', 'finished', 'cancelled')),
  starts_at timestamptz,
  ends_at timestamptz,
  duration_seconds integer not null default 120 check (duration_seconds between 30 and 3600),
  remaining_seconds integer check (remaining_seconds is null or remaining_seconds >= 0),
  winner_id uuid references public.contestants(id) on delete restrict,
  final_votes_a integer,
  final_votes_b integer,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (tournament_id, round_number, bracket_position),
  check (contestant_a_id is null or contestant_b_id is null or contestant_a_id <> contestant_b_id)
);

create table public.votes (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  voter_id uuid not null,
  contestant_id uuid not null references public.contestants(id) on delete restrict,
  creado_en timestamptz not null default now(),
  constraint one_vote_per_match unique (match_id, voter_id)
);

create table public.administrators (
  id uuid primary key default gen_random_uuid(),
  usuario text not null unique check (usuario ~ '^[a-zA-Z0-9._-]{3,40}$'),
  contrasenia_hash text not null,
  rol text not null default 'collaborator' check (rol in ('admin', 'collaborator')),
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  administrator_id uuid references public.administrators(id) on delete set null,
  action text not null check (char_length(action) between 3 and 80),
  entity_type text not null check (char_length(entity_type) between 2 and 50),
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  creado_en timestamptz not null default now()
);

create index idx_registrations_tournament_status on public.participant_registrations(tournament_id, status);
create index idx_contestants_tournament_status on public.contestants(tournament_id, status);
create index idx_matches_tournament_status on public.matches(tournament_id, status);
create index idx_matches_round_position on public.matches(tournament_id, round_number, bracket_position);
create index idx_matches_round_id on public.matches(round_id);
create index idx_matches_contestant_a on public.matches(contestant_a_id);
create index idx_matches_contestant_b on public.matches(contestant_b_id);
create index idx_matches_winner on public.matches(winner_id);
create index idx_votes_match_contestant on public.votes(match_id, contestant_id);
create index idx_votes_contestant on public.votes(contestant_id);
create index idx_audit_logs_created on public.audit_logs(creado_en desc);
create index idx_audit_logs_administrator on public.audit_logs(administrator_id);

alter table public.tournaments enable row level security;
alter table public.participant_registrations enable row level security;
alter table public.contestants enable row level security;
alter table public.rounds enable row level security;
alter table public.matches enable row level security;
alter table public.votes enable row level security;
alter table public.administrators enable row level security;
alter table public.audit_logs enable row level security;

revoke all on table public.tournaments from anon, authenticated;
revoke all on table public.participant_registrations from anon, authenticated;
revoke all on table public.contestants from anon, authenticated;
revoke all on table public.rounds from anon, authenticated;
revoke all on table public.matches from anon, authenticated;
revoke all on table public.votes from anon, authenticated;
revoke all on table public.administrators from anon, authenticated;
revoke all on table public.audit_logs from anon, authenticated;

create or replace function public.cast_vote(
  p_match_id uuid,
  p_contestant_id uuid,
  p_voter_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_match public.matches%rowtype;
  votes_a integer;
  votes_b integer;
begin
  select * into target_match
  from public.matches
  where id = p_match_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Batalla no encontrada';
  end if;
  if target_match.status <> 'live' then
    raise exception using errcode = 'P0001', message = 'La votación no está abierta';
  end if;
  if target_match.ends_at is not null and now() >= target_match.ends_at then
    raise exception using errcode = 'P0001', message = 'El tiempo de esta batalla terminó';
  end if;
  if p_contestant_id is distinct from target_match.contestant_a_id
     and p_contestant_id is distinct from target_match.contestant_b_id then
    raise exception using errcode = '23514', message = 'El participante no pertenece a esta batalla';
  end if;

  insert into public.votes (match_id, voter_id, contestant_id)
  values (p_match_id, p_voter_id, p_contestant_id);

  select
    count(*) filter (where contestant_id = target_match.contestant_a_id)::integer,
    count(*) filter (where contestant_id = target_match.contestant_b_id)::integer
  into votes_a, votes_b
  from public.votes
  where match_id = p_match_id;

  return jsonb_build_object('votesA', votes_a, 'votesB', votes_b, 'totalVotes', votes_a + votes_b);
end;
$$;

create or replace function public.generate_bracket(
  p_tournament_id uuid,
  p_contestant_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  participant_count integer := coalesce(array_length(p_contestant_ids, 1), 0);
  total_rounds integer;
  round_index integer;
  match_index integer;
  match_count integer;
  created_round_id uuid;
  round_label text;
begin
  if participant_count not in (2, 4, 8, 16, 32) then
    raise exception using errcode = '22023', message = 'El bracket requiere 2, 4, 8, 16 o 32 participantes';
  end if;
  if (select count(*) from public.contestants where id = any(p_contestant_ids) and tournament_id = p_tournament_id and status = 'approved') <> participant_count then
    raise exception using errcode = '23514', message = 'La selección contiene participantes inválidos';
  end if;

  delete from public.rounds where tournament_id = p_tournament_id;
  total_rounds := log(2, participant_count)::integer;

  for round_index in 1..total_rounds loop
    round_label := case
      when round_index = total_rounds then 'Final'
      when round_index = total_rounds - 1 then 'Semifinal'
      when round_index = total_rounds - 2 then 'Cuartos de final'
      else 'Ronda ' || round_index::text
    end;

    insert into public.rounds (tournament_id, round_number, nombre)
    values (p_tournament_id, round_index, round_label)
    returning id into created_round_id;

    match_count := participant_count / (2 ^ round_index)::integer;
    for match_index in 1..match_count loop
      insert into public.matches (
        tournament_id, round_id, round_number, bracket_position,
        contestant_a_id, contestant_b_id
      ) values (
        p_tournament_id,
        created_round_id,
        round_index,
        match_index,
        case when round_index = 1 then p_contestant_ids[(match_index * 2) - 1] else null end,
        case when round_index = 1 then p_contestant_ids[match_index * 2] else null end
      );
    end loop;
  end loop;

  update public.tournaments
  set status = 'ready', actualizado_en = now()
  where id = p_tournament_id;

  return jsonb_build_object('rounds', total_rounds, 'participants', participant_count);
end;
$$;

create or replace function public.finish_match(
  p_match_id uuid,
  p_tie_winner_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_match public.matches%rowtype;
  votes_a integer;
  votes_b integer;
  selected_winner uuid;
  next_match_id uuid;
begin
  select * into target_match from public.matches where id = p_match_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Batalla no encontrada';
  end if;
  if target_match.status not in ('live', 'paused') then
    raise exception using errcode = 'P0001', message = 'La batalla no se puede finalizar en su estado actual';
  end if;

  select
    count(*) filter (where contestant_id = target_match.contestant_a_id)::integer,
    count(*) filter (where contestant_id = target_match.contestant_b_id)::integer
  into votes_a, votes_b from public.votes where match_id = p_match_id;

  if votes_a = votes_b then
    if p_tie_winner_id is null or p_tie_winner_id not in (target_match.contestant_a_id, target_match.contestant_b_id) then
      raise exception using errcode = 'P0001', message = 'La batalla está empatada; selecciona un ganador';
    end if;
    selected_winner := p_tie_winner_id;
  else
    selected_winner := case when votes_a > votes_b then target_match.contestant_a_id else target_match.contestant_b_id end;
  end if;

  update public.matches set
    status = 'finished', winner_id = selected_winner,
    final_votes_a = votes_a, final_votes_b = votes_b,
    ends_at = coalesce(ends_at, now()), actualizado_en = now()
  where id = p_match_id;

  select id into next_match_id
  from public.matches
  where tournament_id = target_match.tournament_id
    and round_number = target_match.round_number + 1
    and bracket_position = ((target_match.bracket_position - 1) / 2) + 1;

  if next_match_id is null then
    update public.tournaments set status = 'finished', actualizado_en = now() where id = target_match.tournament_id;
  elsif mod(target_match.bracket_position, 2) = 1 then
    update public.matches set contestant_a_id = selected_winner, actualizado_en = now() where id = next_match_id;
  else
    update public.matches set contestant_b_id = selected_winner, actualizado_en = now() where id = next_match_id;
  end if;

  return jsonb_build_object('winnerId', selected_winner, 'votesA', votes_a, 'votesB', votes_b, 'tournamentFinished', next_match_id is null);
end;
$$;

create or replace function public.review_registration(
  p_registration_id uuid,
  p_status text,
  p_reviewer_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_registration public.participant_registrations%rowtype;
  created_contestant_id uuid;
begin
  if p_status not in ('approved', 'rejected') then
    raise exception using errcode = '22023', message = 'Estado de revisión inválido';
  end if;

  select * into target_registration
  from public.participant_registrations
  where id = p_registration_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Solicitud no encontrada';
  end if;
  if target_registration.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'La solicitud ya fue revisada';
  end if;

  update public.participant_registrations
  set status = p_status, revisado_por = p_reviewer_id, revisado_en = now()
  where id = p_registration_id;

  if p_status = 'approved' then
    insert into public.contestants (tournament_id, registration_id, nombre, carrera, foto_url)
    values (
      target_registration.tournament_id,
      target_registration.id,
      coalesce(nullif(target_registration.alias, ''), target_registration.nombre || ' ' || target_registration.apellidos),
      target_registration.carrera,
      target_registration.foto_url
    )
    returning id into created_contestant_id;
  end if;

  return jsonb_build_object('status', p_status, 'contestantId', created_contestant_id);
end;
$$;

create or replace function public.start_match(p_match_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_match public.matches%rowtype;
begin
  select * into target_match from public.matches where id = p_match_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Batalla no encontrada'; end if;
  if target_match.status <> 'scheduled' then raise exception using errcode = 'P0001', message = 'La batalla no está programada'; end if;
  if target_match.contestant_a_id is null or target_match.contestant_b_id is null then
    raise exception using errcode = 'P0001', message = 'La batalla aún no tiene dos participantes';
  end if;
  if exists (select 1 from public.matches where tournament_id = target_match.tournament_id and status = 'live' and id <> p_match_id) then
    raise exception using errcode = 'P0001', message = 'Ya existe otra batalla en vivo';
  end if;

  update public.matches set
    status = 'live', starts_at = now(),
    ends_at = now() + make_interval(secs => duration_seconds),
    remaining_seconds = null, actualizado_en = now()
  where id = p_match_id;
  update public.tournaments set status = 'live', actualizado_en = now() where id = target_match.tournament_id;

  return jsonb_build_object('status', 'live');
end;
$$;

create or replace function public.pause_match(p_match_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  seconds_left integer;
begin
  select greatest(0, floor(extract(epoch from (ends_at - now())))::integer)
  into seconds_left
  from public.matches where id = p_match_id and status = 'live' for update;
  if not found then raise exception using errcode = 'P0001', message = 'La batalla no está en vivo'; end if;

  update public.matches set status = 'paused', remaining_seconds = seconds_left, ends_at = null, actualizado_en = now()
  where id = p_match_id;
  return jsonb_build_object('status', 'paused', 'remainingSeconds', seconds_left);
end;
$$;

create or replace function public.resume_match(p_match_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  seconds_left integer;
begin
  select coalesce(remaining_seconds, duration_seconds) into seconds_left
  from public.matches where id = p_match_id and status = 'paused' for update;
  if not found then raise exception using errcode = 'P0001', message = 'La batalla no está pausada'; end if;

  update public.matches set status = 'live', ends_at = now() + make_interval(secs => seconds_left),
    remaining_seconds = null, actualizado_en = now()
  where id = p_match_id;
  return jsonb_build_object('status', 'live');
end;
$$;

create or replace function public.reset_tournament(p_tournament_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.rounds where tournament_id = p_tournament_id;
  update public.tournaments set status = 'registration', actualizado_en = now() where id = p_tournament_id;
end;
$$;

revoke all on function public.cast_vote(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.generate_bracket(uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.finish_match(uuid, uuid) from public, anon, authenticated;
revoke all on function public.review_registration(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.start_match(uuid) from public, anon, authenticated;
revoke all on function public.pause_match(uuid) from public, anon, authenticated;
revoke all on function public.resume_match(uuid) from public, anon, authenticated;
revoke all on function public.reset_tournament(uuid) from public, anon, authenticated;
grant execute on function public.cast_vote(uuid, uuid, uuid) to service_role;
grant execute on function public.generate_bracket(uuid, uuid[]) to service_role;
grant execute on function public.finish_match(uuid, uuid) to service_role;
grant execute on function public.review_registration(uuid, text, uuid) to service_role;
grant execute on function public.start_match(uuid) to service_role;
grant execute on function public.pause_match(uuid) to service_role;
grant execute on function public.resume_match(uuid) to service_role;
grant execute on function public.reset_tournament(uuid) to service_role;

create or replace function public.broadcast_vote_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object('matchId', new.match_id),
    'score_changed',
    'match:' || new.match_id::text || ':score',
    true
  );
  return null;
end;
$$;

create trigger votes_broadcast_trigger
after insert on public.votes
for each row execute function public.broadcast_vote_change();

create or replace function public.broadcast_match_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object('matchId', new.id, 'status', new.status),
    'state_changed',
    'tournament:' || new.tournament_id::text || ':state',
    true
  );
  return null;
end;
$$;

create trigger matches_broadcast_trigger
after insert or update on public.matches
for each row execute function public.broadcast_match_change();

create or replace function public.broadcast_tournament_entity_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_data jsonb;
  target_tournament_id uuid;
  event_name text;
begin
  row_data := case when TG_OP = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  target_tournament_id := case
    when TG_TABLE_NAME = 'tournaments' then (row_data ->> 'id')::uuid
    else (row_data ->> 'tournament_id')::uuid
  end;
  event_name := case
    when TG_TABLE_NAME = 'participant_registrations' then 'registration_changed'
    when TG_TABLE_NAME = 'contestants' then 'participant_changed'
    when TG_TABLE_NAME = 'rounds' then 'bracket_changed'
    else 'tournament_changed'
  end;

  perform realtime.send(
    jsonb_build_object(
      'entity', TG_TABLE_NAME,
      'entityId', row_data ->> 'id',
      'operation', TG_OP
    ),
    event_name,
    'tournament:' || target_tournament_id::text || ':state',
    true
  );
  return null;
end;
$$;

create trigger tournaments_broadcast_trigger
after update on public.tournaments
for each row execute function public.broadcast_tournament_entity_change();

create trigger registrations_broadcast_trigger
after insert or update on public.participant_registrations
for each row execute function public.broadcast_tournament_entity_change();

create trigger contestants_broadcast_trigger
after insert or update on public.contestants
for each row execute function public.broadcast_tournament_entity_change();

create trigger rounds_broadcast_trigger
after insert or update or delete on public.rounds
for each row execute function public.broadcast_tournament_entity_change();

revoke all on function public.broadcast_vote_change() from public, anon, authenticated;
revoke all on function public.broadcast_match_change() from public, anon, authenticated;
revoke all on function public.broadcast_tournament_entity_change() from public, anon, authenticated;

create policy "authenticated can receive public tournament broadcasts"
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and (
    (select realtime.topic()) like 'match:%:score'
    or (select realtime.topic()) like 'tournament:%:state'
  )
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'participant-photos',
  'participant-photos',
  true,
  3145728,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into public.tournaments (nombre, slug, status)
values ('Batallas de Aura', 'batallas-de-aura', 'registration')
on conflict (slug) do nothing;
