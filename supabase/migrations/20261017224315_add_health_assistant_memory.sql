begin;

create table public.health_assistant_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  activity_context_enabled boolean not null default false,
  memory_enabled boolean not null default false,
  consented_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.health_assistant_messages (
  message_id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('USER', 'ASSISTANT')),
  content text not null check (char_length(content) between 1 and 1200),
  citations jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index health_assistant_messages_user_created_idx
  on public.health_assistant_messages (user_id, created_at desc);

alter table public.health_assistant_preferences enable row level security;
alter table public.health_assistant_messages enable row level security;
revoke all on public.health_assistant_preferences, public.health_assistant_messages from public, anon, authenticated;

-- These tables are accessed only through authenticated application-server
-- routes. Explicit grants are required on projects that do not automatically
-- expose new public-schema tables to Data API roles; RLS remains enabled and
-- browser roles retain no privileges.
grant usage on schema public to service_role;
grant select, insert, update, delete on table
  public.health_assistant_preferences,
  public.health_assistant_messages
to service_role;

comment on table public.health_assistant_preferences is
  'Private opt-in controls for the account-aware health assistant. Pharmacy, TB-centre, and government roles never receive this data.';
comment on table public.health_assistant_messages is
  'Private user-owned assistant conversation memory. It is not used for model training and may be deleted by the account owner.';

commit;
