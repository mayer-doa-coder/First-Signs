begin;

create table public.patients (
  patient_id text primary key,
  phone_or_demo_id text not null unique,
  consent_status boolean not null default false,
  created_at timestamptz not null default now(),
  constraint patients_patient_id_not_blank check (length(btrim(patient_id)) > 0),
  constraint patients_phone_or_demo_id_not_blank check (length(btrim(phone_or_demo_id)) > 0)
);

comment on table public.patients is
  'Private prototype patient records. Never expose this table in public-health or public views.';

create table public.pharmacies (
  pharmacy_id text primary key,
  name text not null,
  area text not null,
  active boolean not null default true,
  integrity_score numeric(5, 2),
  constraint pharmacies_pharmacy_id_not_blank check (length(btrim(pharmacy_id)) > 0),
  constraint pharmacies_name_not_blank check (length(btrim(name)) > 0),
  constraint pharmacies_area_not_blank check (length(btrim(area)) > 0),
  constraint pharmacies_integrity_score_range check (
    integrity_score is null or integrity_score between 0 and 100
  )
);

create table public.tb_centers (
  center_id text primary key,
  name text not null,
  district text not null,
  area text not null,
  latitude numeric(9, 6) not null,
  longitude numeric(9, 6) not null,
  service_type text not null,
  constraint tb_centers_center_id_not_blank check (length(btrim(center_id)) > 0),
  constraint tb_centers_name_not_blank check (length(btrim(name)) > 0),
  constraint tb_centers_district_not_blank check (length(btrim(district)) > 0),
  constraint tb_centers_area_not_blank check (length(btrim(area)) > 0),
  constraint tb_centers_service_type_not_blank check (length(btrim(service_type)) > 0),
  constraint tb_centers_latitude_range check (latitude between -90 and 90),
  constraint tb_centers_longitude_range check (longitude between -180 and 180)
);

create table public.screenings (
  screening_id text primary key,
  patient_id text not null references public.patients(patient_id),
  source_type text not null,
  pharmacy_id text references public.pharmacies(pharmacy_id),
  area_name text not null,
  area_latitude numeric(9, 6),
  area_longitude numeric(9, 6),
  symptom_answers jsonb not null default '{}'::jsonb,
  audio_status text,
  screening_result text,
  created_at timestamptz not null default now(),
  constraint screenings_screening_id_not_blank check (length(btrim(screening_id)) > 0),
  constraint screenings_source_type_allowed check (source_type in ('SELF', 'PHARMACY')),
  constraint screenings_source_matches_pharmacy check (
    (source_type = 'SELF' and pharmacy_id is null)
    or (source_type = 'PHARMACY' and pharmacy_id is not null)
  ),
  constraint screenings_area_name_not_blank check (length(btrim(area_name)) > 0),
  constraint screenings_area_latitude_range check (
    area_latitude is null or area_latitude between -90 and 90
  ),
  constraint screenings_area_longitude_range check (
    area_longitude is null or area_longitude between -180 and 180
  ),
  constraint screenings_area_coordinates_together check (
    (area_latitude is null and area_longitude is null)
    or (area_latitude is not null and area_longitude is not null)
  ),
  constraint screenings_symptom_answers_object check (
    jsonb_typeof(symptom_answers) = 'object'
  ),
  constraint screenings_patient_pair unique (screening_id, patient_id)
);

comment on column public.screenings.area_name is
  'Broad area only. Never store an exact home address in this table.';
comment on column public.screenings.area_latitude is
  'Optional coarse area coordinate; never an exact patient location.';
comment on column public.screenings.area_longitude is
  'Optional coarse area coordinate; never an exact patient location.';

create table public.referrals (
  referral_id text primary key,
  screening_id text not null unique,
  patient_id text not null,
  pharmacy_id text references public.pharmacies(pharmacy_id),
  tb_center_id text not null references public.tb_centers(center_id),
  status text not null default 'PENDING',
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint referrals_screening_patient_fk
    foreign key (screening_id, patient_id)
    references public.screenings(screening_id, patient_id),
  constraint referrals_referral_id_not_blank check (length(btrim(referral_id)) > 0),
  constraint referrals_status_allowed check (
    status in ('PENDING', 'FOLLOW_UP', 'COMPLETED', 'CLOSED')
  ),
  constraint referrals_completion_time_matches_status check (
    (status = 'COMPLETED' and completed_at is not null)
    or (status <> 'COMPLETED' and completed_at is null)
  ),
  constraint referrals_patient_pair unique (referral_id, patient_id)
);

create table public.rewards (
  reward_id text primary key,
  pharmacy_id text not null references public.pharmacies(pharmacy_id),
  referral_id text references public.referrals(referral_id),
  reward_type text not null,
  amount numeric(10, 2) not null,
  status text not null default 'PENDING',
  constraint rewards_reward_id_not_blank check (length(btrim(reward_id)) > 0),
  constraint rewards_reward_type_not_blank check (length(btrim(reward_type)) > 0),
  constraint rewards_amount_non_negative check (amount >= 0),
  constraint rewards_status_allowed check (
    status in ('PENDING', 'CONFIRMED', 'HELD_FOR_REVIEW')
  )
);

comment on table public.rewards is
  'Illustrative prototype incentives only. Rewards are for workflow completion, never a positive TB result.';

create table public.followups (
  patient_id text not null,
  referral_id text primary key,
  followup_status text not null,
  barrier text,
  next_action text,
  created_at timestamptz not null default now(),
  constraint followups_referral_patient_fk
    foreign key (referral_id, patient_id)
    references public.referrals(referral_id, patient_id),
  constraint followups_status_not_blank check (length(btrim(followup_status)) > 0)
);

create function public.validate_referral_source_context()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  screening_source_type text;
  screening_pharmacy_id text;
begin
  select source_type, pharmacy_id
    into screening_source_type, screening_pharmacy_id
    from public.screenings
    where screening_id = new.screening_id;

  if not found then
    return new;
  end if;

  if screening_source_type = 'SELF' and new.pharmacy_id is not null then
    raise exception 'A self-use screening cannot create a pharmacy-linked referral';
  end if;

  if screening_source_type = 'PHARMACY'
    and new.pharmacy_id is distinct from screening_pharmacy_id then
    raise exception 'Referral pharmacy must match the assisted screening pharmacy';
  end if;

  return new;
end;
$$;

create trigger referrals_validate_source_context
before insert or update of screening_id, pharmacy_id
on public.referrals
for each row
execute function public.validate_referral_source_context();

create function public.validate_reward_pharmacy_context()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  referral_pharmacy_id text;
begin
  if new.referral_id is null then
    return new;
  end if;

  select pharmacy_id
    into referral_pharmacy_id
    from public.referrals
    where referral_id = new.referral_id;

  if not found then
    return new;
  end if;

  if referral_pharmacy_id is null then
    raise exception 'A self-use referral cannot create a pharmacy reward';
  end if;

  if new.pharmacy_id is distinct from referral_pharmacy_id then
    raise exception 'Reward pharmacy must match the referral pharmacy';
  end if;

  return new;
end;
$$;

create trigger rewards_validate_pharmacy_context
before insert or update of pharmacy_id, referral_id
on public.rewards
for each row
execute function public.validate_reward_pharmacy_context();

create index screenings_patient_id_idx on public.screenings(patient_id);
create index screenings_pharmacy_id_idx on public.screenings(pharmacy_id) where pharmacy_id is not null;
create index screenings_area_created_at_idx on public.screenings(area_name, created_at desc);
create index referrals_patient_id_idx on public.referrals(patient_id);
create index referrals_pharmacy_id_idx on public.referrals(pharmacy_id) where pharmacy_id is not null;
create index referrals_tb_center_status_idx on public.referrals(tb_center_id, status);
create index rewards_pharmacy_id_idx on public.rewards(pharmacy_id);
create index rewards_referral_id_idx on public.rewards(referral_id) where referral_id is not null;
create index followups_patient_id_idx on public.followups(patient_id);
create index followups_status_idx on public.followups(followup_status);

alter table public.patients enable row level security;
alter table public.pharmacies enable row level security;
alter table public.tb_centers enable row level security;
alter table public.screenings enable row level security;
alter table public.referrals enable row level security;
alter table public.rewards enable row level security;
alter table public.followups enable row level security;

revoke all on table public.patients from anon, authenticated;
revoke all on table public.pharmacies from anon, authenticated;
revoke all on table public.tb_centers from anon, authenticated;
revoke all on table public.screenings from anon, authenticated;
revoke all on table public.referrals from anon, authenticated;
revoke all on table public.rewards from anon, authenticated;
revoke all on table public.followups from anon, authenticated;
revoke all on function public.validate_referral_source_context() from public, anon, authenticated;
revoke all on function public.validate_reward_pharmacy_context() from public, anon, authenticated;

commit;
