begin;

do $$
declare
  self_token constant uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  pharmacy_token constant uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
  result record;
  first_created_at timestamptz;
  barriers text[] := array[
    'WORK_SCHEDULE',
    'CENTRE_TOO_FAR',
    'FEAR',
    'STIGMA',
    'TRANSPORT_PROBLEM',
    'DID_NOT_UNDERSTAND',
    'OTHER'
  ];
  actions text[] := array[
    'PLAN_SUITABLE_TIME',
    'SHOW_ANOTHER_CENTRE',
    'EXPLAIN_EVALUATION',
    'PRIVACY_AND_SUPPORT',
    'SEEK_TRANSPORT_SUPPORT',
    'EXPLAIN_WHY_EVALUATION_MATTERS',
    'HUMAN_SUPPORT'
  ];
  item integer;
begin
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

  insert into public.referrals (
    referral_id,
    screening_id,
    patient_id,
    pharmacy_id,
    tb_center_id,
    status,
    access_token
  ) values
    (
      'JVH-KHU-9900001',
      'JVH-SCR-BBBBBBBBBBBBBBBBBBBBBBBBBBBBBB01',
      'JVH-DEMO-BB000001',
      null,
      'NTP-KHL-KMCH',
      'PENDING',
      self_token
    ),
    (
      'JVH-KHU-9900002',
      'JVH-SCR-BBBBBBBBBBBBBBBBBBBBBBBBBBBBBB02',
      'JVH-DEMO-BB000002',
      'DEMO-KHL-RAHMAN',
      'NTP-KHL-KMCH',
      'PENDING',
      pharmacy_token
    );

  select * into result from public.get_part12_follow_up(self_token);
  assert result.referral_status = 'PENDING'
    and result.followup_status is null
    and result.barrier is null
    and result.next_action is null,
    'pending referral did not return an empty follow-up context';

  begin
    perform * from public.save_part12_follow_up_barrier(pharmacy_token, 'WORK_SCHEDULE');
    raise exception 'barrier was accepted before follow-up started';
  exception
    when invalid_parameter_value then null;
  end;

  select * into result from public.simulate_part12_follow_up(self_token);
  first_created_at := result.created_at;
  assert result.referral_status = 'FOLLOW_UP'
    and result.followup_status = 'AWAITING_BARRIER'
    and result.barrier is null
    and result.next_action is null,
    'self-use pending referral did not enter follow-up';

  for item in 1..array_length(barriers, 1) loop
    select * into result
    from public.save_part12_follow_up_barrier(self_token, barriers[item]);

    assert result.referral_status = 'FOLLOW_UP'
      and result.followup_status = 'ACTION_READY'
      and result.barrier = barriers[item]
      and result.next_action = actions[item],
      'barrier did not map to its deterministic next action';
  end loop;

  select * into result from public.simulate_part12_follow_up(self_token);
  assert result.created_at = first_created_at
    and result.barrier = 'OTHER'
    and result.next_action = 'HUMAN_SUPPORT',
    'idempotent follow-up retry replaced saved details';

  begin
    perform * from public.save_part12_follow_up_barrier(self_token, 'NOT_A_BARRIER');
    raise exception 'unknown barrier was accepted';
  exception
    when invalid_parameter_value then null;
  end;

  select * into result from public.simulate_part12_follow_up(pharmacy_token);
  assert result.referral_status = 'FOLLOW_UP'
    and result.followup_status = 'AWAITING_BARRIER',
    'pharmacy-assisted referral did not enter the same follow-up state';

  select * into result
  from public.save_part12_follow_up_barrier(pharmacy_token, 'CENTRE_TOO_FAR');
  assert result.next_action = 'SHOW_ANOTHER_CENTRE',
    'distance barrier did not show another-centre action';

  select * into result
  from public.complete_part10_referral(null, pharmacy_token, 'NTP-KHL-KMCH');
  assert result.status = 'COMPLETED'
    and result.completion_reward_created,
    'Part 10 could not complete a pharmacy referral after Part 12 follow-up';

  begin
    perform * from public.simulate_part12_follow_up(pharmacy_token);
    raise exception 'completed referral re-entered follow-up';
  exception
    when invalid_parameter_value then null;
  end;

  assert not exists (
    select 1
    from public.rewards r
    where r.referral_id = 'JVH-KHU-9900001'
  ), 'self-use follow-up created a pharmacy reward';

  raise notice 'PART12_DATABASE_TESTS_PASSED';
end;
$$;

rollback;

select count(*) as remaining_test_followups
from public.followups
where referral_id in ('JVH-KHU-9900001', 'JVH-KHU-9900002');
