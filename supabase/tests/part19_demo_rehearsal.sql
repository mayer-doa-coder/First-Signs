begin;

do $$
declare
  dashboard_before record;
  dashboard_after record;
  daulatpur_before jsonb;
  daulatpur_after jsonb;
  daulatpur_after_duplicate jsonb;
  held_demo_rewards integer;
  formal_answers jsonb := jsonb_build_object(
    'coughDays', 14,
    'fever', false,
    'nightSweats', false,
    'weightLoss', false,
    'bloodInSputum', false,
    'tbExposure', false
  );
begin
  select * into dashboard_before from public.get_part13_government_dashboard();
  assert dashboard_before.demo_seeded_screenings = 21,
    'Part 19 demo cohort must contain exactly 21 explicitly labelled seed screenings';

  select area into daulatpur_before
  from jsonb_array_elements(dashboard_before.area_activity) as area
  where area->>'area_name' = 'Daulatpur';
  assert daulatpur_before->>'hotspot_level' = 'WATCH',
    'Daulatpur must begin at WATCH before the fifth independent referral';
  assert (daulatpur_before->>'independent_referred_users')::integer = 4,
    'Daulatpur must begin with four independent referred users';

  select count(*) into held_demo_rewards
  from public.rewards rw
  join public.referrals r on r.referral_id = rw.referral_id
  join private.part19_demo_screenings d on d.screening_id = r.screening_id
  where d.scenario = 'FRAUD_VOLUME'
    and rw.status = 'HELD_FOR_REVIEW';
  assert held_demo_rewards >= 1,
    'The real Part 14 volume rule did not hold a prepared demo reward for review';

  perform * from public.create_part9_referral(
    'JVH-SCR-P19-TXN-TRIGGER-01', 'JVH-DEMO-P19-TXN-01',
    'SELF', null, 'Daulatpur', 22.8875, 89.5167,
    formal_answers, 'skipped', null,
    'FORMAL_TB_EVALUATION_RECOMMENDED', 'NTP-KHL-KMCH'
  );

  select * into dashboard_after from public.get_part13_government_dashboard();
  select area into daulatpur_after
  from jsonb_array_elements(dashboard_after.area_activity) as area
  where area->>'area_name' = 'Daulatpur';
  assert daulatpur_after->>'hotspot_level' = 'RED',
    'The fifth independent referred user did not change Daulatpur to RED';
  assert (daulatpur_after->>'independent_referred_users')::integer = 5,
    'The fifth independent referred user was not counted exactly once';

  perform * from public.create_part9_referral(
    'JVH-SCR-P19-TXN-DUPLICATE-01', 'JVH-DEMO-P19-TXN-01',
    'SELF', null, 'Daulatpur', 22.8875, 89.5167,
    formal_answers, 'skipped', null,
    'FORMAL_TB_EVALUATION_RECOMMENDED', 'NTP-KHL-KMCH'
  );

  select area into daulatpur_after_duplicate
  from public.get_part13_government_dashboard() dashboard,
    jsonb_array_elements(dashboard.area_activity) as area
  where area->>'area_name' = 'Daulatpur';
  assert (daulatpur_after_duplicate->>'independent_referred_users')::integer = 5,
    'A repeated patient incorrectly inflated the hotspot count';

  assert not has_table_privilege('anon', 'private.part19_demo_screenings', 'SELECT')
    and not has_table_privilege('authenticated', 'private.part19_demo_screenings', 'SELECT'),
    'The demo cohort marker is exposed to browser roles';

  raise notice 'PART19_DEMO_REHEARSAL_TESTS_PASSED';
end;
$$;

rollback;
