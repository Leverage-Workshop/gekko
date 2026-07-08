-- feat-026: Web notifications — Realtime Broadcast plumbing.
--
-- Decision: Broadcast, NOT postgres_changes. Every Gekko table is RLS-enabled
-- with NO policies (20260620203044_init_core_schema.sql) so only the service
-- role can read them. Delivering postgres_changes INSERT events to the
-- browser's anon client would require anon SELECT policies on briefings +
-- eval_results (plus adding both tables to the supabase_realtime
-- publication), which also opens the FULL rows — briefing content, model
-- output, entry levels — to anyone holding the anon key via the REST Data
-- API. Notifications only need "something new exists", so instead an AFTER
-- INSERT trigger broadcasts a MINIMAL payload (type/status/id/created_at) on
-- the private Realtime topic 'gekko:alerts'. The only anon-visible surface is
-- that topic's broadcast messages (realtime.messages SELECT policy below);
-- the tables stay service-role-only and the publication is untouched. The
-- client is simpler too: one channel for both tables instead of two
-- postgres_changes subscriptions.
--
-- realtime.send(payload, event, topic, private) enqueues the broadcast and
-- swallows its own errors; the trigger adds a belt-and-braces exception guard
-- so a Realtime hiccup can never fail the underlying INSERT (notifications
-- are advisory — the briefing/eval write always wins).
--
-- Idempotent: create-or-replace + drop-if-exists before create, in the house
-- style of the prior migrations.

create or replace function public.gekko_broadcast_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_json jsonb := to_jsonb(new);
begin
  perform realtime.send(
    jsonb_strip_nulls(
      jsonb_build_object(
        'type', case tg_table_name when 'briefings' then 'briefing' else 'eval' end,
        'id', row_json->>'id',
        'status', row_json->>'status',
        'created_at', row_json->>'created_at'
      )
    ),
    'insert',        -- event name the browser client filters on
    'gekko:alerts',  -- broadcast topic (lib/notifications/events.ts GEKKO_ALERTS_TOPIC)
    true             -- private: receiving requires the realtime.messages policy below
  );
  return null;
exception
  when others then
    -- Never fail the INSERT because of a notification problem.
    return null;
end;
$$;

-- security definer is required so the trigger can call realtime.send
-- regardless of the inserting role; it is a trigger-returning function, so
-- PostgREST cannot expose it as an RPC endpoint.
comment on function public.gekko_broadcast_insert() is
  'AFTER INSERT trigger on briefings/eval_results: broadcasts a minimal alert payload (type/status/id/created_at — never briefing content) on the private Realtime topic gekko:alerts (feat-026).';

drop trigger if exists gekko_broadcast_briefing_insert on public.briefings;
create trigger gekko_broadcast_briefing_insert
  after insert on public.briefings
  for each row execute function public.gekko_broadcast_insert();

drop trigger if exists gekko_broadcast_eval_insert on public.eval_results;
create trigger gekko_broadcast_eval_insert
  after insert on public.eval_results
  for each row execute function public.gekko_broadcast_insert();

-- Allow the browser (anon key) to RECEIVE broadcasts on exactly this topic.
-- Scoped to extension = 'broadcast' AND the single gekko:alerts topic; no
-- table rows are exposed, and with no INSERT policy the anon role still
-- cannot SEND on the topic (or anything else).
drop policy if exists "anon can receive gekko alerts" on realtime.messages;
create policy "anon can receive gekko alerts"
  on realtime.messages
  for select
  to anon, authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and realtime.topic() = 'gekko:alerts'
  );
