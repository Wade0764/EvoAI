-- EVOai TEST SEED. Throwaway/test databases ONLY. Fake data, @example.test addresses, no secrets.
-- Requires schema.sql + rls.sql. Run as a privileged role (bypasses RLS).
-- Cast: admin(Wade placeholder), owners A & B, techs T1 & T2, spare accounts for invite/transfer tests.

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1','wade-admin@example.test','{"display_name":"Wade (test admin)"}'),
  ('00000000-0000-0000-0000-0000000000b1','owner-a@example.test','{"display_name":"Owner A"}'),
  ('00000000-0000-0000-0000-0000000000b2','owner-b@example.test','{"display_name":"Owner B"}'),
  ('00000000-0000-0000-0000-0000000000b3','newowner@example.test','{"display_name":"Fresh Owner"}'),
  ('00000000-0000-0000-0000-0000000000b4','buyer@example.test','{"display_name":"Buyer"}'),
  ('00000000-0000-0000-0000-0000000000c1','tech-1@example.test','{"display_name":"Tech One","role":"admin"}'),   -- role in metadata must be IGNORED
  ('00000000-0000-0000-0000-0000000000c2','tech-2@example.test','{"display_name":"Tech Two"}'),
  ('00000000-0000-0000-0000-0000000000c3','newtech@example.test','{"display_name":"Fresh Tech"}');

update public.profiles set role='admin' where id='00000000-0000-0000-0000-0000000000a1';
update public.profiles set role='tech', business_name='One Garage' where id='00000000-0000-0000-0000-0000000000c1';
update public.profiles set role='tech', business_name='Two Motorworks' where id='00000000-0000-0000-0000-0000000000c2';

-- 6 vehicles (A: 3 incl. one archived; B: 3)
insert into public.vehicles (id, owner_id, year, make, model, color, nickname, vin, plate, plate_region, mileage, archived) values
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000b1',1967,'Chevrolet','Corvette Sting Ray','Marlboro Maroon','Maroon',  '194677S100001','VETTE67','NY',48210,false),
 ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000b1',1991,'Acura','NSX','Formula Red','Red NSX','JH4NA1157MT000002','NSX91','NY',31877,false),
 ('10000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-0000000000b1',1973,'Porsche','911 T','Sepia Brown',null,'9113100003','OLD911','NY',90412,true),
 ('10000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-0000000000b2',1995,'Toyota','Supra Turbo','Renaissance Red','Supra','JT2JA82J5S0000004','MK4','NJ',54100,false),
 ('10000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-0000000000b2',1969,'Chevrolet','Camaro Z/28','Hugger Orange','Z',  '124379N500005','Z28','NJ',67020,false),
 ('10000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-0000000000b2',2004,'Dodge','Viper SRT-10','Viper Blue',null,'1B3JZ65Z74V000006','VIPER','NJ',12980,false);

insert into public.vehicle_financials (vehicle_id, purchase_price, purchase_date) values
 ('10000000-0000-0000-0000-000000000001',62000,'2019-05-11'),
 ('10000000-0000-0000-0000-000000000002',71500,'2021-08-02'),
 ('10000000-0000-0000-0000-000000000003',45000,'2015-03-20'),
 ('10000000-0000-0000-0000-000000000004',58000,'2020-01-15'),
 ('10000000-0000-0000-0000-000000000005',83000,'2018-09-09'),
 ('10000000-0000-0000-0000-000000000006',52000,'2022-06-30');

-- tech access matrix
--  T1: OWNER-scoped on A (a1,a2,a3)  +  vehicle-scoped on B's Camaro (v5)
--  T2: vehicle-scoped on A's Corvette (v1) REVOKED  +  vehicle-scoped on B's Viper (v6) ACTIVE
insert into public.tech_access (id, tech_id, owner_id, vehicle_id, status, client_origin, invited_by, accepted_at, revoked_at, revoked_by) values
 ('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000b1',null,'active',true ,'00000000-0000-0000-0000-0000000000c1',now(),null,null),
 ('20000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000b2','10000000-0000-0000-0000-000000000005','active',false,'00000000-0000-0000-0000-0000000000b2',now(),null,null),
 ('20000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000b1','10000000-0000-0000-0000-000000000001','revoked',false,'00000000-0000-0000-0000-0000000000b1',now()-interval '30 days',now()-interval '1 day','00000000-0000-0000-0000-0000000000b1'),
 ('20000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000b2','10000000-0000-0000-0000-000000000006','active',false,'00000000-0000-0000-0000-0000000000b2',now(),null,null);

insert into public.service_records (id, vehicle_id, created_by, title, description, category, performed_on, mileage, cost, shop_name) values
 ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c2','Brake overhaul','Rebuilt calipers, new lines','repair','2025-03-10',47900,1850,'Two Motorworks'),
 ('30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c1','Oil + filter','Annual service','maintenance','2026-02-02',48210,220,'One Garage'),
 ('30000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000c1','Timing belt','Belt, water pump, tensioner','maintenance','2026-04-18',31800,2400,'One Garage'),
 ('30000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-0000000000c1','Carb rebuild','Holley 780 rebuild','repair','2026-05-01',67000,640,'One Garage'),
 ('30000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-0000000000c2','Clutch hydraulic','Master + slave replaced','repair','2026-06-12',12980,780,'Two Motorworks'),
 ('30000000-0000-0000-0000-000000000006','10000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-0000000000b2','Detail + ceramic','Owner-logged','detail','2026-07-04',54100,900,null);

insert into public.expenses (vehicle_id, category, amount, incurred_on, vendor, notes) values
 ('10000000-0000-0000-0000-000000000001','insurance',1100,'2026-01-05','Hagerty','Agreed value policy'),
 ('10000000-0000-0000-0000-000000000001','maintenance',220,'2026-02-02','One Garage',null),
 ('10000000-0000-0000-0000-000000000002','storage',2400,'2026-01-01','Garage Co','Annual'),
 ('10000000-0000-0000-0000-000000000004','insurance',950,'2026-01-05','Hagerty',null),
 ('10000000-0000-0000-0000-000000000005','parts',415,'2026-04-20','Summit',null),
 ('10000000-0000-0000-0000-000000000006','registration',180,'2026-03-03','NJ MVC',null);

insert into public.documents (id, vehicle_id, uploaded_by, kind, title, storage_path, mime_type, size_bytes, owner_only) values
 ('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c1','invoice','Oil service invoice','00000000-0000-0000-0000-0000000000b1/10000000-0000-0000-0000-000000000001/oil-2026-02.pdf','application/pdf',120400,false),
 ('40000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000b1','insurance','Policy declaration','00000000-0000-0000-0000-0000000000b1/10000000-0000-0000-0000-000000000001/policy.pdf','application/pdf',88000,true),
 ('40000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-0000000000c1','invoice','Carb rebuild invoice','00000000-0000-0000-0000-0000000000b2/10000000-0000-0000-0000-000000000005/carb.pdf','application/pdf',64000,false),
 ('40000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-0000000000b2','title','Title scan','00000000-0000-0000-0000-0000000000b2/10000000-0000-0000-0000-000000000006/title.pdf','application/pdf',300000,true);

insert into public.vehicle_photos (vehicle_id, uploaded_by, storage_path, caption, is_cover, sort_order) values
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b1/10000000-0000-0000-0000-000000000001/front.jpg','Front 3/4',true,0),
 ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b1/10000000-0000-0000-0000-000000000002/side.jpg','Side',true,0),
 ('10000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-0000000000b2/10000000-0000-0000-0000-000000000005/engine.jpg','Engine bay',true,0),
 ('10000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-0000000000b2/10000000-0000-0000-0000-000000000006/rear.jpg','Rear',true,0);

insert into public.reminders (id, vehicle_id, kind, title, due_date, due_mileage, repeat_months, repeat_miles, remind_days_before) values
 ('50000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','insurance','Hagerty renewal','2026-11-01',null,12,null,30),
 ('50000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','service','Oil change',null,53000,null,5000,14),
 ('50000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000004','inspection','NJ inspection','2026-10-25',null,24,null,14),
 ('50000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000005','tag','Registration tag','2027-03-01',null,12,null,14),
 ('50000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000006','custom','Battery tender swap','2026-09-01',null,null,null,7);

insert into public.advisories (id, vehicle_id, from_tech_id, title, body, severity, estimated_cost, status) values
 ('60000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c1','Replace rear shocks','Leaking at both rears','recommended',640,'pending'),
 ('60000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-0000000000c1','Fuel line age','Rubber lines original','urgent',300,'pending'),
 ('60000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-0000000000c2','Coolant flush','Due this year','info',180,'pending');

-- ai_estimates: written here as the privileged/service role only
insert into public.ai_estimates (vehicle_id, kind, value_low, value_high, confidence, sources, as_of) values
 ('10000000-0000-0000-0000-000000000001','value',78000,92000,0.72,'[{"name":"test-source","note":"fixture"}]','2026-10-01'),
 ('10000000-0000-0000-0000-000000000005','value',95000,115000,0.65,'[{"name":"test-source"}]','2026-10-01');
insert into public.ai_estimates (vehicle_id, kind, health_score, confidence, reasons, as_of) values
 ('10000000-0000-0000-0000-000000000001','health',84,0.6,'["recent brake overhaul","shocks leaking"]','2026-10-01'),
 ('10000000-0000-0000-0000-000000000006','health',91,0.7,'["low mileage"]','2026-10-01');
