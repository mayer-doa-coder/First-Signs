begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

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
    on conflict do nothing;
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

commit;
