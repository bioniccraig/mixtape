# MixTape — Next Stage Plan

*Prepared June 2026 · Say It With Music · follows `V1_Build_Plan.md`*

---

## Where we are

V1 is effectively built. Every milestone in the V1 Build Plan is done except the domain (M4), which is blocked until ~14 Aug 2026 by the Wix contract on `sayitwithmusic.net`. On top of the planned scope, the app already has accounts, a saved library, ISRC matching with confirm-at-build, the dual-engine Walkman (YouTube + Apple Music), an installable PWA, reactions, comments, in-app notifications, Sentry monitoring, and a live privacy policy + ToS.

The honest gap is no longer engineering — it's that **no real user has made and received a tape yet.** This plan fixes that, hardens the few things that only break under real traffic, and keeps the door to native apps open.

**Strategy:** soft launch now on `mixtape-rho.vercel.app` → harden in parallel → public launch when `sayitwithmusic.net` goes live (~mid-Aug) → native as a deliberate later step.

---

## Stage A — Soft launch now (this week)

Goal: get the core gifting moment in front of 10–20 real people and watch what happens. The PRD's own first recommendation, finally actioned.

**Must-fix before sending the link to anyone (small, fast):**
- Revert the error-toast duration from 6000ms back to ~2800ms (left long for debugging).
- Confirm the Supabase `notifications` table + triggers SQL has actually been run in production (memory flags this as "must be run by Craig if not already done"). If not, notifications silently do nothing.
- Do one full end-to-end pass as a brand-new user on a phone that has never seen the app: sign up → build a tape → confirm matches → share → open the link as a different person (incognito / second device) → play through Side A into Side B → like + comment. Note anything that feels off.

**The soft launch itself:**
- Pick 10–20 people who'll actually give honest feedback (not just "nice!"). A mix of Apple Music users and non-Apple users so both engines get exercised.
- Give them a one-line ask, e.g. *"Make a tape for someone and send it — tell me where it confused you or felt magic."*
- Watch 2–3 of them use it live if you can. Five minutes of watching beats fifty survey responses.

**What to measure (the data foundation is already in place):**
- Does a first-timer get from splash to a sent tape without help?
- Do matches feel right, or do people hit wrong versions / missing songs?
- Do recipients actually play the whole tape, or bounce after one track?
- Apple Music connect flow — does anyone complete it, or does everyone fall back to YouTube?

This stage is mostly *yours* — the build is ready. My job here is the small fixes above and reading the Sentry / usage data with you afterward.

---

## Stage B — Harden for public launch (parallel with A)

These are the things that work fine for one user and get visible with a crowd. Most are already half-handled; this is closing the gaps.

**1. YouTube quota resilience (highest priority).**
Matching falls back to the YouTube Data API (100 units/call, ~10k units/day free). A burst of new users could exhaust the daily quota, after which new matches fail until midnight PT. Today this surfaces a clear message — good — but it's still a hard wall. Options, cheapest first: lean harder on the free layers (Supabase cache, Deezer→MusicBrainz, the 6 Invidious instances) before ever touching the API; pre-warm the cache for popular tracks; and only as a last resort, request a YouTube quota increase. Worth a focused look before any wider push.

**2. Search catalogue gap.**
iTunes search misses some studio recordings (e.g. RATM "Killing in the Name" returns only live cuts). The planned real fix is switching the search backend to Deezer's free search API — larger catalogue, and it returns the Deezer ID you already use for ISRC lookup, so it consolidates the pipeline. Medium-sized task; high payoff for curation quality.

**3. Error 150 auto-retry.**
When YouTube fires error 150 (Vevo/label embedding disabled) at play time, the player currently skips the track with a toast. Better: auto re-match to an alternative video and swap it in, so the recipient never sees a hole in the tape. The `isEmbeddable()` check catches most of these at match time; this handles the stragglers.

**4. 4th cassette skin.**
You ran out of ChatGPT tokens mid-session. Generate a 4th photographic (unbranded) skin to round out the picker.

**5. Light cleanup.**
Drop the stale `vercel.json` rewrite rule (superseded by serverless functions, harmless but untidy) and remove the leftover `vite.config.js.timestamp-*` build artifacts from the repo.

---

## Stage C — Public launch (~mid-August, when the domain lands)

Triggered by the existing 14 Aug reminder to move `sayitwithmusic.net` off Wix.

**Domain cutover (M4 from the V1 plan):**
- Transfer `sayitwithmusic.net` from Wix to Cloudflare once the contract allows rollover.
- Update `SITE` in `api/tape.js` and the OG URL in `index.html`; point DNS at Vercel.
- Verify the share-preview cards render correctly in WhatsApp and iMessage with the real domain (the OG infrastructure already exists).

**Audience prep (do during the Stage A/B window so it's ready):**
- A simple landing page + waitlist at the domain — the PRD's "MixTape is coming, sign up to be first." Even a couple hundred sign-ups is real proof of demand and a launch-day audience.
- Decide the launch channels (your own network, relevant subreddits/communities, music-nerd spaces).

**Go-live gate — don't open the doors until:**
- Stage B item 1 (quota) has a clear answer, or you accept the cap with eyes open.
- The new-user end-to-end pass is clean on both iOS and Android.
- Sentry is quiet on real traffic from the soft launch.

---

## Stage D — Path to native (the horizon goal)

You want native apps, and nothing built so far is wasted — the PWA, both playback engines, the backend, the matching pipeline and the Supabase data all carry over. Native is a *deliberate later step*, sequenced after V1 has real users, because it adds real cost and overhead (two app-store accounts, review cycles, a native codebase).

**What native specifically unlocks** (and the PWA can't): NFC tap-to-share, true home-screen app presence and push notifications, App Store / Play Store discoverability, and the "[Name] sent you a mixtape → download the app → deep-link straight to the tape" deferred-deep-link flow described in your memory.

**Sensible sequencing when you get there:**
- React Native (per the PRD) keeps one codebase for iOS + Android and reuses your React knowledge and much of the existing component logic.
- Branch.io (or similar) for the deferred deep link so a shared tape survives an app install.
- Apple Developer membership is already paid, so the iOS side is partly funded.

**Decision to make first:** whether to validate further on the PWA (cheap, fast, you're already there) or commit to native once you've seen real usage. The data from Stage A should make this call for you. Recommend not starting native until V1 has shown people actually send and open tapes.

---

## A scope flag worth a deliberate decision

The original PRD describes a large social product (feed, following, NFC, artist MP3 uploads, commerce). The V1 plan deliberately narrowed to "prove the gifting moment," yet several social features (reactions, comments, notifications) have already crept in. That's not wrong — but decide consciously whether MixTape is **a personal gifting tool** (tight, intimate, 1-to-1) or **a social music network** (feed, discovery, follows). The two pull the product in different directions, and the soft-launch feedback is the right input for that call. Recommend staying gifting-first through V1 and letting real usage tell you if the social layer earns more investment.

---

## Risks & caveats

- **YouTube terms & ads.** Embedding is permitted with the video kept visible; ads can occasionally interrupt. Monitor as terms evolve — it's still the only free, universal full-playback route.
- **Quota under load.** Covered in Stage B; the single most likely thing to break on a good launch day.
- **Match quality on the long tail.** Obscure/classical/brand-new tracks still sometimes need manual picking or dropping — confirm-at-build keeps the recipient from ever seeing it.
- **Solo bandwidth.** All of this is doable part-time with me writing the code-heavy parts, but Stage B + native is weeks of work — sequence it, don't do it all at once.

---

## Immediate next actions

1. **Claude:** revert the toast timing; confirm/run the notifications SQL; tee up the quota-resilience review. *(Small, this week.)*
2. **Craig:** run the new-user end-to-end pass on your phone, then pick your 10–20 soft-launch people and send the link.
3. **Both:** read the Sentry + usage data together after the first week of real tapes.
4. **Craig:** stand up the waitlist landing page during the soft-launch window so it's live before the domain cutover.
5. **Calendar:** the 14 Aug domain reminder is already set — that's the trigger for Stage C.
