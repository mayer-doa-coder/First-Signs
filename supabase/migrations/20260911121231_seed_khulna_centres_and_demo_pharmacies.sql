begin;

-- NTP laboratory directory source:
-- https://www.ntp.gov.bd/laboratory/
-- Map positions were verified against OpenStreetMap search results on 2026-09-11.
-- These are NTP-listed laboratories used as prototype referral destinations.
insert into public.tb_centers (
  center_id,
  name,
  district,
  area,
  latitude,
  longitude,
  service_type
) values
  (
    'NTP-KHL-BATIAGHATA',
    'UHC Batiaghata',
    'Khulna',
    'Batiaghata',
    22.738530,
    89.514479,
    'Microscopy'
  ),
  (
    'NTP-KHL-DACOPE',
    'UHC Dacope',
    'Khulna',
    'Dacope',
    22.599848,
    89.517771,
    'Microscopy'
  ),
  (
    'NTP-KHL-DIGHALIA',
    'UHC Dighalia',
    'Khulna',
    'Dighalia',
    22.872988,
    89.524585,
    'Microscopy'
  ),
  (
    'NTP-KHL-DUMURIA',
    'UHC Dumuria',
    'Khulna',
    'Dumuria',
    22.809993,
    89.410562,
    'Microscopy'
  ),
  (
    'NTP-KHL-PAIKGACHA',
    'UHC Paikgacha',
    'Khulna',
    'Paikgacha',
    22.594345,
    89.318243,
    'Microscopy'
  ),
  (
    'NTP-KHL-KMCH',
    'Khulna Medical College Hospital (KMCH)',
    'Khulna',
    'Sonadanga',
    22.828940,
    89.537463,
    'Microscopy'
  )
on conflict (center_id) do update set
  name = excluded.name,
  district = excluded.district,
  area = excluded.area,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  service_type = excluded.service_type;

-- Demo pharmacies only; these are not real business listings or verified partners.
insert into public.pharmacies (
  pharmacy_id,
  name,
  area,
  active,
  integrity_score
) values
  ('DEMO-KHL-RAHMAN', 'Rahman Pharmacy', 'Sonadanga', true, null),
  ('DEMO-KHL-CITY', 'City Pharmacy', 'Boyra', true, null),
  ('DEMO-KHL-SHAPLA', 'Shapla Pharmacy', 'Khalishpur', true, null),
  ('DEMO-KHL-MAA', 'Maa Pharmacy', 'Daulatpur', true, null),
  ('DEMO-KHL-CARE', 'Khulna Care Pharmacy', 'Rupsha', true, null),
  ('DEMO-KHL-BATIAGHATA', 'Batiaghata Model Pharmacy', 'Batiaghata', true, null)
on conflict (pharmacy_id) do update set
  name = excluded.name,
  area = excluded.area,
  active = excluded.active,
  integrity_score = excluded.integrity_score;

commit;
