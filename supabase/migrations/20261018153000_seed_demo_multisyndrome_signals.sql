begin;

alter table public.care_signals add column is_demo boolean not null default false;

insert into public.care_signals (
  signal_id, pathway_id, age_band, care_outcome, source_type, area_name, created_at, is_demo
)
values
  ('JVH-SIG-D0000000000000000000000000000001','DIARRHOEA_DEHYDRATION','UNDER_5','PROFESSIONAL_EVALUATION_RECOMMENDED','SELF','Khulna',transaction_timestamp() - interval '5 days',true),
  ('JVH-SIG-D0000000000000000000000000000002','DIARRHOEA_DEHYDRATION','AGE_5_TO_17','PROFESSIONAL_EVALUATION_RECOMMENDED','PHARMACY','Khulna',transaction_timestamp() - interval '4 days',true),
  ('JVH-SIG-D0000000000000000000000000000003','DIARRHOEA_DEHYDRATION','ADULT','URGENT_MEDICAL_EVALUATION','SELF','Khulna',transaction_timestamp() - interval '3 days',true),
  ('JVH-SIG-D0000000000000000000000000000004','DIARRHOEA_DEHYDRATION','UNDER_5','PROFESSIONAL_EVALUATION_RECOMMENDED','PHARMACY','Khulna',transaction_timestamp() - interval '2 days',true),
  ('JVH-SIG-D0000000000000000000000000000005','DIARRHOEA_DEHYDRATION','ADULT','PROFESSIONAL_EVALUATION_RECOMMENDED','SELF','Khulna',transaction_timestamp() - interval '1 day',true)
on conflict (signal_id) do nothing;

create or replace function public.get_multisyndrome_summary()
returns table (pathway_activity jsonb, recent_actions jsonb)
language sql stable security definer set search_path = ''
as $$
  with counts as (
    select pathway_id, area_name, count(*)::bigint as signal_count,
      count(*) filter (where care_outcome = 'URGENT_MEDICAL_EVALUATION')::bigint as urgent_count
    from public.care_signals
    where is_demo and created_at >= statement_timestamp() - interval '7 days'
    group by pathway_id, area_name
    having count(*) >= 3
  )
  select
    coalesce((select jsonb_agg(jsonb_build_object(
      'pathway_id', pathway_id, 'area_name', area_name, 'signal_count', signal_count,
      'urgent_count', urgent_count, 'is_demo', true,
      'signal_level', case when signal_count >= 5 then 'RED' when signal_count >= 3 then 'WATCH' else 'NORMAL' end
    ) order by pathway_id, area_name) from counts), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object(
      'action_id', action_id, 'pathway_id', pathway_id, 'area_name', area_name,
      'action_type', action_type, 'note', note, 'recorded_at', recorded_at
    ) order by recorded_at desc) from (
      select * from public.public_health_actions order by recorded_at desc limit 20
    ) actions), '[]'::jsonb);
$$;

comment on function public.get_multisyndrome_summary() is
  'Returns only synthetic demo signals for the uncalibrated 3/5 warning thresholds. Real signals are not classified as outbreaks or hotspots.';

revoke all on function public.get_multisyndrome_summary() from public, anon, authenticated;
grant execute on function public.get_multisyndrome_summary() to service_role;

commit;
