begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table public.screenings
  add column pathway_id text not null default 'RESPIRATORY_TB',
  add column rule_version text not null default 'BD-NTP-WHO-SYMPTOM-V1',
  add column age_band text not null default 'ADULT',
  add column care_outcome text;

alter table public.screenings
  add constraint screenings_pathway_allowed check (pathway_id in (
    'RESPIRATORY_TB', 'FEVER_MOSQUITO', 'DIARRHOEA_DEHYDRATION',
    'SKIN_NERVE_LEPROSY', 'CHILD_BREATHING'
  )),
  add constraint screenings_age_band_allowed check (age_band in ('UNDER_5', 'AGE_5_TO_17', 'ADULT')),
  add constraint screenings_care_outcome_allowed check (care_outcome in (
    'CONTINUE_WITH_CARE_INFORMATION',
    'PROFESSIONAL_EVALUATION_RECOMMENDED',
    'URGENT_MEDICAL_EVALUATION'
  ));

update public.screenings
set care_outcome = case screening_result
  when 'CONTINUE_SCREENING' then 'CONTINUE_WITH_CARE_INFORMATION'
  when 'FORMAL_TB_EVALUATION_RECOMMENDED' then 'PROFESSIONAL_EVALUATION_RECOMMENDED'
  else 'URGENT_MEDICAL_EVALUATION'
end;

alter table public.screenings alter column care_outcome set not null;

comment on column public.screenings.pathway_id is 'Non-diagnostic care-navigation pathway selected by the person.';
comment on column public.screenings.care_outcome is 'Server-recomputed fixed-rule navigation outcome; never a diagnosis.';

alter table public.referrals
  add column pathway_id text not null default 'RESPIRATORY_TB',
  add column facility_id text references public.tb_centers(center_id);

update public.referrals set facility_id = tb_center_id where facility_id is null;
alter table public.referrals alter column facility_id set not null;
alter table public.referrals add constraint referrals_pathway_allowed check (pathway_id in (
  'RESPIRATORY_TB', 'FEVER_MOSQUITO', 'DIARRHOEA_DEHYDRATION',
  'SKIN_NERVE_LEPROSY', 'CHILD_BREATHING'
));

comment on column public.referrals.facility_id is
  'Generic care-facility link. tb_center_id is retained for backward compatibility with existing QR and verification workflows.';

alter table public.tb_centers
  add column supported_pathways text[] not null default array['RESPIRATORY_TB']::text[];

update public.tb_centers
set supported_pathways = array[
  'RESPIRATORY_TB', 'FEVER_MOSQUITO', 'DIARRHOEA_DEHYDRATION',
  'SKIN_NERVE_LEPROSY', 'CHILD_BREATHING'
]::text[];

create table public.care_signals (
  signal_id text primary key,
  pathway_id text not null,
  age_band text not null,
  care_outcome text not null,
  source_type text not null,
  area_name text not null,
  created_at timestamptz not null default transaction_timestamp(),
  constraint care_signals_id_format check (signal_id ~ '^JVH-SIG-[A-F0-9]{32}$'),
  constraint care_signals_pathway_allowed check (pathway_id in (
    'RESPIRATORY_TB', 'FEVER_MOSQUITO', 'DIARRHOEA_DEHYDRATION',
    'SKIN_NERVE_LEPROSY', 'CHILD_BREATHING'
  )),
  constraint care_signals_age_allowed check (age_band in ('UNDER_5', 'AGE_5_TO_17', 'ADULT')),
  constraint care_signals_outcome_allowed check (care_outcome in (
    'CONTINUE_WITH_CARE_INFORMATION', 'PROFESSIONAL_EVALUATION_RECOMMENDED', 'URGENT_MEDICAL_EVALUATION'
  )),
  constraint care_signals_source_allowed check (source_type in ('SELF', 'PHARMACY')),
  constraint care_signals_area_not_blank check (length(btrim(area_name)) > 0)
);

alter table public.care_signals enable row level security;
revoke all on table public.care_signals from public, anon, authenticated;
create index care_signals_pathway_area_created_idx on public.care_signals(pathway_id, area_name, created_at desc);

comment on table public.care_signals is
  'Anonymous early care-navigation signals. Contains no patient ID, raw answers, referral token, exact location, or audio.';

create table public.public_health_actions (
  action_id uuid primary key default gen_random_uuid(),
  pathway_id text not null,
  area_name text not null,
  action_type text not null,
  note text,
  recorded_at timestamptz not null default transaction_timestamp(),
  constraint public_health_actions_pathway_allowed check (pathway_id in (
    'RESPIRATORY_TB', 'FEVER_MOSQUITO', 'DIARRHOEA_DEHYDRATION',
    'SKIN_NERVE_LEPROSY', 'CHILD_BREATHING'
  )),
  constraint public_health_actions_type_allowed check (action_type in (
    'REVIEW_SIGNAL', 'CHECK_WATER_SAFETY', 'ARRANGE_OUTREACH',
    'CHECK_TESTING_ACCESS', 'MOBILE_SERVICE', 'CLOSE_REVIEW'
  )),
  constraint public_health_actions_note_length check (note is null or char_length(note) <= 280)
);

alter table public.public_health_actions enable row level security;
revoke all on table public.public_health_actions from public, anon, authenticated;
create index public_health_actions_area_recorded_idx on public.public_health_actions(pathway_id, area_name, recorded_at desc);

create function public.save_care_signal(
  p_signal_id text, p_pathway_id text, p_age_band text,
  p_care_outcome text, p_source_type text, p_area_name text
)
returns table (signal_id text, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare affected_rows integer := 0;
begin
  if p_signal_id !~ '^JVH-SIG-[A-F0-9]{32}$'
    or p_pathway_id not in ('RESPIRATORY_TB','FEVER_MOSQUITO','DIARRHOEA_DEHYDRATION','SKIN_NERVE_LEPROSY','CHILD_BREATHING')
    or p_age_band not in ('UNDER_5','AGE_5_TO_17','ADULT')
    or p_care_outcome not in ('CONTINUE_WITH_CARE_INFORMATION','PROFESSIONAL_EVALUATION_RECOMMENDED','URGENT_MEDICAL_EVALUATION')
    or p_source_type not in ('SELF','PHARMACY')
    or p_area_name is null or length(btrim(p_area_name)) = 0 then
    raise exception 'Invalid anonymous care signal' using errcode = '22023';
  end if;
  insert into public.care_signals(signal_id, pathway_id, age_band, care_outcome, source_type, area_name)
  values (p_signal_id, p_pathway_id, p_age_band, p_care_outcome, p_source_type, p_area_name)
  on conflict (signal_id) do nothing;
  get diagnostics affected_rows = row_count;
  return query select p_signal_id, affected_rows > 0;
end;
$$;

create function public.save_multisyndrome_screening(
  p_screening_id text, p_patient_id text, p_source_type text, p_pharmacy_id text,
  p_pathway_id text, p_rule_version text, p_age_band text,
  p_area_name text, p_area_latitude numeric, p_area_longitude numeric,
  p_symptom_answers jsonb, p_audio_status text, p_audio_hash text, p_screening_result text
)
returns table (
  screening_id text, created boolean, screening_reward_created boolean,
  reward_eligible boolean, reward_status text, reward_warning text,
  possible_reused_audio boolean, activity_requires_review boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare mapped_result text;
begin
  if p_pathway_id not in ('RESPIRATORY_TB','FEVER_MOSQUITO','DIARRHOEA_DEHYDRATION','SKIN_NERVE_LEPROSY','CHILD_BREATHING')
    or p_age_band not in ('UNDER_5','AGE_5_TO_17','ADULT')
    or p_rule_version is null or length(btrim(p_rule_version)) = 0 then
    raise exception 'Invalid pathway metadata' using errcode = '22023';
  end if;
  mapped_result := case p_screening_result
    when 'CONTINUE_WITH_CARE_INFORMATION' then 'CONTINUE_SCREENING'
    when 'PROFESSIONAL_EVALUATION_RECOMMENDED' then 'FORMAL_TB_EVALUATION_RECOMMENDED'
    when 'URGENT_MEDICAL_EVALUATION' then 'URGENT_MEDICAL_EVALUATION'
    else null
  end;
  if mapped_result is null then raise exception 'Invalid care outcome' using errcode = '22023'; end if;

  return query
    with saved as (
      select * from public.save_part11_screening(
        p_screening_id, p_patient_id, p_source_type, p_pharmacy_id,
        p_area_name, p_area_latitude, p_area_longitude, p_symptom_answers,
        p_audio_status, p_audio_hash, mapped_result
      )
    ), updated as (
      update public.screenings s set
        pathway_id = p_pathway_id, rule_version = p_rule_version,
        age_band = p_age_band, care_outcome = p_screening_result
      where s.screening_id = p_screening_id
      returning s.screening_id
    )
    select saved.* from saved cross join updated;
end;
$$;

create function public.create_multisyndrome_referral(
  p_screening_id text, p_patient_id text, p_source_type text, p_pharmacy_id text,
  p_pathway_id text, p_rule_version text, p_age_band text,
  p_area_name text, p_area_latitude numeric, p_area_longitude numeric,
  p_symptom_answers jsonb, p_audio_status text, p_audio_hash text,
  p_screening_result text, p_tb_center_id text
)
returns table (
  referral_id text, access_token uuid, status text, tb_center_id text,
  centre_name text, centre_area text, centre_district text, service_type text,
  created_at timestamptz, reward_created boolean, reward_eligible boolean,
  reward_status text, reward_warning text, possible_reused_audio boolean,
  activity_requires_review boolean, pathway_id text
)
language plpgsql
security definer
set search_path = ''
as $$
declare base_record record; mapped_result text;
begin
  if p_screening_result = 'PROFESSIONAL_EVALUATION_RECOMMENDED' then
    mapped_result := 'FORMAL_TB_EVALUATION_RECOMMENDED';
  elsif p_screening_result = 'URGENT_MEDICAL_EVALUATION' then
    mapped_result := 'URGENT_MEDICAL_EVALUATION';
  else
    raise exception 'A referral requires a professional or urgent evaluation outcome' using errcode = '22023';
  end if;

  select * into base_record from public.create_part9_referral(
    p_screening_id, p_patient_id, p_source_type, p_pharmacy_id,
    p_area_name, p_area_latitude, p_area_longitude, p_symptom_answers,
    p_audio_status, p_audio_hash, mapped_result, p_tb_center_id
  );

  update public.screenings set pathway_id = p_pathway_id, rule_version = p_rule_version,
    age_band = p_age_band, care_outcome = p_screening_result
  where screenings.screening_id = p_screening_id;
  update public.referrals set pathway_id = p_pathway_id, facility_id = p_tb_center_id
  where referrals.screening_id = p_screening_id;

  return query select
    base_record.referral_id, base_record.access_token, base_record.status,
    base_record.tb_center_id, base_record.centre_name, base_record.centre_area,
    base_record.centre_district, base_record.service_type, base_record.created_at,
    base_record.reward_created, base_record.reward_eligible, base_record.reward_status,
    base_record.reward_warning, base_record.possible_reused_audio,
    base_record.activity_requires_review, p_pathway_id;
end;
$$;

drop function public.get_part9_referral(uuid);
create function public.get_part9_referral(p_access_token uuid)
returns table (
  referral_id text, access_token uuid, status text, tb_center_id text,
  centre_name text, centre_area text, centre_district text, service_type text,
  created_at timestamptz, reward_created boolean, pathway_id text
)
language sql stable security definer set search_path = ''
as $$
  select r.referral_id, r.access_token, r.status, r.tb_center_id,
    c.name, c.area, c.district, c.service_type, r.created_at,
    exists(select 1 from public.rewards rw where rw.referral_id = r.referral_id),
    r.pathway_id
  from public.referrals r join public.tb_centers c on c.center_id = r.tb_center_id
  where r.access_token = p_access_token;
$$;

drop function public.get_part14_care_status(text);
create function public.get_part14_care_status(p_patient_id text)
returns table (
  patient_id text, screening_id text, source_type text, pharmacy_id text,
  area_name text, pathway_id text, rule_version text, age_band text,
  symptom_answers jsonb, audio_status text, audio_file_hash text, screening_result text,
  screening_created_at timestamptz, state_updated_at timestamptz,
  referral_id text, access_token uuid, referral_status text, tb_center_id text,
  centre_name text, centre_area text, centre_district text, service_type text,
  referral_created_at timestamptz, reward_created boolean, reward_eligible boolean,
  reward_status text, reward_warning text, possible_reused_audio boolean,
  activity_requires_review boolean, followup_status text, barrier text,
  next_action text, followup_created_at timestamptz
)
language sql stable security definer set search_path = ''
as $$
  with latest_screening as (
    select s.* from public.screenings s where s.patient_id = p_patient_id
    order by s.created_at desc, s.screening_id desc limit 1
  )
  select s.patient_id, s.screening_id, s.source_type, s.pharmacy_id, s.area_name,
    s.pathway_id, s.rule_version, s.age_band, s.symptom_answers, s.audio_status,
    s.audio_file_hash, s.care_outcome, s.created_at,
    greatest(s.created_at, coalesce(r.completed_at, r.created_at, s.created_at), coalesce(f.created_at, s.created_at)),
    r.referral_id, r.access_token, r.status, r.tb_center_id,
    c.name, c.area, c.district, c.service_type, r.created_at,
    rw.reward_id is not null,
    case when r.referral_id is null or r.pharmacy_id is null then false else not exists (
      select 1 from private.part14_review_signals sig
      where sig.signal_type = 'DUPLICATE_PATIENT_REWARD' and sig.screening_id = r.screening_id
        and sig.reward_type = 'APPROPRIATE_REFERRAL_CREDIT'
    ) end,
    rw.status,
    case when exists (
      select 1 from private.part14_review_signals sig
      where sig.signal_type = 'DUPLICATE_PATIENT_REWARD' and sig.screening_id = r.screening_id
        and sig.reward_type = 'APPROPRIATE_REFERRAL_CREDIT'
    ) then 'RECENT_SCREENING_ALREADY_EXISTS' else null end,
    s.possible_reused_audio,
    case when r.pharmacy_id is null then false else private.part14_pharmacy_requires_review(r.pharmacy_id, statement_timestamp()) end,
    f.followup_status, f.barrier, f.next_action, f.created_at
  from latest_screening s
  left join public.referrals r on r.screening_id = s.screening_id
  left join public.tb_centers c on c.center_id = r.tb_center_id
  left join public.rewards rw on rw.referral_id = r.referral_id and rw.reward_type = 'APPROPRIATE_REFERRAL_CREDIT'
  left join public.followups f on f.referral_id = r.referral_id;
$$;

create function public.get_multisyndrome_summary()
returns table (pathway_activity jsonb, recent_actions jsonb)
language sql stable security definer set search_path = ''
as $$
  with counts as (
    select pathway_id, area_name, count(*)::bigint as signal_count,
      count(*) filter (where care_outcome = 'URGENT_MEDICAL_EVALUATION')::bigint as urgent_count
    from public.care_signals
    where created_at >= statement_timestamp() - interval '7 days'
    group by pathway_id, area_name
    having count(*) >= 3
  )
  select
    coalesce((select jsonb_agg(jsonb_build_object(
      'pathway_id', pathway_id, 'area_name', area_name, 'signal_count', signal_count,
      'urgent_count', urgent_count,
      'signal_level', case when signal_count >= 5 then 'RED' when signal_count >= 3 then 'WATCH' else 'NORMAL' end
    ) order by pathway_id, area_name) from counts), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object(
      'action_id', action_id, 'pathway_id', pathway_id, 'area_name', area_name,
      'action_type', action_type, 'note', note, 'recorded_at', recorded_at
    ) order by recorded_at desc) from (
      select * from public.public_health_actions order by recorded_at desc limit 20
    ) actions), '[]'::jsonb);
$$;

create function public.record_public_health_action(
  p_pathway_id text, p_area_name text, p_action_type text, p_note text
)
returns table (action_id uuid, recorded_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
begin
  if p_pathway_id not in ('RESPIRATORY_TB','FEVER_MOSQUITO','DIARRHOEA_DEHYDRATION','SKIN_NERVE_LEPROSY','CHILD_BREATHING')
    or p_area_name is null or length(btrim(p_area_name)) = 0
    or p_action_type not in ('REVIEW_SIGNAL','CHECK_WATER_SAFETY','ARRANGE_OUTREACH','CHECK_TESTING_ACCESS','MOBILE_SERVICE','CLOSE_REVIEW')
    or char_length(coalesce(p_note, '')) > 280 then
    raise exception 'Invalid public-health action' using errcode = '22023';
  end if;
  return query insert into public.public_health_actions(pathway_id, area_name, action_type, note)
    values (p_pathway_id, p_area_name, p_action_type, nullif(btrim(p_note), ''))
    returning public_health_actions.action_id, public_health_actions.recorded_at;
end;
$$;

revoke all on function public.save_care_signal(text,text,text,text,text,text) from public, anon, authenticated;
revoke all on function public.save_multisyndrome_screening(text,text,text,text,text,text,text,text,numeric,numeric,jsonb,text,text,text) from public, anon, authenticated;
revoke all on function public.create_multisyndrome_referral(text,text,text,text,text,text,text,text,numeric,numeric,jsonb,text,text,text,text) from public, anon, authenticated;
revoke all on function public.get_part9_referral(uuid) from public, anon, authenticated;
revoke all on function public.get_part14_care_status(text) from public, anon, authenticated;
revoke all on function public.get_multisyndrome_summary() from public, anon, authenticated;
revoke all on function public.record_public_health_action(text,text,text,text) from public, anon, authenticated;

grant execute on function public.save_care_signal(text,text,text,text,text,text) to service_role;
grant execute on function public.save_multisyndrome_screening(text,text,text,text,text,text,text,text,numeric,numeric,jsonb,text,text,text) to service_role;
grant execute on function public.create_multisyndrome_referral(text,text,text,text,text,text,text,text,numeric,numeric,jsonb,text,text,text,text) to service_role;
grant execute on function public.get_part9_referral(uuid) to service_role;
grant execute on function public.get_part14_care_status(text) to service_role;
grant execute on function public.get_multisyndrome_summary() to service_role;
grant execute on function public.record_public_health_action(text,text,text,text) to service_role;

commit;
