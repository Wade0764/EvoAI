-- rollback migration_020: drop the RPC, constraint and column (custom names are lost; export first if needed:
--   select id, collection_name from public.profiles where collection_name is not null;)
begin;
drop function if exists public.set_collection_name(uuid,text);
alter table public.profiles drop constraint if exists profiles_collection_name_chk;
do $b$ declare had text := 'false'; begin
  if to_regclass('private.backup_020') is not null then
    execute 'select coalesce((select v from private.backup_020 where k=''had_column''),''false'')' into had;
  end if;
  if had = 'false' then alter table public.profiles drop column if exists collection_name; end if;
end $b$;
drop table if exists private.backup_020;
commit;
