-- ==========================================
-- DEVELOPMENT SEED DATA
-- ==========================================

insert into profiles (id, full_name, role)
values
  ('00000000-0000-0000-0000-000000000001', 'Owner User', 'owner'),
  ('00000000-0000-0000-0000-000000000002', 'Admin User', 'admin'),
  ('00000000-0000-0000-0000-000000000003', 'Developer User', 'developer'),
  ('00000000-0000-0000-0000-000000000004', 'Garden Member', 'user')
on conflict do nothing;
