-- Unified secure artist/customer chat with media gallery.

create table if not exists public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid not null references auth.users(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz,
  archived_by_artist boolean not null default false,
  archived_by_customer boolean not null default false,
  constraint chat_threads_artist_customer_unique unique (artist_id, customer_id),
  constraint chat_threads_no_self_chat check (artist_id <> customer_id)
);

create table if not exists public.chat_members (
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('artist', 'customer')),
  joined_at timestamptz not null default now(),
  last_read_at timestamptz,
  primary key (thread_id, user_id)
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null default '',
  message_type text not null default 'text' check (message_type in ('text', 'media', 'system')),
  created_at timestamptz not null default now(),
  edited_at timestamptz
);

create table if not exists public.chat_media (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  message_id uuid references public.chat_messages(id) on delete set null,
  uploaded_by uuid not null references auth.users(id) on delete cascade,
  bucket text not null default 'chat-media',
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  caption text,
  created_at timestamptz not null default now()
);

create index if not exists chat_threads_artist_idx on public.chat_threads (artist_id, coalesce(last_message_at, created_at) desc);
create index if not exists chat_threads_customer_idx on public.chat_threads (customer_id, coalesce(last_message_at, created_at) desc);
create index if not exists chat_messages_thread_created_idx on public.chat_messages (thread_id, created_at asc);
create index if not exists chat_media_thread_created_idx on public.chat_media (thread_id, created_at desc);

create or replace function public.handle_chat_thread_member_seed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.chat_members (thread_id, user_id, role)
  values
    (new.id, new.artist_id, 'artist'),
    (new.id, new.customer_id, 'customer')
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists trg_chat_thread_member_seed on public.chat_threads;
create trigger trg_chat_thread_member_seed
after insert on public.chat_threads
for each row execute function public.handle_chat_thread_member_seed();

create or replace function public.touch_chat_thread_last_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.chat_threads
  set last_message_at = new.created_at, updated_at = now()
  where id = new.thread_id;
  return new;
end;
$$;

drop trigger if exists trg_chat_message_touch_thread on public.chat_messages;
create trigger trg_chat_message_touch_thread
after insert on public.chat_messages
for each row execute function public.touch_chat_thread_last_message();

alter table public.chat_threads enable row level security;
alter table public.chat_members enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_media enable row level security;

create policy "Chat members can view threads"
on public.chat_threads
for select to authenticated
using (
  exists (
    select 1
    from public.chat_members m
    where m.thread_id = id and m.user_id = auth.uid()
  )
);

create policy "Authenticated can create own thread participant"
on public.chat_threads
for insert to authenticated
with check (
  auth.uid() in (artist_id, customer_id)
);

create policy "Chat members can update own thread visibility"
on public.chat_threads
for update to authenticated
using (
  exists (
    select 1
    from public.chat_members m
    where m.thread_id = id and m.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.chat_members m
    where m.thread_id = id and m.user_id = auth.uid()
  )
);

create policy "Chat members can view members"
on public.chat_members
for select to authenticated
using (
  exists (
    select 1
    from public.chat_members m
    where m.thread_id = thread_id and m.user_id = auth.uid()
  )
);

create policy "Chat members can view messages"
on public.chat_messages
for select to authenticated
using (
  exists (
    select 1
    from public.chat_members m
    where m.thread_id = thread_id and m.user_id = auth.uid()
  )
);

create policy "Chat members can insert own messages"
on public.chat_messages
for insert to authenticated
with check (
  sender_id = auth.uid()
  and exists (
    select 1
    from public.chat_members m
    where m.thread_id = thread_id and m.user_id = auth.uid()
  )
);

create policy "Sender can edit own messages"
on public.chat_messages
for update to authenticated
using (sender_id = auth.uid())
with check (sender_id = auth.uid());

create policy "Chat members can view media"
on public.chat_media
for select to authenticated
using (
  exists (
    select 1
    from public.chat_members m
    where m.thread_id = thread_id and m.user_id = auth.uid()
  )
);

create policy "Chat members can insert media"
on public.chat_media
for insert to authenticated
with check (
  uploaded_by = auth.uid()
  and exists (
    select 1
    from public.chat_members m
    where m.thread_id = thread_id and m.user_id = auth.uid()
  )
);

create policy "Uploader can update media metadata"
on public.chat_media
for update to authenticated
using (uploaded_by = auth.uid())
with check (uploaded_by = auth.uid());

insert into storage.buckets (id, name, public)
values ('chat-media', 'chat-media', false)
on conflict (id) do nothing;

create policy "Chat members can read chat media objects"
on storage.objects
for select to authenticated
using (
  bucket_id = 'chat-media'
  and exists (
    select 1
    from public.chat_members m
    where m.thread_id = nullif(split_part(name, '/', 1), '')::uuid
      and m.user_id = auth.uid()
  )
);

create policy "Chat members can upload chat media objects"
on storage.objects
for insert to authenticated
with check (
  bucket_id = 'chat-media'
  and exists (
    select 1
    from public.chat_members m
    where m.thread_id = nullif(split_part(name, '/', 1), '')::uuid
      and m.user_id = auth.uid()
  )
);
