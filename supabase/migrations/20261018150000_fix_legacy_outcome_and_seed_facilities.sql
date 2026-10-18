begin;

create function private.sync_multisyndrome_care_outcome()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.care_outcome is null then
    new.care_outcome := case new.screening_result
      when 'CONTINUE_SCREENING' then 'CONTINUE_WITH_CARE_INFORMATION'
      when 'FORMAL_TB_EVALUATION_RECOMMENDED' then 'PROFESSIONAL_EVALUATION_RECOMMENDED'
      when 'URGENT_MEDICAL_EVALUATION' then 'URGENT_MEDICAL_EVALUATION'
      else null
    end;
  end if;
  return new;
end;
$$;

create trigger screenings_sync_care_outcome_before_write
before insert or update of screening_result on public.screenings
for each row execute function private.sync_multisyndrome_care_outcome();

revoke all on function private.sync_multisyndrome_care_outcome() from public, anon, authenticated, service_role;

insert into public.tb_centers (
  center_id, name, district, area, latitude, longitude, service_type, supported_pathways
)
values
  ('BD-DHA-NIDCH', 'National Institute of Diseases of the Chest and Hospital', 'Dhaka', 'Mohakhali', 23.7757437, 90.4094176, 'General referral hospital — confirm current service availability', array['RESPIRATORY_TB','FEVER_MOSQUITO','DIARRHOEA_DEHYDRATION','SKIN_NERVE_LEPROSY','CHILD_BREATHING']),
  ('BD-CTG-CMCH', 'Chittagong Medical College Hospital', 'Chattogram', 'Chattogram City', 22.3593346, 91.8306570, 'General referral hospital — confirm current service availability', array['RESPIRATORY_TB','FEVER_MOSQUITO','DIARRHOEA_DEHYDRATION','SKIN_NERVE_LEPROSY','CHILD_BREATHING']),
  ('BD-RAJ-RMCH', 'Rajshahi Medical College Hospital', 'Rajshahi', 'Rajshahi City', 24.3730464, 88.5871186, 'General referral hospital — confirm current service availability', array['RESPIRATORY_TB','FEVER_MOSQUITO','DIARRHOEA_DEHYDRATION','SKIN_NERVE_LEPROSY','CHILD_BREATHING']),
  ('BD-BAR-SBMCH', 'Sher-e-Bangla Medical College Hospital', 'Barishal', 'Barishal City', 22.6864652, 90.3617364, 'General referral hospital — confirm current service availability', array['RESPIRATORY_TB','FEVER_MOSQUITO','DIARRHOEA_DEHYDRATION','SKIN_NERVE_LEPROSY','CHILD_BREATHING']),
  ('BD-SYL-OMCH', 'M.A.G. Osmani Medical College Hospital', 'Sylhet', 'Kajolshah', 24.9020252, 91.8535767, 'General referral hospital — confirm current service availability', array['RESPIRATORY_TB','FEVER_MOSQUITO','DIARRHOEA_DEHYDRATION','SKIN_NERVE_LEPROSY','CHILD_BREATHING']),
  ('BD-RNG-RMCH', 'Rangpur Medical College Hospital', 'Rangpur', 'Dhap', 25.7673241, 89.2327154, 'General referral hospital — confirm current service availability', array['RESPIRATORY_TB','FEVER_MOSQUITO','DIARRHOEA_DEHYDRATION','SKIN_NERVE_LEPROSY','CHILD_BREATHING']),
  ('BD-MYM-MMCH', 'Mymensingh Medical College Hospital', 'Mymensingh', 'Mymensingh City', 24.7415116, 90.4092469, 'General referral hospital — confirm current service availability', array['RESPIRATORY_TB','FEVER_MOSQUITO','DIARRHOEA_DEHYDRATION','SKIN_NERVE_LEPROSY','CHILD_BREATHING'])
on conflict (center_id) do update set
  name = excluded.name,
  district = excluded.district,
  area = excluded.area,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  service_type = excluded.service_type,
  supported_pathways = excluded.supported_pathways;

commit;
