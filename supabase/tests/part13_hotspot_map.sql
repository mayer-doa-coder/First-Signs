begin;

do $$
declare
  activity jsonb;
  area_row jsonb;
  test_referral record;
  index integer;
begin
  -- Isolate one approved broad area inside this rollback-only test without
  -- deleting any existing records or exposing patient-level data.
  update public.screenings
  set created_at = statement_timestamp() - interval '8 days'
  where area_name = 'Batiaghata'
    and created_at >= statement_timestamp() - interval '7 days';

  for index in 1..2 loop
    perform * from public.save_part11_screening(
      'JVH-MAP-PRIVACY-SCR-' || index,
      'JVH-MAP-PRIVACY-PAT-' || index,
      'SELF',
      null,
      'Batiaghata',
      22.7417,
      89.5167,
      '{"coughDays":14,"fever":false,"nightSweats":false,"weightLoss":false,"bloodInSputum":false,"tbExposure":false}'::jsonb,
      'skipped',
      null,
      'FORMAL_TB_EVALUATION_RECOMMENDED'
    );
  end loop;

  select area_activity into activity
  from public.get_part13_government_dashboard();
  select value into area_row
  from jsonb_array_elements(activity)
  where value->>'area_name' = 'Batiaghata';
  assert area_row is null,
    'an area with fewer than three independent screened users was exposed';

  perform * from public.save_part11_screening(
    'JVH-MAP-PRIVACY-SCR-3',
    'JVH-MAP-PRIVACY-PAT-3',
    'SELF',
    null,
    'Batiaghata',
    22.7417,
    89.5167,
    '{"coughDays":14,"fever":false,"nightSweats":false,"weightLoss":false,"bloodInSputum":false,"tbExposure":false}'::jsonb,
    'skipped',
    null,
    'FORMAL_TB_EVALUATION_RECOMMENDED'
  );

  select area_activity into activity
  from public.get_part13_government_dashboard();
  select value into area_row
  from jsonb_array_elements(activity)
  where value->>'area_name' = 'Batiaghata';
  assert (area_row->>'unique_users_screened')::integer = 3,
    'privacy-safe area did not report three unique screened users';
  assert area_row->>'hotspot_level' = 'NORMAL',
    'area without referrals was not normal';

  for index in 1..3 loop
    perform * from public.create_part9_referral(
      'JVH-MAP-PRIVACY-SCR-' || index,
      'JVH-MAP-PRIVACY-PAT-' || index,
      'SELF',
      null,
      'Batiaghata',
      22.7417,
      89.5167,
      '{"coughDays":14,"fever":false,"nightSweats":false,"weightLoss":false,"bloodInSputum":false,"tbExposure":false}'::jsonb,
      'skipped',
      null,
      'FORMAL_TB_EVALUATION_RECOMMENDED',
      'NTP-KHL-KMCH'
    );
  end loop;

  select area_activity into activity
  from public.get_part13_government_dashboard();
  select value into area_row
  from jsonb_array_elements(activity)
  where value->>'area_name' = 'Batiaghata';
  assert area_row->>'hotspot_level' = 'WATCH',
    'three independent referred users did not produce watch status';
  assert (area_row->>'independent_referred_users')::integer = 3,
    'independent referred user count is incorrect';

  -- A second screening and referral for the same person may increase the raw
  -- referral count, but must not move the independent-user hotspot count.
  perform * from public.save_part11_screening(
    'JVH-MAP-PRIVACY-SCR-DUPLICATE',
    'JVH-MAP-PRIVACY-PAT-1',
    'SELF',
    null,
    'Batiaghata',
    22.7417,
    89.5167,
    '{"coughDays":14,"fever":false,"nightSweats":false,"weightLoss":false,"bloodInSputum":false,"tbExposure":false}'::jsonb,
    'skipped',
    null,
    'FORMAL_TB_EVALUATION_RECOMMENDED'
  );
  perform * from public.create_part9_referral(
    'JVH-MAP-PRIVACY-SCR-DUPLICATE',
    'JVH-MAP-PRIVACY-PAT-1',
    'SELF',
    null,
    'Batiaghata',
    22.7417,
    89.5167,
    '{"coughDays":14,"fever":false,"nightSweats":false,"weightLoss":false,"bloodInSputum":false,"tbExposure":false}'::jsonb,
    'skipped',
    null,
    'FORMAL_TB_EVALUATION_RECOMMENDED',
    'NTP-KHL-KMCH'
  );

  select area_activity into activity
  from public.get_part13_government_dashboard();
  select value into area_row
  from jsonb_array_elements(activity)
  where value->>'area_name' = 'Batiaghata';
  assert (area_row->>'unique_users_screened')::integer = 3,
    'duplicate patient increased unique screened users';
  assert (area_row->>'independent_referred_users')::integer = 3,
    'duplicate patient increased independent referred users';
  assert (area_row->>'referral_count')::integer = 4,
    'raw referral count did not include the additional referral';
  assert area_row->>'hotspot_level' = 'WATCH',
    'duplicate patient incorrectly moved the area to red';

  for index in 4..5 loop
    select * into test_referral
    from public.create_part9_referral(
      'JVH-MAP-PRIVACY-SCR-' || index,
      'JVH-MAP-PRIVACY-PAT-' || index,
      'SELF',
      null,
      'Batiaghata',
      22.7417,
      89.5167,
      '{"coughDays":14,"fever":false,"nightSweats":false,"weightLoss":false,"bloodInSputum":false,"tbExposure":false}'::jsonb,
      'skipped',
      null,
      'FORMAL_TB_EVALUATION_RECOMMENDED',
      'NTP-KHL-KMCH'
    );
  end loop;

  perform * from public.complete_part10_referral(
    test_referral.referral_id,
    null::uuid,
    'NTP-KHL-KMCH'
  );

  select area_activity into activity
  from public.get_part13_government_dashboard();
  select value into area_row
  from jsonb_array_elements(activity)
  where value->>'area_name' = 'Batiaghata';
  assert (area_row->>'independent_referred_users')::integer = 5,
    'five independent referred users were not counted';
  assert area_row->>'hotspot_level' = 'RED',
    'five independent referred users did not produce a red warning';
  assert (area_row->>'completion_count')::integer = 1,
    'completed referral was not counted in the area aggregate';
  assert not (area_row ? 'patient_id'),
    'area aggregate exposed a patient identifier';

  raise notice 'PART13_HOTSPOT_MAP_TESTS_PASSED';
end;
$$;

rollback;
