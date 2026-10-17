begin;

-- Real government referral hospitals in every Bangladesh division. Facility
-- names and coordinates were checked against OpenStreetMap/Nominatim on
-- 2026-10-17. The product still asks patients to confirm current TB testing
-- availability before travelling; these rows do not claim a live service.
insert into public.tb_centers (
  center_id,
  name,
  district,
  area,
  latitude,
  longitude,
  service_type
)
values
  ('BD-DHA-NIDCH', 'National Institute of Diseases of the Chest and Hospital', 'Dhaka', 'Mohakhali', 23.7757437, 90.4094176, 'TB evaluation — confirm current test availability'),
  ('BD-CTG-CMCH', 'Chittagong Medical College Hospital', 'Chattogram', 'Chattogram City', 22.3593346, 91.8306570, 'TB evaluation — confirm current test availability'),
  ('BD-RAJ-RMCH', 'Rajshahi Medical College Hospital', 'Rajshahi', 'Rajshahi City', 24.3730464, 88.5871186, 'TB evaluation — confirm current test availability'),
  ('BD-BAR-SBMCH', 'Sher-e-Bangla Medical College Hospital', 'Barishal', 'Barishal City', 22.6864652, 90.3617364, 'TB evaluation — confirm current test availability'),
  ('BD-SYL-OMCH', 'M.A.G. Osmani Medical College Hospital', 'Sylhet', 'Kajolshah', 24.9020252, 91.8535767, 'TB evaluation — confirm current test availability'),
  ('BD-RNG-RMCH', 'Rangpur Medical College Hospital', 'Rangpur', 'Dhap', 25.7673241, 89.2327154, 'TB evaluation — confirm current test availability'),
  ('BD-MYM-MMCH', 'Mymensingh Medical College Hospital', 'Mymensingh', 'Mymensingh City', 24.7415116, 90.4092469, 'TB evaluation — confirm current test availability')
on conflict (center_id) do update set
  name = excluded.name,
  district = excluded.district,
  area = excluded.area,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  service_type = excluded.service_type;

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
      and s.area_name in (
        'Dhaka', 'Chattogram', 'Rajshahi', 'Khulna', 'Barishal', 'Sylhet', 'Rangpur', 'Mymensingh',
        'Sonadanga', 'Khalishpur', 'Daulatpur', 'Boyra', 'Batiaghata'
      )
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
  'Server-only anonymous nationwide programme aggregate. Includes explicitly counted Part 19 demo seed records; never returns patient IDs, audio hashes, pharmacy identities, or exact locations.';

revoke all on function public.get_part13_government_dashboard()
  from public, anon, authenticated;
grant execute on function public.get_part13_government_dashboard()
  to service_role;

commit;
