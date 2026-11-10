-- READ-ONLY report (v25b): which current AI values look implausible, and why. Run in the Supabase SQL editor; changes nothing.
with e as (
  select a.vehicle_id, a.value_mid, a.value_low, a.value_high, a.confidence, a.cache_key, a.as_of,
         jsonb_array_length(coalesce(a.sources,'[]'::jsonb)) as n_src,
         lag(a.value_mid) over (partition by a.vehicle_id order by a.as_of) as prev_mid,
         lag(a.cache_key) over (partition by a.vehicle_id order by a.as_of) as prev_key,
         row_number() over (partition by a.vehicle_id order by a.as_of desc) as rn
  from public.ai_estimates a where a.kind = 'value')
select v.nickname, v.year, v.make, v.model, v.is_replica, v.builder, v.mileage, v.vin is not null as has_vin,
       e.value_mid, e.prev_mid, e.confidence, e.n_src, e.as_of::date,
       concat_ws('; ',
         case when e.n_src = 0 then 'no web sources (ungrounded guess)' end,
         case when e.confidence < 0.35 then 'low confidence' end,
         case when e.prev_mid > 0 and abs(e.value_mid - e.prev_mid) / e.prev_mid > 0.30 then 'swing ' || round((e.value_mid - e.prev_mid) / e.prev_mid * 100) || '%' end,
         case when e.prev_key is distinct from e.cache_key and e.prev_key is not null then 'basis changed (' || e.prev_key || ' -> ' || e.cache_key || ')' end,
         case when v.is_replica and e.value_mid > 350000 then 'replica priced like an original' end,
         case when not coalesce(v.is_replica,false) and e.cache_key like 'replica|%' then 'priced as replica but car is not flagged' end,
         case when v.mileage is null then 'no mileage' end,
         case when v.year is null or v.model is null or v.model = '' then 'year/model missing' end) as reasons
from e join public.vehicles v on v.id = e.vehicle_id
where e.rn = 1 and not v.archived
order by (e.n_src = 0) desc, e.confidence asc;
