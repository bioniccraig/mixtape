# MixTape — Changelog

Running log of notable changes. Newest first.

## 19 June 2026 — metrics, funnel analytics & activation UX

### Metrics & analysis
- Pulled engagement + activation metrics live from Supabase (via the SQL editor). Headline finding: of **82 signups, only 19 (23%) ever create a tape**; 72 sign in successfully, so the wall is **not** email/auth — **53 (65%) sign in and never build, not even a draft**.
- Confirmed what the DB can/can't answer: magic-link *sent* and *used* are tracked; email *delivery* (Brevo) and Apple Music connection are **not**; account deletions are hard-deletes with no trail.
- Saved reusable query `mixtape-poc/supabase/metrics_engagement.sql` (activation funnel + 5 engagement metrics) and a scheduled weekly report logging to `metrics_history.csv`.

### Builder funnel analytics (new)
- Reuses the existing `events` table — **no schema change**. `db.js` `logEvent` relaxed to allow a null `tapeId` (builder events fire before a tape exists). New `src/session.js` shares `getSessionId` (extracted from `TapePlayer`).
- `TapeBuilder` now logs `builder_opened`, `first_track_added`, and `signin_prompt_shown` (trigger: cover/save/share). Read via the SQL editor (builder events have null `tape_id`). Spec: `mixtape-poc/supabase/builder_analytics_spec.md`.

### Activation UX
- **Tape-first builder:** opens on the tape (name/cover/design), not a cold search box (mobile panel defaults to `tape`). Empty tracklist shows a prominent **"+ Add your first tracks"** button that jumps to search and disappears after the first track.
- **Email-code sign-in (replaces the magic link):** `AuthModal` now verifies a 6–10 digit OTP code in-place (`verifyOtp`) so the user never leaves the page — fixes the magic-link cross-browser/webview context loss. **Requires** `{{ .Token }}` added to the Supabase **Magic Link** + **Confirm signup** email templates.
- **Example tape on splash:** signed-out visitors get a "▶ See an example tape" button (loads published tape `7450963f`, "Welcome to MixTape"). Controlled by `EXAMPLE_TAPE_SHARE_ID` in `constants.js`.

### Search overhaul
- **Root cause found (verified live against Deezer):** Deezer's general search is good — `Blink 182` → 191 hits, `Mumford and Sons` → 108 (finds "Mumford & Sons"). The app broke it: typing a band in the **Artist** field routed to `searchByArtist`, whose client-side `exact`/`artistMatch` name checks demanded near-literal equality and dropped everything on "&"/"and" or hyphen/space differences.
- **Single search box (default):** new `searchGeneral()` sends the whole query to Deezer's general `/search` with **no client-side artist/album filtering** — fixes the "and"/"&" and number/symbol failures (#3, #4) and the one-box ask (#1). The 3-field search is kept behind an **Advanced** toggle.
- **Punctuation-blind matching:** `normalizeArtist` now maps "&"↔"and", treats hyphens/punctuation as spaces, and collapses whitespace — so even Advanced mode no longer over-filters.
- **Graceful empty state:** "No matches — check the spelling, or try just the song title or artist" instead of a dead end.
- **`search_no_results` analytics event** logs the raw failing query (reuses the builder-analytics `logEvent`) so the real failing-query long tail is visible.
- **Known limitation (#2 typos):** Deezer has no spell-correction (`Little Sims` returns irrelevant "little…" tracks, not Little Simz). Deferred fix: MusicBrainz fuzzy fallback (already in the stack) → correct the name → re-query Deezer.

### Decisions
- Rejected localStorage "build-first then sign in" — magic links often open in a different browser than the build context, losing the draft. Solved the underlying problem with in-place OTP instead.
- Kept gifting-first; deferred social. Activation is the priority over scaling/quota work until the funnel improves.

## 19 June 2026 — maintenance, library redesign & design-uniformity pass

### Bug fixes
- **Likes failing to save (Sentry MIXTAPE-7):** root cause was missing table-level GRANTs on the social tables (created via the SQL editor, so they never inherited Supabase's anon/authenticated grants). Fixed with a grants migration. Also fixed a latent bug where the `notify_on_comment` trigger referenced the dropped `user_email` column (would have thrown on every comment after the privacy migration).
- **Search:** numbers/version-suffix titles returned nothing ("One After 909") — switched off Deezer's strict quoted syntax to a plain popularity-ranked query; album search returned wrong artists ("Let It Be") — stopped preferring an exact title match that skipped the canonical album; search results now mark tracks already on the tape.
- **Received tapes** showed "0 tracks" (verified fixed); the menu action now says "Open" (it opened without auto-playing).
- **Mobile player/builder chrome:** removed duplicate header buttons that overflowed the screen; footer sized to fit.

### Features
- **Library redesign:** saved tapes render as cassette-case spines; tapping one opens an action menu (bottom sheet on mobile, popover on desktop) — Open/Play, Copy link, Duplicate, Delete.
- **Remove received tapes** ("Remove from my library") — hides a tape someone sent you, for good. New `hidden_received_tapes` table.

### Hardening
- Origin-locked the public API proxies (Deezer/YouTube/Apple search, MusicKit token) to deter quota abuse.
- Removed dead code (`spotify.js`, `api/itunes-search.js`, unused share helpers).
- Attached Sentry user identity so "users impacted" is meaningful.
- Added a Vitest test suite (13 unit tests over the matching/share logic) — `npm test`.

### Design uniformity / refactor
- MixTape logo returns home on every screen.
- One shared `.btn` button family replacing ~10 ad-hoc button classes.
- Shared `AppHeader` component used by the builder and player.
- **App-shell layout** (full-height column, scrolling middle, in-flow footer) on the builder and player — permanently fixes the recurring "footer obscures content" bug on desktop and mobile.

### Supabase migrations to run
- `mixtape-poc/supabase/migration_2026-06-19_grant-social-tables.sql`
- `mixtape-poc/supabase/migration_2026-06-19_hidden-received-tapes.sql`
