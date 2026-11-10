-- Negative isolation tests for migration_023. Local Postgres only. No live data.
-- Actors: owner A, owner B, full co-owner, limited co-owner, restricted tech, revoked tech, multi-client advisor.
create or replace function public._evo_test_023() returns text
language plpgsql as $$
declare
  a uuid := 'a0000000-0000-4000-a000-00000000000a';
  b uuid := 'b0000000-0000-4000-a000-00000000000b';
  cf uuid := 'c0000000-0000-4000-a000-0000000000c1';
  dl uuid := 'd0000000-0000-4000-a000-0000000000d1';
  t uuid := 'e0000000-0000-4000-a000-0000000000e1';
  r uuid := 'e0000000-0000-4000-a000-0000000000e2';
  m uuid := 'e0000000-0000-4000-a000-0000000000e3';
  n1 uuid := '11000000-0000-4000-a000-000000000001';
  n2 uuid := '11000000-0000-4000-a000-000000000002';
  n3 uuid := '11000000-0000-4000-a000-000000000003';
  v1 uuid; v2 uuid; v3 uuid;
  acc_t uuid; acc_m_a uuid; acc_r uuid;
  est uuid; est_b uuid;
  doc1 uuid; doc_priv uuid;
  n int; bad text := '';
  code_full text; code_lim text; code_tech text; code_bad text;
  j jsonb;
  flag boolean;
begin
  insert into auth.users(id, email, email_confirmed_at) values
    (a,'owner-a@example.test',now()),(b,'owner-b@example.test',now()),
    (cf,'co-full@example.test',now()),(dl,'co-lim@example.test',now()),
    (t,'tech-r@example.test',now()),(r,'tech-x@example.test',now()),(m,'adv-m@example.test',now()),
    (n1,'new-full@example.test',now()),(n2,'new-lim@example.test',now()),(n3,'new-tech@example.test',now());
  update public.profiles set role='tech', display_name='Restricted' where id=t;
  update public.profiles set role='tech', display_name='Revoked' where id=r;
  update public.profiles set role='tech', display_name='Advisor' where id=m;
  update public.profiles set display_name='Owner A' where id=a;
  update public.profiles set display_name='Owner B' where id=b;

  insert into public.vehicles(owner_id, year, make, model) values
    (a,1964,'Aston Martin','DB5') returning id into v1;
  insert into public.vehicles(owner_id, year, make, model) values
    (a,2019,'Aston Martin','DBS') returning id into v2;
  insert into public.vehicles(owner_id, year, make, model) values
    (b,2022,'Porsche','911') returning id into v3;

  insert into public.collection_members(collection_owner_id, user_id, role, management, added_by)
  values (a, cf, 'owner', 'full', a), (a, dl, 'owner', 'limited', a);

  insert into public.tech_access(tech_id, owner_id, vehicle_id, status, invited_by, accepted_at)
  values (t, a, null, 'active', a, now()) returning id into acc_t;
  insert into public.tech_grant_vehicles(access_id, vehicle_id) values (acc_t, v1);
  update public.tech_permissions set can_upload_photos=false, can_scan_documents=false, can_add_reminders=false, can_send_estimates=false
   where access_id=acc_t and vehicle_id is null;

  insert into public.tech_access(tech_id, owner_id, vehicle_id, status, invited_by, accepted_at)
  values (m, a, null, 'active', a, now()) returning id into acc_m_a;
  insert into public.tech_access(tech_id, owner_id, vehicle_id, status, client_origin, invited_by, accepted_at)
  values (m, b, null, 'active', true, m, now());

  insert into public.tech_access(tech_id, owner_id, vehicle_id, status, invited_by, accepted_at)
  values (r, a, null, 'active', a, now()) returning id into acc_r;

  insert into public.documents(vehicle_id, uploaded_by, kind, title, storage_path, owner_only)
  values (v1, a, 'invoice', 'Invoice', a::text||'/'||v1::text||'/inv.txt', false) returning id into doc1;
  insert into public.documents(vehicle_id, uploaded_by, kind, title, storage_path, owner_only)
  values (v1, a, 'title', 'Title', a::text||'/'||v1::text||'/title.txt', true) returning id into doc_priv;
  insert into public.documents(vehicle_id, uploaded_by, kind, title, storage_path)
  values (v2, a, 'other', 'V2 doc', a::text||'/'||v2::text||'/v2.txt');
  insert into public.documents(vehicle_id, uploaded_by, kind, title, storage_path)
  values (v3, b, 'other', 'V3 doc', b::text||'/'||v3::text||'/v3.txt');
  insert into public.vehicle_photos(vehicle_id, uploaded_by, storage_path)
  values (v1, a, a::text||'/'||v1::text||'/cover.jpg');
  insert into public.vehicle_photos(vehicle_id, uploaded_by, storage_path)
  values (v2, a, a::text||'/'||v2::text||'/cover.jpg');
  insert into public.reminders(vehicle_id, kind, title, due_date, due_mileage)
  values (v1,'service','Annual service', current_date + 30, 12000);
  insert into public.reminders(vehicle_id, kind, title, due_mileage)
  values (v2,'service','Mileage service', 8000);
  insert into public.comments(owner_id, vehicle_id, author_id, body)
  values (a, v1, a, 'Note on the DB5'), (a, v2, a, 'Note on the DBS'), (b, v3, b, 'Note on the 911');
  insert into storage.objects(bucket_id, name, owner_id) values
    ('vehicle-documents', a::text||'/'||v1::text||'/inv.txt', a::text),
    ('vehicle-documents', a::text||'/'||v2::text||'/v2.txt', a::text),
    ('vehicle-photos', b::text||'/'||v3::text||'/x.jpg', b::text);

  -- portfolio in a country outside the old short list
  insert into public.portfolios(owner_id, name, country, currency) values (a, 'Tokyo garage', 'JP', 'JPY');

  perform set_config('request.jwt.claim.sub', m::text, true);
  perform set_config('request.jwt.claim.email', 'adv-m@example.test', true);
  execute 'set local role authenticated';
  insert into public.service_requests(owner_id, vehicle_id, created_by, service, request_kind, work_summary,
      price_amount, price_currency, proposed_start, proposed_tz, duration_minutes, decision, status, assigned_tech)
  values (a, v1, m, 'maintenance', 'estimate', 'Replace the fuel pump and road-test',
      2400, 'USD', now() + interval '3 days', 'Asia/Tokyo', 180, 'pending', 'new', m)
  returning id into est;
  execute 'reset role';

  -- ---------- restricted tech sees only v1, and not the private title ----------
  perform set_config('request.jwt.claim.sub', t::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.vehicles;
  if n <> 1 then bad := bad || 'T vehicles='||n||'; '; end if;
  select count(*) into n from public.vehicles where id=v2;
  if n <> 0 then bad := bad || 'T saw v2; '; end if;
  select count(*) into n from public.documents;
  if n <> 1 then bad := bad || 'T docs='||n||' (private title must stay hidden); '; end if;
  select count(*) into n from public.documents where id=doc_priv;
  if n <> 0 then bad := bad || 'T saw owner_only; '; end if;
  select count(*) into n from public.vehicle_photos;
  if n <> 1 then bad := bad || 'T photos='||n||'; '; end if;
  select count(*) into n from public.reminders;
  if n <> 1 then bad := bad || 'T reminders='||n||'; '; end if;
  select count(*) into n from public.comments;
  if n <> 1 then bad := bad || 'T comments='||n||'; '; end if;
  select count(*) into n from public.service_requests where vehicle_id=v1;
  if n <> 1 then bad := bad || 'T should see the v1 estimate ('||n||'); '; end if;
  select count(*) into n from public.service_requests where vehicle_id<>v1;
  if n <> 0 then bad := bad || 'T saw a request outside the allow-list; '; end if;
  select count(*) into n from public.vehicle_history where vehicle_id<>v1;
  if n <> 0 then bad := bad || 'T history outside v1='||n||'; '; end if;
  select count(*) into n from storage.objects;
  if n <> 1 then bad := bad || 'T storage='||n||'; '; end if;
  select count(*) into n from public.notifications;
  if n <> 0 then bad := bad || 'T notifications='||n||'; '; end if;
  execute 'reset role';

  -- spoofed writes
  perform set_config('request.jwt.claim.sub', t::text, true);
  begin
    execute 'set local role authenticated';
    insert into public.vehicles(owner_id, make, model) values (b, 'Spoof', 'Car');
    bad := bad || 'T inserted B vehicle; ';
  exception when others then null; end;
  execute 'reset role';
  begin
    execute 'set local role authenticated';
    insert into public.comments(owner_id, vehicle_id, author_id, body) values (b, v3, t, 'spoof');
    bad := bad || 'T commented on B; ';
  exception when others then null; end;
  execute 'reset role';
  begin
    execute 'set local role authenticated';
    insert into public.comments(owner_id, vehicle_id, author_id, body) values (a, v2, t, 'spoof v2');
    bad := bad || 'T commented on v2; ';
  exception when others then null; end;
  execute 'reset role';
  begin
    execute 'set local role authenticated';
    insert into public.documents(vehicle_id, uploaded_by, kind, title, storage_path)
    values (v2, t, 'other', 'x', a::text||'/'||v2::text||'/nope.txt');
    bad := bad || 'T uploaded v2 doc; ';
  exception when others then null; end;
  execute 'reset role';
  begin
    execute 'set local role authenticated';
    insert into public.vehicle_photos(vehicle_id, uploaded_by, storage_path)
    values (v1, t, a::text||'/'||v1::text||'/tech.jpg');
    bad := bad || 'T uploaded photo with upload off; ';
  exception when others then null; end;
  execute 'reset role';
  execute 'set local role authenticated';
  update public.documents set ai_status='scanned' where id=doc1;
  select count(*) into n from public.documents where id=doc1 and ai_status='scanned';
  if n <> 0 then bad := bad || 'T scanned without permission; '; end if;
  execute 'reset role';
  begin
    execute 'set local role authenticated';
    insert into public.service_requests(owner_id, vehicle_id, created_by, service, request_kind, work_summary,
      price_amount, price_currency, proposed_start, proposed_tz, duration_minutes, decision, status, assigned_tech)
    values (a, v2, t, 'maintenance', 'estimate', 'Spoofed estimate text', 10, 'USD', now(), 'UTC', 60, 'pending', 'new', t);
    bad := bad || 'T sent estimate on v2; ';
  exception when others then null; end;
  execute 'reset role';
  begin
    execute 'set local role authenticated';
    perform public.create_tech_invite(array[v1], false, null, null);
    bad := bad || 'T created a tech invite; ';
  exception when others then null; end;
  execute 'reset role';
  begin
    execute 'set local role authenticated';
    perform public.create_co_owner_invite(null, 'full');
    bad := bad || 'T invited a co-owner; ';
  exception when others then null; end;
  execute 'reset role';

  -- advisor M sees both private collections, not owner_only, and cannot cross-wire a comment
  perform set_config('request.jwt.claim.sub', m::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.vehicles;
  if n <> 3 then bad := bad || 'M vehicles='||n||'; '; end if;
  select count(*) into n from public.documents where id=doc_priv;
  if n <> 0 then bad := bad || 'M saw title; '; end if;
  select count(*) into n from public.service_requests where id=est;
  if n <> 1 then bad := bad || 'M missed own estimate; '; end if;
  select count(*) into n from public.notifications where kind='estimate_sent';
  if n <> 0 then bad := bad || 'M saw owner notification; '; end if;
  execute 'reset role';
  begin
    execute 'set local role authenticated';
    insert into public.comments(owner_id, vehicle_id, author_id, body) values (a, v3, m, 'cross');
    bad := bad || 'M cross-wired comment; ';
  exception when others then null; end;
  execute 'reset role';
  begin
    execute 'set local role authenticated';
    update public.service_requests set decision='approved', status='accepted' where id=est;
    bad := bad || 'M approved own estimate by update; ';
  exception when others then null; end;
  execute 'reset role';

  -- owner A: scan still works, direct decision update does not, approve RPC does
  perform set_config('request.jwt.claim.sub', a::text, true);
  perform set_config('request.jwt.claim.email', 'owner-a@example.test', true);
  execute 'set local role authenticated';
  update public.documents set ai_status='scanned' where id=doc1;
  select count(*) into n from public.documents where id=doc1 and ai_status='scanned';
  if n <> 1 then bad := bad || 'owner scan did not stick; '; end if;
  select count(*) into n from public.notifications where request_id=est and kind='estimate_sent';
  if n <> 1 then bad := bad || 'owner estimate notice='||n||'; '; end if;
  select count(*) into n from public.vehicle_history where request_id=est and kind='estimate';
  if n < 1 then bad := bad || 'estimate history missing; '; end if;
  execute 'reset role';
  begin
    execute 'set local role authenticated';
    update public.service_requests set decision='approved' where id=est;
    get diagnostics n = row_count;
    if n <> 0 then bad := bad || 'owner updated decision directly; '; end if;
  exception when others then null; end;
  execute 'reset role';
  execute 'set local role authenticated';
  j := public.decide_estimate(est, 'approved', null);
  if j->>'decision' <> 'approved' then bad := bad || 'approve rpc; '; end if;
  execute 'reset role';

  -- limited co-owner: can see the collection, cannot manage, can ask, cannot approve
  perform set_config('request.jwt.claim.sub', m::text, true);
  execute 'set local role authenticated';
  insert into public.service_requests(owner_id, vehicle_id, created_by, service, request_kind, work_summary,
      price_amount, price_currency, proposed_start, proposed_tz, duration_minutes, decision, status, assigned_tech)
  values (a, v1, m, 'mechanical', 'estimate', 'Set the timing and check the plugs',
      900, 'GBP', now() + interval '1 day', 'Europe/London', 90, 'pending', 'new', m)
  returning id into est_b;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub', dl::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.vehicles where owner_id=a;
  if n <> 2 then bad := bad || 'limited vehicles='||n||'; '; end if;
  select count(*) into n from public.vehicles where owner_id=b;
  if n <> 0 then bad := bad || 'limited saw B; '; end if;
  select count(*) into n from public.documents where id=doc_priv;
  if n <> 1 then bad := bad || 'limited should see title; '; end if;
  execute 'reset role';
  begin
    execute 'set local role authenticated';
    update public.vehicles set color='green' where id=v1;
    get diagnostics n = row_count;
    if n <> 0 then bad := bad || 'limited edited vehicle; '; end if;
  exception when others then null; end;
  execute 'reset role';
  begin
    execute 'set local role authenticated';
    perform public.set_tech_permission(acc_t, 'can_upload_photos', true, null);
    bad := bad || 'limited changed a permission; ';
  exception when others then null; end;
  execute 'reset role';
  begin
    execute 'set local role authenticated';
    perform public.create_tech_invite(null, true, null, null);
    bad := bad || 'limited invited a tech; ';
  exception when others then null; end;
  execute 'reset role';
  begin
    execute 'set local role authenticated';
    perform public.create_co_owner_invite(null, 'full');
    bad := bad || 'limited invited a co-owner; ';
  exception when others then null; end;
  execute 'reset role';
  begin
    execute 'set local role authenticated';
    perform public.decide_estimate(est_b, 'approved', null);
    bad := bad || 'limited approved; ';
  exception when others then null; end;
  execute 'reset role';
  execute 'set local role authenticated';
  j := public.decide_estimate(est_b, 'question', 'Can this wait until the car is back?');
  if j->>'decision' <> 'question' then bad := bad || 'limited question failed; '; end if;
  select count(*) into n from public.comments where request_id=est_b;
  if n <> 1 then bad := bad || 'question comment missing; '; end if;
  execute 'reset role';

  -- full co-owner can set a permission, cannot invite another co-owner, cannot see B
  perform set_config('request.jwt.claim.sub', cf::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.vehicles where owner_id=b;
  if n <> 0 then bad := bad || 'full saw B; '; end if;
  j := public.set_tech_permission(acc_m_a, 'can_add_reminders', true, v1);
  if j->>'can_add_reminders' <> 'true' then bad := bad || 'full perm failed; '; end if;
  execute 'reset role';
  begin
    execute 'set local role authenticated';
    perform public.create_co_owner_invite(null, 'limited');
    bad := bad || 'full co-owner invited a co-owner; ';
  exception when others then null; end;
  execute 'reset role';

  -- owner cannot point a tech invite at B's car; completion archives the approved estimate
  perform set_config('request.jwt.claim.sub', a::text, true);
  begin
    execute 'set local role authenticated';
    perform public.create_tech_invite(array[v3], false, null, null);
    bad := bad || 'A invited tech onto B car; ';
  exception when others then null; end;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', m::text, true);
  execute 'set local role authenticated';
  j := public.complete_service_job(est, 'Pump replaced, road-test done', 41000);
  if j->>'history_id' is null then bad := bad || 'complete missing history; '; end if;
  select count(*) into n from public.service_requests where id=est and status='done' and completion_note is not null;
  if n <> 1 then bad := bad || 'estimate not archived in place; '; end if;
  select count(*) into n from public.service_records where vehicle_id=v1;
  if n <> 1 then bad := bad || 'completion record missing; '; end if;
  select count(*) into n from public.comments where request_id=est;
  if n <> 0 then bad := bad || 'completion deleted the thread; '; end if;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', a::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.notifications where request_id=est and kind='job_completed';
  if n <> 1 then bad := bad || 'owner job notice='||n||'; '; end if;
  select count(*) into n from public.vehicle_history where vehicle_id=v1 and kind='job_complete';
  if n <> 1 then bad := bad || 'job history; '; end if;
  execute 'reset role';

  -- revocation hides the collection everywhere, and keeps only the access-ended notice
  perform set_config('request.jwt.claim.sub', a::text, true);
  execute 'set local role authenticated';
  perform public.revoke_tech_access(acc_r);
  execute 'reset role';
  insert into public.notifications(recipient_id, owner_id, vehicle_id, kind, title)
  values (r, a, v1, 'estimate_sent', 'Should vanish');
  perform set_config('request.jwt.claim.sub', r::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.vehicles;
  if n <> 0 then bad := bad || 'revoked vehicles='||n||'; '; end if;
  select count(*) into n from public.documents;
  if n <> 0 then bad := bad || 'revoked docs='||n||'; '; end if;
  select count(*) into n from public.comments;
  if n <> 0 then bad := bad || 'revoked chat='||n||'; '; end if;
  select count(*) into n from public.service_requests;
  if n <> 0 then bad := bad || 'revoked requests='||n||'; '; end if;
  select count(*) into n from public.reminders;
  if n <> 0 then bad := bad || 'revoked reminders='||n||'; '; end if;
  select count(*) into n from public.vehicle_history;
  if n <> 0 then bad := bad || 'revoked history='||n||'; '; end if;
  select count(*) into n from storage.objects;
  if n <> 0 then bad := bad || 'revoked storage='||n||'; '; end if;
  select count(*) into n from public.notifications where kind='estimate_sent';
  if n <> 0 then bad := bad || 'revoked still sees estimate notice; '; end if;
  select count(*) into n from public.notifications where kind='access_ended';
  if n <> 1 then bad := bad || 'revoked access notice='||n||'; '; end if;
  execute 'reset role';

  -- fresh accounts: full and limited invites, and a tech invite cannot be redeemed by a co-owner
  perform set_config('request.jwt.claim.sub', a::text, true);
  perform set_config('request.jwt.claim.email', 'owner-a@example.test', true);
  execute 'set local role authenticated';
  select code into code_full from public.create_co_owner_invite(null, 'full');
  select code into code_lim from public.create_co_owner_invite(null, 'limited');
  select code into code_tech from public.create_tech_invite(array[v1,v2], false, null, '{"can_upload_photos":false}'::jsonb);
  execute 'reset role';

  perform set_config('request.jwt.claim.sub', n1::text, true);
  perform set_config('request.jwt.claim.email', 'new-full@example.test', true);
  execute 'set local role authenticated';
  j := public.redeem_invite(code_full);
  if j->>'management' <> 'full' then bad := bad || 'redeem full='||j::text||'; '; end if;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub', n2::text, true);
  perform set_config('request.jwt.claim.email', 'new-lim@example.test', true);
  execute 'set local role authenticated';
  j := public.redeem_invite(code_lim);
  if j->>'management' <> 'limited' then bad := bad || 'redeem limited='||j::text||'; '; end if;
  execute 'reset role';
  execute 'set local role authenticated';
  j := public.redeem_invite(code_tech);
  if coalesce(j->>'error','') = '' then bad := bad || 'limited account also became a tech; '; end if;
  execute 'reset role';
  select count(*) into n from public.profiles where id=n2 and role='owner';
  if n <> 1 then bad := bad || 'limited role changed; '; end if;

  perform set_config('request.jwt.claim.sub', n3::text, true);
  perform set_config('request.jwt.claim.email', 'new-tech@example.test', true);
  execute 'set local role authenticated';
  j := public.redeem_invite(code_tech);
  if j->>'kind' <> 'tech_owner' then bad := bad || 'tech redeem='||coalesce(j::text,'null')||'; '; end if;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', n3::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.vehicles;
  if n <> 2 then bad := bad || 'new tech vehicles='||n||'; '; end if;
  select count(*) into n from public.vehicles where id=v3;
  if n <> 0 then bad := bad || 'new tech saw B; '; end if;
  execute 'reset role';
  select tp.can_upload_photos into flag from public.tech_permissions tp
    join public.tech_access ta on ta.id=tp.access_id
   where ta.tech_id=n3 and tp.vehicle_id is null;
  if flag is distinct from false then bad := bad || 'preset upload not applied; '; end if;

  -- second client still isolated after the new tech exists
  perform set_config('request.jwt.claim.sub', b::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.service_requests;
  if n <> 0 then bad := bad || 'B saw A requests; '; end if;
  select count(*) into n from public.comments where owner_id=a;
  if n <> 0 then bad := bad || 'B saw A chat; '; end if;
  select count(*) into n from public.vehicle_history where owner_id=a;
  if n <> 0 then bad := bad || 'B saw A history; '; end if;
  execute 'reset role';

  if bad <> '' then raise exception '023 failures: %', bad; end if;
  return 'ok';
end $$;

select public._evo_test_023();
