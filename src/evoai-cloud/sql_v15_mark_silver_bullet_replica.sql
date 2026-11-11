-- sql_v15_mark_silver_bullet_replica.sql -- NOT RUN. Run in the Supabase SQL editor AFTER migration_009 and the estimate-value v15 redeploy.
-- Marks "Silver Bullet" (fb048e76-5b01-49c7-8f72-8197fd888dfb) as a JPS Motorsport 550 Spyder replica and clears its
-- original-car valuation (the $3.25M / $3.8M / $4.5M result) so it can be re-run and valued as a replica.
begin;
-- 0) sanity: shows the car you are about to change (expect exactly 1 row)
select id, year, make, model, nickname, is_replica, builder from public.vehicles where id = 'fb048e76-5b01-49c7-8f72-8197fd888dfb';

-- 1) flag it (the app also mirrors this into the notes extras, so either source works)
update public.vehicles set is_replica = true, builder = 'JPS Motorsport'
 where id = 'fb048e76-5b01-49c7-8f72-8197fd888dfb';

-- 2) remove its old value estimates (history + current) so the app stops showing $3.8M
delete from public.ai_estimates
 where vehicle_id = 'fb048e76-5b01-49c7-8f72-8197fd888dfb' and kind = 'value';

-- 3) drop the cached ORIGINAL 550 Spyder price (cache key year|make|model|trim, not prefixed "replica|")
delete from public.value_estimate_cache c
 using public.vehicles v
 where v.id = 'fb048e76-5b01-49c7-8f72-8197fd888dfb'
   and c.cache_key not like 'replica|%'
   and c.year = v.year and lower(c.make) = lower(v.make) and lower(c.model_name) = lower(v.model);

-- 4) reset the once-a-day per-vehicle limit so "Get estimate" works today
delete from public.ai_value_log
 where vehicle_id = 'fb048e76-5b01-49c7-8f72-8197fd888dfb' and kind = 'user' and created_at > now() - interval '24 hours';

-- 5) optional: a sensible owner value until the AI re-runs (uncomment and set the amount)
-- insert into public.vehicle_owner_values (vehicle_id, owner_id, owner_value)
--   select id, owner_id, 95000 from public.vehicles where id = 'fb048e76-5b01-49c7-8f72-8197fd888dfb'
--   on conflict (vehicle_id) do update set owner_value = excluded.owner_value;
commit;
-- Then in the app: open Silver Bullet > Get estimate. If the button says "already refreshed today", that is the app's local
-- 1-day guard (localStorage key valRef): reload the page in a private window, or wait for Monday's weekly job.
