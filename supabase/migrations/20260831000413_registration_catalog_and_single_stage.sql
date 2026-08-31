-- The catalogue is public metadata, but all writes remain server/admin-only.
create function public.broadcast_tournament_catalog()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send(jsonb_build_object('changed',true),'calls_changed','tournament:catalog:state',true);
  return null;
end;
$$;
create trigger tournament_catalog_broadcast after insert or update or delete on public.tournaments
for each row execute function public.broadcast_tournament_catalog();
revoke all on function public.broadcast_tournament_catalog() from public,anon,authenticated;

create function public.open_tournament_registrations(p_tournament_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare target_status text;
begin
  select status into target_status from public.tournaments where id=p_tournament_id for update;
  if not found then raise exception using errcode='P0002',message='Convocatoria no encontrada'; end if;
  if target_status not in ('draft','registration') then
    raise exception using errcode='P0001',message='Solo puedes abrir un borrador. Crea otra convocatoria para una nueva edición';
  end if;
  update public.tournaments set status='registration',actualizado_en=now() where id=p_tournament_id;
end;
$$;
revoke all on function public.open_tournament_registrations(uuid) from public,anon,authenticated;
grant execute on function public.open_tournament_registrations(uuid) to service_role;

-- Keep the existing global stage lock, and enforce official bracket order.
-- Replays remain explicit exhibitions; they never advance the official bracket.
create or replace function public.start_match(p_match_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare target public.matches%rowtype; current_call boolean; next_id uuid;
begin
  perform pg_advisory_xact_lock(482619);
  select is_current into current_call from public.tournaments where id=(select tournament_id from public.matches where id=p_match_id) for update;
  select * into target from public.matches where id=p_match_id for update;
  if not found then raise exception using errcode='P0002',message='Batalla no encontrada'; end if;
  if not current_call then raise exception using errcode='P0001',message='Publica esta convocatoria antes de iniciar sus batallas'; end if;
  if target.status<>'scheduled' or target.match_type='bye' or target.contestant_a_id is null or target.contestant_b_id is null then
    raise exception using errcode='P0001',message='La batalla necesita dos participantes y debe estar pendiente';
  end if;
  if exists(select 1 from public.matches where status in('live','paused') and id<>p_match_id) then
    raise exception using errcode='P0001',message='El escenario está ocupado. Finaliza o reanuda la batalla actual';
  end if;
  if target.match_type<>'exhibition' then
    select id into next_id from public.matches
    where tournament_id=target.tournament_id and status='scheduled' and match_type in('knockout','third_place')
    order by round_number,case when match_type='third_place' then 0 else 1 end,bracket_position,id limit 1;
    if next_id is distinct from target.id then
      raise exception using errcode='P0001',message='Sigue el orden del escenario: termina los turnos anteriores. El tercer lugar va antes de la final';
    end if;
  end if;
  update public.matches set status='live',starts_at=now(),ends_at=now()+make_interval(secs=>duration_seconds),remaining_seconds=null,actualizado_en=now() where id=p_match_id;
  update public.tournaments set status=case when target.is_replay then status else 'live' end,actualizado_en=now() where id=target.tournament_id;
  return jsonb_build_object('status','live','durationSeconds',target.duration_seconds);
end;
$$;

create function public.start_next_stage_match(p_tournament_id uuid,p_expected_match_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare next_id uuid; result jsonb;
begin
  perform pg_advisory_xact_lock(482619);
  perform 1 from public.tournaments where id=p_tournament_id and is_current for update;
  if not found then raise exception using errcode='P0001',message='Esta convocatoria no está en el escenario'; end if;
  if exists(select 1 from public.matches where status in('live','paused')) then
    raise exception using errcode='P0001',message='El escenario está ocupado';
  end if;
  select id into next_id from public.matches where tournament_id=p_tournament_id and status='scheduled' and match_type<>'bye'
  order by is_replay,round_number,case when match_type='third_place' then 0 else 1 end,bracket_position,id limit 1;
  if next_id is null then raise exception using errcode='P0001',message='No hay otra batalla pendiente'; end if;
  if next_id is distinct from p_expected_match_id then
    raise exception using errcode='P0001',message='El turno cambió. Actualiza la agenda antes de iniciar';
  end if;
  select public.start_match(next_id) into result;
  return result || jsonb_build_object('matchId',next_id);
end;
$$;
revoke all on function public.start_next_stage_match(uuid,uuid) from public,anon,authenticated;
grant execute on function public.start_next_stage_match(uuid,uuid) to service_role;
