-- The account API routes run only on the trusted application server with the
-- Supabase secret key. New projects can require explicit Data API privileges
-- even for service_role; RLS remains enabled for browser-facing roles.
grant usage on schema public to service_role;

grant select, insert, update, delete on table
  public.account_profiles,
  public.account_patient_links,
  public.staff_memberships,
  public.care_reminders
to service_role;
