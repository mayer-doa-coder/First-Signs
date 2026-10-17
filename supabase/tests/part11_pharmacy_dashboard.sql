begin;

do $$
declare
  before_dashboard record;
  after_self record;
  after_screenings record;
  after_referral record;
  after_completion record;
  after_retry record;
  saved record;
  retried record;
  created_referral record;
  completed_referral record;
  repeated_completion record;
begin
  select * into before_dashboard
  from public.get_part11_pharmacy_dashboard('DEMO-KHL-RAHMAN');

  assert before_dashboard.pharmacy_id = 'DEMO-KHL-RAHMAN',
    'active pharmacy dashboard was not returned';

  perform * from public.save_part11_screening(
    'JVH-SCR-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA01',
    'JVH-DEMO-AA000001',
    'SELF',
    null,
    'Sonadanga',
    22.8167,
    89.55,
    '{"coughDays":3,"fever":false,"nightSweats":false,"weightLoss":false,"bloodInSputum":false,"tbExposure":false}'::jsonb,
    'skipped',
    null,
    'CONTINUE_SCREENING'
  );

  select * into after_self
  from public.get_part11_pharmacy_dashboard('DEMO-KHL-RAHMAN');

  assert after_self.assisted_screenings = before_dashboard.assisted_screenings,
    'self-use screening leaked into pharmacy totals';
  assert not exists (
    select 1 from public.rewards
    where screening_id = 'JVH-SCR-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA01'
  ), 'self-use screening created a pharmacy reward';

  perform * from public.save_part11_screening(
    'JVH-SCR-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA04',
    'JVH-DEMO-AA000004',
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

  select * into created_referral
  from public.create_part9_referral(
    'JVH-SCR-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA04',
    'JVH-DEMO-AA000004',
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

  assert not exists (
    select 1 from public.rewards
    where referral_id = created_referral.referral_id
       or screening_id = 'JVH-SCR-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA04'
  ), 'self-use referral created a pharmacy reward';

  select * into after_self
  from public.get_part11_pharmacy_dashboard('DEMO-KHL-RAHMAN');

  assert after_self.assisted_screenings = before_dashboard.assisted_screenings
    and after_self.referrals_created = before_dashboard.referrals_created,
    'self-use referral leaked into pharmacy dashboard';

  select * into saved
  from public.save_part11_screening(
    'JVH-SCR-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA02',
    'JVH-DEMO-AA000002',
    'PHARMACY',
    'DEMO-KHL-RAHMAN',
    'Sonadanga',
    22.8167,
    89.55,
    '{"coughDays":3,"fever":false,"nightSweats":false,"weightLoss":false,"bloodInSputum":false,"tbExposure":false}'::jsonb,
    'skipped',
    null,
    'CONTINUE_SCREENING'
  );

  assert saved.created and saved.screening_reward_created,
    'new assisted screening or its valid-screening credit was not created';

  select * into retried
  from public.save_part11_screening(
    'JVH-SCR-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA02',
    'JVH-DEMO-AA000002',
    'PHARMACY',
    'DEMO-KHL-RAHMAN',
    'Sonadanga',
    22.8167,
    89.55,
    '{"coughDays":3,"fever":false,"nightSweats":false,"weightLoss":false,"bloodInSputum":false,"tbExposure":false}'::jsonb,
    'skipped',
    null,
    'CONTINUE_SCREENING'
  );

  assert not retried.created and not retried.screening_reward_created,
    'idempotent screening retry created duplicate data';

  begin
    perform * from public.save_part11_screening(
      'JVH-SCR-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA02',
      'JVH-DEMO-AA000002',
      'PHARMACY',
      'DEMO-KHL-RAHMAN',
      'Khalishpur',
      22.85,
      89.5361,
      '{"coughDays":3,"fever":false,"nightSweats":false,"weightLoss":false,"bloodInSputum":false,"tbExposure":false}'::jsonb,
      'skipped',
      null,
      'CONTINUE_SCREENING'
    );
    raise exception 'conflicting screening retry was accepted';
  exception
    when unique_violation then null;
  end;

  perform * from public.save_part11_screening(
    'JVH-SCR-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA03',
    'JVH-DEMO-AA000003',
    'PHARMACY',
    'DEMO-KHL-RAHMAN',
    'Sonadanga',
    22.8167,
    89.55,
    '{"coughDays":14,"fever":false,"nightSweats":false,"weightLoss":false,"bloodInSputum":false,"tbExposure":false}'::jsonb,
    'recorded',
    null,
    'FORMAL_TB_EVALUATION_RECOMMENDED'
  );

  select * into after_screenings
  from public.get_part11_pharmacy_dashboard('DEMO-KHL-RAHMAN');

  assert after_screenings.assisted_screenings = before_dashboard.assisted_screenings + 2,
    'assisted screenings were not counted independently of referrals';
  assert after_screenings.valid_screening_credits = before_dashboard.valid_screening_credits + 2,
    'valid-screening credits were not created exactly once';

  select * into created_referral
  from public.create_part9_referral(
    'JVH-SCR-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA03',
    'JVH-DEMO-AA000003',
    'PHARMACY',
    'DEMO-KHL-RAHMAN',
    'Sonadanga',
    22.8167,
    89.55,
    '{"coughDays":14,"fever":false,"nightSweats":false,"weightLoss":false,"bloodInSputum":false,"tbExposure":false}'::jsonb,
    'recorded',
    null,
    'FORMAL_TB_EVALUATION_RECOMMENDED',
    'NTP-KHL-KMCH'
  );

  select * into after_referral
  from public.get_part11_pharmacy_dashboard('DEMO-KHL-RAHMAN');

  assert after_referral.referrals_created = before_dashboard.referrals_created + 1,
    'pharmacy referral was not counted';
  assert after_referral.appropriate_referral_credits = before_dashboard.appropriate_referral_credits + 1,
    'appropriate-referral credit was not created';
  assert after_referral.referrals_completed = before_dashboard.referrals_completed,
    'pending referral was counted as completed';

  select * into completed_referral
  from public.complete_part10_referral(
    created_referral.referral_id,
    null::uuid,
    'NTP-KHL-KMCH'
  );

  assert completed_referral.status = 'COMPLETED'
    and completed_referral.completion_reward_created
    and not completed_referral.already_used,
    'first independent completion did not complete and credit the referral';

  select * into after_completion
  from public.get_part11_pharmacy_dashboard('DEMO-KHL-RAHMAN');

  assert after_completion.referrals_completed = before_dashboard.referrals_completed + 1,
    'completed referral total did not update';
  assert after_completion.verified_completion_credits = before_dashboard.verified_completion_credits + 1,
    'verified-completion credit did not update';

  select * into repeated_completion
  from public.complete_part10_referral(
    created_referral.referral_id,
    null::uuid,
    'NTP-KHL-KMCH'
  );

  assert repeated_completion.already_used
    and not repeated_completion.completion_reward_created,
    'repeated completion was not idempotent';

  select * into after_retry
  from public.get_part11_pharmacy_dashboard('DEMO-KHL-RAHMAN');

  assert after_retry.referrals_completed = after_completion.referrals_completed
    and after_retry.verified_completion_credits = after_completion.verified_completion_credits,
    'repeated completion changed dashboard totals or credits';

  raise notice 'PART11_DATABASE_TESTS_PASSED';
end;
$$;

rollback;

select count(*) as remaining_test_screenings
from public.screenings
where screening_id in (
  'JVH-SCR-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA01',
  'JVH-SCR-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA02',
  'JVH-SCR-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA03',
  'JVH-SCR-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA04'
);
