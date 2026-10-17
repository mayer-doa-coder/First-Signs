begin;

-- This Supabase-generated event-trigger helper is SECURITY DEFINER. It must
-- remain available to its owner, but never be callable through the public API.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

commit;
