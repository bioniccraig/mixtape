# Builder Funnel Analytics — Spec

**Why:** 65% of signups (53 of 82) sign in and never create a tape — not even an auto-saved draft. We currently log *nothing* about the creator journey (the `events` table only records recipient actions: `tape_opened` / `tape_played` / `tape_completed`). This spec adds the missing rungs so the "signed-in-but-no-tape" black box becomes a step-by-step drop-off.

Reuses the existing `events` table — **no schema change required**. Two small code prerequisites first.

---

## Prerequisite 1 — let `logEvent` accept a null `tapeId`

`src/db.js` line ~423, `logEvent` currently bails when there is no tape:

```js
export async function logEvent({ tapeId, eventType, sessionId, viewerId = null, metadata = {} }) {
  if (!supabase || !tapeId) return;   // ← this drops every builder event before a tape exists
  ...
}
```

The whole point is to capture users **before** a tape row exists, so the `!tapeId` guard must go. Either relax it:

```js
export async function logEvent({ tapeId = null, eventType, sessionId, viewerId = null, metadata = {} }) {
  if (!supabase) return;
  await supabase.from('events').insert({
    tape_id:    tapeId,          // null is valid — events.tape_id is nullable
    event_type: eventType,
    session_id: sessionId || null,
    viewer_id:  viewerId  || null,
    metadata,
  });
}
```

…or add a sibling `logBuilderEvent()` if you'd rather not touch the recipient path. `events.tape_id` is already nullable (FK `references tapes(id)`), and the `notify_on_play` trigger early-returns on any `event_type <> 'tape_played'`, so new event types are safe.

## Prerequisite 2 — share `getSessionId()`

It lives privately in `src/TapePlayer.jsx` (line ~49). Extract to `src/session.js` and import in both TapePlayer and TapeBuilder so builder events group by browser session the same way:

```js
// src/session.js
export function getSessionId() {
  const key = 'mixtape_session_id';
  let id = sessionStorage.getItem(key);
  if (!id) { id = crypto.randomUUID(); sessionStorage.setItem(key, id); }
  return id;
}
```

---

## The events

All fire from `src/TapeBuilder.jsx`. Pass `viewerId: user?.id ?? null` (logged-out builder use is real and worth capturing) and `sessionId: getSessionId()`. `tapeId` is the current tape id once one exists, else `null`.

| # | event_type | When / where it fires | tape_id | Key metadata |
|---|---|---|---|---|
| 1 | `builder_opened` | Once on mount — `useEffect([], …)` inside `TapeBuilder()` (component starts line 124; add alongside the effects at ~170). | null (usually) | `{ from_initial: !!initialTape }` |
| 2 | `first_track_added` | First successful `addTrack()` this session (line 376). Dedupe with a `useRef(false)` so it fires once, not per track. | null until saved | `{ side, source: 'search' }` |
| 3 | `signin_prompt_shown` | Wherever the builder calls `onSignInRequest()` because `!user` — e.g. cover upload (line 303), save (line 457), share (line 495). This reveals if the **sign-in wall mid-build** is the blocker. | null | `{ trigger: 'add' \| 'save' \| 'share' \| 'cover' }` |
| 4 | `tape_saved_draft` | After `upsertTape({… status:'draft'})` succeeds (line ~459). | the new id | `{ track_count }` |
| 5 | `unmatched_warning_shown` | When the pre-share "unmatched tracks" modal opens (the `attentionPanel` path, ~line 488/814). Known friction point. | id if saved | `{ unmatched_count }` |
| 6 | `share_initiated` | After `upsertTape({… status:'published'})` succeeds (line ~500), i.e. the moment a tape becomes shareable. | the id | `{ track_count, via: 'native' \| 'community' }` |

Events 4 and 6 overlap with rows already in `tapes` (draft/published), but logging them as events gives you **timing** and lets the whole funnel be read from one table.

The two that actually fill the current blind spot are **#1 `builder_opened`** and **#2 `first_track_added`** — together they split the 53 into "opened the builder but never added a track" vs. "started a tape but abandoned it." **#3 `signin_prompt_shown`** is the prime suspect for *why*.

---

## RLS note

The `events` insert policy is `with check (true)`, so authenticated and anonymous inserts both work — no change needed. The **read** policy is tape-scoped, so builder events with `tape_id = null` won't be readable through the app. That's fine: read them via the SQL Editor (role `postgres`) for analytics. If you ever want them in-app, add a `viewer_id = auth.uid()` select policy.

---

## Reading the funnel (after a few days of data)

```sql
select event_type, count(*) as events, count(distinct viewer_id) as users
from events
where event_type in
  ('builder_opened','first_track_added','signin_prompt_shown',
   'tape_saved_draft','unmatched_warning_shown','share_initiated')
group by event_type
order by users desc;
```

Add `count(distinct session_id)` to include logged-out sessions where `viewer_id` is null.

---

## Suggested order

1. Prereqs 1 & 2 (tiny, safe).
2. Ship events **#1, #2, #3** first — they answer the live question (where do the 53 go?).
3. Add #4–#6 when convenient.
4. Once data accrues, fold the funnel query into the weekly metrics report.
