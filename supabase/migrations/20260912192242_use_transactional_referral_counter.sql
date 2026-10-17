begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- The prototype must begin at JVH-KHU-00001. Refuse to reset numbering when
-- any referral exists so this migration can never create duplicate IDs.
do $$
begin
  if exists (select 1 from public.referrals) then
    raise exception 'Cannot initialize referral numbering while referrals exist';
  end if;
end;
$$;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.referral_counters (
  counter_key text primary key,
  last_value bigint not null default 0,
  updated_at timestamptz not null default now(),
  constraint referral_counters_key_not_blank check (length(btrim(counter_key)) > 0),
  constraint referral_counters_last_value_non_negative check (last_value >= 0)
);

comment on table private.referral_counters is
  'Transactional referral-number allocator. Unlike a sequence, increments roll back when referral creation fails.';

insert into private.referral_counters (counter_key, last_value)
values ('JVH-KHU', 0);

revoke all on table private.referral_counters from public, anon, authenticated, service_role;

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

  if p_symptom_answers is null or jsonb_typeof(p_symptom_answers) <> 'object' then
    raise exception 'symptom_answers must be an object' using errcode = '22023';
  end if;

  if p_screening_result not in (
    'FORMAL_TB_EVALUATION_RECOMMENDED',
    'URGENT_MEDICAL_EVALUATION'
  ) then
    raise exception 'Only a fixed-rule formal or urgent result can create a referral' using errcode = '22023';
  end if;

  -- Idempotency is checked before allocating a number. A network retry for an
  -- already-created screening therefore returns the original referral.
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
          select 1
          from public.rewards rw
          where rw.referral_id = r.referral_id
        )
      from public.referrals r
      join public.tb_centers c on c.center_id = r.tb_center_id
      where r.screening_id = p_screening_id;
    return;
  end if;

  select * into centre_record
    from public.tb_centers c
    where c.center_id = p_tb_center_id;

  if not found then
    raise exception 'Unknown TB centre' using errcode = '23503';
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
  );

  -- UPDATE takes a row lock, serializing concurrent allocations. Because this
  -- is a normal transactional row update, a later error rolls the increment
  -- back together with the patient, screening, referral, and reward writes.
  update private.referral_counters
    set last_value = last_value + 1,
        updated_at = clock_timestamp()
    where counter_key = 'JVH-KHU'
    returning last_value into next_referral_number;

  if not found then
    raise exception 'Referral counter is not initialized' using errcode = '55000';
  end if;

  -- Keep a minimum of five digits without truncating values above 99999.
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
    ) values
      (
        'JVH-RWD-' || upper(replace(gen_random_uuid()::text, '-', '')),
        p_pharmacy_id,
        next_referral_id,
        'VALID_SCREENING_CREDIT',
        null,
        'PENDING'
      ),
      (
        'JVH-RWD-' || upper(replace(gen_random_uuid()::text, '-', '')),
        p_pharmacy_id,
        next_referral_id,
        'APPROPRIATE_REFERRAL_CREDIT',
        null,
        'PENDING'
      );
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

revoke all on function public.create_part9_referral(
  text, text, text, text, text, numeric, numeric, jsonb, text, text, text
) from public, anon, authenticated;

grant execute on function public.create_part9_referral(
  text, text, text, text, text, numeric, numeric, jsonb, text, text, text
) to service_role;

drop sequence public.referral_code_sequence;

commit;
