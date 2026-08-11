-- PostgREST uses these roles for the browser/server Supabase clients.
-- RLS policies below remain the authorization boundary for every write.
grant usage on schema public to anon, authenticated;

grant select on public.profiles to anon, authenticated;
grant update on public.profiles to authenticated;
grant select on public.startups to anon, authenticated;
grant select on public.votes to anon, authenticated;
grant select on public.comments to anon, authenticated;

grant select, insert, update, delete on public.startups to authenticated;
grant insert, delete on public.votes to authenticated;
grant insert, update, delete on public.comments to authenticated;
grant select, insert, update on public.investor_interests to authenticated;
grant select, insert, delete on public.saves to authenticated;

grant execute on function public.increment_startup_view(uuid, text) to anon, authenticated;
grant execute on function public.get_startup_interest_count(uuid) to anon, authenticated;
