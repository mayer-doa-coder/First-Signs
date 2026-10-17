begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Part 19 uses an explicit cohort marker so prepared demonstration records can
-- be labelled without adding patient-facing fields or changing normal flows.
create table private.part19_demo_screenings (
  screening_id text primary key references public.screenings(screening_id) on delete cascade,
  scenario text not null check (
    scenario in ('MAP_NORMAL', 'MAP_WATCH', 'MAP_TRIGGER', 'FRAUD_VOLUME')
  ),
  seeded_at timestamptz not null default transaction_timestamp()
);

alter table private.part19_demo_screenings enable row level security;
revoke all on table private.part19_demo_screenings from public, anon, authenticated, service_role;

comment on table private.part19_demo_screenings is
  'Marks synthetic Part 19 demonstration screenings. Contains no names, phone numbers, audio, exact locations, or clinical data.';

do $$
declare
  item integer;
  next_patient_id text;
  next_screening_id text;
  formal_answers jsonb := jsonb_build_object(
    'coughDays', 14,
    'fever', false,
    'nightSweats', false,
    'weightLoss', false,
    'bloodInSputum', false,
    'tbExposure', false
  );
  continue_answers jsonb := jsonb_build_object(
    'coughDays', 3,
    'fever', false,
    'nightSweats', false,
    'weightLoss', false,
    'bloodInSputum', false,
    'tbExposure', false
  );
begin
  -- Three independent Boyra screenings satisfy the privacy floor; only two
  -- are referred, so the area remains NORMAL.
  for item in 1..3 loop
    next_patient_id := format('JVH-DEMO-P19-BYR-%s', lpad(item::text, 2, '0'));
    next_screening_id := format('JVH-SCR-P19-BYR-%s', lpad(item::text, 2, '0'));

    if item <= 2 then
      perform * from public.create_part9_referral(
        next_screening_id, next_patient_id, 'SELF', null,
        'Boyra', 22.839267, 89.535984, formal_answers,
        'skipped', null, 'FORMAL_TB_EVALUATION_RECOMMENDED', 'NTP-KHL-KMCH'
      );
    else
      perform * from public.save_part11_screening(
        next_screening_id, next_patient_id, 'SELF', null,
        'Boyra', 22.839267, 89.535984, continue_answers,
        'skipped', null, 'CONTINUE_SCREENING'
      );
    end if;

    insert into private.part19_demo_screenings (screening_id, scenario)
    values (next_screening_id, 'MAP_NORMAL') on conflict do nothing;
  end loop;

  -- Four independent referrals produce WATCH and prepare a clear map example.
  for item in 1..4 loop
    next_patient_id := format('JVH-DEMO-P19-KHL-%s', lpad(item::text, 2, '0'));
    next_screening_id := format('JVH-SCR-P19-KHL-%s', lpad(item::text, 2, '0'));
    perform * from public.create_part9_referral(
      next_screening_id, next_patient_id, 'SELF', null,
      'Khalishpur', 22.85, 89.5361, formal_answers,
      'skipped', null, 'FORMAL_TB_EVALUATION_RECOMMENDED', 'NTP-KHL-KMCH'
    );
    insert into private.part19_demo_screenings (screening_id, scenario)
    values (next_screening_id, 'MAP_WATCH') on conflict do nothing;
  end loop;

  -- Daulatpur starts at four independent referrals. The rehearsal's fifth
  -- user must be what moves this area from WATCH to RED.
  for item in 1..4 loop
    next_patient_id := format('JVH-DEMO-P19-DLT-%s', lpad(item::text, 2, '0'));
    next_screening_id := format('JVH-SCR-P19-DLT-%s', lpad(item::text, 2, '0'));
    perform * from public.create_part9_referral(
      next_screening_id, next_patient_id, 'SELF', null,
      'Daulatpur', 22.8875, 89.5167, formal_answers,
      'skipped', null, 'FORMAL_TB_EVALUATION_RECOMMENDED', 'NTP-KHL-KMCH'
    );
    insert into private.part19_demo_screenings (screening_id, scenario)
    values (next_screening_id, 'MAP_TRIGGER') on conflict do nothing;
  end loop;

  -- Ten assisted referrals activate the already-defined Part 14 demo-volume
  -- rule. The rule itself creates held rewards; this block does not forge a
  -- warning or manually alter reward status.
  for item in 1..10 loop
    next_patient_id := format('JVH-DEMO-P19-VOL-%s', lpad(item::text, 2, '0'));
    next_screening_id := format('JVH-SCR-P19-VOL-%s', lpad(item::text, 2, '0'));
    perform * from public.create_part9_referral(
      next_screening_id, next_patient_id, 'PHARMACY', 'DEMO-KHL-RAHMAN',
      'Rupsha', 22.8225, 89.6473, formal_answers,
      'skipped', null, 'FORMAL_TB_EVALUATION_RECOMMENDED', 'NTP-KHL-KMCH'
    );
    insert into private.part19_demo_screenings (screening_id, scenario)
    values (next_screening_id, 'FRAUD_VOLUME') on conflict do nothing;
  end loop;
end;
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
  fraud_alerts jsonb,
  demo_seeded_screenings bigint
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
    from public.screenings s
    cross join demo_window w
    where (
        (s.created_at >= w.started_at and s.created_at <= w.ended_at)
        or exists (
          select 1 from private.part19_demo_screenings d
          where d.screening_id = s.screening_id
        )
      )
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
  ),
  demo_seed_summary as (
    select count(*)::bigint as demo_seeded_screenings
    from private.part19_demo_screenings
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
    ),
    dss.demo_seeded_screenings
  from screening_totals st
  cross join referral_totals rt
  cross join demo_window w
  cross join review_summary rs
  cross join active_pharmacy_reviews apr
  cross join held_rewards hr
  cross join demo_seed_summary dss;
$$;

comment on function public.get_part13_government_dashboard() is
  'Server-only anonymous programme aggregate. Includes explicitly counted Part 19 demo seed records; never returns patient IDs, audio hashes, pharmacy identities, or exact locations.';

revoke all on function public.get_part13_government_dashboard()
  from public, anon, authenticated;
grant execute on function public.get_part13_government_dashboard()
  to service_role;

commit;
