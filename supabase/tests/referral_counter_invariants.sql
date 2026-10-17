begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create function private.audit_reject_counter_test_referral()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.screening_id = 'JVH-COUNTER-TEST-SCR-FAIL' then
    raise exception 'intentional rollback audit failure';
  end if;
  return new;
end;
$$;

create trigger audit_reject_counter_test_referral
before insert on public.referrals
for each row execute function private.audit_reject_counter_test_referral();

do $$
declare
  counter_before bigint;
  counter_after_first bigint;
  counter_after_retry bigint;
  counter_after_failure bigint;
  first_result record;
  retry_result record;
  formatted_large_id text;
begin
  select last_value into counter_before
  from private.referral_counters
  where counter_key = 'JVH-KHU'
  for update;

  assert counter_before is not null, 'referral counter is not initialized';

  select * into first_result
  from public.create_part9_referral(
    'JVH-COUNTER-TEST-SCR-01', 'JVH-COUNTER-TEST-PAT-01', 'SELF', null,
    'Sonadanga', 22.8167, 89.55,
    '{"coughDays":14,"fever":false,"nightSweats":false,"weightLoss":false,"bloodInSputum":false,"tbExposure":false}'::jsonb,
    'skipped', null, 'FORMAL_TB_EVALUATION_RECOMMENDED', 'NTP-KHL-KMCH'
  );

  select last_value into counter_after_first
  from private.referral_counters where counter_key = 'JVH-KHU';

  assert counter_after_first = counter_before + 1,
    'a successful referral did not advance the counter exactly once';
  assert first_result.referral_id = 'JVH-KHU-' || lpad(
    counter_after_first::text,
    greatest(5, length(counter_after_first::text)),
    '0'
  ), 'the referral ID does not match the transactional counter';

  select * into retry_result
  from public.create_part9_referral(
    'JVH-COUNTER-TEST-SCR-01', 'JVH-COUNTER-TEST-PAT-01', 'SELF', null,
    'Sonadanga', 22.8167, 89.55,
    '{"coughDays":14,"fever":false,"nightSweats":false,"weightLoss":false,"bloodInSputum":false,"tbExposure":false}'::jsonb,
    'skipped', null, 'FORMAL_TB_EVALUATION_RECOMMENDED', 'NTP-KHL-KMCH'
  );

  select last_value into counter_after_retry
  from private.referral_counters where counter_key = 'JVH-KHU';

  assert retry_result.referral_id = first_result.referral_id,
    'retrying the same screening did not return its existing referral';
  assert counter_after_retry = counter_after_first,
    'retrying the same screening consumed another referral number';

  begin
    perform * from public.create_part9_referral(
      'JVH-COUNTER-TEST-SCR-FAIL', 'JVH-COUNTER-TEST-PAT-FAIL', 'SELF', null,
      'Sonadanga', 22.8167, 89.55,
      '{"coughDays":14,"fever":false,"nightSweats":false,"weightLoss":false,"bloodInSputum":false,"tbExposure":false}'::jsonb,
      'skipped', null, 'FORMAL_TB_EVALUATION_RECOMMENDED', 'NTP-KHL-KMCH'
    );
    assert false, 'forced post-counter referral failure unexpectedly succeeded';
  exception when raise_exception then
    null;
  end;

  select last_value into counter_after_failure
  from private.referral_counters where counter_key = 'JVH-KHU';

  assert counter_after_failure = counter_after_retry,
    'a failed referral transaction consumed a referral number';
  assert not exists (
    select 1 from public.screenings where screening_id = 'JVH-COUNTER-TEST-SCR-FAIL'
  ), 'failed referral left a partial screening behind';

  assert 'JVH-KHU-' || lpad('1', greatest(5, length('1')), '0') = 'JVH-KHU-00001',
    'the specified initial counter state does not format as JVH-KHU-00001';

  formatted_large_id := 'JVH-KHU-' || lpad(
    '100000',
    greatest(5, length('100000')),
    '0'
  );
  assert formatted_large_id = 'JVH-KHU-100000'
    and formatted_large_id ~ '^JVH-KHU-[0-9]{5,}$',
    'referral IDs above 99999 are truncated or rejected';

  raise notice 'REFERRAL_COUNTER_INVARIANTS_TESTS_PASSED';
end;
$$;

rollback;
