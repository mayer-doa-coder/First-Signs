begin;

create or replace function public.save_care_signal(
  p_signal_id text, p_pathway_id text, p_age_band text,
  p_care_outcome text, p_source_type text, p_area_name text
)
returns table (signal_id text, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare affected_rows integer := 0;
begin
  if p_signal_id !~ '^JVH-SIG-[A-F0-9]{32}$'
    or p_pathway_id not in ('RESPIRATORY_TB','FEVER_MOSQUITO','DIARRHOEA_DEHYDRATION','SKIN_NERVE_LEPROSY','CHILD_BREATHING')
    or p_age_band not in ('UNDER_5','AGE_5_TO_17','ADULT')
    or p_care_outcome not in ('CONTINUE_WITH_CARE_INFORMATION','PROFESSIONAL_EVALUATION_RECOMMENDED','URGENT_MEDICAL_EVALUATION')
    or p_source_type not in ('SELF','PHARMACY')
    or p_area_name is null or length(btrim(p_area_name)) = 0 then
    raise exception 'Invalid anonymous care signal' using errcode = '22023';
  end if;
  insert into public.care_signals(signal_id, pathway_id, age_band, care_outcome, source_type, area_name)
  values (p_signal_id, p_pathway_id, p_age_band, p_care_outcome, p_source_type, p_area_name)
  on conflict on constraint care_signals_pkey do nothing;
  get diagnostics affected_rows = row_count;
  return query select p_signal_id, affected_rows > 0;
end;
$$;

create index if not exists referrals_facility_id_idx on public.referrals(facility_id);

revoke all on function public.save_care_signal(text,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.save_care_signal(text,text,text,text,text,text) to service_role;

commit;
