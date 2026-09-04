begin;

do $$
declare
  test_id uuid;
  first_voter uuid := gen_random_uuid();
  second_voter uuid := gen_random_uuid();
  blocked boolean := false;
  result jsonb;
begin
  select (public.create_tournament_call_with_capacity('QA cupo real','single_elimination',90,100,2,true)->>'id')::uuid into test_id;
  perform public.open_tournament_registrations(test_id);

  perform public.submit_registration(gen_random_uuid(),test_id,first_voter,'QA','Uno',20,'Software','8A',null,null,null);
  select public.submit_registration(gen_random_uuid(),test_id,second_voter,'QA','Dos',20,'Software','8A',null,null,null) into result;

  if result->>'registeredCount' <> '2' or result->>'callStatus' <> 'ready' then
    raise exception 'The last seat did not close the call atomically';
  end if;

  begin
    perform public.submit_registration(gen_random_uuid(),test_id,gen_random_uuid(),'QA','Tres',20,'Software','8A',null,null,null);
  exception when sqlstate 'P0001' then
    blocked := true;
  end;
  if not blocked then raise exception 'A registration exceeded the configured capacity'; end if;

  blocked := false;
  begin
    perform public.update_tournament_settings_with_capacity(test_id,90,100,1,true);
  exception when sqlstate '22023' then
    blocked := true;
  end;
  if not blocked then raise exception 'Capacity was reduced below the registered count'; end if;

  if has_function_privilege('anon','public.create_tournament_call_with_capacity(text,text,integer,integer,integer,boolean)','EXECUTE')
    or has_function_privilege('authenticated','public.update_tournament_settings_with_capacity(uuid,integer,integer,integer,boolean)','EXECUTE') then
    raise exception 'Capacity admin RPC exposed to the browser';
  end if;
end $$;

select 'PASS: capacity is atomic, auto-close is real, and admin RPCs remain private; no fixtures retained' as result;

rollback;
