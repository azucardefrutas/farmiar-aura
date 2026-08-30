-- Flujo completo: inscripción inmediata, llaves con BYE, tercer lugar y batallas de 90 segundos.

alter table public.participant_registrations add column if not exists edad integer;
update public.participant_registrations set edad = 18 where edad is null;
alter table public.participant_registrations alter column edad set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'participant_registrations_edad_check') then
    alter table public.participant_registrations
      add constraint participant_registrations_edad_check check (edad between 15 and 99);
  end if;
end $$;

alter table public.matches add column if not exists match_type text not null default 'knockout';
alter table public.matches alter column duration_seconds set default 90;
update public.matches set duration_seconds = 90 where status = 'scheduled';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'matches_match_type_check') then
    alter table public.matches
      add constraint matches_match_type_check check (match_type in ('knockout', 'third_place', 'bye'));
  end if;
end $$;

create or replace function public.submit_registration(
  p_id uuid,
  p_tournament_id uuid,
  p_submitter_id uuid,
  p_nombre text,
  p_apellidos text,
  p_edad integer,
  p_carrera text,
  p_grupo text,
  p_alias text,
  p_instagram text,
  p_foto_url text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  tournament_status text;
  created_contestant_id uuid;
begin
  select status into tournament_status
  from public.tournaments
  where id = p_tournament_id
  for update;

  if not found then raise exception using errcode = 'P0002', message = 'Torneo no encontrado'; end if;
  if tournament_status <> 'registration' then
    raise exception using errcode = 'P0001', message = 'El registro de participantes está cerrado';
  end if;
  if p_edad not between 15 and 99 then
    raise exception using errcode = '23514', message = 'La edad no es válida';
  end if;

  insert into public.participant_registrations (
    id, tournament_id, submitter_id, nombre, apellidos, edad, carrera, grupo,
    alias, instagram, foto_url, status, revisado_en
  ) values (
    p_id, p_tournament_id, p_submitter_id, p_nombre, p_apellidos, p_edad, p_carrera, p_grupo,
    p_alias, p_instagram, p_foto_url, 'approved', now()
  );

  insert into public.contestants (tournament_id, registration_id, nombre, carrera, foto_url)
  values (
    p_tournament_id,
    p_id,
    coalesce(nullif(p_alias, ''), p_nombre || ' ' || p_apellidos),
    p_carrera,
    p_foto_url
  )
  returning id into created_contestant_id;

  update public.tournaments set actualizado_en = now() where id = p_tournament_id;
  return jsonb_build_object('registrationId', p_id, 'contestantId', created_contestant_id, 'status', 'approved');
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
  created_round_id uuid;
  round_label text;
  bye_match record;
  next_match_id uuid;
begin
  select count(value), count(distinct value) into participant_count, distinct_count
  from unnest(p_contestant_ids) as value
  where value is not null;

  if slot_count not in (4, 8, 16, 32) then
    raise exception using errcode = '22023', message = 'La llave debe tener 4, 8, 16 o 32 espacios';
  end if;
  if participant_count < 4 or participant_count > 32 then
    raise exception using errcode = '22023', message = 'El torneo requiere entre 4 y 32 participantes';
  end if;
  if distinct_count <> participant_count then
    raise exception using errcode = '23514', message = 'No se permiten participantes repetidos';
  end if;
  if (select count(*) from public.contestants where id = any(p_contestant_ids) and tournament_id = p_tournament_id and status = 'approved') <> participant_count then
    raise exception using errcode = '23514', message = 'La selección contiene participantes inválidos';
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
        90
      );
    end loop;

    if round_index = total_rounds then
      insert into public.matches (
        tournament_id, round_id, round_number, bracket_position, match_type, duration_seconds
      ) values (p_tournament_id, created_round_id, round_index, 2, 'third_place', 90);
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
  selected_loser uuid;
  next_match_id uuid;
  third_place_match_id uuid;
  total_rounds integer;
  tournament_finished boolean := false;
begin
  select * into target_match from public.matches where id = p_match_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Batalla no encontrada'; end if;
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
  selected_loser := case when selected_winner = target_match.contestant_a_id then target_match.contestant_b_id else target_match.contestant_a_id end;

  update public.matches set
    status = 'finished', winner_id = selected_winner,
    final_votes_a = votes_a, final_votes_b = votes_b,
    ends_at = coalesce(ends_at, now()), remaining_seconds = 0, actualizado_en = now()
  where id = p_match_id;

  select max(round_number) into total_rounds from public.rounds where tournament_id = target_match.tournament_id;

  if target_match.round_number < total_rounds then
    select id into next_match_id
    from public.matches
    where tournament_id = target_match.tournament_id
      and round_number = target_match.round_number + 1
      and bracket_position = ((target_match.bracket_position - 1) / 2) + 1
      and match_type = 'knockout';

    if mod(target_match.bracket_position, 2) = 1 then
      update public.matches set contestant_a_id = selected_winner, actualizado_en = now() where id = next_match_id;
    else
      update public.matches set contestant_b_id = selected_winner, actualizado_en = now() where id = next_match_id;
    end if;

    if target_match.round_number = total_rounds - 1 then
      select id into third_place_match_id
      from public.matches
      where tournament_id = target_match.tournament_id and round_number = total_rounds and match_type = 'third_place';
      if mod(target_match.bracket_position, 2) = 1 then
        update public.matches set contestant_a_id = selected_loser, actualizado_en = now() where id = third_place_match_id;
      else
        update public.matches set contestant_b_id = selected_loser, actualizado_en = now() where id = third_place_match_id;
      end if;
    end if;
  else
    select not exists (
      select 1 from public.matches
      where tournament_id = target_match.tournament_id
        and round_number = total_rounds
        and match_type in ('knockout', 'third_place')
        and status <> 'finished'
    ) into tournament_finished;
    if tournament_finished then
      update public.tournaments set status = 'finished', actualizado_en = now() where id = target_match.tournament_id;
    end if;
  end if;

  return jsonb_build_object(
    'winnerId', selected_winner,
    'loserId', selected_loser,
    'votesA', votes_a,
    'votesB', votes_b,
    'tournamentFinished', tournament_finished
  );
end;
$$;

create or replace function public.settle_expired_match(p_match_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_match public.matches%rowtype;
  votes_a integer;
  votes_b integer;
  result jsonb;
begin
  select * into target_match from public.matches where id = p_match_id for update;
  if not found or target_match.status <> 'live' or target_match.ends_at is null or now() < target_match.ends_at then
    return jsonb_build_object('settled', false);
  end if;

  select
    count(*) filter (where contestant_id = target_match.contestant_a_id)::integer,
    count(*) filter (where contestant_id = target_match.contestant_b_id)::integer
  into votes_a, votes_b from public.votes where match_id = p_match_id;

  if votes_a = votes_b then
    update public.matches
    set status = 'paused', remaining_seconds = 0, ends_at = null, actualizado_en = now()
    where id = p_match_id;
    return jsonb_build_object('settled', true, 'tie', true);
  end if;

  select public.finish_match(p_match_id, null) into result;
  return result || jsonb_build_object('settled', true, 'tie', false);
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
  if target_match.status <> 'scheduled' or target_match.match_type = 'bye' then raise exception using errcode = 'P0001', message = 'La batalla no está programada'; end if;
  if target_match.contestant_a_id is null or target_match.contestant_b_id is null then raise exception using errcode = 'P0001', message = 'La batalla aún no tiene dos participantes'; end if;
  if exists (select 1 from public.matches where tournament_id = target_match.tournament_id and status = 'live' and id <> p_match_id) then raise exception using errcode = 'P0001', message = 'Ya existe otra batalla en vivo'; end if;

  update public.matches set status = 'live', starts_at = now(), ends_at = now() + make_interval(secs => duration_seconds), remaining_seconds = null, actualizado_en = now() where id = p_match_id;
  update public.tournaments set status = 'live', actualizado_en = now() where id = target_match.tournament_id;
  return jsonb_build_object('status', 'live', 'durationSeconds', target_match.duration_seconds);
end;
$$;

revoke all on function public.submit_registration(uuid, uuid, uuid, text, text, integer, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.generate_bracket(uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.finish_match(uuid, uuid) from public, anon, authenticated;
revoke all on function public.settle_expired_match(uuid) from public, anon, authenticated;
revoke all on function public.start_match(uuid) from public, anon, authenticated;
grant execute on function public.submit_registration(uuid, uuid, uuid, text, text, integer, text, text, text, text, text) to service_role;
grant execute on function public.generate_bracket(uuid, uuid[]) to service_role;
grant execute on function public.finish_match(uuid, uuid) to service_role;
grant execute on function public.settle_expired_match(uuid) to service_role;
grant execute on function public.start_match(uuid) to service_role;
