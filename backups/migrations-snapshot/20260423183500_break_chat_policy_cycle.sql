-- Break policy cycle between chat_threads and chat_members.
-- Use direct membership checks against chat_threads for all chat tables.

drop policy if exists "Chat members can view threads" on public.chat_threads;
drop policy if exists "Chat members can update own thread visibility" on public.chat_threads;
drop policy if exists "Chat members can view messages" on public.chat_messages;
drop policy if exists "Chat members can insert own messages" on public.chat_messages;
drop policy if exists "Chat members can view media" on public.chat_media;
drop policy if exists "Chat members can insert media" on public.chat_media;
drop policy if exists "Chat members can view typing state" on public.chat_typing_state;
drop policy if exists "Chat members can set own typing state" on public.chat_typing_state;
drop policy if exists "Chat members can view media pins" on public.chat_media_pins;
drop policy if exists "Chat members can pin media for themselves" on public.chat_media_pins;

create policy "Chat participants can view threads"
on public.chat_threads
for select to authenticated
using (auth.uid() in (artist_id, customer_id));

create policy "Chat participants can update thread visibility"
on public.chat_threads
for update to authenticated
using (auth.uid() in (artist_id, customer_id))
with check (auth.uid() in (artist_id, customer_id));

create policy "Chat participants can view messages"
on public.chat_messages
for select to authenticated
using (
  exists (
    select 1
    from public.chat_threads t
    where t.id = chat_messages.thread_id
      and auth.uid() in (t.artist_id, t.customer_id)
  )
);

create policy "Chat participants can insert own messages"
on public.chat_messages
for insert to authenticated
with check (
  sender_id = auth.uid()
  and exists (
    select 1
    from public.chat_threads t
    where t.id = chat_messages.thread_id
      and auth.uid() in (t.artist_id, t.customer_id)
  )
);

create policy "Chat participants can view media"
on public.chat_media
for select to authenticated
using (
  exists (
    select 1
    from public.chat_threads t
    where t.id = chat_media.thread_id
      and auth.uid() in (t.artist_id, t.customer_id)
  )
);

create policy "Chat participants can insert media"
on public.chat_media
for insert to authenticated
with check (
  uploaded_by = auth.uid()
  and exists (
    select 1
    from public.chat_threads t
    where t.id = chat_media.thread_id
      and auth.uid() in (t.artist_id, t.customer_id)
  )
);

create policy "Chat participants can view typing state"
on public.chat_typing_state
for select to authenticated
using (
  exists (
    select 1
    from public.chat_threads t
    where t.id = chat_typing_state.thread_id
      and auth.uid() in (t.artist_id, t.customer_id)
  )
);

create policy "Chat participants can set own typing state"
on public.chat_typing_state
for insert to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.chat_threads t
    where t.id = chat_typing_state.thread_id
      and auth.uid() in (t.artist_id, t.customer_id)
  )
);

create policy "Chat participants can view media pins"
on public.chat_media_pins
for select to authenticated
using (
  exists (
    select 1
    from public.chat_threads t
    where t.id = chat_media_pins.thread_id
      and auth.uid() in (t.artist_id, t.customer_id)
  )
);

create policy "Chat participants can pin media for themselves"
on public.chat_media_pins
for insert to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.chat_threads t
    where t.id = chat_media_pins.thread_id
      and auth.uid() in (t.artist_id, t.customer_id)
  )
);
