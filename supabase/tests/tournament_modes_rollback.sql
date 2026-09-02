-- Run as the migration owner. Fixtures and broadcasts are discarded by ROLLBACK.
begin;
do $$
declare
  test_id uuid; a uuid; b uuid; first_match uuid; second_match uuid; replay_id uuid;
  deletable_id uuid; delete_a uuid; delete_b uuid; delete_round uuid; delete_match uuid;
  voter uuid := gen_random_uuid(); result jsonb; blocked boolean; count_votes bigint;
begin
  select (public.create_tournament_call('QA transaccional','free_battles',90,100)->>'id')::uuid into test_id;
  if (select status from public.tournaments where id=test_id)<>'draft' then raise exception 'Draft invariant failed'; end if;
  -- Changes to the active flag remain inside this transaction and are never published.
  update public.tournaments set is_current=false where is_current;
  update public.tournaments set is_current=true,status='registration' where id=test_id;
  insert into public.contestants(tournament_id,nombre,carrera) values(test_id,'QA Alfa','QA') returning id into a;
  insert into public.contestants(tournament_id,nombre,carrera) values(test_id,'QA Beta','QA') returning id into b;
  select (public.create_free_match(test_id,a,b,90)->>'id')::uuid into first_match;
  select (public.create_free_match(test_id,b,a,60)->>'id')::uuid into second_match;
  perform public.start_match(first_match);
  blocked:=false;
  begin perform public.start_match(second_match); exception when sqlstate 'P0001' then blocked:=true; end;
  if not blocked then raise exception 'Two live matches allowed'; end if;
  perform public.cast_vote(first_match,a,voter);
  blocked:=false;
  begin perform public.cast_vote(first_match,b,voter); exception when unique_violation then blocked:=true; end;
  if not blocked then raise exception 'Duplicate vote allowed'; end if;
  insert into public.votes(match_id,contestant_id,voter_id) select first_match,a,gen_random_uuid() from generate_series(1,1000);
  select vote_count into count_votes from public.tournament_vote_counts(test_id) where match_id=first_match and contestant_id=a;
  if count_votes<>1001 then raise exception 'Vote aggregation truncated: %',count_votes; end if;
  perform public.pause_match(first_match);
  blocked:=false;
  begin perform public.start_match(second_match); exception when sqlstate 'P0001' then blocked:=true; end;
  if not blocked then raise exception 'Paused match does not block another start'; end if;
  perform public.resume_match(first_match);
  select public.finish_match(first_match,null) into result;
  if result->>'winnerId'<>a::text then raise exception 'Wrong winner'; end if;
  select (public.replay_match(first_match)->>'id')::uuid into replay_id;
  if replay_id=first_match or not (select is_replay from public.matches where id=replay_id) then raise exception 'Replay did not create independent match'; end if;
  if (public.replay_match(first_match)->>'id')::uuid<>replay_id then raise exception 'Duplicate pending replay'; end if;
  if (select count(*) from public.votes where match_id=first_match)<>1001 then raise exception 'Replay destroyed original votes'; end if;
  if exists(select 1 from public.votes where match_id=replay_id) then raise exception 'Replay inherited votes'; end if;
  perform public.start_match(replay_id);
  perform public.cast_vote(replay_id,b,voter);
  perform public.finish_match(replay_id,null);
  if (select winner_id from public.matches where id=first_match)<>a then raise exception 'Replay changed original winner'; end if;
  perform public.delete_free_match(second_match);
  perform public.finish_free_tournament(test_id);
  if (select status from public.tournaments where id=test_id)<>'finished' then raise exception 'Free call did not finish'; end if;
  perform public.reset_tournament(test_id);
  if exists(select 1 from public.matches where tournament_id=test_id) then raise exception 'Reset left matches'; end if;
  if (select count(*) from public.contestants where tournament_id=test_id)<>2 then raise exception 'Reset deleted entrants'; end if;

  blocked:=false;
  begin perform public.delete_tournament_call(test_id); exception when sqlstate 'P0001' then blocked:=true; end;
  if not blocked then raise exception 'Current call deletion was allowed'; end if;

  select (public.create_tournament_call('QA eliminable','free_battles',90,100)->>'id')::uuid into deletable_id;
  insert into public.contestants(tournament_id,nombre,carrera) values(deletable_id,'QA Gamma','QA') returning id into delete_a;
  insert into public.contestants(tournament_id,nombre,carrera) values(deletable_id,'QA Delta','QA') returning id into delete_b;
  insert into public.rounds(tournament_id,round_number,nombre) values(deletable_id,1,'QA ronda') returning id into delete_round;
  insert into public.matches(tournament_id,round_id,round_number,bracket_position,contestant_a_id,contestant_b_id)
  values(deletable_id,delete_round,1,1,delete_a,delete_b) returning id into delete_match;
  insert into public.votes(match_id,voter_id,contestant_id) values(delete_match,gen_random_uuid(),delete_a);
  perform public.delete_tournament_call(deletable_id);
  if exists(select 1 from public.tournaments where id=deletable_id) then raise exception 'Deleted call remained'; end if;
  if exists(select 1 from public.matches where id=delete_match) then raise exception 'Deleted call left matches'; end if;
  if exists(select 1 from public.contestants where id in(delete_a,delete_b)) then raise exception 'Deleted call left contestants'; end if;
end;
$$;
rollback;
select 'PASS: modes, 1001 votes, duplicate prevention, timers, replay isolation, guarded call deletion and reset; all test data rolled back' as result;
