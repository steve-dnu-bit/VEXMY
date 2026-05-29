-- Fix recursive RLS policy on chat_members.
-- Previous policy referenced chat_members inside its own USING clause,
-- which can trigger infinite recursion during policy evaluation.

drop policy if exists "Chat members can view members" on public.chat_members;

create policy "Chat members can view members"
on public.chat_members
for select to authenticated
using (
  exists (
    select 1
    from public.chat_threads t
    where t.id = chat_members.thread_id
      and auth.uid() in (t.artist_id, t.customer_id)
  )
);

create policy "Chat members can update own read marker"
on public.chat_members
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());
