alter table public.tournaments
  add column format text not null default 'single_elimination'
    check (format in ('single_elimination', 'free_battles')),
  add column is_current boolean not null default false;
update public.tournaments set is_current = true where slug = 'batallas-de-aura';
create unique index tournaments_one_current on public.tournaments (is_current) where is_current;

alter table public.matches drop constraint matches_match_type_check;
alter table public.matches add constraint matches_match_type_check
  check (match_type in ('knockout', 'third_place', 'bye', 'exhibition'));
alter table public.matches add column replay_of_id uuid references public.matches(id) on delete set null,
  add column is_replay boolean not null default false;
create index matches_replay_of on public.matches(replay_of_id) where replay_of_id is not null;

create function public.create_tournament_call(p_name text, p_format text, p_duration integer, p_aura integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare created_id uuid := gen_random_uuid();
begin
  if char_length(trim(p_name)) not between 3 and 100
    or p_format not in ('single_elimination', 'free_battles')
    or p_duration not between 30 and 600 or p_aura not between 10 and 1000 then
    raise exception using errcode = '22023', message = 'Configuración de convocatoria inválida';
  end if;
  insert into public.tournaments(id,nombre,slug,status,format,match_duration_seconds,aura_per_vote)
  values(created_id,trim(p_name),'aura-' || replace(created_id::text,'-',''),'draft',p_format,p_duration,p_aura);
  update public.tournaments set actualizado_en = now() where is_current;
  return jsonb_build_object('id',created_id);
end;
$$;

create function public.publish_tournament_call(p_tournament_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(482619);
  if not exists(select 1 from public.tournaments where id = p_tournament_id) then
    raise exception using errcode = 'P0002', message = 'Convocatoria no encontrada';
  end if;
  if exists(select 1 from public.matches m join public.tournaments t on t.id=m.tournament_id
    where t.is_current and t.id <> p_tournament_id and m.status in ('live','paused')) then
    raise exception using errcode = 'P0001', message = 'Finaliza la batalla actual antes de cambiar la convocatoria pública';
  end if;
  update public.tournaments set is_current=false,actualizado_en=now() where is_current and id<>p_tournament_id;
  update public.tournaments set is_current=true,
    status=case when status='draft' then 'registration' else status end,actualizado_en=now()
  where id=p_tournament_id;
end;
$$;

alter function public.generate_bracket(uuid,uuid[]) rename to generate_knockout_bracket;
create function public.generate_bracket(p_tournament_id uuid,p_contestant_ids uuid[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare target public.tournaments%rowtype; result jsonb;
begin
  select * into target from public.tournaments where id=p_tournament_id for update;
  if not found or target.format <> 'single_elimination' then
    raise exception using errcode = 'P0001', message = 'Esta convocatoria usa batallas libres, no una llave eliminatoria';
  end if;
  if exists(select 1 from public.matches where tournament_id=p_tournament_id
    and match_type<>'bye' and status in ('live','paused','finished')) then
    raise exception using errcode = 'P0001', message = 'La llave ya tiene resultados. Usa Reiniciar torneo si deseas eliminarlos';
  end if;
  select public.generate_knockout_bracket(p_tournament_id,p_contestant_ids) into result;
  return result;
end;
$$;

create function public.create_free_match(p_tournament_id uuid,p_contestant_a uuid,p_contestant_b uuid,p_duration integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare target public.tournaments%rowtype; round_id uuid; match_id uuid; next_position integer;
begin
  select * into target from public.tournaments where id=p_tournament_id for update;
  if not found or target.format<>'free_battles' or target.status in ('draft','finished','archived') then
    raise exception using errcode='P0001',message='Abre una convocatoria de batallas libres para crear encuentros';
  end if;
  if p_contestant_a=p_contestant_b or p_duration not between 30 and 600
    or (select count(*) from public.contestants where id in(p_contestant_a,p_contestant_b)
      and tournament_id=p_tournament_id and status='approved')<>2 then
    raise exception using errcode='22023',message='Selecciona dos participantes distintos de esta convocatoria';
  end if;
  if (select count(*) from public.matches where tournament_id=p_tournament_id)>=200 then
    raise exception using errcode='P0001',message='Esta convocatoria alcanzó 200 batallas. Abre una nueva';
  end if;
  insert into public.rounds(tournament_id,round_number,nombre) values(p_tournament_id,1,'Batallas libres')
  on conflict(tournament_id,round_number) do update set nombre=excluded.nombre returning id into round_id;
  select coalesce(max(bracket_position),0)+1 into next_position from public.matches where tournament_id=p_tournament_id;
  insert into public.matches(tournament_id,round_id,round_number,bracket_position,contestant_a_id,contestant_b_id,match_type,duration_seconds)
  values(p_tournament_id,round_id,1,next_position,p_contestant_a,p_contestant_b,'exhibition',p_duration) returning id into match_id;
  update public.tournaments set actualizado_en=now() where id=p_tournament_id;
  return jsonb_build_object('id',match_id);
end;
$$;

alter function public.finish_match(uuid,uuid) rename to finish_knockout_match;
create function public.finish_match(p_match_id uuid,p_tie_winner_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare target public.matches%rowtype; votes_a integer; votes_b integer; selected_winner uuid; result jsonb;
begin
  perform 1 from public.tournaments where id=(select tournament_id from public.matches where id=p_match_id) for update;
  select * into target from public.matches where id=p_match_id for update;
  if not found then raise exception using errcode='P0002',message='Batalla no encontrada'; end if;
  if target.match_type<>'exhibition' then
    select public.finish_knockout_match(p_match_id,p_tie_winner_id) into result;
    return result;
  end if;
  if target.status not in ('live','paused') then
    raise exception using errcode='P0001',message='La batalla no está en curso';
  end if;
  select count(*) filter(where contestant_id=target.contestant_a_id)::integer,
    count(*) filter(where contestant_id=target.contestant_b_id)::integer
  into votes_a,votes_b from public.votes where match_id=p_match_id;
  if votes_a=votes_b then
    if p_tie_winner_id is null or p_tie_winner_id not in(target.contestant_a_id,target.contestant_b_id) then
      raise exception using errcode='P0001',message='La batalla está empatada; selecciona un ganador';
    end if;
    selected_winner:=p_tie_winner_id;
  else selected_winner:=case when votes_a>votes_b then target.contestant_a_id else target.contestant_b_id end;
  end if;
  update public.matches set status='finished',winner_id=selected_winner,final_votes_a=votes_a,
    final_votes_b=votes_b,remaining_seconds=0,ends_at=coalesce(ends_at,now()),actualizado_en=now() where id=p_match_id;
  update public.tournaments set status=case when target.is_replay then status else 'ready' end,actualizado_en=now() where id=target.tournament_id;
  return jsonb_build_object('winnerId',selected_winner,'votesA',votes_a,'votesB',votes_b,'tournamentFinished',false);
end;
$$;

create function public.finish_free_tournament(p_tournament_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.tournaments where id=p_tournament_id and format='free_battles' for update;
  if not found then raise exception using errcode='P0001',message='Solo aplica a batallas libres'; end if;
  if not exists(select 1 from public.matches where tournament_id=p_tournament_id and status='finished')
    or exists(select 1 from public.matches where tournament_id=p_tournament_id and status in('scheduled','live','paused')) then
    raise exception using errcode='P0001',message='Completa o elimina las batallas pendientes antes de cerrar';
  end if;
  update public.tournaments set status='finished',actualizado_en=now() where id=p_tournament_id;
end;
$$;

create function public.delete_free_match(p_match_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare target public.matches%rowtype;
begin
  perform 1 from public.tournaments where id=(select tournament_id from public.matches where id=p_match_id) for update;
  select * into target from public.matches where id=p_match_id for update;
  if not found then raise exception using errcode='P0002',message='Batalla no encontrada'; end if;
  if target.match_type<>'exhibition' then
    raise exception using errcode='P0001',message='Una batalla eliminatoria forma parte de la llave. Elimina o regenera la llave completa';
  end if;
  if target.status in('live','paused') then
    raise exception using errcode='P0001',message='Finaliza la batalla antes de eliminarla';
  end if;
  delete from public.matches where id=p_match_id;
  update public.tournaments set actualizado_en=now() where id=target.tournament_id;
  return jsonb_build_object('tournamentId',target.tournament_id);
end;
$$;

create function public.delete_participant_registration(p_registration_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare target public.participant_registrations%rowtype; contestant_id uuid;
begin
  perform 1 from public.tournaments where id=(select tournament_id from public.participant_registrations where id=p_registration_id) for update;
  select * into target from public.participant_registrations where id=p_registration_id for update;
  if not found then raise exception using errcode='P0002',message='Inscripción no encontrada'; end if;
  select id into contestant_id from public.contestants where registration_id=p_registration_id for update;
  if exists(select 1 from public.matches where contestant_a_id=contestant_id or contestant_b_id=contestant_id or winner_id=contestant_id) then
    raise exception using errcode='P0001',message='Esta persona tiene batallas asignadas. Elimina primero sus batallas libres o reinicia la llave';
  end if;
  delete from public.contestants where id=contestant_id;
  delete from public.participant_registrations where id=p_registration_id;
  update public.tournaments set actualizado_en=now() where id=target.tournament_id;
  return jsonb_build_object('tournamentId',target.tournament_id);
end;
$$;

-- A replay is a new independent exhibition. Original votes and progression stay intact.
create function public.replay_match(p_match_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare target public.matches%rowtype; created_id uuid; next_position integer;
begin
  perform 1 from public.tournaments where id=(select tournament_id from public.matches where id=p_match_id) for update;
  select * into target from public.matches where id=p_match_id for update;
  if not found or target.status<>'finished' or target.match_type='bye'
    or target.contestant_a_id is null or target.contestant_b_id is null then
    raise exception using errcode='P0001',message='Solo se puede repetir una batalla terminada entre dos participantes';
  end if;
  select id into created_id from public.matches where replay_of_id=p_match_id and status in('scheduled','live','paused') limit 1;
  if found then return jsonb_build_object('id',created_id); end if;
  if (select count(*) from public.matches where tournament_id=target.tournament_id)>=200 then
    raise exception using errcode='P0001',message='Esta convocatoria alcanzó 200 batallas. Abre una nueva';
  end if;
  select coalesce(max(bracket_position),0)+1 into next_position from public.matches where round_id=target.round_id;
  insert into public.matches(tournament_id,round_id,round_number,bracket_position,contestant_a_id,contestant_b_id,match_type,duration_seconds,replay_of_id,is_replay)
  values(target.tournament_id,target.round_id,target.round_number,next_position,target.contestant_a_id,target.contestant_b_id,'exhibition',target.duration_seconds,p_match_id,true)
  returning id into created_id;
  update public.tournaments set actualizado_en=now() where id=target.tournament_id;
  return jsonb_build_object('id',created_id);
end;
$$;

-- Lock tournament before match consistently so collaborative controls cannot start two battles.
create or replace function public.start_match(p_match_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare target public.matches%rowtype; current_call boolean;
begin
  perform pg_advisory_xact_lock(482619);
  select is_current into current_call from public.tournaments where id=(select tournament_id from public.matches where id=p_match_id) for update;
  select * into target from public.matches where id=p_match_id for update;
  if not found then raise exception using errcode='P0002',message='Batalla no encontrada'; end if;
  if not current_call then raise exception using errcode='P0001',message='Publica esta convocatoria antes de iniciar sus batallas'; end if;
  if target.status<>'scheduled' or target.match_type='bye' or target.contestant_a_id is null or target.contestant_b_id is null then
    raise exception using errcode='P0001',message='La batalla necesita dos participantes y debe estar pendiente';
  end if;
  if exists(select 1 from public.matches where tournament_id=target.tournament_id and status in('live','paused') and id<>p_match_id) then
    raise exception using errcode='P0001',message='Finaliza la batalla en curso o pausada antes de iniciar otra';
  end if;
  update public.matches set status='live',starts_at=now(),ends_at=now()+make_interval(secs=>duration_seconds),remaining_seconds=null,actualizado_en=now() where id=p_match_id;
  update public.tournaments set status=case when target.is_replay then status else 'live' end,actualizado_en=now() where id=target.tournament_id;
  return jsonb_build_object('status','live','durationSeconds',target.duration_seconds);
end;
$$;

create or replace function public.resume_match(p_match_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare target public.matches%rowtype;
begin
  perform pg_advisory_xact_lock(482619);
  perform 1 from public.tournaments where id=(select tournament_id from public.matches where id=p_match_id) for update;
  select * into target from public.matches where id=p_match_id for update;
  if not found or target.status<>'paused' then raise exception using errcode='P0001',message='La batalla no está pausada'; end if;
  if coalesce(target.remaining_seconds,0)<=0 then raise exception using errcode='P0001',message='El tiempo terminó. Resuelve el empate para finalizar'; end if;
  if exists(select 1 from public.matches where tournament_id=target.tournament_id and status in('live','paused') and id<>p_match_id) then
    raise exception using errcode='P0001',message='Ya existe otra batalla en curso';
  end if;
  update public.matches set status='live',ends_at=now()+make_interval(secs=>remaining_seconds),remaining_seconds=null,actualizado_en=now() where id=p_match_id;
  return jsonb_build_object('status','live');
end;
$$;

create or replace function public.settle_expired_match(p_match_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare target public.matches%rowtype; votes_a integer; votes_b integer; result jsonb;
begin
  perform 1 from public.tournaments where id=(select tournament_id from public.matches where id=p_match_id) for update;
  select * into target from public.matches where id=p_match_id for update;
  if not found or target.status<>'live' or target.ends_at is null or now()<target.ends_at then return jsonb_build_object('settled',false); end if;
  select count(*) filter(where contestant_id=target.contestant_a_id)::integer,count(*) filter(where contestant_id=target.contestant_b_id)::integer
  into votes_a,votes_b from public.votes where match_id=p_match_id;
  if votes_a=votes_b then
    update public.matches set status='paused',remaining_seconds=0,ends_at=null,actualizado_en=now() where id=p_match_id;
    return jsonb_build_object('settled',true,'tie',true);
  end if;
  select public.finish_match(p_match_id,null) into result;
  return result || jsonb_build_object('settled',true,'tie',false);
end;
$$;

-- Aggregate inside Postgres: totals must not stop at the REST row limit (1000 votes).
create or replace function public.reset_tournament(p_tournament_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.tournaments where id=p_tournament_id for update;
  if not found then raise exception using errcode='P0002',message='Convocatoria no encontrada'; end if;
  delete from public.rounds where tournament_id=p_tournament_id;
  update public.tournaments set status='registration',actualizado_en=now() where id=p_tournament_id;
end;
$$;

create function public.tournament_vote_counts(p_tournament_id uuid)
returns table(match_id uuid,contestant_id uuid,vote_count bigint)
language sql stable security definer set search_path = '' as $$
  select v.match_id,v.contestant_id,count(*) from public.votes v
  join public.matches m on m.id=v.match_id where m.tournament_id=p_tournament_id
  group by v.match_id,v.contestant_id;
$$;

revoke all on function public.replay_match(uuid) from public,anon,authenticated;
revoke all on function public.tournament_vote_counts(uuid) from public,anon,authenticated;
grant execute on function public.replay_match(uuid) to service_role;
grant execute on function public.tournament_vote_counts(uuid) to service_role;
revoke all on function public.create_tournament_call(text,text,integer,integer) from public,anon,authenticated;
revoke all on function public.publish_tournament_call(uuid) from public,anon,authenticated;
revoke all on function public.generate_bracket(uuid,uuid[]) from public,anon,authenticated;
revoke all on function public.generate_knockout_bracket(uuid,uuid[]) from public,anon,authenticated;
revoke all on function public.create_free_match(uuid,uuid,uuid,integer) from public,anon,authenticated;
revoke all on function public.finish_match(uuid,uuid) from public,anon,authenticated;
revoke all on function public.finish_knockout_match(uuid,uuid) from public,anon,authenticated;
revoke all on function public.finish_free_tournament(uuid) from public,anon,authenticated;
revoke all on function public.delete_free_match(uuid) from public,anon,authenticated;
revoke all on function public.delete_participant_registration(uuid) from public,anon,authenticated;
grant execute on function public.create_tournament_call(text,text,integer,integer) to service_role;
grant execute on function public.publish_tournament_call(uuid) to service_role;
grant execute on function public.generate_bracket(uuid,uuid[]) to service_role;
grant execute on function public.create_free_match(uuid,uuid,uuid,integer) to service_role;
grant execute on function public.finish_match(uuid,uuid) to service_role;
grant execute on function public.finish_free_tournament(uuid) to service_role;
grant execute on function public.delete_free_match(uuid) to service_role;
grant execute on function public.delete_participant_registration(uuid) to service_role;
