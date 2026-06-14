# MixTape — V1 Build Plan

*Prepared June 2026 · Say It With Music*

---

## The decision

V1 keeps **full music playback inside the app**. No passing the listener out to Spotify or Apple Music to hear the tape — that would strip away the sleeve, the note, the curated running order, and reduce MixTape to a link forwarder. The whole point is that the tape is *an experience you have inside MixTape*.

To deliver in-app playback for **every** recipient, V1 uses **two playback engines behind one Walkman**:

- **YouTube — the universal engine.** Plays full tracks for everyone, free, no subscription, no login. Guarantees 100% of recipients can hear the whole tape in sequence inside the app.
- **Apple Music — the premium engine.** Recipients with Apple Music can connect their account and hear official, high-quality audio via MusicKit — still entirely inside the Walkman. This is what the **$99/year** Apple Developer membership unlocks, and it's also your route to the App Store later.

Either way the listener never leaves MixTape. Sleeve, note, narrative order, auto-advance Side A → Side B all stay intact.

---

## Where the project stands today

The deployed web POC at **mixtape-rho.vercel.app** already proves the emotional core: search songs, build Side A + Side B with hard time limits, spinning reels, five cassette themes, a customisable J-card with a personal note, and share the whole tape as one link to a read-only player. ~1,300 lines of working React, deployed, no backend, no running costs.

What changes for V1: the music layer. Today playback is 30-second iTunes previews. V1 replaces that with real, full, in-app playback via the dual-engine approach above — which means introducing a small backend and a song-matching step.

---

## The streaming reality (why it's Apple + YouTube)

Full in-app playback is gated everywhere. Platforms that allow it hide it behind a private partnership you must be approved for; the open ones only give 30-second previews. There is no self-serve "full songs for everyone" path on any single subscription service.

| Platform | Open to a solo dev? | Full in-app playback? | Notes |
|---|---|---|---|
| **Spotify** | Limited | Yes, but gated | Premium required for every listener; new apps capped at 5 users since Feb 2026 |
| **Apple Music** | Yes (paid) | **Yes** | $99/yr membership + a token-signing server; listener needs Apple Music — **chosen as premium engine** |
| **Amazon Music** | No | Yes (all tiers) | Closed beta — must be granted access by Amazon; no public sign-up |
| **Deezer** | Yes | No | Open API but 30-sec previews only; full-playback SDK deprecated |
| **Tidal** | Yes | No | Clean open sign-up + public web SDK, but third parties only get preview playback |
| **Qobuz** | No | n/a | Email-to-request access; niche audiophile audience |
| **Tencent / QQ Music** | No | n/a | China-focused, no open international programme — ignore |
| **YouTube** | No official Music API | **Yes, via embed** | Standard YouTube player legally plays full music for everyone, free, no Premium — **chosen as universal engine** |

Apple Music is the only self-serve route to *official* full playback, and YouTube is the only route to *free, universal* full playback. Together they cover everyone.

---

## How the music matching works (the critical part)

A tape is built from the **Apple/iTunes catalogue** (which the POC already searches) — rich, clean metadata, and every track carries an **ISRC**, a unique fingerprint for that exact recording. Each track on a tape stores its Apple ID, ISRC, artwork, title/artist, and a resolved **YouTube video ID** for the universal engine.

The risk to manage: songs almost always *exist* on YouTube (~96–98% coverage), but naive matching lands on the **wrong version about 1 in 3 times** on YouTube (live cut, remix, sped-up edit, wrong remaster). That would wreck a curated tape. Two defences:

1. **Match by ISRC, not text.** Resolve each Apple track to its YouTube equivalent via Odesli (free), which matches on ISRC + metadata rather than crude text search — far more precise.
2. **Confirm-at-build.** When the creator adds a song, MixTape shows the matched version and lets them confirm or swap it *before sending*. This fits MixTape's careful-curation ethos and means the recipient never hits a wrong version — the human locks it once, at creation.

Tracks that can't be matched cleanly (obscure indie, classical, brand-new releases, embedding-disabled videos) are flagged so the creator can pick manually or drop them.

---

## What V1 includes

- Everything the POC already does (build, themes, J-card, time limits, share link)
- **Full in-app playback** via the dual engine (YouTube universal + Apple Music premium)
- **ISRC-based matching + confirm-at-build** so the right recording always plays
- Auto-advance through the tracklist; seamless Side A → Side B
- Recipient connects Apple Music (optional) for premium audio; otherwise YouTube plays
- **Installable PWA** — home-screen icon, app-like feel, no app store needed
- **Accounts + saved tape library** (Supabase) — sign in, a personal library of tapes created/received, and the data foundation for understanding how people use MixTape (opens, completions, replays)
- A real domain + proper share-preview cards (WhatsApp/iMessage)
- Polish pass (fix toast-timing bug, mobile layout)

## Deliberately NOT in V1 (later versions)

- Native iOS/Android app and the app stores
- NFC tap-to-share (needs native)
- Spotify integration (the 5-user cap / Premium wall makes it not worth it)
- Artist MP3 uploads
- Social feed, likes, comments, following
- Canva / Procreate / handwriting tools

---

## Why still PWA, not native, for V1

Both engines (Apple MusicKit JS and the YouTube player) run in the browser, so a web/PWA build delivers the full in-app experience without taking on a native codebase, two app-store accounts, and review cycles. You keep the stack you already know. The only V1 feature a PWA can't do is NFC — which was never essential. Native becomes a deliberate later step, and nothing built now is wasted.

---

## The build sequence

Five milestones, each shippable on its own. I write the code-heavy parts directly in your project; you do the things only you can (account sign-ups, the domain, testing on your phone). This matches your "mix of both" preference.

**Milestone 0 — Accounts & keys (Craig, mostly)**
*Craig:* enrol in the Apple Developer Program ($99), create a MusicKit identifier + download the key file; create a free Google Cloud project for a YouTube Data API key; register for a free Odesli API key. I'll give exact step-by-step instructions for each.

**Milestone 1 — Song matching + confirm-at-build** *(can start now — not blocked by Apple approval)*
*Claude:* add ISRC-based resolution (Apple track → YouTube video ID via Odesli), and the "confirm/swap this version" step in the builder.
*Craig:* test with a few of your own playlists and tell me where matches feel wrong.

**Milestone 1b — Accounts & database (Supabase)** *(runs in parallel; not blocked by Apple)*
*Claude:* add sign-in, store users + tapes (created/received) in Supabase, and basic usage events (tape opened, played, completed) for analytics.
*Craig:* create a free Supabase project — I'll give exact steps.

**Milestone 2 — The dual-engine Walkman**
*Claude:* build the YouTube playback engine (full tracks, hidden/embedded per YouTube's rules, auto-advance, A→B) and the Apple MusicKit engine, plus the logic that picks the right one per listener. Includes the Vercel serverless function that securely signs the Apple developer token.
*Craig:* test playback as both an Apple Music user and a non-Apple user.

**Milestone 3 — Installable PWA**
*Claude:* manifest, icons, service worker, "Add to Home Screen."
*Craig:* install on your iPhone, confirm it feels like an app.

**Milestone 4 — Domain + share polish + cleanup**
*Claude:* wire the real domain into the share URL and Open Graph tags; fix the toast bug; tidy mobile layout.
*Craig:* buy the domain (mixtape.fm / getmixtape.com) and point it at Vercel — I'll walk you through it.

---

## Costs for this V1

- Apple Developer membership: **$99/year** (required, ongoing)
- YouTube Data API (matching): **free** at your scale
- Odesli API (matching): **free**
- Vercel hosting + serverless functions: **free**
- Domain: **~£10–30/year**

So roughly **$99 + a domain** to stand up a V1 where every recipient gets full, in-app, in-sequence listening.

---

## Risks & honest caveats

- **YouTube terms & ads.** Embedding YouTube's player is permitted, but the compliant approach keeps the video visible (it can be framed inside the cassette window), and ads can occasionally interrupt playback. Not the pristine ad-free ideal, but it's the only route to free full playback for everyone. Worth keeping an eye on as terms evolve.
- **Match quality.** ISRC matching + confirm-at-build handles most of it, but obscure/classical/brand-new tracks will sometimes need manual picking or dropping.
- **More moving parts than a previews app.** A backend, two integrations, token signing — meaningfully more work (weeks, part-time). Very doable solo with me writing the hard parts, but go in clear-eyed.
- **Apple key handling.** The Apple key file must never go into the code/repo (same rule that applied to the old Spotify secret) — it lives only in Vercel's secure environment variables.

---

## A leaner alternative worth keeping in mind

YouTube *alone* already gives full in-app playback to 100% of recipients for free. The $99 Apple layer mainly buys *audio quality* for the subset on Apple Music, plus App-Store readiness. If you wanted to prove the experience faster and cheaper, **YouTube-first, Apple Music as a fast-follow** is entirely legitimate and loses nothing on "can everyone hear the full tape." This plan assumes Apple + YouTube together (your call), but the door to starting YouTube-only stays open if the Apple setup feels like too much up front.

---

## Decisions locked (June 2026)

- **Accounts: yes.** V1 has sign-in + a saved tape library, on Supabase (free tier), partly to capture how people actually use MixTape.
- **Apple + YouTube together**, in-app dual-engine playback. Apple enrolment kicked off June 2026.
- **PWA, not native, for V1.** Spotify, native, NFC, MP3 upload, social feed all deferred.

---

## Immediate next steps

1. **Craig:** Apple Developer enrolment — in progress (needed for Milestone 2, not Milestone 1).
2. **Claude:** start Milestone 1 (matching + confirm-at-build) now — not blocked by Apple.
3. **Craig:** create a free Supabase project when ready, for Milestone 1b (accounts) — I'll give exact steps.
