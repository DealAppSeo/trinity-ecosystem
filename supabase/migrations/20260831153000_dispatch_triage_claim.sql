-- claim_dispatch_message — hand exactly one un-replied message to exactly one worker.
--
-- WHY AN RPC AND NOT SELECT-THEN-UPDATE. Two workers polling the same mailbox
-- would both read the same top row and both reply to it. FOR UPDATE SKIP LOCKED
-- makes the claim atomic.
--
-- IT SETS BOTH read_at AND status, DELIBERATELY. Measured 2026-08-31: of 46
-- messages in ai_dispatch, read_at was NULL on ALL of them, while 6 carried
-- status='read' and 5 status='pending'. Nobody had ever run the reader, so those
-- statuses were set by hand. "Has this been read?" answered yes or no depending
-- on which column you asked.
--
-- ELIGIBILITY KEYS OFF `reply IS NULL`, NEVER OFF `status`. A first version used
-- status='unread' and that silently made those 11 never-actually-read rows
-- PERMANENTLY invisible — the backlog would have looked drained while a quarter
-- of it had never been opened. Trusting the flag over the evidence is what created
-- the mess; the claim must not repeat it.
--
-- STRANDED IN-FLIGHT ROWS: a worker that dies between claim and reply leaves
-- status='reading' and no reply. Reclaimed after 10 minutes. A message that
-- cannot be retried is a message quietly lost.
create or replace function public.claim_dispatch_message(
  p_to_ai text,
  p_worker text
)
returns public.ai_dispatch
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.ai_dispatch;
begin
  update public.ai_dispatch d
     set status  = 'reading',
         read_at = coalesce(d.read_at, now())  -- keep the FIRST read time on a retry
   where d.id = (
     select c.id
       from public.ai_dispatch c
      where c.to_ai = p_to_ai
        and c.reply is null
        and (
             c.status <> 'reading'
          or c.read_at < now() - interval '10 minutes'
        )
      order by c.priority desc nulls last, c.created_at asc
      limit 1
      for update skip locked
   )
  returning d.* into v_row;

  return v_row;  -- NULL row when nothing is eligible; the caller must handle that
end;
$$;

comment on function public.claim_dispatch_message(text, text) is
  'Atomically claim the highest-priority un-replied ai_dispatch message for one worker. Sets read_at AND status together. Eligibility keys off reply IS NULL, never off status, because status was set by hand on 11 rows that had never been read. Reclaims rows stranded in status=reading for over 10 minutes.';

revoke all on function public.claim_dispatch_message(text, text) from public, anon, authenticated;
grant execute on function public.claim_dispatch_message(text, text) to service_role;
