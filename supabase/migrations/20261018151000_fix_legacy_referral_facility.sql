begin;

create function private.sync_referral_facility()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.facility_id is null then new.facility_id := new.tb_center_id; end if;
  return new;
end;
$$;

create trigger referrals_sync_facility_before_write
before insert or update of tb_center_id on public.referrals
for each row execute function private.sync_referral_facility();

revoke all on function private.sync_referral_facility() from public, anon, authenticated, service_role;

commit;
