begin;

-- A held reward is still an existing reward event. Ignoring it allowed the
-- same patient and reward type to generate another row during a volume hold,
-- contrary to the Part 14 thirty-day duplicate rule.
create or replace function private.part14_has_recent_patient_reward(
  p_patient_id text,
  p_reward_type text,
  p_at timestamptz
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.rewards rw
    left join public.screenings s on s.screening_id = rw.screening_id
    left join public.referrals r on r.referral_id = rw.referral_id
    where rw.reward_type = p_reward_type
      and rw.created_at >= p_at - interval '30 days'
      and coalesce(s.patient_id, r.patient_id) = p_patient_id
  );
$$;

comment on function private.part14_has_recent_patient_reward(text, text, timestamptz) is
  'Returns true for every existing reward state, including HELD_FOR_REVIEW, so a hold can never enable a duplicate reward.';

revoke all on function private.part14_has_recent_patient_reward(text, text, timestamptz)
  from public, anon, authenticated, service_role;

commit;
