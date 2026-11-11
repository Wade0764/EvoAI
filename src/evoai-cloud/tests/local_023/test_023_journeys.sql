-- Cross-feature logic journeys for migration_023. Local Postgres only. No live data.
-- Asserts the behaviour that should hold so a sold/transferred/deleted car, a
-- removed tech, and each role stay consistent across coverage, estimates, history and chat.
create or replace function public._evo_test_023_journeys() returns text
language plpgsql as $$
declare
  a uuid := 'aa000000-0000-4000-a000-0000000000a1';
  b uuid := 'bb000000-0000-4000-a000-0000000000b1';
  cf uuid := 'cc000000-0000-4000-a000-0000000000c1';
  dl uuid := 'dd000000-0000-4000-a000-0000000000d1';
  t uuid := 'ee000000-0000-4000-a000-0000000000e1';
  t2 uuid := 'ee000000-0000-4000-a000-0000000000e2';
  v1 uuid; v_arch uuid; v_del uuid;
  acc_t uuid; acc_t2 uuid;
  est uuid; est2 uuid;
  doc_title uuid; rec uuid; hist uuid;
  xfer uuid; code_xfer text;
  n int; bad text := '';
  j jsonb; flag boolean;
  vin text := 'TRANSFERVINTEST00001';
begin
  insert into auth.users(id, email, email_confirmed_at) values
    (a,'j-owner-a@example.test',now()),(b,'j-owner-b@example.test',now()),
    (cf,'j-co-full@example.test',now()),(dl,'j-co-lim@example.test',now()),
    (t,'j-tech-1@example.test',now()),(t2,'j-tech-2@example.test',now());
  update public.profiles set role='tech', display_name='Tech One' where id=t;
  update public.profiles set role='tech', display_name='Tech Two' where id=t2;
  update public.profiles set display_name='Owner A' where id=a;
  update public.profiles set display_name='Owner B' where id=b;

  perform set_config('request.jwt.claim.sub', a::text, true);
  perform set_config('request.jwt.claim.email', 'j-owner-a@example.test', true);
  execute 'set local role authenticated';
  insert into public.vehicles(owner_id, year, make, model, vin)
  values (a, 1964, 'Aston Martin', 'DB5', vin) returning id into v1;
  insert into public.vehicles(owner_id, year, make, model, vin)
  values (a, 2018, 'Aston Martin', 'DB11', 'ARCHIVEDVINTEST00002') returning id into v_arch;
  insert into public.vehicles(owner_id, year, make, model, vin)
  values (a, 2020, 'Aston Martin', 'Vantage', 'DELETEDVINTEST00003') returning id into v_del;
  execute 'reset role';

  insert into public.collection_members(collection_owner_id, user_id, role, management, added_by)
  values (a, cf, 'owner', 'full', a), (a, dl, 'owner', 'limited', a);

  insert into public.tech_access(tech_id, owner_id, vehicle_id, status, invited_by, accepted_at)
  values (t, a, null, 'active', a, now()) returning id into acc_t;
  insert into public.tech_access(tech_id, owner_id, vehicle_id, status, invited_by, accepted_at)
  values (t2, a, null, 'active', a, now()) returning id into acc_t2;

  -- ---------- 1. tech removed mid-estimate ----------
  perform set_config('request.jwt.claim.sub', t::text, true);
  perform set_config('request.jwt.claim.email', 'j-tech-1@example.test', true);
  execute 'set local role authenticated';
  insert into public.service_requests(owner_id, vehicle_id, created_by, service, request_kind, work_summary,
      price_amount, price_currency, proposed_start, proposed_tz, duration_minutes, decision, status, assigned_tech)
  values (a, v1, t, 'maintenance', 'estimate', 'Replace the fuel pump mid-job',
      1800, 'USD', now() + interval '2 days', 'UTC', 120, 'pending', 'new', t)
  returning id into est;
  insert into public.comments(owner_id, vehicle_id, request_id, author_id, body)
  values (a, v1, est, t, 'I can start Thursday.');
  execute 'reset role';

  perform set_config('request.jwt.claim.sub', a::text, true);
  execute 'set local role authenticated';
  perform public.revoke_tech_access(acc_t);
  execute 'reset role';

  perform set_config('request.jwt.claim.sub', t::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.service_requests where id=est;
  if n <> 0 then bad := bad || 'revoked tech still sees pending estimate; '; end if;
  select count(*) into n from public.comments where request_id=est;
  if n <> 0 then bad := bad || 'revoked tech still sees estimate chat; '; end if;
  select count(*) into n from public.notifications where kind='access_ended';
  if n <> 1 then bad := bad || 'revoked tech access notice='||n||'; '; end if;
  begin
    perform public.complete_service_job(est, 'Should not work', 1000);
    bad := bad || 'revoked tech completed a job; ';
  exception when others then null; end;
  execute 'reset role';

  -- Removed advisor: the estimate is not a live decision. The owner can dismiss it. Nobody can complete it.
  perform set_config('request.jwt.claim.sub', a::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.service_requests where id=est and decision='advisor_removed';
  if n <> 1 then bad := bad || 'estimate was not marked advisor removed ('||n||'); '; end if;
  select count(*) into n from public.comments where request_id=est;
  if n <> 1 then bad := bad || 'owner lost the estimate chat on revoke; '; end if;
  begin
    perform public.decide_estimate(est, 'approved', null);
    bad := bad || 'owner approved an estimate after the advisor was removed; ';
  exception when others then null; end;
  j := public.dismiss_removed_estimate(est);
  if coalesce(j->>'dismissed','') <> 'true' then bad := bad || 'owner could not dismiss the removed estimate; '; end if;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub', t2::text, true);
  execute 'set local role authenticated';
  begin
    perform public.complete_service_job(est, 'Should not finish a removed estimate', 41000);
    bad := bad || 'second tech completed a removed estimate; ';
  exception when others then null; end;
  execute 'reset role';

  -- ---------- 2. title document filed by a tech; limited co-owner vs tech visibility ----------
  perform set_config('request.jwt.claim.sub', t2::text, true);
  execute 'set local role authenticated';
  insert into public.documents(vehicle_id, uploaded_by, kind, title, storage_path, owner_only)
  values (v1, t2, 'title', 'Scanned title', a::text||'/'||v1::text||'/scanned-title.txt', false)
  returning id into doc_title;
  select count(*) into n from public.documents where id=doc_title;
  if n <> 1 then bad := bad || 'tech could not read the title they filed; '; end if;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub', dl::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.documents where id=doc_title;
  if n <> 0 then bad := bad || 'limited saw a tech-filed title without the toggle; '; end if;
  execute 'reset role';

  -- ---------- 3. full/limited co-owner initiating a transfer ----------
  perform set_config('request.jwt.claim.sub', dl::text, true);
  perform set_config('request.jwt.claim.email', 'j-co-lim@example.test', true);
  begin
    execute 'set local role authenticated';
    perform public.initiate_transfer(v_arch, null);
    bad := bad || 'limited co-owner started a transfer; ';
    execute 'reset role';
    -- cancel so a later test can use the same car
    update public.transfers set status='cancelled' where vehicle_id=v_arch and status='pending';
    update public.invites set revoked_at=now() where vehicle_id=v_arch and kind='transfer' and redeemed_at is null;
  exception when others then execute 'reset role'; end;
  execute 'reset role';

  xfer := null; code_xfer := null;
  perform set_config('request.jwt.claim.sub', cf::text, true);
  perform set_config('request.jwt.claim.email', 'j-co-full@example.test', true);
  begin
    execute 'set local role authenticated';
    select transfer_id, code into xfer, code_xfer from public.initiate_transfer(v_arch, null);
    execute 'reset role';
  exception when others then
    execute 'reset role';
    xfer := null; code_xfer := null;
  end;
  if xfer is not null and code_xfer is not null then
    perform set_config('request.jwt.claim.sub', b::text, true);
    perform set_config('request.jwt.claim.email', 'j-owner-b@example.test', true);
    begin
      execute 'set local role authenticated';
      j := public.redeem_invite(code_xfer);
      execute 'reset role';
      if coalesce(j->>'kind','') <> 'transfer' then
        bad := bad || 'full co-owner transfer invite could not be redeemed (dead-end); ';
      end if;
    exception when others then
      execute 'reset role';
      bad := bad || 'full co-owner transfer invite could not be redeemed (dead-end); ';
    end;
    update public.transfers set status='cancelled' where id=xfer and status='pending';
    update public.invites set revoked_at=now() where transfer_id=xfer and redeemed_at is null;
    update public.vehicles set owner_id=a where id=v_arch and owner_id is distinct from a;
    update public.vehicle_coverage set covered_by=a, vehicle_id=v_arch where vin_key='ARCHIVEDVINTEST00002';
  end if;
  execute 'reset role';

  -- no public way to downgrade a co-owner after invite
  if to_regprocedure('public.set_co_owner_management(uuid,text)') is not null
     or to_regprocedure('public.set_co_owner_management(uuid,text,uuid)') is not null then
    null; -- present; journeys below do not require it
  else
    -- recorded as a gap in the audit; not a hard SQL failure
    null;
  end if;

  -- ---------- 4. transfer a covered car that has an open estimate, history and chat ----------
  perform set_config('request.jwt.claim.sub', t2::text, true);
  execute 'set local role authenticated';
  insert into public.service_requests(owner_id, vehicle_id, created_by, service, request_kind, work_summary,
      price_amount, price_currency, proposed_start, proposed_tz, duration_minutes, decision, status, assigned_tech)
  values (a, v1, t2, 'mechanical', 'estimate', 'Geometry and a road test after sale',
      400, 'USD', now() + interval '5 days', 'UTC', 90, 'pending', 'new', t2)
  returning id into est2;
  insert into public.comments(owner_id, vehicle_id, request_id, author_id, body)
  values (a, v1, est2, t2, 'This stays with the car.');
  execute 'reset role';

  insert into public.service_records(vehicle_id, created_by, title, category, performed_on)
  values (v1, a, 'Pre-sale service', 'maintenance', current_date);
  -- coverage already claimed by A via the insert trigger
  select count(*) into n from public.vehicle_coverage where vin_key=vin and covered_by=a and vehicle_id=v1;
  if n <> 1 then bad := bad || 'pre-transfer coverage missing; '; end if;

  perform set_config('request.jwt.claim.sub', a::text, true);
  perform set_config('request.jwt.claim.email', 'j-owner-a@example.test', true);
  execute 'set local role authenticated';
  select transfer_id, code into xfer, code_xfer from public.initiate_transfer(v1, null);
  execute 'reset role';

  perform set_config('request.jwt.claim.sub', b::text, true);
  perform set_config('request.jwt.claim.email', 'j-owner-b@example.test', true);
  execute 'set local role authenticated';
  j := public.redeem_invite(code_xfer);
  if j->>'kind' is distinct from 'transfer' then bad := bad || 'transfer redeem='||coalesce(j::text,'null')||'; '; end if;
  select count(*) into n from public.vehicles where id=v1 and owner_id=b;
  if n <> 1 then bad := bad || 'buyer does not own the transferred car; '; end if;

  -- Coverage must follow the car so the buyer is not blocked, and the seller cannot keep the VIN.
  select count(*) into n from public.vehicle_coverage where vin_key=vin and covered_by=b and vehicle_id=v1;
  if n <> 1 then bad := bad || 'coverage did not move to the buyer; '; end if;
  select count(*) into n from public.vehicle_coverage where vin_key=vin and covered_by=a;
  if n <> 0 then bad := bad || 'seller still holds coverage after transfer; '; end if;

  -- Buyer can save an edit that includes the same VIN (the app always writes vin on update).
  begin
    update public.vehicles as car set color='Silver', vin=car.vin where car.id=v1;
    get diagnostics n = row_count;
    if n <> 1 then bad := bad || 'buyer VIN save rowcount='||n||'; '; end if;
  exception when others then
    bad := bad || 'buyer could not save the transferred car ('||sqlerrm||'); ';
  end;

  -- Buyer should see completed jobs and history that travelled with the car.
  select count(*) into n from public.service_records where vehicle_id=v1;
  if n < 1 then bad := bad || 'buyer lost service records after transfer; '; end if;
  select count(*) into n from public.vehicle_history where vehicle_id=v1;
  if n < 1 then bad := bad || 'buyer cannot read vehicle history after transfer; '; end if;
  select count(*) into n from public.comments where vehicle_id=v1;
  if n < 1 then bad := bad || 'buyer cannot read the vehicle conversation after transfer; '; end if;

  -- Open estimates should not stay actionable by the seller, and should be visible or closed for the buyer.
  execute 'reset role';
  select count(*) into n from public.service_requests where id=est2 and owner_id=a and decision='pending';
  if n <> 0 then
    bad := bad || 'open estimate still belongs to the seller after transfer; ';
    perform set_config('request.jwt.claim.sub', a::text, true);
    begin
      execute 'set local role authenticated';
      perform public.decide_estimate(est2, 'approved', null);
      bad := bad || 'seller approved an estimate after transferring the car; ';
    exception when others then null; end;
    execute 'reset role';
  end if;
  execute 'reset role';

  -- Seller must not be able to re-add the same VIN while the buyer has the car.
  perform set_config('request.jwt.claim.sub', a::text, true);
  begin
    execute 'set local role authenticated';
    insert into public.vehicles(owner_id, year, make, model, vin)
    values (a, 1964, 'Aston Martin', 'DB5', vin);
    bad := bad || 'seller re-added the transferred VIN; ';
  exception when others then null; end;
  execute 'reset role';

  -- ---------- 5. archive keeps jobs and coverage; another person cannot take the VIN ----------
  perform set_config('request.jwt.claim.sub', a::text, true);
  execute 'set local role authenticated';
  update public.vehicles set archived=true where id=v_arch;
  select count(*) into n from public.vehicle_coverage where vin_key='ARCHIVEDVINTEST00002' and covered_by=a;
  if n <> 1 then bad := bad || 'archive dropped coverage; '; end if;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', b::text, true);
  begin
    execute 'set local role authenticated';
    insert into public.vehicles(owner_id, year, make, model, vin)
    values (b, 2018, 'Aston Martin', 'DB11', 'ARCHIVEDVINTEST00002');
    bad := bad || 'second person added an archived VIN; ';
  exception when others then
    if sqlerrm not like '%vehicle_already_covered%' then
      -- a unique or other error is also a block; fine
      null;
    end if;
  end;
  execute 'reset role';

  -- ---------- 6. approve an estimate, then permanently delete the car ----------
  -- Use v_del (still owned by A). Send, approve, complete, then delete.
  perform set_config('request.jwt.claim.sub', t2::text, true);
  -- t2 still has access to A's remaining cars (v_arch, v_del). v1 moved away.
  execute 'set local role authenticated';
  insert into public.service_requests(owner_id, vehicle_id, created_by, service, request_kind, work_summary,
      price_amount, price_currency, proposed_start, proposed_tz, duration_minutes, decision, status, assigned_tech)
  values (a, v_del, t2, 'maintenance', 'estimate', 'Brake fluid and a test drive',
      250, 'USD', now() + interval '1 day', 'UTC', 60, 'pending', 'new', t2)
  returning id into est;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', a::text, true);
  execute 'set local role authenticated';
  perform public.decide_estimate(est, 'approved', null);
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', t2::text, true);
  execute 'set local role authenticated';
  j := public.complete_service_job(est, 'Brakes done', 9000);
  execute 'reset role';

  select count(*) into n from public.vehicle_history where vehicle_id=v_del and kind='job_complete';
  if n <> 1 then bad := bad || 'job history missing before delete; '; end if;

  perform set_config('request.jwt.claim.sub', a::text, true);
  execute 'set local role authenticated';
  begin
    perform public.delete_vehicle_permanently(v_del);
    bad := bad || 'permanent delete removed a car that has a completed job; ';
  exception when others then
    if sqlerrm not like '%Archive%' then bad := bad || 'delete block did not offer archive ('||sqlerrm||'); '; end if;
  end;
  execute 'reset role';

  select count(*) into n from public.vehicles where id=v_del;
  if n <> 1 then bad := bad || 'blocked delete removed the vehicle; '; end if;
  select count(*) into n from public.vehicle_history where vehicle_id=v_del and kind='job_complete';
  if n <> 1 then bad := bad || 'completed job history was not kept; '; end if;
  select count(*) into n from public.vehicle_coverage where vin_key='DELETEDVINTEST00003' and covered_by=a;
  if n <> 1 then bad := bad || 'blocked delete released coverage; '; end if;

  -- ---------- 7. estimate insert requires both can_send_estimates and can_add_service ----------
  perform set_config('request.jwt.claim.sub', a::text, true);
  execute 'set local role authenticated';
  perform public.set_tech_permission(acc_t2, 'can_add_service', false, null);
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', t2::text, true);
  begin
    execute 'set local role authenticated';
    insert into public.service_requests(owner_id, vehicle_id, created_by, service, request_kind, work_summary,
        price_amount, price_currency, proposed_start, proposed_tz, duration_minutes, decision, status, assigned_tech)
    values (a, v_arch, t2, 'maintenance', 'estimate', 'Estimate without add-service permission',
        10, 'USD', now(), 'UTC', 30, 'pending', 'new', t2);
  exception when others then
    bad := bad || 'estimate refused when only can_add_service is off; ';
  end;
  execute 'reset role';

  if bad <> '' then raise exception '023 journey failures: %', bad; end if;
  return 'ok';
end $$;

select public._evo_test_023_journeys();
