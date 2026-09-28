-- RCG Clocking App
-- Performance index for kiosk-device administrator attribution.

create index if not exists kiosk_devices_enrolled_by_profile_idx
  on public.kiosk_devices(enrolled_by_profile_id)
  where enrolled_by_profile_id is not null;
