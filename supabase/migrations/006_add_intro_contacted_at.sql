-- 005 was already applied before contacted_at was included in the contact migration.
alter table public.investor_interests
  add column if not exists contacted_at timestamptz;

-- Make PostgREST see the new column immediately after the migration.
notify pgrst, 'reload schema';
