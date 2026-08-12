-- Signal counters are denormalized activity counters. Keep them monotonic with
-- user actions instead of recounting source rows on every change. This also
-- preserves seeded demo activity counters while real users continue to add or
-- remove one signal at a time.
create or replace function public.sync_vote_count() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.startups
    set votes_count = votes_count + 1
    where id = new.startup_id;
  elsif tg_op = 'DELETE' then
    update public.startups
    set votes_count = greatest(votes_count - 1, 0)
    where id = old.startup_id;
  end if;
  return coalesce(new, old);
end;
$$;

notify pgrst, 'reload schema';
