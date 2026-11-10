-- v16b: fill sort_order when the client sends null (fixes photo upload failures from any app version)
create or replace function public.vehicle_photos_fill_sort_order()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.sort_order is null then
    select coalesce(max(sort_order), -1) + 1 into new.sort_order
      from public.vehicle_photos where vehicle_id = new.vehicle_id;
  end if;
  return new;
end $$;
drop trigger if exists trg_vehicle_photos_fill_sort_order on public.vehicle_photos;
create trigger trg_vehicle_photos_fill_sort_order
  before insert on public.vehicle_photos
  for each row execute function public.vehicle_photos_fill_sort_order();
select 'sort_order guard installed' as status;
