# MixTape — Engineering & Infrastructure Review
**Date:** 18 June 2026 · **Last updated:** 18 June 2026 · **Audience:** Craig (non-technical founder) · **Reviewed:** full app code, database rules, server functions, hosting config

---

## How to read this

I've written this for you, not for an engineer. No jargon without a plain explanation. Each finding has a severity tag:

- 🔴 **Important** — fix before you push growth harder
- 🟡 **Worth doing soon** — not on fire, but it protects you
- 🟢 **Tidy-up** — low risk, do when convenient
- ✅ **Strength** — already done well; keep it

The honest one-line verdict first, then strengths, then each area you asked about, then a single prioritised to-do list at the end. Nothing here needs you to touch code — it's about knowing what to ask for.

---

## The honest verdict

**The foundations are in good shape.** Building feature-by-feature has *not* left you with a mess — the code is organised sensibly, the risky secrets are handled correctly, and the playback system is genuinely well-designed. That's not flattery; I checked.

But there is **one recurring habit** that has already bitten you once and is the thread running through several findings: **the app sometimes ignores errors from the database instead of noticing them.** The disappearing-likes bug was caused by exactly this. I found at least one more place with the same problem (deleting a tape), and it's the single most valuable thing to tighten. Think of it as the app occasionally "nodding politely" when the database actually said *no* — so a thing looks done but isn't.

Everything else is normal "we're scaling up now" housekeeping.

---

## What's already good (don't lose these)

- ✅ **The playback system is genuinely robust.** When MixTape tries to find a song to play, it doesn't rely on one source — it tries a saved cache, then Deezer, then MusicBrainz, then *six* alternative YouTube mirrors, then *five* more, and only then the paid YouTube route. If one breaks, the others carry it. This is exactly the kind of redundancy you'd want, and it's already built.
- ✅ **Two playback engines (YouTube + Apple Music).** If one fails for a listener, the other can cover. Good resilience and the reason the app is already "cross-platform" for listening.
- ✅ **Your secret keys are handled correctly.** The sensitive Apple and database admin keys live on the server, never in the app that users download, and the "delete my account" feature is written so a user can only ever delete *their own* account — never anyone else's. This is the kind of thing that's embarrassing to get wrong, and you didn't.
- ✅ **The database is locked down by default.** Every data table has security rules switched on, and most are sensible (you can only edit your own tapes, your own likes, your own profile).
- ✅ **You have error monitoring (Sentry) and a daily check.** Most projects this age are flying blind. You're not.

---

## 1. Optimisation

Performance is **fine for where you are** — the app is small and fast, and the server functions already cache results so repeat lookups are cheap. Nothing urgent here. The optimisation worth caring about is *maintainability* — how easy and safe the code is to change as it grows:

- 🟡 **Two files are getting very large.** `TapeBuilder` (≈900 lines) and `TapePlayer` (≈640 lines) each do a lot. Big files are harder to change without accidentally breaking something nearby — notably, both recent bugs lived in big files. Not urgent, but as we add features, breaking these into smaller pieces will make every future change safer and quicker. (This is a "tidy as we go" job, not a stop-the-world rewrite.)
- 🟢 **There's dead code to remove.** A leftover `spotify.js` file (≈135 lines) from the abandoned Spotify attempt, and an unused `itunes-search` server function. Neither is used anywhere. Dead code isn't dangerous, but it confuses future work ("wait, do we use Spotify?"). Quick delete.
- 🟢 **Your tools are reasonably current.** React, Sentry and Supabase are near-latest. The build tool (Vite) is deliberately held one version back for stability — that's a sensible, conscious choice, not neglect.

---

## 2. Security & protection

The big stuff (secret keys, account deletion, database rules) is handled well — see strengths above. The gaps are smaller but real:

- 🔴 **Public comments store and expose people's email addresses.** When someone comments on a tape, their email is saved in a table that *anyone* can read through the app's data connection. The on-screen display cleverly shows a name instead of the full email — but the raw email is still sitting in a publicly-readable place behind the scenes. For a public, community-facing app this is a privacy weak spot worth closing (store a display name instead of the email, or restrict who can read that column).
- 🟡 **Your server "helpers" are open to the public internet with no throttle.** The small functions that search Deezer/YouTube/Apple for you can be called by anyone, as many times as they like. The practical risk: the YouTube one consumes your limited daily quota, so someone could burn through it (deliberately or by accident) and break matching for real users. Two cheap protections: lock the YouTube key to your own website in the Google console, and add basic rate-limiting so no single source can hammer the endpoints.
- 🟡 **One tracking table allows anyone to write to it.** The table that records who a tape was sent to accepts writes from anyone. It's low-sensitivity data, but it's more open than it needs to be.
- 🟢 **A couple of search inputs aren't sanity-checked** before being passed on to Deezer. Low risk (they go to a fixed, trusted address), but worth tightening when convenient.

---

## 3. Redundancy & fragility

This is where the recurring "ignored errors" theme lives.

- 🔴 **The "silent failure" habit — your most valuable fix.** In a few places the app asks the database to do something, the database refuses, and the app carries on as if it succeeded. You already felt this with likes. I found the **same pattern in "delete a tape"**: there's no database rule permitting a creator to delete their own tape, so the deletion is almost certainly being *blocked and ignored* — the card may vanish from view but the tape likely still exists. The fix is twofold and I can do it: add the missing permission rule, and make the app *check* the database's answer everywhere (so nothing can silently fail again). This single habit-change removes a whole category of "it looks fine but isn't" bugs.
- 🟡 **There are no automated tests.** Right now, the only way we know a change didn't break something is you (or a user) noticing. That's workable at this size but it's why bugs reach real people. A small set of automated "smoke tests" on the core paths (sharing a tape, matching a song, liking) would act as a safety net that catches breakage *before* it ships — especially valuable *because* you rely on me for the code and can't eyeball it yourself.
- 🟡 **Single points of failure & free-tier ceilings.** A few services hold the whole app up, and several are on free plans with limits you'll eventually hit as you grow. None are problems *today*, but they're the things to watch:
  - **Supabase** (your database, logins, image storage) — if it's down, logins/likes/comments/library stop. Free tier has storage and traffic limits.
  - **YouTube quota** — the recurring pinch point; a daily cap on automatic matching.
  - **Vercel** (hosting) and **Brevo** (sign-in emails, 300/day) — both have free-tier ceilings.
  - *Recommendation:* keep a simple "scaling watch-list" (below) so a limit never surprises you mid-growth.
- 🟡 **The two kinds of share link.** As covered in the likes fix, some shares carry the app's full database identity (`/t/...` links) and some don't (the older hash links). The identity-less ones quietly disable likes/comments. The proper cure (already on the work list, item #8) is to make *every* share a `/t/...` link.

---

## 4. Future build plans — what to put in place before scaling

You don't need a big architecture change. You need a few lightweight *habits and guardrails* so growth doesn't outrun the foundations:

1. **Adopt a tiny "definition of done" for changes** (I'll follow it): every change checks the database's answers, and we test the main path before it ships. This directly prevents the silent-failure class of bug.
2. **Add a handful of automated smoke tests** on the core flows. Small effort, large safety payoff — your best insurance given you can't read the code yourself.
3. **Keep a scaling watch-list** (quota/free-tier ceilings) so limits are a planned upgrade, not a 2am outage.
4. **Use preview deploys before production.** Vercel can show a change on a private test link before it goes live to users — a cheap dress rehearsal. Worth making standard practice now that real people are on the app.
5. **Make the gifting-vs-social decision consciously.** The community/feed/friends requests pull toward a social network (deferred to V2/V3). Whichever way you go, decide it on purpose — the engineering effort and the moderation burden differ a lot between "gifting tool" and "social platform."

---

## 5. Anything else worth knowing

- **You don't need to learn to read the code.** You need to know the right *questions*, and this review is meant to give you them. When I propose a change, the two you can always ask are: *"Does this check the database's answer?"* and *"How will we know if it breaks?"* Those two questions cover most of what protects you.
- **Your instinct to pause and review was correct.** Catching the silent-failure habit now — while it's three small fixes — is far cheaper than catching it after it's spread through twenty features.
- **The iterative approach is working.** Nothing here says "you built it wrong." It says "you're ready to add a thin safety layer so it keeps working as more people arrive."

---

## Prioritised action list

Ordered by value-for-effort. Almost all of these are things I can do for you; your part is mostly approving and testing.

| # | Action | Why it matters (plain) | Severity | Effort | Who |
|---|--------|------------------------|----------|--------|-----|
| 1 | Fix "delete a tape" (add the missing DB permission rule) + stop the app ignoring database errors app-wide | Kills the silent-failure habit that caused the likes bug; deleting a tape probably doesn't actually work right now | 🔴 | Small | Me (you test) |
| 2 | Stop storing/exposing user emails on public comments | Privacy — emails are currently readable behind the scenes | 🔴 | Small | Me (+ you run 1 DB step) |
| 3 | Lock the YouTube key to your site + add basic rate-limiting on the server helpers | Stops anyone burning your daily matching quota | 🟡 | Small–Med | Me (+ you set 1 Google setting) |
| 4 | Make every share a `/t/...` link (work-list #8) | So likes/comments/counts work for *every* recipient | 🟡 | Medium | Me (you test) |
| 5 | Add a small set of automated smoke tests | Safety net that catches breakage before users do | 🟡 | Medium | Me |
| 6 | Start using Vercel preview links before going live | Dress-rehearse changes safely | 🟡 | Tiny | You + me |
| 7 | Remove dead code (`spotify.js`, unused `itunes-search`) | Less confusion in future work | 🟢 | Tiny | Me |
| 8 | Gradually split the two large files as we touch them | Makes every future change safer | 🟢 | Ongoing | Me |
| 9 | Keep a scaling watch-list of free-tier limits | No limit surprises you mid-growth | 🟢 | Tiny | Me + you |

**Suggested first move:** items **1 and 2** together — they're both small, both close real holes (one functional, one privacy), and both stem from the same "check the database's answer" principle. I can do them in one pass whenever you're ready.
