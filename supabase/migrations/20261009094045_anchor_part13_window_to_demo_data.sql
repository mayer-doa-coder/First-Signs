begin;

create or replace function public.get_part13_government_dashboard()
returns table (
  total_screenings bigint,
  self_use_screenings bigint,
  pharmacy_assisted_screenings bigint,
  formal_referrals bigint,
  completed_referrals bigint,
  completion_rate numeric,
  demo_window_started_at timestamptz,
  demo_window_ended_at timestamptz,
  area_activity jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with demo_clock as (
    -- Prototype data may be demonstrated after it was recorded. Treat the
    -- latest screening as "today" in demo time; a new screening advances it.
    select coalesce(max(s.created_at), statement_timestamp()) as ended_at
    from public.screenings s
  ),
  demo_window as (
    select ended_at - interval '7 days' as started_at, ended_at
    from demo_clock
  ),
  screening_totals as (
    select
      count(*)::bigint as total_screenings,
      count(*) filter (where s.source_type = 'SELF')::bigint as self_use_screenings,
      count(*) filter (where s.source_type = 'PHARMACY')::bigint as pharmacy_assisted_screenings
    from public.screenings s
  ),
  referral_totals as (
    select
      count(*)::bigint as formal_referrals,
      count(*) filter (where r.status = 'COMPLETED')::bigint as completed_referrals
    from public.referrals r
  ),
  window_screenings as (
    select
      s.screening_id,
      s.patient_id,
      s.area_name,
      s.screening_result
    from public.screenings s
    cross join demo_window w
    where s.created_at >= w.started_at
      and s.created_at <= w.ended_at
      and s.area_name in ('Sonadanga', 'Khalishpur', 'Daulatpur', 'Boyra', 'Batiaghata')
  ),
  area_screenings as (
    select
      s.area_name,
      count(distinct s.patient_id)::bigint as unique_users_screened,
      count(distinct s.patient_id) filter (
        where s.screening_result in (
          'FORMAL_TB_EVALUATION_RECOMMENDED',
          'URGENT_MEDICAL_EVALUATION'
        )
      )::bigint as unique_users_recommended
    from window_screenings s
    group by s.area_name
  ),
  area_referrals as (
    select
      s.area_name,
      count(r.referral_id)::bigint as referral_count,
      count(r.referral_id) filter (where r.status = 'COMPLETED')::bigint as completion_count,
      count(distinct r.patient_id)::bigint as independent_referred_users
    from window_screenings s
    left join public.referrals r on r.screening_id = s.screening_id
    group by s.area_name
  ),
  visible_areas as (
    select
      s.area_name,
      s.unique_users_screened,
      s.unique_users_recommended,
      r.referral_count,
      r.completion_count,
      r.independent_referred_users,
      case
        when r.independent_referred_users >= 5 then 'RED'
        when r.independent_referred_users >= 3 then 'WATCH'
        else 'NORMAL'
      end as hotspot_level
    from area_screenings s
    join area_referrals r using (area_name)
    where s.unique_users_screened >= 3
  )
  select
    st.total_screenings,
    st.self_use_screenings,
    st.pharmacy_assisted_screenings,
    rt.formal_referrals,
    rt.completed_referrals,
    case
      when rt.formal_referrals = 0 then 0::numeric
      else round((rt.completed_referrals::numeric / rt.formal_referrals::numeric) * 100, 1)
    end as completion_rate,
    w.started_at,
    w.ended_at,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'area_name', a.area_name,
            'unique_users_screened', a.unique_users_screened,
            'unique_users_recommended', a.unique_users_recommended,
            'referral_count', a.referral_count,
            'completion_count', a.completion_count,
            'independent_referred_users', a.independent_referred_users,
            'hotspot_level', a.hotspot_level
          )
          order by a.area_name
        )
        from visible_areas a
      ),
      '[]'::jsonb
    ) as area_activity
  from screening_totals st
  cross join referral_totals rt
  cross join demo_window w;
$$;

comment on function public.get_part13_government_dashboard() is
  'Server-only anonymous programme aggregate. Its seven-day demo window ends at the latest recorded screening; areas with fewer than three distinct screened patients are omitted and no patient identifiers or exact locations are returned.';

revoke all on function public.get_part13_government_dashboard()
  from public, anon, authenticated;
grant execute on function public.get_part13_government_dashboard()
  to service_role;

commit;
