create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  name text,
  onboarding_completed boolean not null default false,
  tone_preference text not null default 'directo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists name text;
alter table public.profiles add column if not exists onboarding_completed boolean not null default false;
alter table public.profiles add column if not exists tone_preference text not null default 'directo';

create table if not exists public.onboarding_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.onboarding_answers add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.onboarding_answers add column if not exists answers jsonb not null default '{}'::jsonb;
create unique index if not exists onboarding_answers_user_id_unique on public.onboarding_answers (user_id);

create table if not exists public.user_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null,
  memory_key text not null,
  memory_value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, category, memory_key)
);

alter table public.user_memory add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.user_memory add column if not exists category text;
alter table public.user_memory add column if not exists memory_key text;
alter table public.user_memory add column if not exists memory_value jsonb not null default '{}'::jsonb;
create unique index if not exists user_memory_user_category_key_unique on public.user_memory (user_id, category, memory_key);

alter table public.profiles enable row level security;
alter table public.onboarding_answers enable row level security;
alter table public.user_memory enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'Users manage own profile') then
    create policy "Users manage own profile" on public.profiles for all using (auth.uid() = id) with check (auth.uid() = id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'onboarding_answers' and policyname = 'Users manage own onboarding') then
    create policy "Users manage own onboarding" on public.onboarding_answers for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'user_memory' and policyname = 'Users manage own memory') then
    create policy "Users manage own memory" on public.user_memory for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end
$$;

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.onboarding_answers to authenticated;
grant select, insert, update, delete on public.user_memory to authenticated;

create or replace function public.ensure_new_user_profile()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, onboarding_completed, tone_preference)
  values (new.id, new.email, false, 'directo')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_modo_ejecucion on auth.users;
create trigger on_auth_user_created_modo_ejecucion
  after insert on auth.users
  for each row execute procedure public.ensure_new_user_profile();
