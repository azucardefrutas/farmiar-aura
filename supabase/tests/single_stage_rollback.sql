-- Isolated transactional fixtures: nothing becomes visible and nothing is retained.
begin;
do $$
declare
  stage_id uuid; call_id uuid; prior_current uuid; next_match record; first_id uuid;
  entrants uuid[] := array[]::uuid[]; slots uuid[] := array[]::uuid[];
  entrant uuid; n integer; seed integer; count_played integer := 0;
  voter uuid := gen_random_uuid(); blocked boolean; last_type text; previous_type text;
begin
  select id into prior_current from public.tournaments where is_current;
  select (public.create_tournament_call('QA escenario 12','single_elimination',90,100)->>'id')::uuid into stage_id;
  select (public.create_tournament_call('QA próxima edición','single_elimination',90,100)->>'id')::uuid into call_id;
  perform public.open_tournament_registrations(stage_id);
  perform public.open_tournament_registrations(call_id);
  if (select id from public.tournaments where is_current) is distinct from prior_current then raise exception 'Opening registrations moved the stage'; end if;
  -- The same voter can choose distinct calls, but cannot submit twice to either.
  perform public.submit_registration(gen_random_uuid(),stage_id,voter,'QA','Votante',20,'QA','QA',null,null,null);
  perform public.submit_registration(gen_random_uuid(),call_id,voter,'QA','Votante',20,'QA','QA',null,null,null);
  blocked:=false;
  begin perform public.submit_registration(gen_random_uuid(),call_id,voter,'QA','Votante',20,'QA','QA',null,null,null);
  exception when unique_violation then blocked:=true; end;
  if not blocked then raise exception 'Duplicate selected-call registration allowed'; end if;
  select array_agg(id) into entrants from public.contestants where tournament_id=stage_id;
  for n in 2..12 loop
    insert into public.contestants(tournament_id,nombre,carrera) values(stage_id,'QA persona '||n,'QA') returning id into entrant;
    entrants:=array_append(entrants,entrant);
  end loop;
  foreach seed in array array[1,16,8,9,4,13,5,12,2,15,7,10,3,14,6,11] loop slots:=array_append(slots,entrants[seed]); end loop;
  update public.tournaments set is_current=false where is_current;
  update public.tournaments set is_current=true where id=stage_id;
  perform public.generate_bracket(stage_id,slots);
  if (select count(*) from public.matches where tournament_id=stage_id and match_type='bye')<>4 then raise exception 'Expected four byes'; end if;
  blocked:=false;
  begin perform public.submit_registration(gen_random_uuid(),stage_id,gen_random_uuid(),'QA','Tarde',20,'QA','QA',null,null,null);
  exception when sqlstate 'P0001' then blocked:=true; end;
  if not blocked then raise exception 'Closed call accepted a registration'; end if;
  select id into first_id from public.matches where tournament_id=stage_id and status='scheduled' and match_type<>'bye' order by round_number,bracket_position limit 1;
  select * into next_match from public.matches where tournament_id=stage_id and status='scheduled' and match_type<>'bye' order by round_number,bracket_position offset 1 limit 1;
  blocked:=false;
  begin perform public.start_match(next_match.id); exception when sqlstate 'P0001' then blocked:=true; end;
  if not blocked then raise exception 'Out-of-order official start allowed'; end if;
  blocked:=false;
  begin perform public.start_next_stage_match(stage_id,next_match.id); exception when sqlstate 'P0001' then blocked:=true; end;
  if not blocked then raise exception 'Stale expected turn allowed'; end if;
  loop
    select * into next_match from public.matches where tournament_id=stage_id and status='scheduled' and match_type<>'bye'
      order by is_replay,round_number,case when match_type='third_place' then 0 else 1 end,bracket_position,id limit 1;
    exit when not found;
    perform public.start_next_stage_match(stage_id,next_match.id);
    blocked:=false;
    begin perform public.start_next_stage_match(stage_id,next_match.id); exception when sqlstate 'P0001' then blocked:=true; end;
    if not blocked then raise exception 'Double start allowed'; end if;
    if count_played=0 then
      perform public.pause_match(next_match.id);
      blocked:=false;
      begin perform public.start_next_stage_match(stage_id,next_match.id); exception when sqlstate 'P0001' then blocked:=true; end;
      if not blocked then raise exception 'Paused fight did not occupy stage'; end if;
      perform public.open_tournament_registrations(call_id);
      if (select id from public.tournaments where is_current)<>stage_id then raise exception 'Opening another call interrupted live stage'; end if;
      perform public.resume_match(next_match.id);
    end if;
    perform public.finish_match(next_match.id,next_match.contestant_a_id);
    previous_type:=last_type; last_type:=next_match.match_type;
    count_played:=count_played+1;
    if count_played>12 then raise exception 'Too many fights'; end if;
  end loop;
  if count_played<>12 or previous_type<>'third_place' or last_type<>'knockout' then raise exception 'Wrong stage order or count'; end if;
  if (select status from public.tournaments where id=stage_id)<>'finished' then raise exception 'Stage did not complete'; end if;
  if has_function_privilege('authenticated','public.start_next_stage_match(uuid,uuid)','EXECUTE')
    or has_function_privilege('anon','public.open_tournament_registrations(uuid)','EXECUTE') then raise exception 'Admin RPC exposed to browser'; end if;
end;
$$;
rollback;
select 'PASS: 12 sequential fights, 4 byes, bronze before final, duplicate/stale/paused/out-of-order rejection and independent selected-call registrations; no fixtures retained' as result;
