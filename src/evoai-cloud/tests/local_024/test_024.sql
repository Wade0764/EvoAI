-- Local Postgres journey for migration 024. Does not touch the live project.
create or replace function public._evo_test_024() returns text
language plpgsql as $$
declare
  a uuid := '02400000-0000-4000-a000-0000000000a1';
  b uuid := '02400000-0000-4000-a000-0000000000b1';
  cf uuid := '02400000-0000-4000-a000-0000000000c1';
  dl uuid := '02400000-0000-4000-a000-0000000000d1';
  t uuid := '02400000-0000-4000-a000-0000000000e1';
  tw uuid := '02400000-0000-4000-a000-0000000000e2';
  tx uuid := '02400000-0000-4000-a000-0000000000e3';
  buyer uuid := '02400000-0000-4000-a000-0000000000f1';
  v1 uuid; v2 uuid; v3 uuid; vb uuid;
  acc uuid; accw uuid; accx uuid;
  svc uuid; svc2 uuid;
  menu_req uuid; req uuid; req_lim uuid;
  est uuid; est_no uuid; est3 uuid;
  n int; bad text := '';
  j jsonb; j2 jsonb;
  got text; plate text; vin text;
  doc_n int; photo_n int; val_n int; hist_n int;
  hold uuid; code_xfer text;
begin
  insert into auth.users(id, email, email_confirmed_at) values
    (a,'pl-a@example.test',now()),(b,'pl-b@example.test',now()),
    (cf,'pl-full@example.test',now()),(dl,'pl-lim@example.test',now()),
    (t,'pl-tech@example.test',now()),(tw,'pl-whole@example.test',now()),
    (tx,'pl-other@example.test',now()),(buyer,'pl-buyer@example.test',now());
  update public.profiles set role='tech', display_name='Hale', business_name='Hale Atelier' where id=t;
  update public.profiles set role='tech', display_name='Whole Shop' where id=tw;
  update public.profiles set role='tech', display_name='Other Shop' where id=tx;
  update public.profiles set display_name='Owner A' where id=a;
  update public.profiles set display_name='Owner B' where id=b;

  insert into public.vehicles(owner_id, year, make, model, plate, vin) values
    (a,2019,'Aston Martin','DBS','AMDBS19','PLDBS19VIN000000001') returning id into v1;
  insert into public.vehicles(owner_id, year, make, model, plate) values
    (a,1967,'Jaguar','E-Type','JAG67') returning id into v2;
  insert into public.vehicles(owner_id, year, make, model, plate, vin) values
    (a,2021,'Porsche','911','GT321','PLGT321VIN000000001') returning id into v3;
  insert into public.vehicles(owner_id, year, make, model, plate) values
    (b,2018,'Ferrari','Roma','ROMA18') returning id into vb;
  insert into public.collection_members(collection_owner_id, user_id, role, management, added_by)
  values (a, cf, 'owner', 'full', a), (a, dl, 'owner', 'limited', a);

  insert into public.tech_access(tech_id, owner_id, vehicle_id, status, invited_by, accepted_at)
  values (t, a, null, 'active', a, now()) returning id into acc;
  insert into public.tech_grant_vehicles(access_id, vehicle_id) values (acc, v1), (acc, v2);
  insert into public.tech_access(tech_id, owner_id, vehicle_id, status, invited_by, accepted_at)
  values (tw, a, null, 'active', a, now()) returning id into accw;
  insert into public.tech_access(tech_id, owner_id, vehicle_id, status, invited_by, accepted_at)
  values (tx, b, null, 'active', b, now()) returning id into accx;

  insert into public.documents(vehicle_id, uploaded_by, kind, title, storage_path, owner_only)
  values (v3, a, 'title', 'GT3 title', a::text||'/'||v3::text||'/title.txt', true);
  insert into public.vehicle_photos(vehicle_id, uploaded_by, storage_path)
  values (v3, a, a::text||'/'||v3::text||'/cover.jpg');
  insert into public.vehicle_financials(vehicle_id, owner_id, purchase_price) values (v3, a, 180000);
  insert into public.vehicle_history(vehicle_id, owner_id, actor_id, kind, summary)
  values (v3, a, a, 'field_change', 'Mileage updated');

  -- Tech saves attestation first, then a draft. Live stays empty.
  perform set_config('request.jwt.claim.sub', t::text, true);
  execute 'set local role authenticated';
  j := public.save_price_draft('https://haleatelier.com', 'https://haleatelier.com/book', true, null);
  if (j->'list'->>'attested_at') is null then bad := bad || 'attestation not stored first; '; end if;
  if jsonb_array_length(j->'live') <> 0 then bad := bad || 'attest created live rows; '; end if;
  begin
    perform public.save_price_draft('http://haleatelier.com', null, true, '[]'::jsonb);
    bad := bad || 'http website accepted; ';
  exception when others then null; end;
  j := public.save_price_draft('https://haleatelier.com', 'https://haleatelier.com/book', true, jsonb_build_array(
    jsonb_build_object('category','Exterior','name','Signature hand wash','description','Foam and a hand dry','price_mode','fixed','amount',185,'currency','USD','duration_label','2 hours','source_url','https://haleatelier.com/services','needs_review',false),
    jsonb_build_object('category','Ceramic','name','Paint protection film, front','description','Coverage was not stated','price_mode','on_request','needs_review',true,'source_url','https://haleatelier.com/services')
  ));
  if jsonb_array_length(j->'draft') <> 2 then bad := bad || 'draft count '||jsonb_array_length(j->'draft')||'; '; end if;
  if jsonb_array_length(j->'live') <> 0 then bad := bad || 'draft wrote live rows; '; end if;
  j2 := public.publish_price_list();
  if jsonb_array_length(j2->'live') <> 2 then bad := bad || 'publish live count; '; end if;
  if (j2->'list'->>'published_at') is null then bad := bad || 'published_at missing; '; end if;
  -- Refresh replaces the draft only.
  j := public.save_price_draft('https://haleatelier.com', 'https://haleatelier.com/book', true, jsonb_build_array(
    jsonb_build_object('category','Exterior','name','Signature hand wash','description','Foam and a hand dry','price_mode','fixed','amount',210,'currency','USD','duration_label','2 hours','source_url','https://haleatelier.com/services','needs_review',false),
    jsonb_build_object('category','Ceramic','name','Wheel faces, ceramic','description','Starting price only','price_mode','from','amount',420,'currency','USD','source_url','https://haleatelier.com/wheels','needs_review',true)
  ));
  select count(*) into n from public.tech_services s join public.tech_price_lists l on l.id=s.list_id
    where l.tech_id=t and s.lane='live' and s.name='Signature hand wash' and s.amount=185;
  if n <> 1 then bad := bad || 'refresh changed the live price; '; end if;
  select count(*) into n from public.tech_services s join public.tech_price_lists l on l.id=s.list_id
    where l.tech_id=t and s.lane='draft' and s.amount=210;
  if n <> 1 then bad := bad || 'refresh draft missing; '; end if;
  perform public.keep_price_list();
  select count(*) into n from public.tech_services s join public.tech_price_lists l on l.id=s.list_id
    where l.tech_id=t and s.lane='draft';
  if n <> 0 then bad := bad || 'keep current left a draft; '; end if;
  select count(*) into n from public.tech_services s join public.tech_price_lists l on l.id=s.list_id
    where l.tech_id=t and s.lane='live' and s.amount=185;
  if n <> 1 then bad := bad || 'keep current dropped the live row; '; end if;
  execute 'reset role';

  -- Another tech cannot read the draft or write this list.
  perform set_config('request.jwt.claim.sub', tx::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.tech_services where tech_id=t and lane='draft';
  if n <> 0 then bad := bad || 'cross-tech read a draft; '; end if;
  select count(*) into n from public.tech_services where tech_id=t and lane='live';
  if n <> 0 then bad := bad || 'cross-tech read another live list; '; end if;
  begin
    perform public.publish_price_list();
    bad := bad || 'other tech published an empty list; ';
  exception when others then null; end;
  execute 'reset role';

  -- Owner B has no access to Hale, so the menu is hidden.
  perform set_config('request.jwt.claim.sub', b::text, true);
  execute 'set local role authenticated';
  begin
    perform public.get_tech_menu(t);
    bad := bad || 'cross-client read the menu; ';
  exception when others then null; end;
  select count(*) into n from public.tech_services where tech_id=t;
  if n <> 0 then bad := bad || 'cross-client selected services; '; end if;
  execute 'reset role';

  -- Owner, full co-owner, and limited co-owner can read live only.
  perform set_config('request.jwt.claim.sub', a::text, true);
  execute 'set local role authenticated';
  j := public.get_tech_menu(t);
  if jsonb_array_length(j->'services') <> 2 then bad := bad || 'owner menu count; '; end if;
  if (j->>'pay_url') is distinct from 'https://haleatelier.com/book' then bad := bad || 'pay link missing; '; end if;
  select count(*) into n from public.tech_services where tech_id=t and lane='draft';
  if n <> 0 then bad := bad || 'client read a draft; '; end if;
  j := public.list_tech_scope(t);
  if (j->>'all')::boolean then bad := bad || 'per-vehicle grant looked like the whole collection; '; end if;
  if not (j->'vehicle_ids' ? v1::text and j->'vehicle_ids' ? v2::text) then bad := bad || 'scope missed granted cars; '; end if;
  if j->'vehicle_ids' ? v3::text then bad := bad || 'scope included an ungranted car; '; end if;
  j2 := public.list_tech_scope(tw);
  if not (j2->>'all')::boolean then bad := bad || 'whole-collection tech was not all; '; end if;
  select id into svc from public.tech_services where tech_id=t and lane='live' and name='Signature hand wash';
  req := public.submit_service_request(t, svc, array[v1, v3], current_date + 1, current_date + 3, 'Side entrance');
  menu_req := req;
  select rv.share into got from public.request_vehicles rv where rv.request_id=req and rv.vehicle_id=v1;
  if got is distinct from 'granted' then bad := bad || 'granted car marked '||coalesce(got,'null')||'; '; end if;
  select rv.share into got from public.request_vehicles rv where rv.request_id=req and rv.vehicle_id=v3;
  if got is distinct from 'request_only' then bad := bad || 'extra car marked '||coalesce(got,'null')||'; '; end if;
  select count(*) into n from public.tech_grant_vehicles where access_id=acc and vehicle_id=v3;
  if n <> 0 then bad := bad || 'request inserted a standing grant; '; end if;
  execute 'reset role';

  -- Fix the select above without a dummy. Re-read properly.
  perform set_config('request.jwt.claim.sub', a::text, true);
  execute 'set local role authenticated';
  select service_name, listed_label into plate, vin from public.service_requests where id=req;
  if plate is distinct from 'Signature hand wash' then bad := bad || 'snapshot name; '; end if;
  if vin is distinct from '$185' and vin is distinct from '$185.00' then bad := bad || 'snapshot price '||coalesce(vin,'null')||'; '; end if;
  -- Whole-collection tech: every car is granted, no new grant row.
  select id into svc2 from public.tech_services where tech_id=t and lane='live' and price_mode='on_request';
  -- use Hale's on_request service with the whole-collection tech by publishing nothing for tw.
  execute 'reset role';

  -- Full co-owner can send. Limited co-owner can send. Neither can publish the tech list.
  perform set_config('request.jwt.claim.sub', cf::text, true);
  execute 'set local role authenticated';
  req := public.submit_service_request(t, svc, array[v2], current_date, current_date, 'Full co-owner');
  select owner_id into hold from public.service_requests where id=req;
  if hold is distinct from a then bad := bad || 'co-owner request owner is not the collection; '; end if;
  begin
    perform public.publish_price_list();
    bad := bad || 'co-owner published a price list; ';
  exception when others then null; end;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub', dl::text, true);
  execute 'set local role authenticated';
  req_lim := public.submit_service_request(t, svc, array[v1], current_date, null, 'Limited co-owner');
  select owner_id into hold from public.service_requests where id=req_lim;
  if hold is distinct from a then bad := bad || 'limited request owner; '; end if;
  execute 'reset role';

  -- Tech sees the request and name/plate only for the request_only car. Not the title, photo library, value, or history.
  perform set_config('request.jwt.claim.sub', t::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.service_requests where id=menu_req;
  if n <> 1 then bad := bad || 'tech cannot see the menu request; '; end if;
  select c.plate into plate from public.request_vehicle_cards(menu_req) c where c.vehicle_id=v3;
  if plate is distinct from 'GT321' then bad := bad || 'card plate '||coalesce(plate,'null')||'; '; end if;
  select count(*) into n from public.vehicles where id=v3;
  if n <> 0 then bad := bad || 'request_only opened the vehicle row; '; end if;
  select count(*) into doc_n from public.documents where vehicle_id=v3;
  select count(*) into photo_n from public.vehicle_photos where vehicle_id=v3;
  select count(*) into val_n from public.vehicle_financials where vehicle_id=v3;
  select count(*) into hist_n from public.vehicle_history where vehicle_id=v3;
  if doc_n <> 0 or photo_n <> 0 or val_n <> 0 or hist_n <> 0 then
    bad := bad || 'request_only opened documents/photos/value/history; '; end if;
  -- Estimate per car: granted car uses the existing path. request_only uses the narrow exception. A stranger car does not.
  insert into public.service_requests(owner_id, vehicle_id, created_by, assigned_tech, service, request_kind,
      work_summary, price_amount, price_currency, proposed_start, proposed_tz, duration_minutes, decision, status)
  values (a, v1, t, t, 'maintenance', 'estimate', 'Hand wash on the DBS', 185, 'USD', now() + interval '2 days', 'UTC', 120, 'pending', 'new')
  returning id into est;
  if not coalesce(private.request_share_allows_estimate(v3), false) then
    bad := bad || 'share allows estimate was false; ';
  end if;
  insert into public.service_requests(owner_id, vehicle_id, created_by, assigned_tech, service, request_kind,
      work_summary, price_amount, price_currency, proposed_start, proposed_tz, duration_minutes, decision, status)
  values (a, v3, t, t, 'maintenance', 'estimate', 'Film on the GT3', 900, 'USD', now() + interval '4 days', 'UTC', 240, 'pending', 'new')
  returning id into est_no;
  insert into public.service_requests(owner_id, vehicle_id, created_by, assigned_tech, service, request_kind,
      work_summary, price_amount, price_currency, proposed_start, proposed_tz, duration_minutes, decision, status)
  values (a, v2, t, t, 'maintenance', 'estimate', 'Cabin on the E-Type', 240, 'USD', now() + interval '3 days', 'UTC', 90, 'pending', 'new')
  returning id into est3;
  begin
    insert into public.service_requests(owner_id, vehicle_id, created_by, assigned_tech, service, request_kind,
        work_summary, price_amount, price_currency, proposed_start, proposed_tz, duration_minutes, decision, status)
    values (a, vb, t, t, 'maintenance', 'estimate', 'Not this collection', 10, 'USD', now() + interval '1 day', 'UTC', 60, 'pending', 'new');
    bad := bad || 'estimate on a stranger car was accepted; ';
  exception when others then null; end;
  execute 'reset role';

  -- Owner decides each estimate on its own car.
  perform set_config('request.jwt.claim.sub', a::text, true);
  execute 'set local role authenticated';
  perform public.decide_estimate(est, 'approved', null);
  perform public.decide_estimate(est_no, 'denied', null);
  select decision into got from public.service_requests where id=est;
  if got is distinct from 'approved' then bad := bad || 'granted estimate not approved; '; end if;
  select decision into got from public.service_requests where id=est_no;
  if got is distinct from 'denied' then bad := bad || 'request_only estimate not denied on its own; '; end if;
  execute 'reset role';

  -- Limited co-owner cannot approve an estimate.
  perform set_config('request.jwt.claim.sub', dl::text, true);
  execute 'set local role authenticated';
  begin
    perform public.decide_estimate(est3, 'denied', null);
    bad := bad || 'limited co-owner decided an estimate; ';
  exception when others then null; end;
  execute 'reset role';

  -- Whole-collection request does not create request_only and does not add grant rows.
  perform set_config('request.jwt.claim.sub', tw::text, true);
  execute 'set local role authenticated';
  perform public.save_price_draft('https://wholeshop.example', null, true, jsonb_build_array(
    jsonb_build_object('category','Exterior','name','Whole shop wash','description','Every car','price_mode','fixed','amount',90,'currency','USD','source_url','https://wholeshop.example/services','needs_review',false)
  ));
  perform public.publish_price_list();
  select id into svc2 from public.tech_services where tech_id=tw and lane='live' limit 1;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', a::text, true);
  execute 'set local role authenticated';
  req := public.submit_service_request(tw, svc2, array[v1, v3], current_date, current_date, 'All cars');
  select count(*) into n from public.request_vehicles where request_id=req and share='request_only';
  if n <> 0 then bad := bad || 'whole-collection request invented a share; '; end if;
  select count(*) into n from public.tech_grant_vehicles where access_id=accw;
  if n <> 0 then bad := bad || 'whole-collection request wrote a grant; '; end if;
  execute 'reset role';

  -- Removed tech loses the menu and the vehicle, and the old share does not keep access.
  perform set_config('request.jwt.claim.sub', a::text, true);
  execute 'set local role authenticated';
  perform public.revoke_tech_access(acc);
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', t::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.vehicles where id in (v1, v2, v3);
  if n <> 0 then bad := bad || 'revoked tech still sees cars; '; end if;
  begin
    perform public.request_vehicle_cards(menu_req);
    bad := bad || 'revoked tech still read cards; ';
  exception when others then null; end;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', a::text, true);
  execute 'set local role authenticated';
  begin
    j := public.get_tech_menu(t);
    if coalesce((j->>'published')::boolean, false) then bad := bad || 'menu survived revoke; '; end if;
  exception when others then null; end;
  execute 'reset role';

  -- Transfer moves the parent car and drops the extra car from that request. No new grant appears.
  perform set_config('request.jwt.claim.sub', a::text, true);
  execute 'set local role authenticated';
  select transfer_id, code into hold, code_xfer from public.initiate_transfer(v1, null);
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', buyer::text, true);
  execute 'set local role authenticated';
  perform public.redeem_invite(code_xfer);
  execute 'reset role';
  select owner_id into hold from public.vehicles where id=v1;
  if hold is distinct from buyer then bad := bad || 'transfer did not move the car; '; end if;
  select count(*) into n from public.tech_grant_vehicles g
    join public.tech_access ta on ta.id=g.access_id
   where g.vehicle_id=v1 and ta.status='active';
  if n <> 0 then bad := bad || 'transfer left a standing grant; '; end if;
  select count(*) into n from public.request_vehicles rv
    join public.service_requests r on r.id=rv.request_id
   where rv.vehicle_id=v1 and r.owner_id is distinct from buyer and r.vehicle_id is distinct from v1;
  if n <> 0 then bad := bad || 'transferred car stayed on someone else''s request; '; end if;

  if bad <> '' then raise exception '024 failures: %', bad; end if;
  return 'ok';
end $$;

select public._evo_test_024();
