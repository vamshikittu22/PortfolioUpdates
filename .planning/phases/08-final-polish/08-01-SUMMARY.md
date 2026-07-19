---
phase: 08-final-polish
plan: 01
subsystem: youtube-analysis
tags: [youtube, innertube, transcript, gemini, multilingual, hindi, telugu]

# Dependency graph
requires:
  - phase: 06-news-pipeline
    provides: "ai-provider.ts multi-provider analyzer + gemini.ts VideoAnalysis shape reused unchanged"
provides:
  - "src/lib/transcript.ts rewritten to fetch captions via YouTube InnerTube (ANDROID client, IOS fallback) — never requires English, picks the video's original-language track (manual preferred, else native ASR)"
  - "TranscriptResult.source_kind ('manual'|'asr'|null) + accurate detected_lang from the caption track's languageCode"
  - "ai-provider.ts prompt REQUIRES English overview/key_points when detected_lang != 'en'"
  - "scripts/transcript-test.ts — LIVE en/hi/te InnerTube proof + real-Gemini English-output check"
affects: []

# Tech tracking
tech-stack:
  removed-usage:
    - "youtube-transcript npm package — no longer imported by any production source (still in package.json; another agent owns that file this round)"
  patterns:
    - "Keyless InnerTube player call (youtubei/v1/player, public ANDROID client, no API key) with URL.searchParams.set('fmt','json3') to override the caption baseUrl's default srv3/XML format"
    - "Original-language caption selection: infer spoken language from the ASR track's languageCode, prefer manual-in-original > manual-any > asr-in-original > asr-any — never require English"

key-files:
  created:
    - scripts/transcript-test.ts
  modified:
    - src/lib/transcript.ts
    - src/lib/ai-provider.ts

key-decisions:
  - "ANDROID InnerTube client is primary (verified live: WEB returns UNPLAYABLE, MWEB/TVHTML5 fail); IOS added as fallback (also verified) for resilience against client-specific breakage. No client rescues genuinely LOGIN_REQUIRED videos — those fail honestly."
  - "analyze/route.ts left unchanged: it already passes transcriptResult.detected_lang to the AI layer and surfaces transcript_available + analysis_source honestly. Reusing 'description_only' on the AI path was rejected because the modal ties that literal to a factually-wrong 'configure a Gemini key / keyword scanner' message, and adding a 'transcript' literal would require editing out-of-scope types (youtube-types.ts, scan/route.ts)."
  - "youtube-transcript dependency left installed in package.json (owned by a sibling agent this round); production code simply stopped importing it."

requirements-completed: [YouTube Hindi/Telugu transcript bug]

# Metrics
completed: 2026-07-19
---

# Phase 8 Plan 01: Multilingual YouTube Transcript Fix Summary

**Rewrote the transcript fetcher to pull captions directly from YouTube's keyless InnerTube API in the video's ORIGINAL language (never requiring English), made the Gemini prompt require English output for non-English transcripts, and proved it LIVE for English, Hindi and Telugu finance videos.**

## The Bug

On the YouTube analysis page, English videos got good transcript-based AI overviews, but Hindi/Telugu videos silently degraded to title+thumbnail-keyword analysis. Root cause: `src/lib/transcript.ts` used the `youtube-transcript` npm package (native→en→hi fallback, no 'te'), which scrapes `ytInitialPlayerResponse` and has been broken by YouTube changes for auto-generated (ASR) non-English tracks. On failure the analyze route fell back to `description_only` — exactly the reported symptom.

## What Changed

1. **`src/lib/transcript.ts` (commit `f5a259d`)** — rewritten to POST `https://www.youtube.com/youtubei/v1/player` with the public **ANDROID** InnerTube client (IOS fallback), no API key. It reads `captions.playerCaptionsTracklistRenderer.captionTracks`, picks the best track by original language (prefer manual-in-original → manual-any → ASR-in-original → ASR-any — **never requires English**), fetches the track `baseUrl` as `fmt=json3` (overriding the default srv3/XML via `URL.searchParams.set`), and parses `events→segs→utf8`. The exported interface (`fetchTranscript`, `truncateTranscript`, `TranscriptResult`, `getLanguageName`) is preserved so the analyze + scan routes are unchanged; `TranscriptResult` gains `source_kind: 'manual'|'asr'|null` and `detected_lang` now comes straight from the chosen track's `languageCode`. Honest failure (`available:false` + clear error) when a video has no caption tracks or is not playable — it never fabricates.

2. **`src/lib/ai-provider.ts` (commit `201ce93`)** — when `detected_lang != 'en'`, the Gemini prompt now names the language explicitly and REQUIRES every `summary_bullet` and `key_theme` in English (no residual Hindi/Telugu or transliteration). No translation pre-step — Gemini reads Hindi/Telugu natively.

3. **`scripts/transcript-test.ts` (commit `d65fdc5`)** — LIVE network test hitting the real InnerTube API for one en/hi/te video each, asserting availability, correct `detected_lang`, `>500` chars, and native-script presence; plus an optional real-Gemini English-output regression guard.

## LIVE Verification Results (real network, 2026-07-19)

| Lang | Video ID | Source | detected_lang | char_count | segments | words | Result |
|------|----------|--------|---------------|-----------|----------|-------|--------|
| en | `ssuaVMbRtCo` (Ben Felix — index funds) | manual | `en` | 5333 | 81 | 889 | PASS |
| hi | `7zIGgbfQysY` (Hindi SIP/mutual-fund explainer) | asr | `hi` | 9056 | 234 | 1940 | PASS |
| te | `p5ORIeMULIg` (Telugu stock-market explainer) | asr | `te` | 31611 | 847 | 4601 | PASS |

**Gemini English-output check (real GEMINI_API_KEY from .env.local):** the Hindi ASR transcript (Devanagari) was analyzed and returned **5 English summary bullets** (about SIP investing via banks vs. brokerage apps, AMCs holding investor funds, etc.), 5 tickers, confidence=high, **zero Devanagari/Telugu characters in the output**. PASS.

Run it yourself: `npx tsx scripts/transcript-test.ts`

## Commits

1. `f5a259d` — fix(transcript): InnerTube ANDROID client caption fetch, never require English
2. `201ce93` — feat(ai-provider): require English overview for non-English transcripts
3. `d65fdc5` — test(transcript): live en/hi/te InnerTube proof + Gemini English-overview check
4. (this SUMMARY.md — committed separately)

`npx tsc --noEmit` clean and `npm run build` clean (all 25 routes generated) after all commits. Each commit was staged with explicit paths and verified via `git show HEAD --stat`.

## Honest Failures / Limitations

- **No client bypasses genuinely gated videos.** During research, `JoakSszEfVo` returned `LOGIN_REQUIRED` on ANDROID, IOS and MWEB, and `ERROR` on TVHTML5 — such videos honestly return `available:false`. This is a real limitation of keyless InnerTube: sign-in / age / region-gated videos cannot be fetched.
- **InnerTube is undocumented and reverse-engineered.** The ANDROID client version (`20.10.38`) is a public value baked into youtube.com/the app (documented in a code comment); YouTube can change the contract at any time and the client version may need bumping. No secret is committed.
- **`youtube-transcript` remains in `package.json`.** Per this round's file-ownership rules a sibling agent owns `package.json`, so the now-unused dependency was left installed — production code simply stopped importing it. It can be removed in a later cleanup. (Two stale files under `scratch/` still `require()` it, but they are not part of the build.)
- **`analyze/route.ts` was intentionally not edited** — the required wiring (`detected_lang` passthrough, honest `transcript_available`/`analysis_source`) already existed; see key-decisions for why reusing `description_only` on the AI path was rejected.
- **Test videos are a point-in-time snapshot.** If a chosen video is later removed/region-gated the live test fails loudly (by design) — swap in another captioned video of the same language rather than weakening the assertions.

---
*Phase: 08-final-polish*
*Completed: 2026-07-19*
