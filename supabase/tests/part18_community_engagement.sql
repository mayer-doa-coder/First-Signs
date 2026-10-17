begin;

do $$
declare
  submission uuid := '18000000-0000-4000-8000-000000000001';
  first_result record;
  retry_result record;
  summary record;
  unexpected_columns integer;
begin
  delete from private.part18_community_feedback where submission_id = submission;

  select * into first_result
  from public.submit_part18_community_feedback(submission, 'WORK');
  assert first_result.created, 'first anonymous submission was not created';

  select * into retry_result
  from public.submit_part18_community_feedback(submission, 'DISTANCE');
  assert not retry_result.created, 'idempotent retry created a second response';
  assert retry_result.total_responses = first_result.total_responses,
    'idempotent retry changed the public response count';

  select * into summary from public.get_part18_community_summary();
  assert summary.total_responses >= 1, 'community summary did not include the response';
  assert summary.work_count >= 1, 'community summary did not retain the original category';

  begin
    perform public.submit_part18_community_feedback(
      '18000000-0000-4000-8000-000000000002',
      'TB_POSITIVE'
    );
    assert false, 'undocumented or health-status category was accepted';
  exception when sqlstate '22023' then
    null;
  end;

  select count(*) into unexpected_columns
  from information_schema.columns
  where table_schema = 'private'
    and table_name = 'part18_community_feedback'
    and column_name in (
      'patient_id', 'name', 'phone', 'tb_status', 'free_text',
      'ip_address', 'user_agent', 'audio_hash', 'channel_key'
    );
  assert unexpected_columns = 0, 'community table contains a prohibited identifying or health field';

  assert not has_table_privilege('anon', 'private.part18_community_feedback', 'SELECT')
    and not has_table_privilege('authenticated', 'private.part18_community_feedback', 'SELECT'),
    'community response rows are exposed to browser roles';
  assert not has_function_privilege('anon', 'public.get_part18_community_summary()', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.submit_part18_community_feedback(uuid, text)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.get_part18_community_summary()', 'EXECUTE'),
    'community RPC privileges are not server-only';

  raise notice 'PART18_COMMUNITY_ENGAGEMENT_TESTS_PASSED';
end;
$$;

rollback;
