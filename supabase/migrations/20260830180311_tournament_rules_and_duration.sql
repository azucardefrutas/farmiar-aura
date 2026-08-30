-- Reglas configurables, llaves pequeñas y presencia real del panel administrativo.

alter table public.tournaments
  add column if not exists match_duration_seconds integer not null default 90,
  add column if not exists aura_per_vote integer not null default 100;

alter table public.tournaments
  drop constraint if exists tournaments_match_duration_seconds_check,
  add constraint tournaments_match_duration_seconds_check
    check (match_duration_seconds between 30 and 600),
  drop constraint if exists tournaments_aura_per_vote_check,
  add constraint tournaments_aura_per_vote_check
    check (aura_per_vote between 10 and 1000);

create or replace function public.update_tournament_settings(
  p_tournament_id uuid,
  p_duration_seconds integer,
  p_aura_per_vote integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_duration_seconds not between 30 and 600 then
    raise exception using errcode = '22023', message = 'La duración debe estar entre 30 y 600 segundos';
  end if;
  if p_aura_per_vote not between 10 and 1000 then
    raise exception using errcode = '22023', message = 'El Aura por voto debe estar entre 10 y 1000';
  end if;

  update public.tournaments
  set match_duration_seconds = p_duration_seconds,
      aura_per_vote = p_aura_per_vote,
      actualizado_en = now()
  where id = p_tournament_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'Torneo no encontrado';
  end if;

  update public.matches
  set duration_seconds = p_duration_seconds,
      remaining_seconds = null,
      actualizado_en = now()
  where tournament_id = p_tournament_id
    and status = 'scheduled';

  return jsonb_build_object(
    'durationSeconds', p_duration_seconds,
    'auraPerVote', p_aura_per_vote
  );
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
  slot_count integer := coalesce(cardinality(p_contestant_ids), 0);
  participant_count integer;
  distinct_count integer;
  total_rounds integer;
  round_index integer;
  match_index integer;
  match_count integer;
  configured_duration integer;
  created_round_id uuid;
  round_label text;
  bye_match record;
  next_match_id uuid;
begin
  select count(value), count(distinct value) into participant_count, distinct_count
  from unnest(p_contestant_ids) as value
  where value is not null;

  if slot_count not in (2, 4, 8, 16, 32) then
    raise exception using errcode = '22023', message = 'La llave debe tener 2, 4, 8, 16 o 32 espacios';
  end if;
  if participant_count < 2 or participant_count > 32 then
    raise exception using errcode = '22023', message = 'El torneo requiere entre 2 y 32 participantes';
  end if;
  if distinct_count <> participant_count then
    raise exception using errcode = '23514', message = 'No se permiten participantes repetidos';
  end if;
  if (select count(*) from public.contestants where id = any(p_contestant_ids) and tournament_id = p_tournament_id and status = 'approved') <> participant_count then
    raise exception using errcode = '23514', message = 'La selección contiene participantes inválidos';
  end if;

  select match_duration_seconds into configured_duration
  from public.tournaments
  where id = p_tournament_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Torneo no encontrado';
  end if;

  delete from public.rounds where tournament_id = p_tournament_id;
  total_rounds := log(2, slot_count)::integer;

  for round_index in 1..total_rounds loop
    round_label := case
      when round_index = total_rounds then 'Finales'
      when round_index = total_rounds - 1 then 'Semifinales'
      when round_index = total_rounds - 2 then 'Cuartos de final'
      else 'Ronda ' || round_index::text
    end;

    insert into public.rounds (tournament_id, round_number, nombre)
    values (p_tournament_id, round_index, round_label)
    returning id into created_round_id;

    match_count := slot_count / (2 ^ round_index)::integer;
    for match_index in 1..match_count loop
      insert into public.matches (
        tournament_id, round_id, round_number, bracket_position,
        contestant_a_id, contestant_b_id, status, winner_id, match_type, duration_seconds
      ) values (
        p_tournament_id,
        created_round_id,
        round_index,
        match_index,
        case when round_index = 1 then p_contestant_ids[(match_index * 2) - 1] else null end,
        case when round_index = 1 then p_contestant_ids[match_index * 2] else null end,
        case
          when round_index = 1 and (p_contestant_ids[(match_index * 2) - 1] is null) <> (p_contestant_ids[match_index * 2] is null) then 'finished'
          else 'scheduled'
        end,
        case
          when round_index = 1 and p_contestant_ids[(match_index * 2) - 1] is null then p_contestant_ids[match_index * 2]
          when round_index = 1 and p_contestant_ids[match_index * 2] is null then p_contestant_ids[(match_index * 2) - 1]
          else null
        end,
        case
          when round_index = 1 and (p_contestant_ids[(match_index * 2) - 1] is null) <> (p_contestant_ids[match_index * 2] is null) then 'bye'
          else 'knockout'
        end,
        configured_duration
      );
    end loop;

    if round_index = total_rounds and participant_count >= 4 then
      insert into public.matches (
        tournament_id, round_id, round_number, bracket_position, match_type, duration_seconds
      ) values (p_tournament_id, created_round_id, round_index, 2, 'third_place', configured_duration);
    end if;
  end loop;

  for bye_match in
    select * from public.matches
    where tournament_id = p_tournament_id and round_number = 1 and match_type = 'bye'
    order by bracket_position
  loop
    select id into next_match_id
    from public.matches
    where tournament_id = p_tournament_id
      and round_number = 2
      and bracket_position = ((bye_match.bracket_position - 1) / 2) + 1
      and match_type = 'knockout';

    if mod(bye_match.bracket_position, 2) = 1 then
      update public.matches set contestant_a_id = bye_match.winner_id, actualizado_en = now() where id = next_match_id;
    else
      update public.matches set contestant_b_id = bye_match.winner_id, actualizado_en = now() where id = next_match_id;
    end if;
  end loop;

  update public.tournaments set status = 'ready', actualizado_en = now() where id = p_tournament_id;
  return jsonb_build_object('rounds', total_rounds, 'participants', participant_count, 'slots', slot_count, 'byes', slot_count - participant_count);
end;
$$;

revoke all on function public.update_tournament_settings(uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.generate_bracket(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.update_tournament_settings(uuid, integer, integer) to service_role;
grant execute on function public.generate_bracket(uuid, uuid[]) to service_role;

drop policy if exists "authenticated can receive admin presence" on realtime.messages;
create policy "authenticated can receive admin presence"
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'presence'
  and (select realtime.topic()) like 'admin:%:presence'
);

drop policy if exists "authenticated can send admin presence" on realtime.messages;
create policy "authenticated can send admin presence"
on realtime.messages
for insert
to authenticated
with check (
  realtime.messages.extension = 'presence'
  and (select realtime.topic()) like 'admin:%:presence'
);
