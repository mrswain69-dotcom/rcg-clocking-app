-- RCG Clocking App
-- Once admin profile mutations use the authenticated admin-user Edge Function,
-- direct authenticated UPDATE grants on profiles are no longer required.
-- The service role used inside the privileged function bypasses RLS after it validates the actor.

revoke update (is_active, archived_at) on public.profiles from authenticated;
