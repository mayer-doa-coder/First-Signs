begin;

-- NTP laboratory directory source:
-- https://www.ntp.gov.bd/laboratory/
-- All facilities below are listed for Khulna with Microscopy service.
-- Coordinates are public map positions verified on 2026-09-11. Entries marked
-- "area-level" use the named locality because no building-level public point
-- was available; they must not be presented as turn-by-turn directions.
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
    'NTP-KHL-RUPSHA',
    'UHC Rupsha',
    'Khulna',
    'Rupsha',
    22.797848,
    89.641167,
    'Microscopy'
  ),
  (
    'NTP-KHL-TEROKHADA',
    'UHC Terokhoda',
    'Khulna',
    'Terokhada',
    22.928190,
    89.672850,
    'Microscopy'
  ),
  (
    'NTP-KHL-AAMCHK',
    'Ad din Akij Medical College Hospital (AAMCHK)',
    'Khulna',
    'Dighalia',
    22.841400,
    89.538762,
    'Microscopy'
  ),
  (
    'NTP-KHL-FULTALA',
    'UHC Fultala',
    'Khulna',
    'Fultala',
    22.958509,
    89.454586,
    'Microscopy'
  ),
  (
    'NTP-KHL-KOYRA',
    'UHC Koyra',
    'Khulna',
    'Koyra',
    21.970031,
    89.431978,
    'Microscopy'
  ),
  (
    'NTP-KHL-KAPILMONI',
    'Kapilmoni Hospital',
    'Khulna',
    'Kapilmoni',
    22.675006,
    89.330177,
    'Microscopy'
  ),
  (
    'NTP-KHL-BALIADANGA',
    'FWC Balia Danga',
    'Khulna',
    'Balia Danga',
    22.718874,
    89.548702,
    'Microscopy'
  ),
  (
    'NTP-KHL-BAJUA',
    'UP Bajua',
    'Khulna',
    'Bajua',
    22.559964,
    89.546299,
    'Microscopy'
  ),
  (
    'NTP-KHL-PIME',
    'PIME Sisters',
    'Khulna',
    'Boro Boyra',
    22.839267,
    89.535984,
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
  ('DEMO-KHL-PADMA', 'Padma Pharmacy', 'Fultala', true, null),
  ('DEMO-KHL-KOYRA', 'Koyra Community Pharmacy', 'Koyra', true, null),
  ('DEMO-KHL-PAIKGACHA', 'Paikgacha Pharmacy', 'Paikgacha', true, null),
  ('DEMO-KHL-RUPSHA', 'Rupsha Pharmacy', 'Rupsha', true, null)
on conflict (pharmacy_id) do update set
  name = excluded.name,
  area = excluded.area,
  active = excluded.active,
  integrity_score = excluded.integrity_score;

commit;
