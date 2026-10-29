create table if not exists public.entries (
  id uuid primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  title text not null,
  location text not null default '',
  body text not null,
  attachments jsonb not null default '[]'::jsonb
    check (jsonb_typeof(attachments) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists entries_date_updated_at_idx
  on public.entries (date desc, updated_at desc);

alter table public.entries enable row level security;
grant select on public.entries to anon, authenticated;
grant insert, update, delete on public.entries to authenticated;

drop policy if exists "Anyone can read entries" on public.entries;
create policy "Anyone can read entries"
  on public.entries for select
  to anon, authenticated
  using (true);

drop policy if exists "Authors can create entries" on public.entries;
create policy "Authors can create entries"
  on public.entries for insert
  to authenticated
  with check (owner_id = (select auth.uid()));

drop policy if exists "Authors can update their entries" on public.entries;
create policy "Authors can update their entries"
  on public.entries for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "Authors can delete their entries" on public.entries;
create policy "Authors can delete their entries"
  on public.entries for delete
  to authenticated
  using (owner_id = (select auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'journal-images',
  'journal-images',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Anyone can view journal images" on storage.objects;
create policy "Anyone can view journal images"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'journal-images');

drop policy if exists "Authors can upload journal images" on storage.objects;
create policy "Authors can upload journal images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'journal-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Authors can update journal images" on storage.objects;
create policy "Authors can update journal images"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'journal-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'journal-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Authors can delete journal images" on storage.objects;
create policy "Authors can delete journal images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'journal-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
