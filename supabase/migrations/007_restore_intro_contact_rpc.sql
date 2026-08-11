-- Restore the founder-side action if migration 004 was applied without the RPC
-- (or if PostgREST never refreshed its schema cache).
alter table public.investor_interests
  add column if not exists contacted_at timestamptz;

create or replace function public.acknowledge_intro_request(p_interest_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  contact_time timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  update public.investor_interests as interest
  set contacted_at = coalesce(interest.contacted_at, now())
  from public.startups as startup
  where interest.id = p_interest_id
    and interest.startup_id = startup.id
    and startup.founder_id = auth.uid()
    and interest.status = 'interested'
  returning interest.contacted_at into contact_time;

  if contact_time is null then
    raise exception 'Intro request not found.';
  end if;

  return contact_time;
end;
$$;

grant execute on function public.acknowledge_intro_request(uuid) to authenticated;
notify pgrst, 'reload schema';
