alter table public.onboarding_answers add column if not exists block_number integer;
alter table public.onboarding_answers add column if not exists question_id text;
alter table public.onboarding_answers add column if not exists question text;
alter table public.onboarding_answers add column if not exists answer jsonb;

drop index if exists public.onboarding_answers_user_id_unique;
alter table public.onboarding_answers drop constraint if exists onboarding_answers_user_id_key;
create unique index if not exists onboarding_answers_user_question_unique
  on public.onboarding_answers (user_id, question_id);

notify pgrst, 'reload schema';
