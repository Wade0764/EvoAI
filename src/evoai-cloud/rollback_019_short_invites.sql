-- rollback_019_short_invites.sql  NOT APPLIED. Restores the pre-019 functions. Short codes issued under 019 stop working
-- (their hashes are peppered); legacy codes keep working. Safe to run twice.
do $$ begin
  if to_regprocedure('private.redeem_invite_core(text)') is not null then
    drop function if exists public.redeem_invite(text);
    alter function private.redeem_invite_core(text) set schema public; alter function public.redeem_invite_core(text) rename to redeem_invite; end if;
  if to_regprocedure('private.create_invite_core(text,uuid,text)') is not null then
    drop function if exists public.create_invite(text,uuid,text);
    alter function private.create_invite_core(text,uuid,text) set schema public; alter function public.create_invite_core(text,uuid,text) rename to create_invite; end if;
  if to_regprocedure('private.create_invite_core(text,uuid,text,text)') is not null then
    drop function if exists public.create_invite(text,uuid,text,text);
    alter function private.create_invite_core(text,uuid,text,text) set schema public; alter function public.create_invite_core(text,uuid,text,text) rename to create_invite; end if;
  if to_regprocedure('private.create_co_owner_invite_core(text)') is not null then
    drop function if exists public.create_co_owner_invite(text);
    alter function private.create_co_owner_invite_core(text) set schema public; alter function public.create_co_owner_invite_core(text) rename to create_co_owner_invite; end if;
  if to_regprocedure('private.create_managed_client_invite_core(uuid,text)') is not null then
    drop function if exists public.create_managed_client_invite(uuid,text);
    alter function private.create_managed_client_invite_core(uuid,text) set schema public; alter function public.create_managed_client_invite_core(uuid,text) rename to create_managed_client_invite; end if;
end $$;
do $$ declare r record; begin
  for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
            where n.nspname='public' and p.proname in ('create_invite','create_co_owner_invite','create_managed_client_invite','redeem_invite') loop
    execute format('revoke execute on function %s from public, anon', r.sig); execute format('grant execute on function %s to authenticated', r.sig);
  end loop; end $$;
drop function if exists private.shorten_invite(uuid);
drop function if exists private.short_token(text);
drop function if exists private.norm_code(text);
drop function if exists private.short_code();
drop table if exists private.invite_attempts;
-- keep private.invite_pepper and private.backup_019 (harmless; drop by hand once sure)
alter table public.invites alter column expires_at set default (now() + interval '14 days');
