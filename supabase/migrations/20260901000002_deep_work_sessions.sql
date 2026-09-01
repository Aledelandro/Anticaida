create table if not exists public.deep_work_sessions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  task text,
  desired_result text,
  duration_minutes int,
  distractions jsonb,
  ai_plan jsonb,
  completed boolean default false,
  abandoned boolean default false,
  success_level text,
  actual_result text,
  pending text,
  distraction_report text,
  steps_completed int default 0,
  created_at timestamptz default now()
);

alter table public.deep_work_sessions enable row level security;

create policy "select own deep work sessions" on public.deep_work_sessions
  for select using (auth.uid() = user_id);
create policy "insert own deep work sessions" on public.deep_work_sessions
  for insert with check (auth.uid() = user_id);
create policy "update own deep work sessions" on public.deep_work_sessions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own deep work sessions" on public.deep_work_sessions
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.deep_work_sessions to authenticated;
grant usage, select on sequence public.deep_work_sessions_id_seq to authenticated;

notify pgrst, 'reload schema';
