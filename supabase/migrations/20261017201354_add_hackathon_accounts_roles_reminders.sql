begin;

create table public.account_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_profiles_display_name_length check (display_name is null or char_length(display_name) between 1 and 80),
  constraint account_profiles_phone_format check (phone is null or phone ~ '^01[3-9][0-9]{8}$')
);

create table public.account_patient_links (
  user_id uuid primary key references auth.users(id) on delete cascade,
  patient_id text not null unique references public.patients(patient_id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.staff_memberships (
  membership_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('PHARMACY_STAFF', 'TB_CENTRE_STAFF', 'GOVERNMENT_VIEWER', 'PLATFORM_ADMIN')),
  pharmacy_id text references public.pharmacies(pharmacy_id) on delete restrict,
  tb_center_id text references public.tb_centers(center_id) on delete restrict,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint staff_memberships_scope check (
    (role = 'PHARMACY_STAFF' and pharmacy_id is not null and tb_center_id is null)
    or (role = 'TB_CENTRE_STAFF' and tb_center_id is not null and pharmacy_id is null)
    or (role in ('GOVERNMENT_VIEWER', 'PLATFORM_ADMIN') and pharmacy_id is null and tb_center_id is null)
  ),
  unique (user_id, role, pharmacy_id, tb_center_id)
);

create table public.care_reminders (
  reminder_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scheduled_for timestamptz not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'SENT', 'COMPLETED', 'DISMISSED')),
  email_opt_in boolean not null default false,
  emailed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index account_patient_links_patient_id_idx on public.account_patient_links(patient_id);
create index staff_memberships_user_active_idx on public.staff_memberships(user_id) where active;
create index care_reminders_user_scheduled_idx on public.care_reminders(user_id, scheduled_for);
create index care_reminders_due_idx on public.care_reminders(scheduled_for) where status = 'PENDING';

alter table public.account_profiles enable row level security;
alter table public.account_patient_links enable row level security;
alter table public.staff_memberships enable row level security;
alter table public.care_reminders enable row level security;

revoke all on public.account_profiles, public.account_patient_links, public.staff_memberships, public.care_reminders from anon, authenticated;
grant select, insert, update on public.account_profiles to authenticated;
grant select on public.account_patient_links to authenticated;
grant select, insert, update on public.care_reminders to authenticated;

create policy "account owners read profile" on public.account_profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy "account owners create profile" on public.account_profiles for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "account owners update profile" on public.account_profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "account owners read care link" on public.account_patient_links for select to authenticated using ((select auth.uid()) = user_id);
create policy "account owners read reminders" on public.care_reminders for select to authenticated using ((select auth.uid()) = user_id);
create policy "account owners create reminders" on public.care_reminders for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "account owners update reminders" on public.care_reminders for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

comment on table public.account_profiles is 'Private optional account profile. Never expose profile identity to pharmacy or government dashboards.';
comment on table public.account_patient_links is 'One account-owned care journey link. Existing anonymous records remain unlinked unless the user saves care while signed in.';
comment on table public.care_reminders is 'Private care-navigation reminders. Email delivery must stay generic and contain no health details.';

commit;
