-- Chat UX extras: typing indicators, media pinning, and faster unread/read metadata.

create table if not exists public.chat_typing_state (
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (thread_id, user_id)
);

create table if not exists public.chat_media_pins (
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  media_id uuid not null references public.chat_media(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  pinned_at timestamptz not null default now(),
  primary key (media_id, user_id)
);

create index if not exists chat_typing_state_expires_idx on public.chat_typing_state (expires_at);
create index if not exists chat_media_pins_thread_user_idx on public.chat_media_pins (thread_id, user_id, pinned_at desc);

alter table public.chat_typing_state enable row level security;
alter table public.chat_media_pins enable row level security;

create policy "Chat members can view typing state"
on public.chat_typing_state
for select to authenticated
using (
  exists (
    select 1
    from public.chat_members m
    where m.thread_id = chat_typing_state.thread_id
      and m.user_id = auth.uid()
  )
);

create policy "Chat members can set own typing state"
on public.chat_typing_state
for insert to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.chat_members m
    where m.thread_id = chat_typing_state.thread_id
      and m.user_id = auth.uid()
  )
);

create policy "Chat members can update own typing state"
on public.chat_typing_state
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Chat members can delete own typing state"
on public.chat_typing_state
for delete to authenticated
using (user_id = auth.uid());

create policy "Chat members can view media pins"
on public.chat_media_pins
for select to authenticated
using (
  exists (
    select 1
    from public.chat_members m
    where m.thread_id = chat_media_pins.thread_id
      and m.user_id = auth.uid()
  )
);

create policy "Chat members can pin media for themselves"
on public.chat_media_pins
for insert to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.chat_members m
    where m.thread_id = chat_media_pins.thread_id
      and m.user_id = auth.uid()
  )
);

create policy "Users can unpin their own media pins"
on public.chat_media_pins
for delete to authenticated
using (user_id = auth.uid());
