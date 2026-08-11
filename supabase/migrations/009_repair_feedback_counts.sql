-- Feedback count is also derived data. Recompute it from comments so the
-- readout stays correct even when an older trigger or counter drifted.
create or replace function public.get_startup_feedback_count(p_startup_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.comments
  where startup_id = p_startup_id;
$$;

grant execute on function public.get_startup_feedback_count(uuid) to anon, authenticated;

create or replace function public.sync_feedback_count() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_startup_id uuid;
begin
  affected_startup_id := case when tg_op = 'DELETE' then old.startup_id else new.startup_id end;
  update public.startups
  set feedback_count = public.get_startup_feedback_count(affected_startup_id)
  where id = affected_startup_id;
  return coalesce(new, old);
end;
$$;

update public.startups as startup
set feedback_count = public.get_startup_feedback_count(startup.id);

notify pgrst, 'reload schema';
