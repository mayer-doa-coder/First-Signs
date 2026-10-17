begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create function public.get_part14_care_status(p_patient_id text)
returns table (
  patient_id text,
  screening_id text,
  source_type text,
  pharmacy_id text,
  area_name text,
  symptom_answers jsonb,
  audio_status text,
  audio_file_hash text,
  screening_result text,
  screening_created_at timestamptz,
  state_updated_at timestamptz,
  referral_id text,
  access_token uuid,
  referral_status text,
  tb_center_id text,
  centre_name text,
  centre_area text,
  centre_district text,
  service_type text,
  referral_created_at timestamptz,
  reward_created boolean,
  reward_eligible boolean,
  reward_status text,
  reward_warning text,
  possible_reused_audio boolean,
  activity_requires_review boolean,
  followup_status text,
  barrier text,
  next_action text,
  followup_created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with latest_screening as (
    select s.*
    from public.screenings s
    where s.patient_id = p_patient_id
    order by s.created_at desc, s.screening_id desc
    limit 1
  )
  select
    s.patient_id,
    s.screening_id,
    s.source_type,
    s.pharmacy_id,
    s.area_name,
    s.symptom_answers,
    s.audio_status,
    s.audio_file_hash,
    s.screening_result,
    s.created_at,
    greatest(
      s.created_at,
      coalesce(r.completed_at, r.created_at, s.created_at),
      coalesce(f.created_at, s.created_at)
    ),
    r.referral_id,
    r.access_token,
    r.status,
    r.tb_center_id,
    c.name,
    c.area,
    c.district,
    c.service_type,
    r.created_at,
    rw.reward_id is not null,
    case
      when r.referral_id is null or r.pharmacy_id is null then false
      else not exists (
        select 1
        from private.part14_review_signals sig
        where sig.signal_type = 'DUPLICATE_PATIENT_REWARD'
          and sig.screening_id = r.screening_id
          and sig.reward_type = 'APPROPRIATE_REFERRAL_CREDIT'
      )
    end,
    rw.status,
    case when exists (
      select 1
      from private.part14_review_signals sig
      where sig.signal_type = 'DUPLICATE_PATIENT_REWARD'
        and sig.screening_id = r.screening_id
        and sig.reward_type = 'APPROPRIATE_REFERRAL_CREDIT'
    ) then 'RECENT_SCREENING_ALREADY_EXISTS' else null end,
    s.possible_reused_audio,
    case
      when r.pharmacy_id is null then false
      else private.part14_pharmacy_requires_review(r.pharmacy_id, statement_timestamp())
    end,
    f.followup_status,
    f.barrier,
    f.next_action,
    f.created_at
  from latest_screening s
  left join public.referrals r on r.screening_id = s.screening_id
  left join public.tb_centers c on c.center_id = r.tb_center_id
  left join public.rewards rw
    on rw.referral_id = r.referral_id
   and rw.reward_type = 'APPROPRIATE_REFERRAL_CREDIT'
  left join public.followups f on f.referral_id = r.referral_id;
$$;

revoke all on function public.get_part14_care_status(text) from public, anon, authenticated;
grant execute on function public.get_part14_care_status(text) to service_role;

comment on function public.get_part14_care_status(text) is
  'Server-only persisted care snapshot for one prototype patient ID. It is not available to browser database roles.';

commit;
