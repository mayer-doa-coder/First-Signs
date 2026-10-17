begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Part 14 keeps only a one-way SHA-256 fingerprint of an audio file. The
-- recording itself remains in the browser and is never written to Postgres.
alter table public.screenings
  add column audio_file_hash text,
  add column possible_reused_audio boolean not null default false,
  add constraint screenings_audio_file_hash_format check (
    audio_file_hash is null or audio_file_hash ~ '^[0-9a-f]{64}$'
  ),
  add constraint screenings_audio_hash_matches_status check (
    audio_file_hash is null or audio_status = 'uploaded'
  );

comment on column public.screenings.audio_file_hash is
  'Lowercase SHA-256 of an uploaded cough-audio file. The audio itself is not stored.';
comment on column public.screenings.possible_reused_audio is
  'Review warning only: true when this exact uploaded-file hash already existed. It is not proof of fraud.';

create index screenings_audio_file_hash_idx
  on public.screenings(audio_file_hash)
  where audio_file_hash is not null;

-- Signals live outside the exposed public schema because they can reference a
-- private prototype patient ID. Only aggregate SECURITY DEFINER functions read
-- this table, and those functions are callable by service_role only.
create table private.part14_review_signals (
  signal_id uuid primary key default gen_random_uuid(),
  signal_type text not null,
  pharmacy_id text references public.pharmacies(pharmacy_id),
  patient_id text not null references public.patients(patient_id),
  screening_id text references public.screenings(screening_id),
  referral_id text references public.referrals(referral_id),
  reward_type text,
  created_at timestamptz not null default transaction_timestamp(),
  constraint part14_review_signals_type_allowed check (
    signal_type in (
      'DUPLICATE_PATIENT_REWARD',
      'POSSIBLE_REUSED_AUDIO',
      'UNUSUAL_PHARMACY_VOLUME'
    )
  ),
  constraint part14_review_signals_context check (
    (signal_type = 'DUPLICATE_PATIENT_REWARD' and screening_id is not null and reward_type is not null)
    or (signal_type = 'POSSIBLE_REUSED_AUDIO' and screening_id is not null and reward_type is null)
    or (signal_type = 'UNUSUAL_PHARMACY_VOLUME' and pharmacy_id is not null and referral_id is not null and reward_type is null)
  )
);

create unique index part14_duplicate_reward_signal_unique_idx
  on private.part14_review_signals(screening_id, reward_type)
  where signal_type = 'DUPLICATE_PATIENT_REWARD';
create unique index part14_reused_audio_signal_unique_idx
  on private.part14_review_signals(screening_id)
  where signal_type = 'POSSIBLE_REUSED_AUDIO';
create unique index part14_volume_signal_unique_idx
  on private.part14_review_signals(referral_id)
  where signal_type = 'UNUSUAL_PHARMACY_VOLUME';
create index part14_review_signals_pharmacy_created_idx
  on private.part14_review_signals(pharmacy_id, created_at desc)
  where pharmacy_id is not null;
create index rewards_patient_window_screening_idx
  on public.rewards(reward_type, created_at desc, screening_id)
  where screening_id is not null and status <> 'HELD_FOR_REVIEW';
create index rewards_patient_window_referral_idx
  on public.rewards(reward_type, created_at desc, referral_id)
  where referral_id is not null and status <> 'HELD_FOR_REVIEW';
create index referrals_pharmacy_created_at_idx
  on public.referrals(pharmacy_id, created_at desc)
  where pharmacy_id is not null;

revoke all on table private.part14_review_signals from public, anon, authenticated;

create function private.part14_has_recent_patient_reward(
  p_patient_id text,
  p_reward_type text,
  p_at timestamptz
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.rewards rw
    left join public.screenings s on s.screening_id = rw.screening_id
    left join public.referrals r on r.referral_id = rw.referral_id
    where rw.reward_type = p_reward_type
      and rw.status <> 'HELD_FOR_REVIEW'
      and rw.created_at >= p_at - interval '30 days'
      and coalesce(s.patient_id, r.patient_id) = p_patient_id
  );
$$;

create function private.part14_pharmacy_requires_review(
  p_pharmacy_id text,
  p_at timestamptz
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select count(*) >= 10
  from public.referrals r
  where r.pharmacy_id = p_pharmacy_id
    and r.created_at > p_at - interval '24 hours'
    and r.created_at <= p_at;
$$;

revoke all on function private.part14_has_recent_patient_reward(text, text, timestamptz)
  from public, anon, authenticated;
revoke all on function private.part14_pharmacy_requires_review(text, timestamptz)
  from public, anon, authenticated;

-- The RPC signatures gain an optional audio hash, so remove the old overloads
-- before creating the new server-only versions.
drop function public.create_part9_referral(
  text, text, text, text, text, numeric, numeric, jsonb, text, text, text
);
drop function public.save_part11_screening(
  text, text, text, text, text, numeric, numeric, jsonb, text, text
);

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
  p_audio_hash text,
  p_screening_result text
)
returns table (
  screening_id text,
  created boolean,
  screening_reward_created boolean,
  reward_eligible boolean,
  reward_status text,
  reward_warning text,
  possible_reused_audio boolean,
  activity_requires_review boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_screening public.screenings%rowtype;
  screening_was_created boolean := false;
  reward_was_created boolean := false;
  reward_is_eligible boolean := true;
  next_reward_status text := null;
  next_reward_warning text := null;
  audio_was_reused boolean := false;
  pharmacy_requires_review boolean := false;
  affected_rows integer := 0;
  event_at timestamptz := transaction_timestamp();
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
  if (p_audio_hash is not null and (
    p_audio_status <> 'uploaded' or p_audio_hash !~ '^[0-9a-f]{64}$'
  )) then
    raise exception 'Audio hash does not match audio status' using errcode = '22023';
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
      select 1 from public.pharmacies p
      where p.pharmacy_id = p_pharmacy_id and p.active
    ) then
    raise exception 'Unknown or inactive pharmacy' using errcode = '23503';
  end if;

  insert into public.patients (patient_id, phone_or_demo_id, consent_status)
  values (p_patient_id, p_patient_id, true)
  on conflict (patient_id) do update set consent_status = true;

  if p_audio_hash is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('part14-audio:' || p_audio_hash, 0));
    select exists (
      select 1 from public.screenings s where s.audio_file_hash = p_audio_hash
    ) into audio_was_reused;
  end if;

  insert into public.screenings (
    screening_id, patient_id, source_type, pharmacy_id, area_name,
    area_latitude, area_longitude, symptom_answers, audio_status,
    audio_file_hash, possible_reused_audio, screening_result
  ) values (
    p_screening_id, p_patient_id, p_source_type, p_pharmacy_id, p_area_name,
    p_area_latitude, p_area_longitude, p_symptom_answers, p_audio_status,
    p_audio_hash, audio_was_reused, p_screening_result
  )
  on conflict do nothing;

  get diagnostics affected_rows = row_count;
  screening_was_created := affected_rows > 0;

  if not screening_was_created then
    select s.* into existing_screening
    from public.screenings s where s.screening_id = p_screening_id;

    if not found
      or existing_screening.patient_id is distinct from p_patient_id
      or existing_screening.source_type is distinct from p_source_type
      or existing_screening.pharmacy_id is distinct from p_pharmacy_id
      or existing_screening.area_name is distinct from p_area_name
      or existing_screening.area_latitude is distinct from p_area_latitude
      or existing_screening.area_longitude is distinct from p_area_longitude
      or existing_screening.symptom_answers is distinct from p_symptom_answers
      or existing_screening.audio_status is distinct from p_audio_status
      or existing_screening.audio_file_hash is distinct from p_audio_hash
      or existing_screening.screening_result is distinct from p_screening_result then
      raise exception 'screening_id already belongs to different screening data' using errcode = '23505';
    end if;
    audio_was_reused := existing_screening.possible_reused_audio;
  elsif audio_was_reused then
    insert into private.part14_review_signals (
      signal_type, pharmacy_id, patient_id, screening_id
    ) values (
      'POSSIBLE_REUSED_AUDIO', p_pharmacy_id, p_patient_id, p_screening_id
    ) on conflict do nothing;
  end if;

  if p_source_type = 'PHARMACY' then
    pharmacy_requires_review := private.part14_pharmacy_requires_review(p_pharmacy_id, event_at);

    if exists (
      select 1 from public.rewards rw
      where rw.screening_id = p_screening_id
        and rw.reward_type = 'VALID_SCREENING_CREDIT'
    ) then
      select rw.status into next_reward_status
      from public.rewards rw
      where rw.screening_id = p_screening_id
        and rw.reward_type = 'VALID_SCREENING_CREDIT';
    else
      perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('part14-reward:' || p_patient_id || ':VALID_SCREENING_CREDIT', 0)
      );
      reward_is_eligible := not private.part14_has_recent_patient_reward(
        p_patient_id, 'VALID_SCREENING_CREDIT', event_at
      );

      if reward_is_eligible then
        next_reward_status := case when pharmacy_requires_review then 'HELD_FOR_REVIEW' else 'PENDING' end;
        insert into public.rewards (
          reward_id, pharmacy_id, screening_id, reward_type, amount, status
        ) values (
          'JVH-RWD-' || upper(replace(gen_random_uuid()::text, '-', '')),
          p_pharmacy_id, p_screening_id, 'VALID_SCREENING_CREDIT', null, next_reward_status
        ) on conflict do nothing;
        get diagnostics affected_rows = row_count;
        reward_was_created := affected_rows > 0;
      else
        next_reward_warning := 'RECENT_SCREENING_ALREADY_EXISTS';
        insert into private.part14_review_signals (
          signal_type, pharmacy_id, patient_id, screening_id, reward_type
        ) values (
          'DUPLICATE_PATIENT_REWARD', p_pharmacy_id, p_patient_id,
          p_screening_id, 'VALID_SCREENING_CREDIT'
        ) on conflict do nothing;
      end if;
    end if;
  end if;

  return query select
    p_screening_id,
    screening_was_created,
    reward_was_created,
    reward_is_eligible,
    next_reward_status,
    next_reward_warning,
    audio_was_reused,
    pharmacy_requires_review;
end;
$$;

create function public.create_part9_referral(
  p_screening_id text,
  p_patient_id text,
  p_source_type text,
  p_pharmacy_id text,
  p_area_name text,
  p_area_latitude numeric,
  p_area_longitude numeric,
  p_symptom_answers jsonb,
  p_audio_status text,
  p_audio_hash text,
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
  reward_created boolean,
  reward_eligible boolean,
  reward_status text,
  reward_warning text,
  possible_reused_audio boolean,
  activity_requires_review boolean
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
  reward_was_created boolean := false;
  reward_is_eligible boolean := true;
  next_reward_status text := null;
  next_reward_warning text := null;
  audio_was_reused boolean := false;
  pharmacy_requires_review boolean := false;
  affected_rows integer := 0;
  event_at timestamptz := transaction_timestamp();
begin
  if p_screening_result not in (
    'FORMAL_TB_EVALUATION_RECOMMENDED',
    'URGENT_MEDICAL_EVALUATION'
  ) then
    raise exception 'Only a fixed-rule formal or urgent result can create a referral' using errcode = '22023';
  end if;

  select r.referral_id, r.access_token, r.created_at, r.patient_id
  into next_referral_id, next_access_token, next_created_at, existing_patient_id
  from public.referrals r where r.screening_id = p_screening_id;

  if found then
    if existing_patient_id is distinct from p_patient_id then
      raise exception 'screening_id already belongs to another patient' using errcode = '23505';
    end if;
    return query
      select r.referral_id, r.access_token, r.status, r.tb_center_id,
        c.name, c.area, c.district, c.service_type, r.created_at,
        rw.reward_id is not null,
        not exists (
          select 1 from private.part14_review_signals sig
          where sig.signal_type = 'DUPLICATE_PATIENT_REWARD'
            and sig.screening_id = r.screening_id
            and sig.reward_type = 'APPROPRIATE_REFERRAL_CREDIT'
        ),
        rw.status,
        case when exists (
          select 1 from private.part14_review_signals sig
          where sig.signal_type = 'DUPLICATE_PATIENT_REWARD'
            and sig.screening_id = r.screening_id
            and sig.reward_type = 'APPROPRIATE_REFERRAL_CREDIT'
        ) then 'RECENT_SCREENING_ALREADY_EXISTS' else null end,
        s.possible_reused_audio,
        private.part14_pharmacy_requires_review(r.pharmacy_id, event_at)
      from public.referrals r
      join public.tb_centers c on c.center_id = r.tb_center_id
      join public.screenings s on s.screening_id = r.screening_id
      left join public.rewards rw
        on rw.referral_id = r.referral_id
       and rw.reward_type = 'APPROPRIATE_REFERRAL_CREDIT'
      where r.screening_id = p_screening_id;
    return;
  end if;

  select * into centre_record
  from public.tb_centers c where c.center_id = p_tb_center_id;
  if not found then
    raise exception 'Unknown TB centre' using errcode = '23503';
  end if;

  perform * from public.save_part11_screening(
    p_screening_id, p_patient_id, p_source_type, p_pharmacy_id,
    p_area_name, p_area_latitude, p_area_longitude, p_symptom_answers,
    p_audio_status, p_audio_hash, p_screening_result
  );

  select s.possible_reused_audio into audio_was_reused
  from public.screenings s where s.screening_id = p_screening_id;

  update private.referral_counters
  set last_value = last_value + 1, updated_at = clock_timestamp()
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
    referral_id, screening_id, patient_id, pharmacy_id, tb_center_id, status
  ) values (
    next_referral_id, p_screening_id, p_patient_id, p_pharmacy_id, p_tb_center_id, 'PENDING'
  ) returning referrals.access_token, referrals.created_at
    into next_access_token, next_created_at;

  if p_source_type = 'PHARMACY' then
    pharmacy_requires_review := private.part14_pharmacy_requires_review(p_pharmacy_id, event_at);
    if pharmacy_requires_review then
      insert into private.part14_review_signals (
        signal_type, pharmacy_id, patient_id, screening_id, referral_id
      ) values (
        'UNUSUAL_PHARMACY_VOLUME', p_pharmacy_id, p_patient_id,
        p_screening_id, next_referral_id
      ) on conflict do nothing;
    end if;

    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('part14-reward:' || p_patient_id || ':APPROPRIATE_REFERRAL_CREDIT', 0)
    );
    reward_is_eligible := not private.part14_has_recent_patient_reward(
      p_patient_id, 'APPROPRIATE_REFERRAL_CREDIT', event_at
    );

    if reward_is_eligible then
      next_reward_status := case when pharmacy_requires_review then 'HELD_FOR_REVIEW' else 'PENDING' end;
      insert into public.rewards (
        reward_id, pharmacy_id, referral_id, reward_type, amount, status
      ) values (
        'JVH-RWD-' || upper(replace(gen_random_uuid()::text, '-', '')),
        p_pharmacy_id, next_referral_id, 'APPROPRIATE_REFERRAL_CREDIT', null, next_reward_status
      ) on conflict do nothing;
      get diagnostics affected_rows = row_count;
      reward_was_created := affected_rows > 0;
    else
      next_reward_warning := 'RECENT_SCREENING_ALREADY_EXISTS';
      insert into private.part14_review_signals (
        signal_type, pharmacy_id, patient_id, screening_id, referral_id, reward_type
      ) values (
        'DUPLICATE_PATIENT_REWARD', p_pharmacy_id, p_patient_id,
        p_screening_id, next_referral_id, 'APPROPRIATE_REFERRAL_CREDIT'
      ) on conflict do nothing;
    end if;
  end if;

  return query select
    next_referral_id, next_access_token, 'PENDING'::text,
    centre_record.center_id, centre_record.name, centre_record.area,
    centre_record.district, centre_record.service_type, next_created_at,
    reward_was_created, reward_is_eligible, next_reward_status,
    next_reward_warning, audio_was_reused, pharmacy_requires_review;
end;
$$;

create or replace function public.complete_part10_referral(
  p_referral_id text,
  p_access_token uuid,
  p_tb_center_id text
)
returns table (
  referral_id text,
  status text,
  code_used boolean,
  tb_center_id text,
  centre_name text,
  centre_area text,
  centre_district text,
  service_type text,
  created_at timestamptz,
  completed_at timestamptz,
  already_used boolean,
  completion_reward_created boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_referral public.referrals%rowtype;
  centre_record public.tb_centers%rowtype;
  was_already_used boolean;
  reward_was_created boolean := false;
  reward_is_eligible boolean := true;
  pharmacy_requires_review boolean := false;
  affected_reward_rows integer := 0;
  event_at timestamptz := transaction_timestamp();
begin
  if (p_referral_id is null) = (p_access_token is null) then
    raise exception 'Provide exactly one referral lookup value' using errcode = '22023';
  end if;
  if p_referral_id is not null and p_referral_id !~ '^JVH-KHU-[0-9]{5,}$' then
    raise exception 'Invalid referral ID' using errcode = '22023';
  end if;
  if p_tb_center_id is null or length(btrim(p_tb_center_id)) = 0 then
    raise exception 'TB centre ID is required' using errcode = '22023';
  end if;

  select r.* into target_referral
  from public.referrals r
  where (p_referral_id is not null and r.referral_id = p_referral_id)
     or (p_access_token is not null and r.access_token = p_access_token)
  for update;
  if not found then return; end if;
  if target_referral.tb_center_id is distinct from p_tb_center_id then
    raise exception 'Referral belongs to a different TB centre' using errcode = '22023';
  end if;

  select * into centre_record
  from public.tb_centers c where c.center_id = target_referral.tb_center_id;
  if not found then
    raise exception 'Intended TB centre no longer exists' using errcode = '23503';
  end if;

  was_already_used := target_referral.code_used_at is not null
    or target_referral.status = 'COMPLETED';

  if not was_already_used then
    if target_referral.status not in ('PENDING', 'FOLLOW_UP') then
      raise exception 'Closed referrals cannot be completed' using errcode = '22023';
    end if;

    -- The row lock makes this one-time transition authoritative even when two
    -- centre devices submit the same code concurrently.
    update public.referrals r
    set status = 'COMPLETED', completed_at = event_at, code_used_at = event_at
    where r.referral_id = target_referral.referral_id
    returning r.* into target_referral;

    if target_referral.pharmacy_id is not null then
      pharmacy_requires_review := private.part14_pharmacy_requires_review(
        target_referral.pharmacy_id, event_at
      );
      perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
          'part14-reward:' || target_referral.patient_id || ':FORMAL_EVALUATION_COMPLETION_CREDIT', 0
        )
      );
      reward_is_eligible := not private.part14_has_recent_patient_reward(
        target_referral.patient_id, 'FORMAL_EVALUATION_COMPLETION_CREDIT', event_at
      );

      if reward_is_eligible then
        insert into public.rewards (
          reward_id, pharmacy_id, referral_id, reward_type, amount, status
        ) values (
          'JVH-RWD-' || upper(replace(gen_random_uuid()::text, '-', '')),
          target_referral.pharmacy_id, target_referral.referral_id,
          'FORMAL_EVALUATION_COMPLETION_CREDIT', null,
          case when pharmacy_requires_review then 'HELD_FOR_REVIEW' else 'CONFIRMED' end
        ) on conflict do nothing;
        get diagnostics affected_reward_rows = row_count;
        reward_was_created := affected_reward_rows > 0;
      else
        insert into private.part14_review_signals (
          signal_type, pharmacy_id, patient_id, screening_id, referral_id, reward_type
        ) values (
          'DUPLICATE_PATIENT_REWARD', target_referral.pharmacy_id,
          target_referral.patient_id, target_referral.screening_id,
          target_referral.referral_id, 'FORMAL_EVALUATION_COMPLETION_CREDIT'
        ) on conflict do nothing;
      end if;
    end if;
  end if;

  return query select
    target_referral.referral_id, target_referral.status,
    target_referral.code_used_at is not null, target_referral.tb_center_id,
    centre_record.name, centre_record.area, centre_record.district,
    centre_record.service_type, target_referral.created_at,
    target_referral.completed_at, was_already_used, reward_was_created;
end;
$$;

drop function public.get_part11_pharmacy_dashboard(text);

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
  duplicate_reward_warnings bigint,
  reused_audio_warnings bigint,
  activity_requires_review boolean,
  last_activity_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with screening_totals as (
    select count(*)::bigint as assisted_screenings, max(s.created_at) as last_screening_at
    from public.screenings s
    where s.source_type = 'PHARMACY' and s.pharmacy_id = p_pharmacy_id
  ),
  referral_totals as (
    select count(*)::bigint as referrals_created,
      count(*) filter (where r.status = 'COMPLETED')::bigint as referrals_completed,
      max(coalesce(r.completed_at, r.created_at)) as last_referral_at
    from public.referrals r where r.pharmacy_id = p_pharmacy_id
  ),
  reward_totals as (
    select count(*) filter (where rw.reward_type = 'VALID_SCREENING_CREDIT')::bigint as valid_screening_credits,
      count(*) filter (where rw.reward_type = 'APPROPRIATE_REFERRAL_CREDIT')::bigint as appropriate_referral_credits,
      count(*) filter (where rw.reward_type = 'FORMAL_EVALUATION_COMPLETION_CREDIT')::bigint as verified_completion_credits,
      count(*) filter (where rw.reward_type = 'QUALITY_BONUS')::bigint as quality_bonus_credits,
      count(*) filter (where rw.status = 'HELD_FOR_REVIEW')::bigint as held_credits,
      count(*) filter (where rw.status <> 'HELD_FOR_REVIEW' and rw.amount is null) = 0 as earnings_configured,
      coalesce(sum(rw.amount) filter (where rw.status <> 'HELD_FOR_REVIEW'), 0) as configured_total,
      max(rw.created_at) as last_reward_at
    from public.rewards rw where rw.pharmacy_id = p_pharmacy_id
  ),
  signal_totals as (
    select count(*) filter (where sig.signal_type = 'DUPLICATE_PATIENT_REWARD')::bigint as duplicate_reward_warnings,
      count(*) filter (where sig.signal_type = 'POSSIBLE_REUSED_AUDIO')::bigint as reused_audio_warnings,
      max(sig.created_at) as last_signal_at
    from private.part14_review_signals sig where sig.pharmacy_id = p_pharmacy_id
  )
  select p.pharmacy_id, p.name, p.area, p.integrity_score,
    st.assisted_screenings, rt.referrals_created, rt.referrals_completed,
    case when rt.referrals_created = 0 then 0::numeric
      else round((rt.referrals_completed::numeric / rt.referrals_created::numeric) * 100, 1) end,
    case when wt.earnings_configured then wt.configured_total else null end,
    wt.earnings_configured, wt.valid_screening_credits,
    wt.appropriate_referral_credits, wt.verified_completion_credits,
    wt.quality_bonus_credits, wt.held_credits,
    sig.duplicate_reward_warnings, sig.reused_audio_warnings,
    private.part14_pharmacy_requires_review(p.pharmacy_id, statement_timestamp()),
    greatest(st.last_screening_at, rt.last_referral_at, wt.last_reward_at, sig.last_signal_at)
  from public.pharmacies p
  cross join screening_totals st
  cross join referral_totals rt
  cross join reward_totals wt
  cross join signal_totals sig
  where p.pharmacy_id = p_pharmacy_id and p.active;
$$;

drop function public.get_part13_government_dashboard();

create function public.get_part13_government_dashboard()
returns table (
  total_screenings bigint,
  self_use_screenings bigint,
  pharmacy_assisted_screenings bigint,
  formal_referrals bigint,
  completed_referrals bigint,
  completion_rate numeric,
  demo_window_started_at timestamptz,
  demo_window_ended_at timestamptz,
  area_activity jsonb,
  fraud_alerts jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with demo_clock as (
    select coalesce(max(s.created_at), statement_timestamp()) as ended_at
    from public.screenings s
  ),
  demo_window as (
    select ended_at - interval '7 days' as started_at, ended_at from demo_clock
  ),
  screening_totals as (
    select count(*)::bigint as total_screenings,
      count(*) filter (where s.source_type = 'SELF')::bigint as self_use_screenings,
      count(*) filter (where s.source_type = 'PHARMACY')::bigint as pharmacy_assisted_screenings
    from public.screenings s
  ),
  referral_totals as (
    select count(*)::bigint as formal_referrals,
      count(*) filter (where r.status = 'COMPLETED')::bigint as completed_referrals
    from public.referrals r
  ),
  window_screenings as (
    select s.screening_id, s.patient_id, s.area_name, s.screening_result
    from public.screenings s cross join demo_window w
    where s.created_at >= w.started_at and s.created_at <= w.ended_at
      and s.area_name in ('Sonadanga', 'Khalishpur', 'Daulatpur', 'Boyra', 'Batiaghata')
  ),
  area_screenings as (
    select s.area_name, count(distinct s.patient_id)::bigint as unique_users_screened,
      count(distinct s.patient_id) filter (
        where s.screening_result in ('FORMAL_TB_EVALUATION_RECOMMENDED', 'URGENT_MEDICAL_EVALUATION')
      )::bigint as unique_users_recommended
    from window_screenings s group by s.area_name
  ),
  area_referrals as (
    select s.area_name, count(r.referral_id)::bigint as referral_count,
      count(r.referral_id) filter (where r.status = 'COMPLETED')::bigint as completion_count,
      count(distinct r.patient_id)::bigint as independent_referred_users
    from window_screenings s
    left join public.referrals r on r.screening_id = s.screening_id
    group by s.area_name
  ),
  visible_areas as (
    select s.area_name, s.unique_users_screened, s.unique_users_recommended,
      r.referral_count, r.completion_count, r.independent_referred_users,
      case when r.independent_referred_users >= 5 then 'RED'
        when r.independent_referred_users >= 3 then 'WATCH' else 'NORMAL' end as hotspot_level
    from area_screenings s join area_referrals r using (area_name)
    where s.unique_users_screened >= 3
  ),
  review_summary as (
    select count(*) filter (where sig.signal_type = 'DUPLICATE_PATIENT_REWARD')::bigint as duplicate_reward_warnings,
      count(*) filter (where sig.signal_type = 'POSSIBLE_REUSED_AUDIO')::bigint as reused_audio_warnings
    from private.part14_review_signals sig
  ),
  active_pharmacy_reviews as (
    select count(*)::bigint as pharmacies_requiring_review
    from public.pharmacies p
    where p.active and private.part14_pharmacy_requires_review(p.pharmacy_id, statement_timestamp())
  ),
  held_rewards as (
    select count(*)::bigint as held_reward_count
    from public.rewards rw where rw.status = 'HELD_FOR_REVIEW'
  )
  select st.total_screenings, st.self_use_screenings, st.pharmacy_assisted_screenings,
    rt.formal_referrals, rt.completed_referrals,
    case when rt.formal_referrals = 0 then 0::numeric
      else round((rt.completed_referrals::numeric / rt.formal_referrals::numeric) * 100, 1) end,
    w.started_at, w.ended_at,
    coalesce((select jsonb_agg(jsonb_build_object(
      'area_name', a.area_name,
      'unique_users_screened', a.unique_users_screened,
      'unique_users_recommended', a.unique_users_recommended,
      'referral_count', a.referral_count,
      'completion_count', a.completion_count,
      'independent_referred_users', a.independent_referred_users,
      'hotspot_level', a.hotspot_level
    ) order by a.area_name) from visible_areas a), '[]'::jsonb),
    jsonb_build_object(
      'duplicate_reward_warnings', rs.duplicate_reward_warnings,
      'reused_audio_warnings', rs.reused_audio_warnings,
      'pharmacies_requiring_review', apr.pharmacies_requiring_review,
      'held_reward_count', hr.held_reward_count
    )
  from screening_totals st
  cross join referral_totals rt
  cross join demo_window w
  cross join review_summary rs
  cross join active_pharmacy_reviews apr
  cross join held_rewards hr;
$$;

comment on function public.get_part13_government_dashboard() is
  'Server-only anonymous programme aggregate. Part 14 adds aggregate review-signal counts only; no patient IDs, audio hashes, pharmacy identities, or exact locations are returned.';

revoke all on function public.save_part11_screening(
  text, text, text, text, text, numeric, numeric, jsonb, text, text, text
) from public, anon, authenticated;
revoke all on function public.create_part9_referral(
  text, text, text, text, text, numeric, numeric, jsonb, text, text, text, text
) from public, anon, authenticated;
revoke all on function public.complete_part10_referral(text, uuid, text)
  from public, anon, authenticated;
revoke all on function public.get_part11_pharmacy_dashboard(text)
  from public, anon, authenticated;
revoke all on function public.get_part13_government_dashboard()
  from public, anon, authenticated;

grant execute on function public.save_part11_screening(
  text, text, text, text, text, numeric, numeric, jsonb, text, text, text
) to service_role;
grant execute on function public.create_part9_referral(
  text, text, text, text, text, numeric, numeric, jsonb, text, text, text, text
) to service_role;
grant execute on function public.complete_part10_referral(text, uuid, text)
  to service_role;
grant execute on function public.get_part11_pharmacy_dashboard(text)
  to service_role;
grant execute on function public.get_part13_government_dashboard()
  to service_role;

commit;
