-- Part 18 stores one fixed, anonymous barrier category per idempotent public
-- feedback submission. It intentionally stores no patient or channel identity,
-- free text, health status, IP address, user agent, or device fingerprint.

create table private.part18_community_feedback (
  id bigint generated always as identity primary key,
  submission_id uuid not null unique,
  category text not null check (
    category in (
      'WORK',
      'DISTANCE',
      'FEAR',
      'STIGMA',
      'LACK_OF_INFORMATION',
      'TRANSPORT'
    )
  ),
  created_at timestamptz not null default now()
);

alter table private.part18_community_feedback enable row level security;
revoke all on table private.part18_community_feedback from public, anon, authenticated, service_role;
revoke all on sequence private.part18_community_feedback_id_seq from public, anon, authenticated, service_role;

create or replace function public.get_part18_community_summary()
returns table (
  total_responses bigint,
  work_count bigint,
  distance_count bigint,
  fear_count bigint,
  stigma_count bigint,
  lack_of_information_count bigint,
  transport_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    count(*)::bigint,
    count(*) filter (where feedback.category = 'WORK')::bigint,
    count(*) filter (where feedback.category = 'DISTANCE')::bigint,
    count(*) filter (where feedback.category = 'FEAR')::bigint,
    count(*) filter (where feedback.category = 'STIGMA')::bigint,
    count(*) filter (where feedback.category = 'LACK_OF_INFORMATION')::bigint,
    count(*) filter (where feedback.category = 'TRANSPORT')::bigint
  from private.part18_community_feedback as feedback;
$$;

create or replace function public.submit_part18_community_feedback(
  p_submission_id uuid,
  p_category text
)
returns table (
  created boolean,
  total_responses bigint,
  work_count bigint,
  distance_count bigint,
  fear_count bigint,
  stigma_count bigint,
  lack_of_information_count bigint,
  transport_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_count integer;
begin
  if p_submission_id is null then
    raise exception 'INVALID_SUBMISSION_ID' using errcode = '22023';
  end if;

  if p_category is null or p_category not in (
    'WORK',
    'DISTANCE',
    'FEAR',
    'STIGMA',
    'LACK_OF_INFORMATION',
    'TRANSPORT'
  ) then
    raise exception 'INVALID_FEEDBACK_CATEGORY' using errcode = '22023';
  end if;

  insert into private.part18_community_feedback (submission_id, category)
  values (p_submission_id, p_category)
  on conflict (submission_id) do nothing;
  get diagnostics inserted_count = row_count;

  return query
  select
    inserted_count = 1,
    summary.total_responses,
    summary.work_count,
    summary.distance_count,
    summary.fear_count,
    summary.stigma_count,
    summary.lack_of_information_count,
    summary.transport_count
  from public.get_part18_community_summary() as summary;
end;
$$;

comment on table private.part18_community_feedback is
  'Anonymous Part 18 fixed-category community responses. Contains no patient identity, contact details, free text, or TB status.';
comment on function public.get_part18_community_summary() is
  'Returns anonymous aggregate community feedback counts only.';
comment on function public.submit_part18_community_feedback(uuid, text) is
  'Idempotently stores one anonymous fixed-category response and returns aggregate counts.';

revoke all on function public.get_part18_community_summary() from public, anon, authenticated;
revoke all on function public.submit_part18_community_feedback(uuid, text) from public, anon, authenticated;
grant execute on function public.get_part18_community_summary() to service_role;
grant execute on function public.submit_part18_community_feedback(uuid, text) to service_role;
