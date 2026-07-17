---
phase: 05-alerts-telegram
plan: 09
subsystem: alerts-telegram
tags: [checkpoint, human-verify, deferred, live-db, telegram, bot-token]
mode: DEFERRED — checkpoint reached, user deferred (no bot token yet; no migration-push consent yet)

requires:
  - phase: 05-01
    provides: alerts_telegram migration (price_alerts, telegram_links, notifications_outbox, claim_due_notifications RPC) — authored, NOT pushed
  - phase: 05-02
    provides: pure Telegram logic (parse /start, link token, HTML message builder, send-error taxonomy), proven token-free
  - phase: 05-03
    provides: pure alert evaluation (level+cooldown trigger, dedupe-window key), proven zero-I/O
  - phase: 05-04
    provides: raw-fetch Telegram API wrapper + retryable outbox engine + secret-guarded dispatch route
  - phase: 05-05
    provides: evaluate-and-enqueue sweep piggybacked onto both price-refresh entry points
  - phase: 05-06
    provides: Telegram linking handshake Server Actions + redeem/read helpers + deploy-gated webhook route
  - phase: 05-07
    provides: price-alert CRUD Server Actions + getPriceAlerts read
  - phase: 05-08
    provides: /alerts UI rewrite (AlertsTable, AlertFormDialog, TelegramLinkCard, auth-guarded page)
provides:
  - (nothing — verify-only plan; checkpoint reached and honestly deferred, not executed)

key-decisions:
  - "DEFERRED, not fabricated. The blocking human-verify checkpoint was reached; standing user direction from this session is to defer user-gated live verification and record it honestly — no Telegram bot has been created (no TELEGRAM_BOT_TOKEN), and live-DB migration pushes remain consent-gated (neither 20260715230011_csv_import.sql nor 20260716221450_alerts_telegram.sql has been pushed). Matches the 03-06/04-07 deferral precedent (see 04-07-SUMMARY.md)."

requirements-completed: []  # ALRT-01/02/03/05 remain in their prior code-complete/static-verified state; live-behavior confirmation is what this plan defers

duration: ~10min (pre-checkpoint honest-state checks only; live verification not executed)
completed: n/a (deferred)
---

# Phase 5 Plan 09: Live Alerts/Telegram Verification Checkpoint — DEFERRED

**The phase-closing live-verification checkpoint was reached and honestly deferred: no Telegram bot has been created (no `TELEGRAM_BOT_TOKEN`) and neither pending migration has consent to push to the live DB, so the 9-step live E2E could not run — nothing was fabricated, and the environment's true state was re-proven before stopping.**

## What actually happened

This plan's single task is a blocking `checkpoint:human-verify`. Per standing direction for this session, user-gated live verification (bot creation, migration pushes) is deferred and recorded honestly rather than waited on. Per the plan's own contract ("record the whole checkpoint DEFERRED... never a fabricated pass"), this SUMMARY records the deferral, matching the 03-06/04-07 precedent exactly.

## Honestly verified NOW (no bot token, no live-DB migration apply — all run 2026-07-16)

| Check | Result | Meaning |
| ----- | ------ | ------- |
| `npx tsc --noEmit` | clean | Whole codebase (all of Phase 5 through 05-08, plus everything else) still typechecks |
| `npm run build` | clean, `/alerts` and both API routes (`/api/notifications/dispatch`, `/api/telegram/webhook`) listed in the route table | Production build unaffected by anything in this checkpoint |
| `npm run test:telegram` | PASS — "all case groups passed (parse-start-payload/link-token/build-message/classify-send-error correct)" | Pure Telegram logic (05-02) still correct, zero I/O, token-free |
| `npm run test:alerts` | PASS — "all 15 case groups passed (evaluateAlerts level+cooldown trigger rule, null/failed-price exclusion, strict direction boundaries, computeAlertDedupeKey cooldown-window bucket)" | Pure alert evaluation (05-03) still correct, zero I/O |
| `npm run test:import-parse` | PASS — "both broker parsers, instrument matching, and duplicate detection correct against synthetic fixtures" | Regression check: Phase 4's pure import layer untouched by Phase 5 work |
| `npm run test:rls` | honest FAIL — `Could not find the table 'public.import_batches' in the schema cache` | Confirms Phase 4's `csv_import.sql` is STILL genuinely unapplied on the live DB (it runs before the Phase 5 tables in the test file, so the new `price_alerts`/`telegram_links`/`notifications_outbox` RLS assertions never even get reached) — this is real evidence both migrations remain unpushed, not a masked skip |
| `npx supabase migration list` | `LegacyProjectNotLinkedError` — "Cannot find project ref. Have you run supabase link?" | Project not linked; no accidental live-DB linkage exists |
| `.env.local` `TELEGRAM_BOT_TOKEN` / `TELEGRAM_BOT_USERNAME` / `TELEGRAM_WEBHOOK_SECRET` | still the labeled placeholders (`your-telegram-bot-token`, `your-telegram-bot-username`, `your-telegram-webhook-secret`) | No real BotFather bot exists — confirmed by inspection, values never printed |
| `.env.local` `NOTIFY_DISPATCH_SECRET` | a real self-generated hex secret is present | Present but unusable for a live E2E without a real bot token + linked chat to dispatch to |
| `supabase/migrations/` directory | 9 files, most recent two are `20260715230011_csv_import.sql` and `20260716221450_alerts_telegram.sql` | Both are authored and sitting unpushed, exactly as prior plans recorded — nothing new landed |
| `git status --short` | only the pre-existing unrelated dirty files from prior sessions (`HoldingFormDialog.tsx`, `HoldingsTable.tsx`, `src/lib/supabase/portfolio.ts`, `src/lib/types.ts`, `src/server-actions/portfolio.ts`, untracked `LotEditDialog.tsx`) | Confirms this checkpoint made zero source-code writes — verify-only, as the plan's own `<files>` field states |

No live-DB writes occurred. No bot was created. No files were written by this plan other than this SUMMARY, and STATE.md/ROADMAP.md for bookkeeping.

## Deferred items (the entire live checkpoint)

1. **Bot provisioning** — message `@BotFather` → `/newbot` → supply a display name and a `bot`-suffixed username → capture the returned token into `TELEGRAM_BOT_TOKEN` (+ `TELEGRAM_BOT_USERNAME` from the chosen username, + a self-generated `TELEGRAM_WEBHOOK_SECRET`) in `.env.local`. Nothing in this checkpoint can proceed past step 1 (`getMe` token-valid probe) without this.
2. **Migration push (selective, with consent)** — apply `20260715230011_csv_import.sql` AND `20260716221450_alerts_telegram.sql` to the live hosted DB (project `ozkorwkhtamyaavuphhm`). Requires `supabase login` (browser auth gate) + `supabase link --project-ref ozkorwkhtamyaavuphhm` first — neither has been run. **CAUTION carried forward unchanged**: a blanket `supabase db push` would ALSO apply the deliberately-held-back `20260714220438_price_refresh_cron.sql`, which must NEVER be applied until a public deploy exists (Supabase's cloud pg_cron cannot reach `localhost`) — push the two intended files selectively, never the cron migration, until deployment.
3. **`npm run test:rls` green** — the two-user isolation checks for `price_alerts`/`telegram_links`/`notifications_outbox` (including the `telegram_links` UPDATE-affects-zero-rows allowlist-closure proof for both a stranger and the owner) can only run, let alone pass, once both migrations are live.
4. **Live handshake (ALRT-01)** — real `/start` click-through via the `TelegramLinkCard` deep link, `checkTelegramLink` polling and binding a real `chat_id`, confirming an expired/reused token does not re-link.
5. **Live alert creation + display (ALRT-02)** — a real price alert on a held/priced ticker persisting and showing current price vs threshold; duplicate (same ticker+direction) rejection.
6. **Live trigger + cooldown (ALRT-03)** — a real threshold crossing enqueueing exactly one `notifications_outbox` row and delivering ONE Telegram message; a second refresh inside the cooldown window sending NO repeat.
7. **Live outbox retry/dead-letter (ALRT-05)** — a blocked-bot permanent 403 marking the row `failed` and revoking the `telegram_links` row; a retryable failure staying `pending` with `attempts` bumped and a later `POST /api/notifications/dispatch` (bearer-guarded by `NOTIFY_DISPATCH_SECRET`) delivering it.
8. **Dispatch lever guard live proof** — `POST /api/notifications/dispatch` returning 401 without the correct secret (and with an unset secret), confirmed against a running server rather than by code inspection alone.
9. **Webhook activation (deploy-gated)** — `setWebhook` + `getWebhookInfo` against a public HTTPS deploy, plus a fresh `/start` binding via the webhook path instead of the dev poll. Same treatment as `price_refresh_cron.sql` — cannot be verified from `localhost` under any circumstances, deploy is a separate prerequisite from bot/migration.

## Resume path

When the user has created a bot via BotFather and grants migration-push consent:

- Re-run `/gsd:execute-phase 5` (or execute `05-09-PLAN.md` directly). The plan is unchanged and remains the single source of truth for the 9 steps (1-8 token-gated/localhost-runnable, 9 deploy-gated).
- Set `TELEGRAM_BOT_TOKEN` / `TELEGRAM_BOT_USERNAME` / `TELEGRAM_WEBHOOK_SECRET` in `.env.local` (labeled placeholders already in place, ready to be overwritten).
- Sequence: `supabase login` → `supabase link --project-ref ozkorwkhtamyaavuphhm` → `supabase db push` restricted to `20260715230011_csv_import.sql` + `20260716221450_alerts_telegram.sql` ONLY (never `20260714220438_price_refresh_cron.sql` until deployment) → `npm run test:rls` → the 8 token-gated steps in `05-09-PLAN.md`'s `how-to-verify` → deploy → step 9 (webhook).

## Requirements status (deliberately NOT upgraded)

| Requirement | Status | Why |
| ----------- | ------ | --- |
| ALRT-01 (Telegram link handshake) | Code-complete/static-verified | Real `/start` click-through + real `chat_id` capture unproven live |
| ALRT-02 (per-ticker price alerts) | Code-complete/static-verified | Live persistence + current-price-vs-threshold display unproven |
| ALRT-03 (trigger + cooldown) | Code-complete/static-verified | Real threshold crossing + real Telegram delivery + cooldown suppression unproven live |
| ALRT-05 (outbox retry, not lost) | Code-complete/static-verified | Real failure/retry/dead-letter/revoke behavior unproven live |

Phase 5 is NOT claimed live-verified. All 9 plans are closed (8 executed + this checkpoint deferred); the live-verification debt carries in STATE.md's STILL OPEN list, alongside Phase 4's still-outstanding equivalent.

---
*Phase: 05-alerts-telegram*
*Status: DEFERRED — checkpoint reached 2026-07-16, no Telegram bot token yet, no migration-push consent yet*
