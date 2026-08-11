-- Keep investor-interest counts derived from the source rows, even if older
-- triggers or denormalized counters drifted.
create or replace function public.get_startup_interest_count(p_startup_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.investor_interests
  where startup_id = p_startup_id
    and status = 'interested';
$$;

grant execute on function public.get_startup_interest_count(uuid) to anon, authenticated;

create or replace function public.sync_interest_count() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_startup_id uuid;
begin
  affected_startup_id := case when tg_op = 'DELETE' then old.startup_id else new.startup_id end;
  update public.startups
  set investor_interest_count = public.get_startup_interest_count(affected_startup_id)
  where id = affected_startup_id;
  return coalesce(new, old);
end;
$$;

update public.startups as startup
set investor_interest_count = public.get_startup_interest_count(startup.id);

notify pgrst, 'reload schema';
