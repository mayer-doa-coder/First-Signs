begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- A valid assisted screening can exist without a referral. Link its illustrative
-- credit to the screening so pharmacy activity is not inferred from referrals.
alter table public.rewards
  add column screening_id text references public.screenings(screening_id),
  add column created_at timestamptz not null default now();

update public.rewards rw
set screening_id = r.screening_id
from public.referrals r
where rw.referral_id = r.referral_id
  and rw.reward_type = 'VALID_SCREENING_CREDIT'
  and rw.screening_id is null;

create unique index rewards_screening_type_unique_idx
  on public.rewards(screening_id, reward_type)
  where screening_id is not null;

create index rewards_pharmacy_status_idx
  on public.rewards(pharmacy_id, status);

comment on column public.rewards.screening_id is
  'Workflow link for a valid pharmacy-assisted screening credit. It does not represent a TB result.';

create or replace function public.validate_reward_pharmacy_context()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  referral_pharmacy_id text;
  screening_pharmacy_id text;
begin
  if new.referral_id is not null then
    select r.pharmacy_id
      into referral_pharmacy_id
      from public.referrals r
      where r.referral_id = new.referral_id;

    if found then
      if referral_pharmacy_id is null then
        raise exception 'A self-use referral cannot create a pharmacy reward';
      end if;

      if new.pharmacy_id is distinct from referral_pharmacy_id then
        raise exception 'Reward pharmacy must match the referral pharmacy';
      end if;
    end if;
  end if;

  if new.screening_id is not null then
    select s.pharmacy_id
      into screening_pharmacy_id
      from public.screenings s
      where s.screening_id = new.screening_id;

    if found then
      if screening_pharmacy_id is null then
        raise exception 'A self-use screening cannot create a pharmacy reward';
      end if;

      if new.pharmacy_id is distinct from screening_pharmacy_id then
        raise exception 'Reward pharmacy must match the assisted screening pharmacy';
      end if;
    end if;
  end if;

  return new;
end;
$$;

create function public.save_part11_screening(
  p_screening_id text,
  p_patient_id text,
  p_source_type text,
  p_pharmacy_id text,
  p_area_name text,
  p_area_latitude numeric,
  p_area_longitude numeric,
  p_symptom_answers jsonb,
  p_audio_status text,
  p_screening_result text
)
returns table (
  screening_id text,
  created boolean,
  screening_reward_created boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_screening public.screenings%rowtype;
  screening_was_created boolean := false;
  reward_was_created boolean := false;
  affected_rows integer := 0;
begin
  if p_screening_id is null or length(btrim(p_screening_id)) = 0 then
    raise exception 'screening_id is required' using errcode = '22023';
  end if;

  if p_patient_id is null or length(btrim(p_patient_id)) = 0 then
    raise exception 'patient_id is required' using errcode = '22023';
  end if;

  if p_source_type not in ('SELF', 'PHARMACY') then
    raise exception 'source_type must be SELF or PHARMACY' using errcode = '22023';
  end if;

  if (p_source_type = 'SELF' and p_pharmacy_id is not null)
    or (p_source_type = 'PHARMACY' and p_pharmacy_id is null) then
    raise exception 'source_type and pharmacy_id do not match' using errcode = '22023';
  end if;

  if p_area_name is null or length(btrim(p_area_name)) = 0 then
    raise exception 'area_name is required' using errcode = '22023';
  end if;

  if p_area_latitude is null or p_area_latitude not between -90 and 90
    or p_area_longitude is null or p_area_longitude not between -180 and 180 then
    raise exception 'Valid broad-area coordinates are required' using errcode = '22023';
  end if;

  if p_symptom_answers is null or jsonb_typeof(p_symptom_answers) <> 'object' then
    raise exception 'symptom_answers must be an object' using errcode = '22023';
  end if;

  if p_audio_status not in ('recorded', 'uploaded', 'skipped') then
    raise exception 'Unknown audio status' using errcode = '22023';
  end if;

  if p_screening_result not in (
    'CONTINUE_SCREENING',
    'FORMAL_TB_EVALUATION_RECOMMENDED',
    'URGENT_MEDICAL_EVALUATION'
  ) then
    raise exception 'Unknown fixed-rule screening result' using errcode = '22023';
  end if;

  if p_source_type = 'PHARMACY'
    and not exists (
      select 1
      from public.pharmacies p
      where p.pharmacy_id = p_pharmacy_id
        and p.active
    ) then
    raise exception 'Unknown or inactive pharmacy' using errcode = '23503';
  end if;

  insert into public.patients (
    patient_id,
    phone_or_demo_id,
    consent_status
  ) values (
    p_patient_id,
    p_patient_id,
    true
  )
  on conflict (patient_id) do update
    set consent_status = true;

  insert into public.screenings (
    screening_id,
    patient_id,
    source_type,
    pharmacy_id,
    area_name,
    area_latitude,
    area_longitude,
    symptom_answers,
    audio_status,
    screening_result
  ) values (
    p_screening_id,
    p_patient_id,
    p_source_type,
    p_pharmacy_id,
    p_area_name,
    p_area_latitude,
    p_area_longitude,
    p_symptom_answers,
    p_audio_status,
    p_screening_result
  )
  on conflict (screening_id) do nothing;

  get diagnostics affected_rows = row_count;
  screening_was_created := affected_rows > 0;

  if not screening_was_created then
    select s.*
      into existing_screening
      from public.screenings s
      where s.screening_id = p_screening_id;

    if existing_screening.patient_id is distinct from p_patient_id
      or existing_screening.source_type is distinct from p_source_type
      or existing_screening.pharmacy_id is distinct from p_pharmacy_id
      or existing_screening.area_name is distinct from p_area_name
      or existing_screening.area_latitude is distinct from p_area_latitude
      or existing_screening.area_longitude is distinct from p_area_longitude
      or existing_screening.symptom_answers is distinct from p_symptom_answers
      or existing_screening.audio_status is distinct from p_audio_status
      or existing_screening.screening_result is distinct from p_screening_result then
      raise exception 'screening_id already belongs to different screening data' using errcode = '23505';
    end if;
  end if;

  if p_source_type = 'PHARMACY' then
    insert into public.rewards (
      reward_id,
      pharmacy_id,
      screening_id,
      reward_type,
      amount,
      status
    ) values (
      'JVH-RWD-' || upper(replace(gen_random_uuid()::text, '-', '')),
      p_pharmacy_id,
      p_screening_id,
      'VALID_SCREENING_CREDIT',
      null,
      'PENDING'
    )
    on conflict (screening_id, reward_type)
      where screening_id is not null
      do nothing;

    get diagnostics affected_rows = row_count;
    reward_was_created := affected_rows > 0;
  end if;

  return query
    select p_screening_id, screening_was_created, reward_was_created;
end;
$$;

-- Referral creation reuses the idempotent completed-screening write above.
-- The readable referral counter remains transactional and gap-free on rollback.
create or replace function public.create_part9_referral(
  p_screening_id text,
  p_patient_id text,
  p_source_type text,
  p_pharmacy_id text,
  p_area_name text,
  p_area_latitude numeric,
  p_area_longitude numeric,
  p_symptom_answers jsonb,
  p_audio_status text,
  p_screening_result text,
  p_tb_center_id text
)
returns table (
  referral_id text,
  access_token uuid,
  status text,
  tb_center_id text,
  centre_name text,
  centre_area text,
  centre_district text,
  service_type text,
  created_at timestamptz,
  reward_created boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_referral_number bigint;
  next_referral_id text;
  next_access_token uuid;
  next_created_at timestamptz;
  existing_patient_id text;
  centre_record public.tb_centers%rowtype;
begin
  if p_screening_result not in (
    'FORMAL_TB_EVALUATION_RECOMMENDED',
    'URGENT_MEDICAL_EVALUATION'
  ) then
    raise exception 'Only a fixed-rule formal or urgent result can create a referral' using errcode = '22023';
  end if;

  select r.referral_id, r.access_token, r.created_at, r.patient_id
    into next_referral_id, next_access_token, next_created_at, existing_patient_id
    from public.referrals r
    where r.screening_id = p_screening_id;

  if found then
    if existing_patient_id is distinct from p_patient_id then
      raise exception 'screening_id already belongs to another patient' using errcode = '23505';
    end if;

    return query
      select
        r.referral_id,
        r.access_token,
        r.status,
        r.tb_center_id,
        c.name,
        c.area,
        c.district,
        c.service_type,
        r.created_at,
        exists (
          select 1 from public.rewards rw
          where rw.referral_id = r.referral_id
        )
      from public.referrals r
      join public.tb_centers c on c.center_id = r.tb_center_id
      where r.screening_id = p_screening_id;
    return;
  end if;

  select *
    into centre_record
    from public.tb_centers c
    where c.center_id = p_tb_center_id;

  if not found then
    raise exception 'Unknown TB centre' using errcode = '23503';
  end if;

  perform *
  from public.save_part11_screening(
    p_screening_id,
    p_patient_id,
    p_source_type,
    p_pharmacy_id,
    p_area_name,
    p_area_latitude,
    p_area_longitude,
    p_symptom_answers,
    p_audio_status,
    p_screening_result
  );

  update private.referral_counters
    set last_value = last_value + 1,
        updated_at = clock_timestamp()
    where counter_key = 'JVH-KHU'
    returning last_value into next_referral_number;

  if not found then
    raise exception 'Referral counter is not initialized' using errcode = '55000';
  end if;

  next_referral_id := 'JVH-KHU-' || lpad(
    next_referral_number::text,
    greatest(5, length(next_referral_number::text)),
    '0'
  );

  insert into public.referrals (
    referral_id,
    screening_id,
    patient_id,
    pharmacy_id,
    tb_center_id,
    status
  ) values (
    next_referral_id,
    p_screening_id,
    p_patient_id,
    p_pharmacy_id,
    p_tb_center_id,
    'PENDING'
  )
  returning referrals.access_token, referrals.created_at
    into next_access_token, next_created_at;

  if p_source_type = 'PHARMACY' then
    insert into public.rewards (
      reward_id,
      pharmacy_id,
      referral_id,
      reward_type,
      amount,
      status
    ) values (
      'JVH-RWD-' || upper(replace(gen_random_uuid()::text, '-', '')),
      p_pharmacy_id,
      next_referral_id,
      'APPROPRIATE_REFERRAL_CREDIT',
      null,
      'PENDING'
    )
    on conflict (referral_id, reward_type)
      where referral_id is not null
      do nothing;
  end if;

  return query
    select
      next_referral_id,
      next_access_token,
      'PENDING'::text,
      centre_record.center_id,
      centre_record.name,
      centre_record.area,
      centre_record.district,
      centre_record.service_type,
      next_created_at,
      p_source_type = 'PHARMACY';
end;
$$;

create function public.get_part11_pharmacy_dashboard(p_pharmacy_id text)
returns table (
  pharmacy_id text,
  pharmacy_name text,
  pharmacy_area text,
  integrity_score numeric,
  assisted_screenings bigint,
  referrals_created bigint,
  referrals_completed bigint,
  completion_rate numeric,
  simulated_earnings numeric,
  earnings_configured boolean,
  valid_screening_credits bigint,
  appropriate_referral_credits bigint,
  verified_completion_credits bigint,
  quality_bonus_credits bigint,
  held_credits bigint,
  last_activity_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with screening_totals as (
    select
      count(*)::bigint as assisted_screenings,
      max(s.created_at) as last_screening_at
    from public.screenings s
    where s.source_type = 'PHARMACY'
      and s.pharmacy_id = p_pharmacy_id
  ),
  referral_totals as (
    select
      count(*)::bigint as referrals_created,
      count(*) filter (where r.status = 'COMPLETED')::bigint as referrals_completed,
      max(coalesce(r.completed_at, r.created_at)) as last_referral_at
    from public.referrals r
    where r.pharmacy_id = p_pharmacy_id
  ),
  reward_totals as (
    select
      count(*) filter (where rw.reward_type = 'VALID_SCREENING_CREDIT')::bigint as valid_screening_credits,
      count(*) filter (where rw.reward_type = 'APPROPRIATE_REFERRAL_CREDIT')::bigint as appropriate_referral_credits,
      count(*) filter (where rw.reward_type = 'FORMAL_EVALUATION_COMPLETION_CREDIT')::bigint as verified_completion_credits,
      count(*) filter (where rw.reward_type = 'QUALITY_BONUS')::bigint as quality_bonus_credits,
      count(*) filter (where rw.status = 'HELD_FOR_REVIEW')::bigint as held_credits,
      count(*) filter (
        where rw.status <> 'HELD_FOR_REVIEW' and rw.amount is null
      ) = 0 as earnings_configured,
      coalesce(sum(rw.amount) filter (where rw.status <> 'HELD_FOR_REVIEW'), 0) as configured_total,
      max(rw.created_at) as last_reward_at
    from public.rewards rw
    where rw.pharmacy_id = p_pharmacy_id
  )
  select
    p.pharmacy_id,
    p.name,
    p.area,
    p.integrity_score,
    st.assisted_screenings,
    rt.referrals_created,
    rt.referrals_completed,
    case
      when rt.referrals_created = 0 then 0::numeric
      else round((rt.referrals_completed::numeric / rt.referrals_created::numeric) * 100, 1)
    end,
    case when wt.earnings_configured then wt.configured_total else null end,
    wt.earnings_configured,
    wt.valid_screening_credits,
    wt.appropriate_referral_credits,
    wt.verified_completion_credits,
    wt.quality_bonus_credits,
    wt.held_credits,
    greatest(st.last_screening_at, rt.last_referral_at, wt.last_reward_at)
  from public.pharmacies p
  cross join screening_totals st
  cross join referral_totals rt
  cross join reward_totals wt
  where p.pharmacy_id = p_pharmacy_id
    and p.active;
$$;

revoke all on function public.save_part11_screening(
  text, text, text, text, text, numeric, numeric, jsonb, text, text
) from public, anon, authenticated;
revoke all on function public.get_part11_pharmacy_dashboard(text)
  from public, anon, authenticated;

grant execute on function public.save_part11_screening(
  text, text, text, text, text, numeric, numeric, jsonb, text, text
) to service_role;
grant execute on function public.get_part11_pharmacy_dashboard(text)
  to service_role;

commit;
