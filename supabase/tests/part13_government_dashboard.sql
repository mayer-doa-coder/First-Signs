begin;

do $$
declare
  before_dashboard record;
  dashboard_function record;
  after_screenings record;
  after_referrals record;
  after_completion record;
  self_referral record;
  pharmacy_referral record;
begin
  select p.prosecdef, p.proconfig
    into dashboard_function
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'get_part13_government_dashboard'
      and p.pronargs = 0;

  assert dashboard_function.prosecdef,
    'government aggregate function must use its owner privileges without granting table reads';
  assert 'search_path=""' = any(dashboard_function.proconfig),
    'government aggregate function search_path is not locked';
  assert not has_function_privilege('anon', 'public.get_part13_government_dashboard()', 'EXECUTE'),
    'anonymous role can execute the government aggregate function';
  assert not has_function_privilege('authenticated', 'public.get_part13_government_dashboard()', 'EXECUTE'),
    'authenticated role can execute the government aggregate function';
  assert has_function_privilege('service_role', 'public.get_part13_government_dashboard()', 'EXECUTE'),
    'service role cannot execute the government aggregate function';

  select * into before_dashboard
  from public.get_part13_government_dashboard();

  assert before_dashboard.total_screenings
    = before_dashboard.self_use_screenings + before_dashboard.pharmacy_assisted_screenings,
    'screening source totals do not add up';
  assert before_dashboard.completed_referrals <= before_dashboard.formal_referrals,
    'completed referrals exceed formal referrals';

  perform * from public.save_part11_screening(
    'JVH-SCR-BBBBBBBBBBBBBBBBBBBBBBBBBBBBBB01',
    'JVH-DEMO-BB000001',
    'SELF',
    null,
    'Sonadanga',
    22.8167,
    89.55,
    '{"coughDays":14,"fever":false,"nightSweats":false,"weightLoss":false,"bloodInSputum":false,"tbExposure":false}'::jsonb,
    'skipped',
    null,
    'FORMAL_TB_EVALUATION_RECOMMENDED'
  );

  perform * from public.save_part11_screening(
    'JVH-SCR-BBBBBBBBBBBBBBBBBBBBBBBBBBBBBB02',
    'JVH-DEMO-BB000002',
    'PHARMACY',
    'DEMO-KHL-RAHMAN',
    'Sonadanga',
    22.8167,
    89.55,
    '{"coughDays":14,"fever":false,"nightSweats":false,"weightLoss":false,"bloodInSputum":false,"tbExposure":false}'::jsonb,
    'skipped',
    null,
    'FORMAL_TB_EVALUATION_RECOMMENDED'
  );

  select * into after_screenings
  from public.get_part13_government_dashboard();

  assert after_screenings.total_screenings = before_dashboard.total_screenings + 2,
    'total screenings did not include both entry paths';
  assert after_screenings.self_use_screenings = before_dashboard.self_use_screenings + 1,
    'self-use screening was not counted';
  assert after_screenings.pharmacy_assisted_screenings = before_dashboard.pharmacy_assisted_screenings + 1,
    'pharmacy-assisted screening was not counted';

  select * into self_referral
  from public.create_part9_referral(
    'JVH-SCR-BBBBBBBBBBBBBBBBBBBBBBBBBBBBBB01',
    'JVH-DEMO-BB000001',
    'SELF',
    null,
    'Sonadanga',
    22.8167,
    89.55,
    '{"coughDays":14,"fever":false,"nightSweats":false,"weightLoss":false,"bloodInSputum":false,"tbExposure":false}'::jsonb,
    'skipped',
    null,
    'FORMAL_TB_EVALUATION_RECOMMENDED',
    'NTP-KHL-KMCH'
  );

  select * into pharmacy_referral
  from public.create_part9_referral(
    'JVH-SCR-BBBBBBBBBBBBBBBBBBBBBBBBBBBBBB02',
    'JVH-DEMO-BB000002',
    'PHARMACY',
    'DEMO-KHL-RAHMAN',
    'Sonadanga',
    22.8167,
    89.55,
    '{"coughDays":14,"fever":false,"nightSweats":false,"weightLoss":false,"bloodInSputum":false,"tbExposure":false}'::jsonb,
    'skipped',
    null,
    'FORMAL_TB_EVALUATION_RECOMMENDED',
    'NTP-KHL-KMCH'
  );

  select * into after_referrals
  from public.get_part13_government_dashboard();

  assert after_referrals.formal_referrals = before_dashboard.formal_referrals + 2,
    'formal referrals did not include both entry paths';
  assert after_referrals.completed_referrals = before_dashboard.completed_referrals,
    'pending referrals were counted as completed';

  perform * from public.complete_part10_referral(
    pharmacy_referral.referral_id,
    null::uuid,
    'NTP-KHL-KMCH'
  );

  select * into after_completion
  from public.get_part13_government_dashboard();

  assert after_completion.completed_referrals = before_dashboard.completed_referrals + 1,
    'completed referral did not update the anonymous total';
  assert after_completion.completion_rate = round(
    ((before_dashboard.completed_referrals + 1)::numeric
      / (before_dashboard.formal_referrals + 2)::numeric) * 100,
    1
  ), 'completion rate is not completed referrals divided by formal referrals';

  raise notice 'PART13_DATABASE_TESTS_PASSED';
end;
$$;

rollback;
