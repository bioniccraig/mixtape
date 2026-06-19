# MixTape — Changelog

Running log of notable changes. Newest first.

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
