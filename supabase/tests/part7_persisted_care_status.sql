begin;

do $$
declare
  saved_screening record;
  saved_referral record;
  saved_followup record;
  care record;
begin
  select * into saved_screening
  from public.save_part11_screening(
    'JVH-CARE-TEST-SCR-01', 'JVH-CARE-TEST-PAT-01', 'PHARMACY', 'DEMO-KHL-RAHMAN',
    'Sonadanga', 22.8167, 89.55,
    '{"coughDays":14,"fever":false,"nightSweats":false,"weightLoss":false,"bloodInSputum":false,"tbExposure":false}'::jsonb,
    'skipped', null, 'FORMAL_TB_EVALUATION_RECOMMENDED'
  );
  assert saved_screening.created, 'care fixture screening was not created';

  select * into saved_referral
  from public.create_part9_referral(
    'JVH-CARE-TEST-SCR-01', 'JVH-CARE-TEST-PAT-01', 'PHARMACY', 'DEMO-KHL-RAHMAN',
    'Sonadanga', 22.8167, 89.55,
    '{"coughDays":14,"fever":false,"nightSweats":false,"weightLoss":false,"bloodInSputum":false,"tbExposure":false}'::jsonb,
    'skipped', null, 'FORMAL_TB_EVALUATION_RECOMMENDED', 'NTP-KHL-KMCH'
  );
  select * into saved_followup
  from public.simulate_part12_follow_up(saved_referral.access_token);

  select * into care from public.get_part14_care_status('JVH-CARE-TEST-PAT-01');
  assert care.screening_id = 'JVH-CARE-TEST-SCR-01'
    and care.source_type = 'PHARMACY'
    and care.pharmacy_id = 'DEMO-KHL-RAHMAN'
    and care.referral_id = saved_referral.referral_id
    and care.referral_status = 'FOLLOW_UP'
    and care.followup_status = 'AWAITING_BARRIER'
    and care.access_token = saved_referral.access_token,
    'persisted care snapshot did not join the screening, referral, and follow-up state';

  assert not has_function_privilege('anon', 'public.get_part14_care_status(text)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.get_part14_care_status(text)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.get_part14_care_status(text)', 'EXECUTE'),
    'persisted care function privileges are not server-only';

  raise notice 'PART7_PERSISTED_CARE_STATUS_TESTS_PASSED';
end;
$$;

rollback;
