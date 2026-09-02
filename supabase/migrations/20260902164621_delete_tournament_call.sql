create function public.delete_tournament_call(p_tournament_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.tournaments%rowtype;
  call_count bigint;
begin
  -- Serializes destructive call changes so two admins cannot delete the last
  -- available call at the same time.
  perform pg_advisory_xact_lock(482619);

  select * into target
  from public.tournaments
  where id = p_tournament_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Convocatoria no encontrada';
  end if;

  if target.is_current then
    raise exception using errcode = 'P0001', message = 'Primero lleva otra convocatoria al escenario';
  end if;

  select count(*) into call_count from public.tournaments;
  if call_count <= 1 then
    raise exception using errcode = 'P0001', message = 'Debe existir al menos una convocatoria';
  end if;

  -- Explicit order avoids the restrictive contestant references used by
  -- matches and votes while preserving one atomic transaction.
  delete from public.votes
  where match_id in (
    select id from public.matches where tournament_id = p_tournament_id
  );
  delete from public.matches where tournament_id = p_tournament_id;
  delete from public.rounds where tournament_id = p_tournament_id;
  delete from public.contestants where tournament_id = p_tournament_id;
  delete from public.participant_registrations where tournament_id = p_tournament_id;
  delete from public.tournaments where id = p_tournament_id;

  return jsonb_build_object('id', target.id, 'name', target.nombre);
end;
$$;

revoke all on function public.delete_tournament_call(uuid) from public, anon, authenticated;
grant execute on function public.delete_tournament_call(uuid) to service_role;
