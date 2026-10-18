begin;

alter table public.account_profiles
  add column username text,
  add column account_role text not null default 'PATIENT';

alter table public.account_profiles
  add constraint account_profiles_username_format
    check (username is null or username ~ '^[a-z0-9][a-z0-9._-]{2,31}$'),
  add constraint account_profiles_account_role
    check (account_role in ('PATIENT', 'PHARMACY_STAFF', 'TB_CENTRE_STAFF', 'GOVERNMENT_VIEWER', 'PLATFORM_ADMIN'));

create unique index account_profiles_username_unique_idx
  on public.account_profiles (username)
  where username is not null;

-- Profiles and role labels are written only by trusted application-server
-- routes. Browser clients retain owner-only read access through the existing
-- RLS policy, but cannot promote themselves or replace a username.
revoke insert, update on public.account_profiles from authenticated;
grant select on public.account_profiles to authenticated;

comment on column public.account_profiles.username is
  'Unique lowercase sign-in name. Resolved to the Auth email only inside a trusted server route.';
comment on column public.account_profiles.account_role is
  'Primary interface label. Staff authorization remains authoritative in staff_memberships; public signup can create PATIENT only.';

commit;
