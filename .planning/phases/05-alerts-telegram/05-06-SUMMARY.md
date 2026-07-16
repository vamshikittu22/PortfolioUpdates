---
phase: 05-alerts-telegram
plan: 06
subsystem: telegram
tags: [telegram, supabase-admin, server-actions, next-route-handler, rls, handshake]

# Dependency graph
requires:
  - phase: 05-01
    provides: telegram_links table (no authenticated UPDATE policy — the allowlist closure), price_alerts, notifications_outbox schema
  - phase: 05-02
    provides: parseStartPayload, generateLinkToken (pure Telegram logic, zero I/O)
  - phase: 05-04
    provides: getTelegramUpdates raw-fetch wrapper (src/lib/telegram/api.ts)
provides:
  - redeemStartToken (src/lib/telegram/redeem.ts) — the single admin-client bind path shared by both the dev poll and the deploy-gated webhook
  - getTelegramLink (src/lib/telegram/read.ts) — cookie-bound status read for the /alerts RSC
  - generateTelegramLink/checkTelegramLink/unlinkTelegram Server Actions (src/server-actions/telegram.ts)
  - POST /api/telegram/webhook (secret-header-guarded, deploy-gated)
affects: [05-08, 05-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "compare-and-set UPDATE ... WHERE status='pending' as the concurrency guard for a single-use token bind (no SELECT FOR UPDATE needed — the WHERE clause itself makes a second concurrent redeem affect zero rows)"
    - "auth-gate-then-admin-client Server Action shape reused a third time (refreshPricesNow -> checkTelegramLink): getUser() on the cookie client, then hand off to the admin client for the actual privileged read/write"
    - "guard-before-Supabase route ordering reused a second time (/api/prices/refresh -> /api/telegram/webhook): header/secret check strictly before any Supabase client is constructed"

key-files:
  created:
    - src/lib/telegram/redeem.ts
    - src/lib/telegram/read.ts
    - src/server-actions/telegram.ts
    - src/app/api/telegram/webhook/route.ts
  modified:
    - .env.local (TELEGRAM_BOT_USERNAME, TELEGRAM_WEBHOOK_SECRET placeholders — gitignored, not committed)

key-decisions:
  - "redeemStartToken treats an already-linked token with the SAME chat_id as idempotent success (not an error) — required because both the dev poll (re-scanning its stateless offset window) and the future webhook can independently observe the same /start update"
  - "generateTelegramLink implements the plan's DELETE-then-INSERT option (not a PK upsert) for regenerating a pending link — matches the RLS policy shape exactly (separate INSERT/DELETE-own policies, no UPDATE policy at all)"
  - "checkTelegramLink never swallows a non-ok getUpdates result (e.g. 409 webhook-active) — surfaced verbatim as the action's error so a stale local webhook is diagnosable, not silently 'no updates found'"

patterns-established:
  - "Single shared binding function (redeemStartToken) is the ONLY path to telegram_links.status='linked', called identically from both handshake entry points (dev poll, webhook) — no duplicated bind logic to drift"

requirements-completed: [ALRT-01]

# Metrics
duration: ~12min
completed: 2026-07-16
---

# Phase 5 Plan 06: Telegram Linking Handshake Summary

**Admin-client compare-and-set token binding (redeemStartToken) shared by a no-public-URL dev getUpdates poll and a deploy-gated, secret-header-guarded webhook route — the single path to `telegram_links.status='linked'`.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-07-16T17:44:00-05:00 (approx, first file read)
- **Completed:** 2026-07-16T17:51:52-05:00
- **Tasks:** 3 completed
- **Files modified:** 4 created (+ `.env.local` gitignored placeholders)

## Accomplishments
- `redeemStartToken` validates a single-use, unexpired, `pending` token and binds `chat_id` via a compare-and-set `UPDATE ... WHERE status='pending'` using the admin client (the only client that can write `telegram_links`, since no authenticated UPDATE policy exists — 05-01's allowlist closure); a same-chat replay is idempotent success, an already-used/expired token is rejected honestly, and a `telegram_links_chat_unique` violation maps to a friendly "already linked to another account" reason instead of a raw Postgres error.
- `getTelegramLink` gives the `/alerts` RSC an honest `pending`/`linked`/`revoked`/`none` status via a cookie-bound RLS-scoped read — never the admin client.
- The three handshake Server Actions in `src/server-actions/telegram.ts`: `generateTelegramLink` (cookie-bound DELETE+INSERT of a fresh pending row, renders the token-free `https://t.me/<username>?start=<token>` deep link from `TELEGRAM_BOT_USERNAME`), `checkTelegramLink` (the no-public-URL dev handshake — `getUser()` gate on the cookie client, then the admin client polls `getTelegramUpdates()`, parses each update via `parseStartPayload`, redeems via `redeemStartToken`, acknowledges by re-polling with `offset = maxUpdateId + 1`, and re-reads the caller's own link status), and `unlinkTelegram` (cookie-bound delete of the caller's own row).
- `POST /api/telegram/webhook` — the production inbound path: verifies `X-Telegram-Bot-Api-Secret-Token` against `TELEGRAM_WEBHOOK_SECRET` strictly before `createAdminClient()` is ever called (an unset secret always rejects), then redeems via the same `redeemStartToken`, always returning 200 for a well-formed request so Telegram does not retry forever. Live `setWebhook` activation is explicitly deferred to 05-09 (deploy-gated, matches `price_refresh_cron.sql`'s precedent) — never enabled while only running locally, since that would 409 `checkTelegramLink`'s dev poll.

## Task Commits

Each task was committed atomically:

1. **Task 1: redeemStartToken binding + getTelegramLink read** - `3ea0329` (feat)
2. **Task 2: Telegram handshake Server Actions (generate/check-poll/unlink)** - `42a1bb8` (feat)
3. **Task 3: Deploy-gated webhook route (secret header guard + redeem)** - `ad1d433` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `src/lib/telegram/redeem.ts` - `redeemStartToken(admin, token, chatId)` — the single admin-client bind path
- `src/lib/telegram/read.ts` - `getTelegramLink(supabase, userId)` — cookie-bound status read
- `src/server-actions/telegram.ts` - `generateTelegramLink`/`checkTelegramLink`/`unlinkTelegram`
- `src/app/api/telegram/webhook/route.ts` - secret-header-guarded `POST` handler, deploy-gated
- `.env.local` - added `TELEGRAM_BOT_USERNAME` and `TELEGRAM_WEBHOOK_SECRET` labeled placeholders (gitignored, not part of any commit)

## Decisions Made
- Idempotent-on-same-chat-replay design in `redeemStartToken` (see key-decisions above) — necessary because the stateless dev-poll offset bookkeeping and the future webhook can both observe the same `/start` update.
- `generateTelegramLink` uses DELETE-then-INSERT rather than a PK upsert, matching `telegram_links`' actual RLS policy shape (separate INSERT/DELETE-own policies, deliberately no UPDATE policy).
- `checkTelegramLink` surfaces a non-ok `getUpdates` result (e.g. 409 webhook-active) verbatim rather than treating it as "no updates" — matches the plan's "honest 409 surfacing, never swallowed" requirement.

## Deviations from Plan

None - plan executed exactly as written. All four `must_haves.artifacts` exist with the specified exports; all `key_links` verified by grep and eyeball per the plan's own verification steps.

## Issues Encountered
- Two `npx tsc --noEmit` errors (`DispatchSummary` not exported from `src/lib/notifications/outbox.ts`, surfacing in `src/app/api/prices/refresh/route.ts` and `src/server-actions/prices.ts`) were observed transiently between Task 1 and Task 2. Both affected files are owned by the concurrently-running 05-05 executor (explicitly out of scope per this plan's environment notes) and were not caused by this plan's changes — logged to `.planning/phases/05-alerts-telegram/deferred-items.md` rather than fixed. By the time Task 3's `tsc`/`build` ran, 05-05 had completed and the errors were already resolved on its own — confirmed both `npx tsc --noEmit` and `npm run build` are clean after all three of this plan's commits.
- One `git commit` attempt (Task 2) failed with `Unable to create '.git/index.lock'` — the concurrent 05-05 executor was mid-commit. Retried after the lock cleared; found 05-05's own files (`route.ts`, `outbox.ts`, `prices.ts`) staged in the shared index at that moment. To avoid sweeping their staged changes into this plan's commit (the known parallel-executor git-index race), Tasks 2 and 3 were both committed with an explicit trailing pathspec (`git commit -m "..." -- <this-plan's-file>`), which commits only that path's changes regardless of what else is staged. `git show HEAD --stat` confirmed after every commit that exactly one intended file landed each time.

## User Setup Required

None yet for this plan specifically — `TELEGRAM_BOT_USERNAME`/`TELEGRAM_WEBHOOK_SECRET` were added as labeled `.env.local` placeholders (gitignored); real values (from BotFather + a self-generated secret) are needed only for 05-09's live handshake/webhook verification, not for this plan's static verification.

## Next Phase Readiness
- `redeemStartToken`/`getTelegramLink`/the three Server Actions/the webhook route are all code-complete and statically verified (`npx tsc --noEmit` and `npm run build` both clean, all plan-specified greps pass).
- 05-08 (`/alerts` UI rewrite) can now import `generateTelegramLink`/`checkTelegramLink`/`unlinkTelegram` and `getTelegramLink` directly to build the `TelegramLinkCard`.
- Live handshake (real BotFather bot + token + `TELEGRAM_BOT_USERNAME`, 05-01's migration applied) and live webhook activation (`setWebhook` with `secret_token`, requires a public deploy) remain explicitly DEFERRED to 05-09 — no real bot token exists yet on this dev machine, and Telegram cannot reach `localhost` for the webhook regardless.

---
*Phase: 05-alerts-telegram*
*Completed: 2026-07-16*

## Self-Check: PASSED

All 4 created files confirmed present on disk; all 3 task commits (3ea0329, 42a1bb8, ad1d433) confirmed present in git log.
