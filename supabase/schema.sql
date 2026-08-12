create extension if not exists pgcrypto;

create type public.user_role as enum ('public', 'investor', 'founder');
create type public.startup_status as enum ('draft', 'launched');
create type public.interest_status as enum ('interested', 'withdrawn');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.user_role not null default 'public',
  full_name text not null default 'SIGNAL user',
  avatar_url text,
  bio text,
  website text,
  interests text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.startups (
  id uuid primary key default gen_random_uuid(),
  founder_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  slogan text not null default '' check (char_length(slogan) <= 120),
  short_description text not null default '' check (char_length(short_description) <= 280),
  long_description text not null default '',
  logo_url text,
  website_url text,
  category text not null,
  status public.startup_status not null default 'draft',
  votes_count integer not null default 0 check (votes_count >= 0),
  investor_interest_count integer not null default 0 check (investor_interest_count >= 0),
  feedback_count integer not null default 0 check (feedback_count >= 0),
  view_count integer not null default 0 check (view_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  launched_at timestamptz
);

create table public.votes (
  id uuid primary key default gen_random_uuid(),
  startup_id uuid not null references public.startups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (startup_id, user_id)
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  startup_id uuid not null references public.startups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.investor_interests (
  id uuid primary key default gen_random_uuid(),
  startup_id uuid not null references public.startups(id) on delete cascade,
  investor_id uuid not null references public.profiles(id) on delete cascade,
  status public.interest_status not null default 'interested',
  message text check (char_length(message) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index investor_interests_active_unique on public.investor_interests (startup_id, investor_id) where status = 'interested';

create table public.saves (
  id uuid primary key default gen_random_uuid(),
  startup_id uuid not null references public.startups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (startup_id, user_id)
);

create table public.startup_views (
  id uuid primary key default gen_random_uuid(),
  startup_id uuid not null references public.startups(id) on delete cascade,
  visitor_token text not null,
  created_at timestamptz not null default now(),
  unique (startup_id, visitor_token)
);

create index startups_public_rank_idx on public.startups (status, votes_count desc, created_at desc);
create index startups_category_idx on public.startups (category, status);
create unique index startups_one_per_founder_idx on public.startups (founder_id);
create index comments_startup_idx on public.comments (startup_id, created_at desc);
create index interests_startup_idx on public.investor_interests (startup_id, status, created_at desc);
create index startup_views_startup_idx on public.startup_views (startup_id, created_at desc);

create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.set_launch_timestamp() returns trigger language plpgsql as $$
begin
  if new.status = 'launched' and old.status <> 'launched' then
    new.launched_at = coalesce(new.launched_at, now());
  elsif new.status = 'draft' then
    new.launched_at = null;
  end if;
  return new;
end;
$$;

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', 'SIGNAL user'), coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'public'::public.user_role));
  return new;
exception when others then
  raise warning 'Profile creation failed for %: %', new.id, sqlerrm;
  return new;
end;
$$;

create or replace function public.sync_vote_count() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then update public.startups set votes_count = votes_count + 1 where id = new.startup_id;
  else update public.startups set votes_count = greatest(votes_count - 1, 0) where id = old.startup_id;
  end if;
  return coalesce(new, old);
end;
$$;

create or replace function public.sync_feedback_count() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then update public.startups set feedback_count = feedback_count + 1 where id = new.startup_id;
  else update public.startups set feedback_count = greatest(feedback_count - 1, 0) where id = old.startup_id;
  end if;
  return coalesce(new, old);
end;
$$;

create or replace function public.sync_interest_count() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' and new.status = 'interested' then update public.startups set investor_interest_count = investor_interest_count + 1 where id = new.startup_id;
  elsif tg_op = 'UPDATE' and old.status <> 'interested' and new.status = 'interested' then update public.startups set investor_interest_count = investor_interest_count + 1 where id = new.startup_id;
  elsif tg_op = 'UPDATE' and old.status = 'interested' and new.status <> 'interested' then update public.startups set investor_interest_count = greatest(investor_interest_count - 1, 0) where id = new.startup_id;
  elsif tg_op = 'DELETE' and old.status = 'interested' then update public.startups set investor_interest_count = greatest(investor_interest_count - 1, 0) where id = old.startup_id;
  end if;
  return coalesce(new, old);
end;
$$;

create or replace function public.increment_startup_view(p_startup_id uuid, p_visitor_token text) returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.startups where id = p_startup_id and status = 'launched') then
    insert into public.startup_views (startup_id, visitor_token) values (p_startup_id, p_visitor_token) on conflict (startup_id, visitor_token) do nothing;
    if found then update public.startups set view_count = view_count + 1 where id = p_startup_id;
    end if;
  end if;
end;
$$;

create trigger profiles_updated_at before update on public.profiles for each row execute procedure public.set_updated_at();
create trigger startups_updated_at before update on public.startups for each row execute procedure public.set_updated_at();
create trigger startups_launch_timestamp before insert or update on public.startups for each row execute procedure public.set_launch_timestamp();
create trigger comments_updated_at before update on public.comments for each row execute procedure public.set_updated_at();
create trigger interests_updated_at before update on public.investor_interests for each row execute procedure public.set_updated_at();
create trigger votes_count_after_insert after insert or delete on public.votes for each row execute procedure public.sync_vote_count();
create trigger feedback_count_after_insert after insert or delete on public.comments for each row execute procedure public.sync_feedback_count();
create trigger interest_count_after_change after insert or update or delete on public.investor_interests for each row execute procedure public.sync_interest_count();

alter table public.profiles enable row level security;
alter table public.startups enable row level security;
alter table public.votes enable row level security;
alter table public.comments enable row level security;
alter table public.investor_interests enable row level security;
alter table public.saves enable row level security;
alter table public.startup_views enable row level security;

create policy "Anyone can read profiles" on public.profiles for select using (true);
create policy "Users manage their profile" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy "Users can read launched startups or their own" on public.startups for select using (status = 'launched' or founder_id = auth.uid());
create policy "Founders create startups" on public.startups for insert to authenticated with check (founder_id = auth.uid() and exists (select 1 from public.profiles where id = auth.uid() and role = 'founder'));
create policy "Founders manage their startups" on public.startups for update using (founder_id = auth.uid()) with check (founder_id = auth.uid());
create policy "Founders delete their startups" on public.startups for delete using (founder_id = auth.uid());
create policy "Users read votes" on public.votes for select using (true);
create policy "Users vote as themselves" on public.votes for insert to authenticated with check (user_id = auth.uid() and exists (select 1 from public.startups where id = startup_id and status = 'launched'));
create policy "Users remove their vote" on public.votes for delete to authenticated using (user_id = auth.uid());
create policy "Users read launched comments" on public.comments for select using (exists (select 1 from public.startups where id = startup_id and status = 'launched'));
create policy "Users comment on launched startups" on public.comments for insert to authenticated with check (user_id = auth.uid() and exists (select 1 from public.startups where id = startup_id and status = 'launched'));
create policy "Users update their comments" on public.comments for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Users delete their comments" on public.comments for delete to authenticated using (user_id = auth.uid());
create policy "Investors and founders read relevant interest" on public.investor_interests for select to authenticated using (investor_id = auth.uid() or exists (select 1 from public.startups where id = startup_id and founder_id = auth.uid()));
create policy "Investors create interest" on public.investor_interests for insert to authenticated with check (investor_id = auth.uid() and exists (select 1 from public.profiles where id = auth.uid() and role = 'investor') and exists (select 1 from public.startups where id = startup_id and status = 'launched'));
create policy "Investors withdraw interest" on public.investor_interests for update to authenticated using (investor_id = auth.uid()) with check (investor_id = auth.uid());
create policy "Users read own saves" on public.saves for select to authenticated using (user_id = auth.uid());
create policy "Users save startups" on public.saves for insert to authenticated with check (user_id = auth.uid() and exists (select 1 from public.startups where id = startup_id and status = 'launched'));
create policy "Users remove own saves" on public.saves for delete to authenticated using (user_id = auth.uid());
create policy "No direct view reads" on public.startup_views for select using (false);
create policy "No direct view writes" on public.startup_views for insert with check (false);

create or replace function public.get_startup_interest_count(p_startup_id uuid) returns integer language sql stable security definer set search_path = public as $$
  select count(*)::integer from public.investor_interests where startup_id = p_startup_id and status = 'interested';
$$;

insert into storage.buckets (id, name, public) values ('startup-logos', 'startup-logos', true) on conflict (id) do nothing;
create policy "Anyone can read startup logos" on storage.objects for select using (bucket_id = 'startup-logos');
create policy "Founders upload their startup logos" on storage.objects for insert to authenticated with check (bucket_id = 'startup-logos' and split_part(name, '/', 1) = auth.uid()::text);
create policy "Founders replace their startup logos" on storage.objects for update to authenticated using (bucket_id = 'startup-logos' and split_part(name, '/', 1) = auth.uid()::text) with check (bucket_id = 'startup-logos' and split_part(name, '/', 1) = auth.uid()::text);
create policy "Founders delete their startup logos" on storage.objects for delete to authenticated using (bucket_id = 'startup-logos' and split_part(name, '/', 1) = auth.uid()::text);

create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

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

-- Production hardening migration, repeated here so a fresh schema matches migrations.
revoke update on public.profiles from authenticated;
grant update (full_name, avatar_url, bio, website, interests) on public.profiles to authenticated;

create or replace function public.set_my_profile_role(p_role public.user_role) returns public.user_role language plpgsql security definer set search_path = public as $$
declare selected_role public.user_role;
begin
  if auth.uid() is null then raise exception 'Authentication is required.'; end if;
  if p_role <> 'founder' and exists (select 1 from public.startups where founder_id = auth.uid()) then raise exception 'Keep the founder role while you own a startup.'; end if;
  update public.profiles set role = p_role where id = auth.uid() returning role into selected_role;
  if selected_role is null then raise exception 'Profile not found.'; end if;
  return selected_role;
end;
$$;
grant execute on function public.set_my_profile_role(public.user_role) to authenticated;

create or replace function public.set_launch_timestamp() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'launched' then new.launched_at = coalesce(new.launched_at, now()); end if;
    return new;
  end if;
  if new.status = 'launched' and old.status <> 'launched' then new.launched_at = coalesce(new.launched_at, now());
  elsif new.status = 'draft' then new.launched_at = null;
  end if;
  return new;
end;
$$;

alter table public.investor_interests add column if not exists contacted_at timestamptz;
alter table public.investor_interests add column if not exists contact_email text;
create or replace function public.acknowledge_intro_request(p_interest_id uuid) returns timestamptz language plpgsql security definer set search_path = public as $$
declare contact_time timestamptz;
begin
  if auth.uid() is null then raise exception 'Authentication is required.'; end if;
  update public.investor_interests as interest set contacted_at = coalesce(interest.contacted_at, now()) from public.startups as startup where interest.id = p_interest_id and interest.startup_id = startup.id and startup.founder_id = auth.uid() and interest.status = 'interested' returning interest.contacted_at into contact_time;
  if contact_time is null then raise exception 'Intro request not found.'; end if;
  return contact_time;
end;
$$;
grant execute on function public.acknowledge_intro_request(uuid) to authenticated;

create table if not exists public.ai_match_rate_limits (user_id uuid primary key references public.profiles(id) on delete cascade, window_started_at timestamptz not null default now(), request_count integer not null default 0 check (request_count >= 0));
alter table public.ai_match_rate_limits enable row level security;
create or replace function public.consume_ai_match_quota() returns boolean language plpgsql security definer set search_path = public as $$
declare quota_available boolean;
begin
  if auth.uid() is null then return false; end if;
  insert into public.ai_match_rate_limits (user_id, window_started_at, request_count) values (auth.uid(), now(), 1)
  on conflict (user_id) do update set window_started_at = case when public.ai_match_rate_limits.window_started_at < now() - interval '1 minute' then now() else public.ai_match_rate_limits.window_started_at end, request_count = case when public.ai_match_rate_limits.window_started_at < now() - interval '1 minute' then 1 else public.ai_match_rate_limits.request_count + 1 end
  returning request_count <= 8 into quota_available;
  return quota_available;
end;
$$;
grant execute on function public.consume_ai_match_quota() to authenticated;
revoke execute on function public.increment_startup_view(uuid, text) from anon;
grant execute on function public.increment_startup_view(uuid, text) to authenticated;
update public.startups as startup set votes_count = (select count(*) from public.votes where startup_id = startup.id), feedback_count = (select count(*) from public.comments where startup_id = startup.id), investor_interest_count = (select count(*) from public.investor_interests where startup_id = startup.id and status = 'interested'), view_count = (select count(*) from public.startup_views where startup_id = startup.id);

-- Keep the denormalized vote counter aligned with each user action.
create or replace function public.sync_vote_count() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.startups set votes_count = votes_count + 1 where id = new.startup_id;
  elsif tg_op = 'DELETE' then
    update public.startups set votes_count = greatest(votes_count - 1, 0) where id = old.startup_id;
  end if;
  return coalesce(new, old);
end;
$$;

create or replace function public.get_startup_interest_count(p_startup_id uuid) returns integer language sql stable security definer set search_path = public as $$
  select count(*)::integer from public.investor_interests where startup_id = p_startup_id and status = 'interested';
$$;
grant execute on function public.get_startup_interest_count(uuid) to anon, authenticated;

create or replace function public.sync_interest_count() returns trigger language plpgsql security definer set search_path = public as $$
declare affected_startup_id uuid;
begin
  affected_startup_id := case when tg_op = 'DELETE' then old.startup_id else new.startup_id end;
  update public.startups set investor_interest_count = public.get_startup_interest_count(affected_startup_id) where id = affected_startup_id;
  return coalesce(new, old);
end;
$$;
update public.startups as startup set investor_interest_count = public.get_startup_interest_count(startup.id);

create or replace function public.get_startup_feedback_count(p_startup_id uuid) returns integer language sql stable security definer set search_path = public as $$
  select count(*)::integer from public.comments where startup_id = p_startup_id;
$$;
grant execute on function public.get_startup_feedback_count(uuid) to anon, authenticated;

create or replace function public.sync_feedback_count() returns trigger language plpgsql security definer set search_path = public as $$
declare affected_startup_id uuid;
begin
  affected_startup_id := case when tg_op = 'DELETE' then old.startup_id else new.startup_id end;
  update public.startups set feedback_count = public.get_startup_feedback_count(affected_startup_id) where id = affected_startup_id;
  return coalesce(new, old);
end;
$$;
update public.startups as startup set feedback_count = public.get_startup_feedback_count(startup.id);
