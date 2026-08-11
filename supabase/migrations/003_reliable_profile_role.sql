-- Keep signup metadata from silently falling back to Explorer when a profile row is created.
create or replace function public.handle_new_user() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_role text := lower(coalesce(new.raw_user_meta_data ->> 'role', 'public'));
begin
  if requested_role not in ('public', 'investor', 'founder') then
    requested_role := 'public';
  end if;

  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), 'SIGNAL user'),
    requested_role::public.user_role
  )
  on conflict (id) do update
    set full_name = excluded.full_name,
        role = excluded.role;

  return new;
exception when others then
  raise warning 'Profile creation failed for %: %', new.id, sqlerrm;
  return new;
end;
$$;
