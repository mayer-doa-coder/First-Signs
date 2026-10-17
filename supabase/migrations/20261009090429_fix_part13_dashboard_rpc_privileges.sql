begin;

-- The Data API's service_role can execute this RPC but intentionally has no
-- direct SELECT grant on the private screening/referral tables. Run only this
-- aggregate function with its owner privileges, retain the locked search path,
-- and keep every browser-facing role unable to invoke it.
alter function public.get_part13_government_dashboard()
  security definer;

revoke all on function public.get_part13_government_dashboard()
  from public, anon, authenticated;
grant execute on function public.get_part13_government_dashboard()
  to service_role;

comment on function public.get_part13_government_dashboard() is
  'Server-only anonymous programme aggregate. SECURITY DEFINER is required because service_role has no direct SELECT grant on private patient tables; execution is restricted to service_role.';

commit;
