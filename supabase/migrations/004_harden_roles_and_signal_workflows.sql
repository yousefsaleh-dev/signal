-- Keep role changes deliberate, repair counter drift, and make intro requests actionable.
revoke update on public.profiles from authenticated;
grant update (full_name, avatar_url, bio, website, interests) on public.profiles to authenticated;

create or replace function public.set_my_profile_role(p_role public.user_role)
returns public.user_role
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_role public.user_role;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if p_role <> 'founder' and exists (select 1 from public.startups where founder_id = auth.uid()) then
    raise exception 'Keep the founder role while you own a startup.';
  end if;

  update public.profiles
  set role = p_role
  where id = auth.uid()
  returning role into selected_role;

  if selected_role is null then
    raise exception 'Profile not found.';
  end if;

  return selected_role;
end;
$$;

grant execute on function public.set_my_profile_role(public.user_role) to authenticated;

create or replace function public.set_launch_timestamp()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'launched' then
      new.launched_at = coalesce(new.launched_at, now());
    end if;
    return new;
  end if;

  if new.status = 'launched' and old.status <> 'launched' then
    new.launched_at = coalesce(new.launched_at, now());
  elsif new.status = 'draft' then
    new.launched_at = null;
  end if;
  return new;
end;
$$;

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

create table if not exists public.ai_match_rate_limits (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0)
);

alter table public.ai_match_rate_limits enable row level security;

create or replace function public.consume_ai_match_quota()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  quota_available boolean;
begin
  if auth.uid() is null then
    return false;
  end if;

  insert into public.ai_match_rate_limits (user_id, window_started_at, request_count)
  values (auth.uid(), now(), 1)
  on conflict (user_id) do update
  set window_started_at = case
        when public.ai_match_rate_limits.window_started_at < now() - interval '1 minute' then now()
        else public.ai_match_rate_limits.window_started_at
      end,
      request_count = case
        when public.ai_match_rate_limits.window_started_at < now() - interval '1 minute' then 1
        else public.ai_match_rate_limits.request_count + 1
      end
  returning request_count <= 8 into quota_available;

  return quota_available;
end;
$$;

grant execute on function public.consume_ai_match_quota() to authenticated;

revoke execute on function public.increment_startup_view(uuid, text) from anon;
grant execute on function public.increment_startup_view(uuid, text) to authenticated;

update public.startups as startup
set votes_count = (select count(*) from public.votes where startup_id = startup.id),
    feedback_count = (select count(*) from public.comments where startup_id = startup.id),
    investor_interest_count = (select count(*) from public.investor_interests where startup_id = startup.id and status = 'interested'),
    view_count = (select count(*) from public.startup_views where startup_id = startup.id);
