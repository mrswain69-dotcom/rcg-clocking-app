-- RCG Clocking App
-- Follow-up hardening for presence checks.

create index if not exists presence_check_requested_by_profile_idx
  on public.presence_check_requests(requested_by_profile_id)
  where requested_by_profile_id is not null;

-- Push endpoints and encryption keys are managed only through authenticated
-- SECURITY DEFINER RPCs and service-role notification delivery. Clients do not
-- need direct Data API reads of subscription records.
revoke select on public.push_subscriptions from authenticated;
