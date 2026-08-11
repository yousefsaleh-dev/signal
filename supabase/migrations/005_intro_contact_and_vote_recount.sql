-- Store the investor's email at request time so founders can follow up by email.
alter table public.investor_interests
  add column if not exists contacted_at timestamptz;
alter table public.investor_interests
  add column if not exists contact_email text;

-- Recompute the denormalized counter from the source rows. This also repairs
-- counters that drifted before this migration was applied.
create or replace function public.sync_vote_count() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_startup_id uuid;
begin
  affected_startup_id := case when tg_op = 'DELETE' then old.startup_id else new.startup_id end;
  update public.startups
  set votes_count = (
    select count(*)::integer
    from public.votes
    where startup_id = affected_startup_id
  )
  where id = affected_startup_id;
  return coalesce(new, old);
end;
$$;

update public.startups as startup
set votes_count = (
  select count(*)::integer
  from public.votes
  where startup_id = startup.id
);
