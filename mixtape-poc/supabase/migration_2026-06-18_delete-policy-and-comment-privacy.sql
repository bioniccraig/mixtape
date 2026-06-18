-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 18 June 2026
-- Engineering-review fixes #1 and #2.
--
-- ⚠️ RUN THIS IN THE SUPABASE SQL EDITOR *BEFORE* (or at the same time as)
--    deploying the matching code change. The new app code reads `author_name`,
--    which doesn't exist until step 2 runs.
--
-- Safe to run more than once (idempotent).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. FIX: let creators delete their own tapes.
--    Without this rule, the database silently blocks deletion, so the library
--    "delete" button appears to work but the tape is never actually removed.
drop policy if exists "Creators can delete own tapes" on tapes;
create policy "Creators can delete own tapes"
  on tapes for delete using (auth.uid() = creator_id);

-- 2. PRIVACY: stop storing/exposing commenters' email addresses.
--    The comments table is world-readable, so the raw email must not live in it.
--    We add a display-name column, backfill it from the existing emails (the part
--    before "@", matching what was shown on screen), then DROP the email column.
alter table comments add column if not exists author_name text;

update comments
   set author_name = split_part(user_email, '@', 1)
 where author_name is null
   and user_email is not null;

alter table comments drop column if exists user_email;
