-- RCG Clocking App
-- Separate management permission to use kiosks from the user's own enabled/configured state.

alter table public.profiles
  add column if not exists kiosk_user_enabled boolean not null default false;

-- Preserve existing configured kiosk users: if management allowed kiosk access and
-- a PIN already exists, treat the user's kiosk setup as enabled.
update public.profiles p
set kiosk_user_enabled = true
where p.profile_type = 'account'
  and p.can_use_kiosk = true
  and exists (
    select 1
    from public.pin_credentials pc
    where pc.profile_id = p.id
  );

update public.profiles
set kiosk_user_enabled = false
where profile_type = 'attendance_only';
