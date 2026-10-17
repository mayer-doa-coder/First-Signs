begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Provider identities are HMAC-SHA256 digests created by the application.
-- Raw WhatsApp phone numbers, Telegram chat IDs, message text, and audio are
-- never persisted here.
create table private.part16_channel_sessions (
  channel_key text primary key,
  provider text not null,
  patient_id text not null,
  source_type text not null,
  pharmacy_id text references public.pharmacies(pharmacy_id),
  language text,
  stage text not null,
  state jsonb not null default '{}'::jsonb,
  version bigint not null default 1,
  created_at timestamptz not null default transaction_timestamp(),
  updated_at timestamptz not null default transaction_timestamp(),
  constraint part16_channel_sessions_key_format check (channel_key ~ '^[0-9a-f]{64}$'),
  constraint part16_channel_sessions_provider_allowed check (provider in ('WHATSAPP', 'TELEGRAM')),
  constraint part16_channel_sessions_patient_format check (patient_id ~ '^JVH-DEMO-[A-F0-9]{8}$'),
  constraint part16_channel_sessions_source_allowed check (source_type in ('SELF', 'PHARMACY')),
  constraint part16_channel_sessions_source_matches_pharmacy check (
    (source_type = 'SELF' and pharmacy_id is null)
    or (source_type = 'PHARMACY' and pharmacy_id is not null)
  ),
  constraint part16_channel_sessions_language_allowed check (language is null or language in ('bn', 'en')),
  constraint part16_channel_sessions_stage_not_blank check (length(btrim(stage)) > 0),
  constraint part16_channel_sessions_state_object check (jsonb_typeof(state) = 'object'),
  constraint part16_channel_sessions_version_positive check (version > 0)
);

comment on table private.part16_channel_sessions is
  'Private WhatsApp/Telegram workflow state keyed only by a one-way channel digest; raw provider identities and audio are not stored.';

create table private.part16_channel_events (
  provider text not null,
  event_id text not null,
  channel_key text not null references private.part16_channel_sessions(channel_key) on delete cascade,
  status text not null default 'PROCESSING',
  response_text text,
  created_at timestamptz not null default transaction_timestamp(),
  updated_at timestamptz not null default transaction_timestamp(),
  primary key (provider, event_id),
  constraint part16_channel_events_provider_allowed check (provider in ('WHATSAPP', 'TELEGRAM')),
  constraint part16_channel_events_id_not_blank check (length(btrim(event_id)) between 1 and 255),
  constraint part16_channel_events_key_format check (channel_key ~ '^[0-9a-f]{64}$'),
  constraint part16_channel_events_status_allowed check (status in ('PROCESSING', 'DONE')),
  constraint part16_channel_events_response_matches_status check (
    (status = 'PROCESSING' and response_text is null)
    or (status = 'DONE' and response_text is not null)
  )
);

comment on table private.part16_channel_events is
  'Webhook replay protection. Stores provider event IDs and the safe reply only; never stores inbound message text or media.';

create index part16_channel_events_created_at_idx
  on private.part16_channel_events(created_at);

revoke all on table private.part16_channel_sessions from public, anon, authenticated;
revoke all on table private.part16_channel_events from public, anon, authenticated;

create function public.get_part16_channel_session(p_channel_key text)
returns table (
  channel_key text,
  provider text,
  patient_id text,
  source_type text,
  pharmacy_id text,
  language text,
  stage text,
  state jsonb,
  version bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.channel_key, s.provider, s.patient_id, s.source_type,
    s.pharmacy_id, s.language, s.stage, s.state, s.version
  from private.part16_channel_sessions s
  where s.channel_key = p_channel_key;
$$;

create function public.save_part16_channel_session(
  p_channel_key text,
  p_provider text,
  p_patient_id text,
  p_source_type text,
  p_pharmacy_id text,
  p_language text,
  p_stage text,
  p_state jsonb,
  p_expected_version bigint
)
returns table (
  channel_key text,
  provider text,
  patient_id text,
  source_type text,
  pharmacy_id text,
  language text,
  stage text,
  state jsonb,
  version bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_session private.part16_channel_sessions%rowtype;
begin
  if p_channel_key is null or p_channel_key !~ '^[0-9a-f]{64}$'
    or p_patient_id is null or p_patient_id !~ '^JVH-DEMO-[A-F0-9]{8}$'
    or p_provider not in ('WHATSAPP', 'TELEGRAM')
    or p_source_type not in ('SELF', 'PHARMACY')
    or (p_source_type = 'SELF' and p_pharmacy_id is not null)
    or (p_source_type = 'PHARMACY' and p_pharmacy_id is null)
    or (p_language is not null and p_language not in ('bn', 'en'))
    or p_stage is null or length(btrim(p_stage)) = 0
    or p_state is null or jsonb_typeof(p_state) <> 'object'
    or p_expected_version is null or p_expected_version < 0 then
    raise exception 'Invalid channel session data' using errcode = '22023';
  end if;

  if p_source_type = 'PHARMACY' and not exists (
    select 1 from public.pharmacies p
    where p.pharmacy_id = p_pharmacy_id and p.active
  ) then
    raise exception 'Unknown or inactive pharmacy' using errcode = '23503';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('part16-session:' || p_channel_key, 0)
  );

  select s.* into current_session
  from private.part16_channel_sessions s
  where s.channel_key = p_channel_key
  for update;

  if not found then
    if p_expected_version <> 0 then
      raise exception 'Channel session version conflict' using errcode = '40001';
    end if;

    insert into private.part16_channel_sessions (
      channel_key, provider, patient_id, source_type, pharmacy_id,
      language, stage, state
    ) values (
      p_channel_key, p_provider, p_patient_id, p_source_type, p_pharmacy_id,
      p_language, p_stage, p_state
    )
    returning * into current_session;
  else
    if current_session.provider is distinct from p_provider
      or current_session.patient_id is distinct from p_patient_id
      or current_session.version is distinct from p_expected_version then
      raise exception 'Channel session version conflict' using errcode = '40001';
    end if;

    update private.part16_channel_sessions s
    set source_type = p_source_type,
      pharmacy_id = p_pharmacy_id,
      language = p_language,
      stage = p_stage,
      state = p_state,
      version = s.version + 1,
      updated_at = transaction_timestamp()
    where s.channel_key = p_channel_key
    returning s.* into current_session;
  end if;

  return query select current_session.channel_key, current_session.provider,
    current_session.patient_id, current_session.source_type,
    current_session.pharmacy_id, current_session.language,
    current_session.stage, current_session.state, current_session.version;
end;
$$;

create function public.begin_part16_channel_event(
  p_provider text,
  p_event_id text,
  p_channel_key text
)
returns table (should_process boolean, previous_response text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_event private.part16_channel_events%rowtype;
begin
  if p_provider not in ('WHATSAPP', 'TELEGRAM')
    or p_event_id is null or length(btrim(p_event_id)) not between 1 and 255
    or p_channel_key is null or p_channel_key !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid channel event data' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('part16-event:' || p_provider || ':' || p_event_id, 0)
  );

  select e.* into existing_event
  from private.part16_channel_events e
  where e.provider = p_provider and e.event_id = p_event_id
  for update;

  if found then
    if existing_event.status = 'PROCESSING'
      and existing_event.updated_at < transaction_timestamp() - interval '2 minutes' then
      update private.part16_channel_events e
      set updated_at = transaction_timestamp()
      where e.provider = p_provider and e.event_id = p_event_id;
      return query select true, null::text;
      return;
    end if;
    return query select false, existing_event.response_text;
    return;
  end if;

  insert into private.part16_channel_events (provider, event_id, channel_key)
  values (p_provider, p_event_id, p_channel_key);
  return query select true, null::text;
end;
$$;

create function public.complete_part16_channel_event(
  p_provider text,
  p_event_id text,
  p_channel_key text,
  p_response_text text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_rows integer;
begin
  if p_response_text is null or length(p_response_text) = 0 or length(p_response_text) > 4096 then
    raise exception 'Invalid channel response' using errcode = '22023';
  end if;

  update private.part16_channel_events e
  set status = 'DONE', response_text = p_response_text,
    updated_at = transaction_timestamp()
  where e.provider = p_provider and e.event_id = p_event_id
    and e.channel_key = p_channel_key and e.status = 'PROCESSING';
  get diagnostics affected_rows = row_count;
  return affected_rows = 1;
end;
$$;

create function public.release_part16_channel_event(
  p_provider text,
  p_event_id text,
  p_channel_key text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_rows integer;
begin
  delete from private.part16_channel_events e
  where e.provider = p_provider and e.event_id = p_event_id
    and e.channel_key = p_channel_key and e.status = 'PROCESSING';
  get diagnostics affected_rows = row_count;
  return affected_rows = 1;
end;
$$;

revoke all on function public.get_part16_channel_session(text) from public, anon, authenticated;
revoke all on function public.save_part16_channel_session(text, text, text, text, text, text, text, jsonb, bigint) from public, anon, authenticated;
revoke all on function public.begin_part16_channel_event(text, text, text) from public, anon, authenticated;
revoke all on function public.complete_part16_channel_event(text, text, text, text) from public, anon, authenticated;
revoke all on function public.release_part16_channel_event(text, text, text) from public, anon, authenticated;

grant execute on function public.get_part16_channel_session(text) to service_role;
grant execute on function public.save_part16_channel_session(text, text, text, text, text, text, text, jsonb, bigint) to service_role;
grant execute on function public.begin_part16_channel_event(text, text, text) to service_role;
grant execute on function public.complete_part16_channel_event(text, text, text, text) to service_role;
grant execute on function public.release_part16_channel_event(text, text, text) to service_role;

comment on function public.get_part16_channel_session(text) is
  'Server-only lookup of a private messaging workflow by one-way channel digest.';
comment on function public.save_part16_channel_session(text, text, text, text, text, text, text, jsonb, bigint) is
  'Server-only optimistic, serialized save for WhatsApp/Telegram workflow state.';
comment on function public.begin_part16_channel_event(text, text, text) is
  'Server-only webhook replay claim. A completed event returns its prior safe response.';

commit;
