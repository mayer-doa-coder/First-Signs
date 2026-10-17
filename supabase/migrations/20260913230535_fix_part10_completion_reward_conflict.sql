begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create or replace function public.complete_part10_referral(
  p_referral_id text,
  p_access_token uuid,
  p_tb_center_id text
)
returns table (
  referral_id text,
  status text,
  code_used boolean,
  tb_center_id text,
  centre_name text,
  centre_area text,
  centre_district text,
  service_type text,
  created_at timestamptz,
  completed_at timestamptz,
  already_used boolean,
  completion_reward_created boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_referral public.referrals%rowtype;
  centre_record public.tb_centers%rowtype;
  was_already_used boolean;
  reward_was_created boolean := false;
  affected_reward_rows integer := 0;
begin
  if (p_referral_id is null) = (p_access_token is null) then
    raise exception 'Provide exactly one referral lookup value' using errcode = '22023';
  end if;

  if p_referral_id is not null
    and p_referral_id !~ '^JVH-KHU-[0-9]{5,}$' then
    raise exception 'Invalid referral ID' using errcode = '22023';
  end if;

  if p_tb_center_id is null or length(btrim(p_tb_center_id)) = 0 then
    raise exception 'TB centre ID is required' using errcode = '22023';
  end if;

  select r.*
    into target_referral
    from public.referrals r
    where (
      p_referral_id is not null
      and r.referral_id = p_referral_id
    ) or (
      p_access_token is not null
      and r.access_token = p_access_token
    )
    for update;

  if not found then
    return;
  end if;

  if target_referral.tb_center_id is distinct from p_tb_center_id then
    raise exception 'Referral belongs to a different TB centre' using errcode = '22023';
  end if;

  select *
    into centre_record
    from public.tb_centers c
    where c.center_id = target_referral.tb_center_id;

  if not found then
    raise exception 'Intended TB centre no longer exists' using errcode = '23503';
  end if;

  was_already_used := target_referral.code_used_at is not null
    or target_referral.status = 'COMPLETED';

  if not was_already_used then
    if target_referral.status not in ('PENDING', 'FOLLOW_UP') then
      raise exception 'Closed referrals cannot be completed' using errcode = '22023';
    end if;

    update public.referrals r
      set status = 'COMPLETED',
          completed_at = transaction_timestamp(),
          code_used_at = transaction_timestamp()
      where r.referral_id = target_referral.referral_id
      returning r.* into target_referral;

    if target_referral.pharmacy_id is not null then
      insert into public.rewards (
        reward_id,
        pharmacy_id,
        referral_id,
        reward_type,
        amount,
        status
      ) values (
        'JVH-RWD-' || upper(replace(gen_random_uuid()::text, '-', '')),
        target_referral.pharmacy_id,
        target_referral.referral_id,
        'FORMAL_EVALUATION_COMPLETION_CREDIT',
        null,
        'CONFIRMED'
      )
      on conflict do nothing;

      get diagnostics affected_reward_rows = row_count;
      reward_was_created := affected_reward_rows > 0;
    end if;
  end if;

  return query
    select
      target_referral.referral_id,
      target_referral.status,
      target_referral.code_used_at is not null,
      target_referral.tb_center_id,
      centre_record.name,
      centre_record.area,
      centre_record.district,
      centre_record.service_type,
      target_referral.created_at,
      target_referral.completed_at,
      was_already_used,
      reward_was_created;
end;
$$;

revoke all on function public.complete_part10_referral(text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.complete_part10_referral(text, uuid, text)
  to service_role;

commit;
