begin;
do $$
declare n integer; test_id uuid; entrant uuid; entrants uuid[]; slots uuid[]; seeds integer[]; next_seeds integer[];
  seed integer; capacity integer; battle record; finished_count integer; final_id uuid; replay_id uuid;
begin
  foreach n in array array[2,3,5,6,8,17,32] loop
    select (public.create_tournament_call('QA eliminatoria','single_elimination',90,100)->>'id')::uuid into test_id;
    update public.tournaments set is_current=false where is_current;
    update public.tournaments set is_current=true,status='registration' where id=test_id;
    entrants:=array[]::uuid[];
    for seed in 1..n loop
      insert into public.contestants(tournament_id,nombre,carrera) values(test_id,'QA persona '||seed,'QA') returning id into entrant;
      entrants:=array_append(entrants,entrant);
    end loop;
    seeds:=array[1,2]; capacity:=2;
    while capacity<n loop
      capacity:=capacity*2; next_seeds:=array[]::integer[];
      foreach seed in array seeds loop next_seeds:=next_seeds||array[seed,capacity+1-seed]; end loop;
      seeds:=next_seeds;
    end loop;
    slots:=array[]::uuid[];
    foreach seed in array seeds loop slots:=array_append(slots,entrants[seed]); end loop;
    perform public.generate_bracket(test_id,slots);
    if (select count(*) from public.matches where tournament_id=test_id and match_type='bye')<>capacity-n then raise exception 'Wrong byes for %',n; end if;
    finished_count:=0;
    loop
      select * into battle from public.matches where tournament_id=test_id and status='scheduled' and contestant_a_id is not null and contestant_b_id is not null order by round_number,bracket_position limit 1;
      exit when not found;
      perform public.start_match(battle.id);
      perform public.finish_match(battle.id,battle.contestant_a_id);
      finished_count:=finished_count+1;
      if finished_count>40 then raise exception 'Loop in bracket'; end if;
    end loop;
    if finished_count<>(n-1+(case when n>=4 then 1 else 0 end)) then raise exception 'Wrong real-match count % for %',finished_count,n; end if;
    if exists(select 1 from public.matches where tournament_id=test_id and status<>'finished') then raise exception 'Unresolved match for %',n; end if;
    if (select status from public.tournaments where id=test_id)<>'finished' then raise exception 'Tournament not finished for %',n; end if;
    select id into final_id from public.matches where tournament_id=test_id and match_type='knockout' order by round_number desc limit 1;
    select (public.replay_match(final_id)->>'id')::uuid into replay_id;
    perform public.start_match(replay_id);
    select * into battle from public.matches where id=replay_id;
    perform public.finish_match(replay_id,battle.contestant_b_id);
    if (select winner_id from public.matches where id=final_id)<>battle.contestant_a_id then raise exception 'Replay changed champion'; end if;
    if (select status from public.tournaments where id=test_id)<>'finished' then raise exception 'Replay changed official completion'; end if;
  end loop;
end;
$$;
rollback;
select 'PASS: 2, 3, 5, 6, 8, 17 and 32 entrants complete all rounds, byes, final, third place and isolated replay; fixtures rolled back' as result;
