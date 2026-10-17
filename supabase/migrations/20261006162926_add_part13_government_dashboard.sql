begin;

create function public.get_part13_government_dashboard()
returns table (
  total_screenings bigint,
  self_use_screenings bigint,
  pharmacy_assisted_screenings bigint,
  formal_referrals bigint,
  completed_referrals bigint,
  completion_rate numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  with screening_totals as (
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
    end as completion_rate
  from screening_totals st
  cross join referral_totals rt;
$$;

comment on function public.get_part13_government_dashboard() is
  'Returns anonymous programme-level counts only. Never returns patient or row-level data.';

revoke all on function public.get_part13_government_dashboard()
  from public, anon, authenticated;
grant execute on function public.get_part13_government_dashboard()
  to service_role;

commit;
