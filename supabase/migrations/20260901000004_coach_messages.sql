create table if not exists public.coach_messages (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,
  message text not null,
  ai_result jsonb,
  created_at timestamptz not null default now(),
  constraint coach_messages_role_check check (role in ('user', 'assistant')),
  constraint coach_message_not_blank check (length(btrim(message)) > 0)
);

create index if not exists coach_messages_user_created_idx
  on public.coach_messages (user_id, created_at desc);

do $$
begin
  if to_regclass('public.coach_conversations') is not null then
    execute $migration$
      insert into public.coach_messages (user_id, role, message, ai_result, created_at)
      select legacy.user_id, 'user', legacy.user_message, null, legacy.created_at
      from public.coach_conversations legacy
      where not exists (
        select 1 from public.coach_messages current_message
        where current_message.user_id = legacy.user_id
          and current_message.role = 'user'
          and current_message.message = legacy.user_message
          and current_message.created_at = legacy.created_at
      )
    $migration$;
    execute $migration$
      insert into public.coach_messages (user_id, role, message, ai_result, created_at)
      select legacy.user_id, 'assistant', legacy.assistant_response->>'respuesta', legacy.assistant_response, legacy.created_at + interval '1 millisecond'
      from public.coach_conversations legacy
      where coalesce(legacy.assistant_response->>'respuesta', '') <> ''
        and not exists (
          select 1 from public.coach_messages current_message
          where current_message.user_id = legacy.user_id
            and current_message.role = 'assistant'
            and current_message.ai_result = legacy.assistant_response
            and current_message.created_at = legacy.created_at + interval '1 millisecond'
        )
    $migration$;
  end if;
end
$$;

alter table public.coach_messages enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'coach_messages' and policyname = 'select own coach messages') then
    create policy "select own coach messages" on public.coach_messages
      for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'coach_messages' and policyname = 'insert own coach messages') then
    create policy "insert own coach messages" on public.coach_messages
      for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'coach_messages' and policyname = 'delete own coach messages') then
    create policy "delete own coach messages" on public.coach_messages
      for delete using (auth.uid() = user_id);
  end if;
end
$$;

grant select, insert, delete on public.coach_messages to authenticated;
grant usage, select on sequence public.coach_messages_id_seq to authenticated;

notify pgrst, 'reload schema';
