-- Cupos por convocatoria, protegidos dentro de la misma transaccion que la inscripcion.

alter table public.tournaments
  add column if not exists max_participants integer not null default 8,
  add column if not exists auto_close_when_full boolean not null default true;

alter table public.tournaments
  drop constraint if exists tournaments_max_participants_check,
  add constraint tournaments_max_participants_check
    check (max_participants between 2 and 32);

create function public.create_tournament_call_with_capacity(
  p_name text,
  p_format text,
  p_duration integer,
  p_aura integer,
  p_max_participants integer,
  p_auto_close_when_full boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_id uuid := gen_random_uuid();
begin
  if char_length(trim(p_name)) not between 3 and 100
    or p_format not in ('single_elimination', 'free_battles')
    or p_duration not between 30 and 600
    or p_aura not between 10 and 1000
    or p_max_participants not between 2 and 32
    or p_auto_close_when_full is null then
    raise exception using errcode = '22023', message = 'Configuracion de convocatoria invalida';
  end if;

  insert into public.tournaments(
    id,nombre,slug,status,format,match_duration_seconds,aura_per_vote,
    max_participants,auto_close_when_full
  ) values (
    created_id,trim(p_name),'aura-' || replace(created_id::text,'-',''),'draft',p_format,
    p_duration,p_aura,p_max_participants,p_auto_close_when_full
  );

  update public.tournaments set actualizado_en = now() where is_current;
  return jsonb_build_object('id',created_id);
end;
$$;

create function public.update_tournament_settings_with_capacity(
  p_tournament_id uuid,
  p_duration_seconds integer,
  p_aura_per_vote integer,
  p_max_participants integer,
  p_auto_close_when_full boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_status text;
  participant_count integer;
  next_status text;
begin
  if p_duration_seconds not between 30 and 600 then
    raise exception using errcode = '22023', message = 'La duracion debe estar entre 30 y 600 segundos';
  end if;
  if p_aura_per_vote not between 10 and 1000 then
    raise exception using errcode = '22023', message = 'El Aura por voto debe estar entre 10 y 1000';
  end if;
  if p_max_participants not between 2 and 32 then
    raise exception using errcode = '22023', message = 'El cupo debe estar entre 2 y 32 participantes';
  end if;
  if p_auto_close_when_full is null then
    raise exception using errcode = '22023', message = 'El cierre automatico debe indicarse';
  end if;

  select status into target_status
  from public.tournaments
  where id = p_tournament_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Torneo no encontrado';
  end if;

  select count(*)::integer into participant_count
  from public.contestants
  where tournament_id = p_tournament_id and status = 'approved';

  if participant_count > p_max_participants then
    raise exception using errcode = '22023', message = 'El cupo no puede ser menor que las personas ya inscritas';
  end if;

  next_status := case
    when target_status = 'registration' and p_auto_close_when_full and participant_count >= p_max_participants then 'ready'
    else target_status
  end;

  update public.tournaments
  set match_duration_seconds = p_duration_seconds,
      aura_per_vote = p_aura_per_vote,
      max_participants = p_max_participants,
      auto_close_when_full = p_auto_close_when_full,
      status = next_status,
      actualizado_en = now()
  where id = p_tournament_id;

  update public.matches
  set duration_seconds = p_duration_seconds,
      remaining_seconds = null,
      actualizado_en = now()
  where tournament_id = p_tournament_id and status = 'scheduled';

  return jsonb_build_object(
    'durationSeconds', p_duration_seconds,
    'auraPerVote', p_aura_per_vote,
    'maxParticipants', p_max_participants,
    'autoCloseWhenFull', p_auto_close_when_full,
    'registeredCount', participant_count,
    'status', next_status
  );
end;
$$;

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
  target public.tournaments%rowtype;
  participant_count integer;
  created_contestant_id uuid;
  next_status text;
begin
  select * into target
  from public.tournaments
  where id = p_tournament_id
  for update;

  if not found then raise exception using errcode = 'P0002', message = 'Torneo no encontrado'; end if;
  if target.status <> 'registration' then
    raise exception using errcode = 'P0001', message = 'El registro de participantes esta cerrado';
  end if;
  if p_edad not between 15 and 99 then
    raise exception using errcode = '23514', message = 'La edad no es valida';
  end if;

  select count(*)::integer into participant_count
  from public.contestants
  where tournament_id = p_tournament_id and status = 'approved';

  if participant_count >= target.max_participants then
    raise exception using errcode = 'P0001', message = 'Esta convocatoria ya alcanzo su cupo maximo';
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

  participant_count := participant_count + 1;
  next_status := case
    when target.auto_close_when_full and participant_count >= target.max_participants then 'ready'
    else 'registration'
  end;

  update public.tournaments
  set status = next_status, actualizado_en = now()
  where id = p_tournament_id;

  return jsonb_build_object(
    'registrationId', p_id,
    'contestantId', created_contestant_id,
    'status', 'approved',
    'registeredCount', participant_count,
    'maxParticipants', target.max_participants,
    'callStatus', next_status
  );
end;
$$;

create or replace function public.open_tournament_registrations(p_tournament_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.tournaments%rowtype;
  participant_count integer;
begin
  select * into target from public.tournaments where id = p_tournament_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Convocatoria no encontrada'; end if;
  if target.status not in ('draft','registration','ready') then
    raise exception using errcode = 'P0001', message = 'Esta convocatoria ya no puede reabrir inscripciones';
  end if;
  if exists(select 1 from public.rounds where tournament_id = p_tournament_id) then
    raise exception using errcode = 'P0001', message = 'La llave ya fue generada; reinicia el torneo antes de reabrir';
  end if;

  select count(*)::integer into participant_count
  from public.contestants
  where tournament_id = p_tournament_id and status = 'approved';

  if participant_count >= target.max_participants then
    raise exception using errcode = 'P0001', message = 'Aumenta el cupo antes de reabrir las inscripciones';
  end if;

  update public.tournaments set status = 'registration', actualizado_en = now() where id = p_tournament_id;
end;
$$;

revoke all on function public.create_tournament_call_with_capacity(text,text,integer,integer,integer,boolean) from public,anon,authenticated;
revoke all on function public.update_tournament_settings_with_capacity(uuid,integer,integer,integer,boolean) from public,anon,authenticated;
revoke all on function public.submit_registration(uuid,uuid,uuid,text,text,integer,text,text,text,text,text) from public,anon,authenticated;
revoke all on function public.open_tournament_registrations(uuid) from public,anon,authenticated;
grant execute on function public.create_tournament_call_with_capacity(text,text,integer,integer,integer,boolean) to service_role;
grant execute on function public.update_tournament_settings_with_capacity(uuid,integer,integer,integer,boolean) to service_role;
grant execute on function public.submit_registration(uuid,uuid,uuid,text,text,integer,text,text,text,text,text) to service_role;
grant execute on function public.open_tournament_registrations(uuid) to service_role;
