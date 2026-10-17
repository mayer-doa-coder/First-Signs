begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create or replace function public.save_part11_screening(
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
  on conflict do nothing;

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
    on conflict do nothing;

    get diagnostics affected_rows = row_count;
    reward_was_created := affected_rows > 0;
  end if;

  return query
    select p_screening_id, screening_was_created, reward_was_created;
end;
$$;

commit;
