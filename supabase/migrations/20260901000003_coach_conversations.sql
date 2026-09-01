create table if not exists public.coach_conversations (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  user_message text not null,
  assistant_response jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint coach_user_message_not_blank check (length(btrim(user_message)) > 0)
);

create index if not exists coach_conversations_user_created_idx
  on public.coach_conversations (user_id, created_at desc);

alter table public.coach_conversations enable row level security;

create policy "select own coach conversations" on public.coach_conversations
  for select using (auth.uid() = user_id);
create policy "insert own coach conversations" on public.coach_conversations
  for insert with check (auth.uid() = user_id);
create policy "delete own coach conversations" on public.coach_conversations
  for delete using (auth.uid() = user_id);

grant select, insert, delete on public.coach_conversations to authenticated;
grant usage, select on sequence public.coach_conversations_id_seq to authenticated;

notify pgrst, 'reload schema';
