-- Migration: fix "permission denied for table reactions" (Sentry MIXTAPE-7)
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query).
--
-- Cause: reactions / comments / notifications were created by running schema.sql
-- in the SQL Editor (as the `postgres` role). Supabase's automatic anon/authenticated
-- table grants only apply to tables created under its default-privilege setup, so these
-- three tables ended up WITHOUT table-level GRANTs. RLS policies alone are not enough —
-- a role must also hold the table privilege, or Postgres returns 42501
-- "permission denied for table ...". This is why liking a tape failed to save.
--
-- Row security is unchanged: RLS is still enabled on every table below, so these grants
-- only let the policies do their job (they do NOT widen which rows a user can touch).
-- Safe to re-run.

grant usage on schema public to anon, authenticated;

-- REACTIONS — anyone may read counts; signed-in users like/unlike as themselves
grant select          on table reactions     to anon, authenticated;
grant insert, delete  on table reactions     to authenticated;

-- COMMENTS — anyone may read; signed-in users add/remove their own
grant select          on table comments      to anon, authenticated;
grant insert, delete  on table comments      to authenticated;

-- NOTIFICATIONS — recipient reads + marks their own read (no anon access)
grant select, update  on table notifications to authenticated;


-- ── FIX: notify_on_comment referenced the dropped `user_email` column ──────────
-- The 18 June comment-privacy migration dropped comments.user_email in favour of
-- author_name, but this trigger still read new.user_email — so AFTER that migration
-- every comment insert would throw "record new has no field user_email" and fail.
-- Re-point it at author_name (already masked, safe to store).
create or replace function notify_on_comment()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_creator uuid; v_name text;
begin
  select creator_id, tape_name into v_creator, v_name from tapes where id = new.tape_id;
  if v_creator is null or v_creator = new.user_id then return new; end if;
  insert into notifications (user_id, type, tape_id, from_email, message)
  values (v_creator, 'comment', new.tape_id, new.author_name,
          coalesce(new.author_name, 'Someone') || ' commented on "' || coalesce(nullif(v_name, ''), 'your tape') || '"');
  return new;
end; $$;
