begin;

do $$
declare
  first_screening record;
  duplicate_screening record;
  first_referral record;
  duplicate_referral record;
  first_audio record;
  second_audio record;
  volume_referral record;
  completed_once record;
  completed_twice record;
  pharmacy_dashboard record;
  government_dashboard record;
  index integer;
  shared_hash text := repeat('a', 64);
begin
  -- Isolate rolling-volume state without deleting any existing project data.
  update public.referrals
  set created_at = statement_timestamp() - interval '2 days'
  where pharmacy_id = 'DEMO-KHL-SHAPLA'
    and created_at > statement_timestamp() - interval '24 hours';

  select * into first_screening
  from public.save_part11_screening(
    'JVH-P14-DUP-SCR-01', 'JVH-P14-DUP-PAT-01', 'PHARMACY', 'DEMO-KHL-RAHMAN',
    'Sonadanga', 22.8167, 89.55,
    '{"coughDays":14,"fever":false,"nightSweats":false,"weightLoss":false,"bloodInSputum":false,"tbExposure":false}'::jsonb,
    'skipped', null, 'FORMAL_TB_EVALUATION_RECOMMENDED'
  );
  assert first_screening.created and first_screening.screening_reward_created
    and first_screening.reward_eligible,
    'first eligible assisted screening did not create a reward';

  select * into duplicate_screening
  from public.save_part11_screening(
    'JVH-P14-DUP-SCR-02', 'JVH-P14-DUP-PAT-01', 'PHARMACY', 'DEMO-KHL-CITY',
    'Sonadanga', 22.8167, 89.55,
    '{"coughDays":14,"fever":false,"nightSweats":false,"weightLoss":false,"bloodInSputum":false,"tbExposure":false}'::jsonb,
    'skipped', null, 'FORMAL_TB_EVALUATION_RECOMMENDED'
  );
  assert duplicate_screening.created
    and not duplicate_screening.screening_reward_created
    and not duplicate_screening.reward_eligible
    and duplicate_screening.reward_warning = 'RECENT_SCREENING_ALREADY_EXISTS',
    'same patient received the same screening reward through another pharmacy inside 30 days';
  assert exists (
    select 1 from public.screenings where screening_id = 'JVH-P14-DUP-SCR-02'
  ), 'duplicate incentive protection blocked the health screening';

  select * into first_referral
  from public.create_part9_referral(
    'JVH-P14-DUP-SCR-01', 'JVH-P14-DUP-PAT-01', 'PHARMACY', 'DEMO-KHL-RAHMAN',
    'Sonadanga', 22.8167, 89.55,
    '{"coughDays":14,"fever":false,"nightSweats":false,"weightLoss":false,"bloodInSputum":false,"tbExposure":false}'::jsonb,
    'skipped', null, 'FORMAL_TB_EVALUATION_RECOMMENDED', 'NTP-KHL-KMCH'
  );
  select * into duplicate_referral
  from public.create_part9_referral(
    'JVH-P14-DUP-SCR-02', 'JVH-P14-DUP-PAT-01', 'PHARMACY', 'DEMO-KHL-CITY',
    'Sonadanga', 22.8167, 89.55,
    '{"coughDays":14,"fever":false,"nightSweats":false,"weightLoss":false,"bloodInSputum":false,"tbExposure":false}'::jsonb,
    'skipped', null, 'FORMAL_TB_EVALUATION_RECOMMENDED', 'NTP-KHL-KMCH'
  );
  assert first_referral.reward_created and first_referral.reward_eligible,
    'first appropriate-referral reward was not created';
  assert duplicate_referral.status = 'PENDING'
    and not duplicate_referral.reward_created
    and not duplicate_referral.reward_eligible
    and duplicate_referral.reward_warning = 'RECENT_SCREENING_ALREADY_EXISTS',
    'duplicate reward protection either blocked the referral or issued another reward';

  select * into first_audio
  from public.save_part11_screening(
    'JVH-P14-AUDIO-SCR-01', 'JVH-P14-AUDIO-PAT-01', 'SELF', null,
    'Boyra', 22.8333, 89.5333,
    '{"coughDays":3,"fever":false,"nightSweats":false,"weightLoss":false,"bloodInSputum":false,"tbExposure":false}'::jsonb,
    'uploaded', shared_hash, 'CONTINUE_SCREENING'
  );
  select * into second_audio
  from public.save_part11_screening(
    'JVH-P14-AUDIO-SCR-02', 'JVH-P14-AUDIO-PAT-02', 'SELF', null,
    'Boyra', 22.8333, 89.5333,
    '{"coughDays":3,"fever":false,"nightSweats":false,"weightLoss":false,"bloodInSputum":false,"tbExposure":false}'::jsonb,
    'uploaded', shared_hash, 'CONTINUE_SCREENING'
  );
  assert not first_audio.possible_reused_audio and second_audio.possible_reused_audio,
    'the second exact uploaded-file hash did not create the expected warning';
  assert (
    select count(*) from private.part14_review_signals
    where signal_type = 'POSSIBLE_REUSED_AUDIO'
      and screening_id = 'JVH-P14-AUDIO-SCR-02'
  ) = 1, 'reused-audio warning was not recorded exactly once';

  for index in 1..10 loop
    select * into volume_referral
    from public.create_part9_referral(
      'JVH-P14-VOL-SCR-' || lpad(index::text, 2, '0'),
      'JVH-P14-VOL-PAT-' || lpad(index::text, 2, '0'),
      'PHARMACY', 'DEMO-KHL-SHAPLA', 'Khalishpur', 22.85, 89.5361,
      '{"coughDays":14,"fever":false,"nightSweats":false,"weightLoss":false,"bloodInSputum":false,"tbExposure":false}'::jsonb,
      'skipped', null, 'FORMAL_TB_EVALUATION_RECOMMENDED', 'NTP-KHL-KMCH'
    );
    if index < 10 then
      assert not volume_referral.activity_requires_review
        and volume_referral.reward_status = 'PENDING',
        'volume warning started before the tenth rolling-24-hour referral';
    else
      assert volume_referral.activity_requires_review
        and volume_referral.reward_status = 'HELD_FOR_REVIEW',
        'the tenth referral did not activate review and hold its new reward';
    end if;
  end loop;

  assert (
    select count(*) from public.rewards rw
    join public.referrals r on r.referral_id = rw.referral_id
    where r.screening_id like 'JVH-P14-VOL-SCR-%'
      and rw.reward_type = 'APPROPRIATE_REFERRAL_CREDIT'
      and rw.status = 'PENDING'
  ) = 9, 'earlier rewards were changed after the volume threshold was reached';
  assert (
    select count(*) from public.rewards rw
    join public.referrals r on r.referral_id = rw.referral_id
    where r.screening_id like 'JVH-P14-VOL-SCR-%'
      and rw.reward_type = 'APPROPRIATE_REFERRAL_CREDIT'
      and rw.status = 'HELD_FOR_REVIEW'
  ) = 1, 'the triggering reward was not the only referral reward held';

  select * into completed_once
  from public.complete_part10_referral(volume_referral.referral_id, null::uuid, 'NTP-KHL-KMCH');
  select * into completed_twice
  from public.complete_part10_referral(volume_referral.referral_id, null::uuid, 'NTP-KHL-KMCH');
  assert completed_once.status = 'COMPLETED' and not completed_once.already_used,
    'first referral-code use did not complete the referral';
  assert completed_twice.already_used and not completed_twice.completion_reward_created,
    'completed referral code created a second completion or reward';

  select * into pharmacy_dashboard
  from public.get_part11_pharmacy_dashboard('DEMO-KHL-SHAPLA');
  assert pharmacy_dashboard.activity_requires_review
    and pharmacy_dashboard.held_credits >= 2,
    'pharmacy dashboard did not show active volume review and held rewards';

  select * into government_dashboard from public.get_part13_government_dashboard();
  assert (government_dashboard.fraud_alerts->>'duplicate_reward_warnings')::integer >= 2
    and (government_dashboard.fraud_alerts->>'reused_audio_warnings')::integer >= 1
    and (government_dashboard.fraud_alerts->>'pharmacies_requiring_review')::integer >= 1
    and not (government_dashboard.fraud_alerts ? 'patient_id')
    and not (government_dashboard.fraud_alerts ? 'pharmacy_id')
    and not (government_dashboard.fraud_alerts ? 'audio_file_hash'),
    'government fraud summary is missing aggregate signals or exposes identifiers';

  raise notice 'PART14_BASIC_FRAUD_PROTECTION_TESTS_PASSED';
end;
$$;

rollback;
