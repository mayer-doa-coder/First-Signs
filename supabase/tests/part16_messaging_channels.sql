begin;

do $$
declare
  saved record;
  loaded record;
  claimed record;
  repeated record;
  version_conflict boolean := false;
  channel_key text := repeat('a', 64);
begin
  select * into saved from public.save_part16_channel_session(
    channel_key, 'TELEGRAM', 'JVH-DEMO-A1B2C3D4', 'PHARMACY', 'DEMO-KHL-RAHMAN',
    'bn', 'AWAITING_LANGUAGE', '{"screeningId":"JVH-SCR-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}'::jsonb, 0
  );
  assert saved.version = 1 and saved.pharmacy_id = 'DEMO-KHL-RAHMAN',
    'initial channel session was not saved';

  select * into loaded from public.get_part16_channel_session(channel_key);
  assert loaded.patient_id = 'JVH-DEMO-A1B2C3D4'
    and loaded.provider = 'TELEGRAM'
    and loaded.state->>'screeningId' = 'JVH-SCR-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'channel session lookup returned incorrect data';

  select * into saved from public.save_part16_channel_session(
    channel_key, 'TELEGRAM', 'JVH-DEMO-A1B2C3D4', 'PHARMACY', 'DEMO-KHL-RAHMAN',
    'en', 'AWAITING_CONSENT', '{"screeningId":"JVH-SCR-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}'::jsonb, 1
  );
  assert saved.version = 2 and saved.language = 'en',
    'channel session optimistic update failed';

  begin
    perform * from public.save_part16_channel_session(
      channel_key, 'TELEGRAM', 'JVH-DEMO-A1B2C3D4', 'PHARMACY', 'DEMO-KHL-RAHMAN',
      'bn', 'COUGH_DAYS', '{"screeningId":"JVH-SCR-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}'::jsonb, 1
    );
  exception when serialization_failure then
    version_conflict := true;
  end;
  assert version_conflict, 'stale channel session update was not rejected';

  select * into claimed from public.begin_part16_channel_event('TELEGRAM', 'update.part16-test', channel_key);
  assert claimed.should_process and claimed.previous_response is null,
    'new webhook event was not claimed';

  select * into repeated from public.begin_part16_channel_event('TELEGRAM', 'update.part16-test', channel_key);
  assert not repeated.should_process and repeated.previous_response is null,
    'in-flight duplicate webhook event was not suppressed';

  assert public.complete_part16_channel_event(
    'TELEGRAM', 'update.part16-test', channel_key, 'safe replay response'
  ), 'webhook event was not completed';

  select * into repeated from public.begin_part16_channel_event('TELEGRAM', 'update.part16-test', channel_key);
  assert not repeated.should_process and repeated.previous_response = 'safe replay response',
    'completed webhook event did not return its replay-safe response';

  select * into claimed from public.begin_part16_channel_event('TELEGRAM', 'update.part16-release', channel_key);
  assert claimed.should_process, 'second event was not claimed';
  assert public.release_part16_channel_event('TELEGRAM', 'update.part16-release', channel_key),
    'failed event was not released for provider retry';
  select * into claimed from public.begin_part16_channel_event('TELEGRAM', 'update.part16-release', channel_key);
  assert claimed.should_process, 'released event could not be claimed again';

  assert not has_function_privilege('anon', 'public.get_part16_channel_session(text)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.get_part16_channel_session(text)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.get_part16_channel_session(text)', 'EXECUTE'),
    'messaging session lookup is not server-only';

  assert not has_table_privilege('anon', 'private.part16_channel_sessions', 'SELECT')
    and not has_table_privilege('authenticated', 'private.part16_channel_events', 'SELECT'),
    'private messaging tables are exposed to browser roles';

  raise notice 'PART16_MESSAGING_CHANNEL_TESTS_PASSED';
end;
$$;

rollback;
