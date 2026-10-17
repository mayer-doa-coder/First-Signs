begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table public.followups
  add constraint followups_status_allowed check (
    followup_status in ('AWAITING_BARRIER', 'ACTION_READY')
  ),
  add constraint followups_barrier_allowed check (
    barrier is null or barrier in (
      'WORK_SCHEDULE',
      'CENTRE_TOO_FAR',
      'FEAR',
      'STIGMA',
      'TRANSPORT_PROBLEM',
      'DID_NOT_UNDERSTAND',
      'OTHER'
    )
  ),
  add constraint followups_next_action_allowed check (
    next_action is null or next_action in (
      'PLAN_SUITABLE_TIME',
      'SHOW_ANOTHER_CENTRE',
      'EXPLAIN_EVALUATION',
      'PRIVACY_AND_SUPPORT',
      'SEEK_TRANSPORT_SUPPORT',
      'EXPLAIN_WHY_EVALUATION_MATTERS',
      'HUMAN_SUPPORT'
    )
  ),
  add constraint followups_state_matches_details check (
    (
      followup_status = 'AWAITING_BARRIER'
      and barrier is null
      and next_action is null
    )
    or (
      followup_status = 'ACTION_READY'
      and barrier is not null
      and next_action is not null
    )
  );

comment on table public.followups is
  'Private missed-referral follow-up details. Barrier and next action are stored as language-neutral codes and must never be exposed on public-health views.';

create function public.get_part12_follow_up(p_access_token uuid)
returns table (
  referral_id text,
  referral_status text,
  followup_status text,
  barrier text,
  next_action text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.referral_id,
    r.status,
    f.followup_status,
    f.barrier,
    f.next_action,
    f.created_at
  from public.referrals r
  left join public.followups f on f.referral_id = r.referral_id
  where r.access_token = p_access_token
  limit 1;
$$;

create function public.simulate_part12_follow_up(p_access_token uuid)
returns table (
  referral_id text,
  referral_status text,
  followup_status text,
  barrier text,
  next_action text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_referral public.referrals%rowtype;
  target_followup public.followups%rowtype;
begin
  if p_access_token is null then
    raise exception 'Referral access token is required' using errcode = '22023';
  end if;

  select r.*
    into target_referral
    from public.referrals r
    where r.access_token = p_access_token
    for update;

  if not found then
    return;
  end if;

  if target_referral.status = 'PENDING' then
    update public.referrals r
      set status = 'FOLLOW_UP'
      where r.referral_id = target_referral.referral_id
      returning r.* into target_referral;
  elsif target_referral.status <> 'FOLLOW_UP' then
    raise exception 'Only a pending referral can enter follow-up' using errcode = '22023';
  end if;

  insert into public.followups (
    patient_id,
    referral_id,
    followup_status
  ) values (
    target_referral.patient_id,
    target_referral.referral_id,
    'AWAITING_BARRIER'
  )
  on conflict (referral_id) do nothing;

  select f.*
    into target_followup
    from public.followups f
    where f.referral_id = target_referral.referral_id;

  return query
    select
      target_referral.referral_id,
      target_referral.status,
      target_followup.followup_status,
      target_followup.barrier,
      target_followup.next_action,
      target_followup.created_at;
end;
$$;

create function public.save_part12_follow_up_barrier(
  p_access_token uuid,
  p_barrier text
)
returns table (
  referral_id text,
  referral_status text,
  followup_status text,
  barrier text,
  next_action text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_referral public.referrals%rowtype;
  target_followup public.followups%rowtype;
  selected_next_action text;
begin
  if p_access_token is null then
    raise exception 'Referral access token is required' using errcode = '22023';
  end if;

  selected_next_action := case p_barrier
    when 'WORK_SCHEDULE' then 'PLAN_SUITABLE_TIME'
    when 'CENTRE_TOO_FAR' then 'SHOW_ANOTHER_CENTRE'
    when 'FEAR' then 'EXPLAIN_EVALUATION'
    when 'STIGMA' then 'PRIVACY_AND_SUPPORT'
    when 'TRANSPORT_PROBLEM' then 'SEEK_TRANSPORT_SUPPORT'
    when 'DID_NOT_UNDERSTAND' then 'EXPLAIN_WHY_EVALUATION_MATTERS'
    when 'OTHER' then 'HUMAN_SUPPORT'
    else null
  end;

  if selected_next_action is null then
    raise exception 'Unknown missed-referral barrier' using errcode = '22023';
  end if;

  select r.*
    into target_referral
    from public.referrals r
    where r.access_token = p_access_token
    for update;

  if not found then
    return;
  end if;

  if target_referral.status <> 'FOLLOW_UP' then
    raise exception 'Referral is not awaiting follow-up' using errcode = '22023';
  end if;

  insert into public.followups (
    patient_id,
    referral_id,
    followup_status,
    barrier,
    next_action
  ) values (
    target_referral.patient_id,
    target_referral.referral_id,
    'ACTION_READY',
    p_barrier,
    selected_next_action
  )
  on conflict (referral_id) do update
    set patient_id = excluded.patient_id,
        followup_status = excluded.followup_status,
        barrier = excluded.barrier,
        next_action = excluded.next_action
  returning * into target_followup;

  return query
    select
      target_referral.referral_id,
      target_referral.status,
      target_followup.followup_status,
      target_followup.barrier,
      target_followup.next_action,
      target_followup.created_at;
end;
$$;

revoke all on function public.get_part12_follow_up(uuid)
  from public, anon, authenticated;
revoke all on function public.simulate_part12_follow_up(uuid)
  from public, anon, authenticated;
revoke all on function public.save_part12_follow_up_barrier(uuid, text)
  from public, anon, authenticated;

grant execute on function public.get_part12_follow_up(uuid)
  to service_role;
grant execute on function public.simulate_part12_follow_up(uuid)
  to service_role;
grant execute on function public.save_part12_follow_up_barrier(uuid, text)
  to service_role;

commit;
