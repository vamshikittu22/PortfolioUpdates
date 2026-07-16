# Phase 5: Alerts + Telegram — Research (Telegram Bot API mechanics)

**Researched:** 2026-07-16
**Domain:** Telegram Bot API (bot provisioning, /start deep-link handshake, getUpdates vs webhook, sendMessage + error taxonomy)
**Scope:** One of three parallel Phase 5 research files. This one covers ONLY the Telegram platform. Sibling files cover outbox/alert-schema and alert-evaluation concerns.
**Confidence:** HIGH overall — every load-bearing claim below was re-verified against core.telegram.org on 2026-07-16 (current Bot API version at verification time: **10.2, released 2026-07-14**), not recalled from training data. Items marked MEDIUM/LOW are flagged inline.

> **No CONTEXT.md exists for Phase 5** (`.planning/phases/05-alerts-telegram/` was empty at research time), so there are no locked user decisions to copy. Constraints below derive from ROADMAP.md, STATE.md precedents, and the phase goal.

<phase_requirements>
## Phase Requirements (this file's slice)

| ID | Description | Research Support |
|----|-------------|-----------------|
| ALRT-01 | Link Telegram account via bot `/start` handshake; chat id captured + allowlisted | Q1 (provisioning/token), Q2 (deep-link handshake + binding threat model), Q3 (receiving the /start update without a public URL) |
| ALRT-03 | Triggered price alert sends a Telegram message with cooldown | Q4 (sendMessage shape, parse_mode, error taxonomy, rate limits), Q5 (raw-fetch wrapper the outbox dispatcher calls) |

(ALRT-02 alert CRUD and ALRT-05 outbox schema/dispatch loop are sibling researchers' scope; this file defines the *Telegram-facing contract* the outbox must satisfy.)
</phase_requirements>

## Summary

Telegram's bot platform is a plain HTTPS JSON API — `https://api.telegram.org/bot<token>/METHOD` — with no SDK requirement, which fits this project's zero-dep fetch-wrapper precedent (`src/lib/prices/fetch-prices.ts`) exactly. The two hard platform facts that shape the plan: **(1) bots cannot message a user until that user messages the bot first**, which is precisely why ALRT-01's `/start` handshake exists and why chat_id capture must precede any alert send; **(2) getUpdates (outbound long/short polling — works from localhost, no public URL) and webhooks (inbound — needs public HTTPS) are mutually exclusive per token**, so dev uses on-demand polling and deploy flips to a secret_token-verified webhook, mirroring the pg_cron deploy-gate precedent from Phase 3.

The user has **not created a bot yet**, so everything touching the real API is token-gated at minimum. But the entire logic layer — deep-link token generation, `/start <payload>` parsing, HTML escaping, sendMessage body building, error classification (429 retry_after / 403 blocked / 400 chat-not-found), cooldown math — is pure and TDD-able now with `node:assert/strict`, matching the 03-02/04-02 pattern.

**Primary recommendation:** raw `fetch` wrapper in `src/lib/telegram/` (no library), HTML parse_mode (never MarkdownV2), on-demand getUpdates poll triggered by a Server Action for the dev-mode handshake, deploy-gated setWebhook with `secret_token` header checked before any Supabase call (mirroring `/api/prices/refresh`).

---

## Q1: Bot provisioning — BotFather, token format, env placement

**Findings (HIGH — verified against core.telegram.org/bots/features and /bots/api, 2026-07-16):**

- Create the bot by messaging **@BotFather** → `/newbot` → supply display name + username. Username must be 5–32 chars, Latin letters/numbers/underscores, **must end in `bot`** (e.g. `folio_intel_bot`). BotFather replies with the auth token.
- **Token format:** `<numeric-bot-id>:<secret>`, e.g. `110201543:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw`. Official warning: "Keep your token secure and store it safely, it can be used by anyone to control your bot."
- **All API calls:** `https://api.telegram.org/bot<token>/METHOD_NAME` — the literal string `bot` prefixes the token in the path. POST with `application/json` body is supported (also form-encoded/multipart; JSON is what we use).
- Sanity check once a token exists: `getMe` (no params) returns the bot's id/username — cheapest "is my token valid" probe.

**Env placement (project precedent):**
- `TELEGRAM_BOT_TOKEN` in `.env.local` (gitignored, real secrets already live there per STATE.md) — server-only, never `NEXT_PUBLIC_`.
- `TELEGRAM_BOT_USERNAME` also as env — the username is needed client-side-ish to render the `t.me/<username>?start=...` link, and it is **not derivable from the token** without calling `getMe`. An env var keeps link rendering pure/token-free; `getMe` at runtime would make rendering the settings page token-gated for no benefit.
- Until the user runs BotFather, use the established labeled-placeholder convention in `.env.local` (Phase 1 precedent).

**Verifiability tiers for the whole phase (use these labels in plans):**

| Tier | What it means here | What falls in it |
|------|--------------------|------------------|
| **Verifiable NOW (no token)** | Pure logic, node:assert tests | link-token generation/encoding, `/start <payload>` parsing, HTML escaping, sendMessage body builder, error-classification function, cooldown logic, offset bookkeeping logic |
| **Token-gated (token exists, still localhost)** | Outbound HTTPS calls — work fine from localhost/Windows, no public URL needed | `getMe`, `getUpdates` polling (the real /start handshake E2E), `sendMessage` to the user's own chat, observing a real 429/403 (block the bot deliberately) |
| **Deploy-gated (public HTTPS URL required)** | Inbound traffic from Telegram's servers | `setWebhook` + secret_token header verification; any pg_cron-scheduled alert evaluation POST (same reason `price_refresh_cron.sql` is held back — Supabase cloud cannot reach localhost:3000) |

Confidence: HIGH.

---

## Q2: The /start deep-link handshake

**Mechanics (HIGH — verified against core.telegram.org/bots/features "Deep linking", 2026-07-16):**

- Link shape: `https://t.me/<bot_username>?start=<payload>`.
- **Payload constraints (official, quoted):** "A-Z, a-z, 0-9, _ and - are allowed. We recommend using base64url to encode parameters with binary and other types of content. The parameter can be up to **64 characters** long."
- When the user opens the link and taps START, the bot receives an ordinary message update whose text is **`/start <payload>`** (single space separator). A bare bot open without deep link yields just `/start`.
- (`?startgroup=` exists for groups — irrelevant here, private-chat linking only.)

**What the update contains (HIGH — verified against Update/Message objects in the Bot API reference):**
- `update.update_id` — queue position identifier (see Q3 for offset semantics).
- `update.message.text` — `"/start <payload>"`.
- `update.message.chat.id` — **this is what ALRT-01 must capture.** Official note: signed 64-bit integer; store as `bigint` in Postgres, never JS `number` parsed from user input paths without care (JSON.parse of Telegram's response is safe — ids fit in double for private chats, but bigint column is the honest type).
- `update.message.from.id` — sender's Telegram user id. For a **private chat, `chat.id === from.id`**, but bind from `chat.id` since that is what `sendMessage` targets. (chat.id==from.id equivalence: MEDIUM — long-standing platform behavior, consistent across community docs; not load-bearing since we only ever use chat.id.)

**Secure binding design (prescriptive; threat = attacker redeems someone else's link token):**

1. Authenticated user clicks "Link Telegram" in settings → Server Action generates a **single-use, high-entropy token**: 32 random bytes → base64url → 43 chars (fits the 64-char limit; charset is exactly the allowed `[A-Za-z0-9_-]`). Node: `crypto.randomBytes(32).toString('base64url')`.
2. Persist `{ token, user_id, created_at, expires_at (e.g. +15 min), used_at: null }` (table shape is the sibling schema-researcher's scope; the contract is: single-use + TTL + owned by exactly one app user).
3. Render `https://t.me/${TELEGRAM_BOT_USERNAME}?start=${token}`.
4. User taps START in Telegram → app later receives `/start <token>` (via Q3's poll or webhook).
5. Handler: parse payload → look up token → reject if unknown/expired/used → bind `chat_id` to that token's `user_id` → mark token used → **the chat_id is now the allowlist** (only bound chat_ids ever receive sends; an unsolicited `/start` with no valid token binds nothing and should get a polite "this bot only talks to linked users" reply or silence).

**Threat analysis:**
- *Attacker claims your token:* requires possessing the 43-char random token before you redeem it — only via link leakage (screenshot/shoulder-surf). Mitigations: single-use, short TTL, and after binding show the claimed Telegram `first_name`/`username` in app settings with an **Unlink** button so a hijack is visible and reversible.
- *You claim someone else's token:* same property, symmetric.
- *Never* encode `user_id` or anything guessable as the payload — the token's entropy IS the auth.
- *Replay:* `used_at` makes re-processing the same update idempotent (matters for Q3's at-least-once polling).

Confidence: HIGH on mechanics, HIGH on the binding pattern (it is the canonical pattern; entropy/TTL/single-use reasoning is first-principles).

---

## Q3: Receiving updates WITHOUT a public URL — polling vs webhook

**getUpdates semantics (HIGH — verified against Bot API reference, 2026-07-16):**

- `getUpdates` is an **outbound HTTPS call from our server to Telegram** — works from a Windows laptop behind NAT with zero public exposure. This is the localhost dev path.
- Parameters: `offset` (first update id to return; an update is **confirmed/deleted once getUpdates is called with offset > its update_id**), `limit` (1–100, default 100), `timeout` (seconds; **0 = short polling**, >0 = long polling; docs say short polling "should be used for testing purposes only" — fine, that's literally what dev mode is), `allowed_updates` (pass `["message"]` to receive only messages).
- Unconfirmed updates are kept **up to 24 hours**, then dropped.
- `update_id`s are sequential-ish but official docs warn the next id can be "chosen randomly instead of sequentially" after long idle periods — treat offsets as opaque watermarks (`max(update_id)+1`), never arithmetic.
- **Mutual exclusivity (official, quoted):** "This method will not work if an outgoing webhook is set up." Calling getUpdates while a webhook is set → **409 Conflict**. Two concurrent getUpdates pollers on one token → **409 "terminated by other getUpdates request"** (verified via multiple community reports; the 409-on-webhook is official). `deleteWebhook` (optionally `drop_pending_updates: true`) flips back to polling mode.

**Is an on-demand "check for /start" poll viable? YES — and it is the recommended dev-mode design:**

When the user clicks **"I've sent /start"** on the linking page (or the page auto-retries every few seconds), a Server Action:
1. Calls `getUpdates` with `timeout: 0`, `allowed_updates: ["message"]` (no offset, or last persisted offset).
2. Scans returned updates for `message.text` starting `/start ` and redeems any valid token per Q2 (single-use `used_at` makes reprocessing idempotent, so even sloppy offset handling can't double-bind).
3. Acknowledges by calling `getUpdates` again with `offset = max(update_id) + 1, limit: 1, timeout: 0` — or persists the offset and passes it next time. Either works; persisting one integer (singleton row or reuse of whatever config table the schema researcher defines) is cleaner and avoids re-scanning 24h of backlog.

Why this beats a persistent poller: no background process to babysit on Windows, no long-lived connection inside a serverless-shaped app, no 409 self-conflict from overlapping pollers (a lone Server Action invoked on click is naturally near-serial; for this single-user app a rare concurrent click yielding a 409 is a benign "try again"). A persistent long-polling loop is the wrong shape for Next.js Server Actions/route handlers entirely.

Failure mode to handle explicitly: if a webhook was ever set (e.g. after a deploy) and you then dev locally, getUpdates returns **409** — surface it honestly ("webhook active; run deleteWebhook or unset it for local dev"), never swallow it.

**Webhook path (deploy-gated — mirror the pg_cron precedent exactly):**

- `setWebhook` params (all verified): `url` (HTTPS, required; empty string removes), `secret_token` — official quote: "A secret token to be sent in a header 'X-Telegram-Bot-Api-Secret-Token' in every webhook request, 1-256 characters. Only characters A-Z, a-z, 0-9, _ and - are allowed." Also `allowed_updates`, `drop_pending_updates` (pass `true` when flipping from dev polling to prod webhook so stale dev updates don't replay), `max_connections` (default 40). Supported inbound ports: 443, 80, 88, 8443 (Vercel = 443, fine).
- Route: `src/app/api/telegram/webhook/route.ts`, `export async function POST(request: Request)` — confirmed against this repo's actual Next.js **16.2.9** bundled docs (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`); Web `Request`/`Response`, same as the existing `/api/prices/refresh/route.ts`.
- **Guard first, exactly like the PRICE_REFRESH_SECRET precedent:** compare `request.headers.get('x-telegram-bot-api-secret-token')` against `TELEGRAM_WEBHOOK_SECRET` env **before** any Supabase client is constructed; 401 on mismatch. Use a constant-time-ish comparison or at minimum an exact string equality on a high-entropy value.
- `getWebhookInfo` (no params) reports current URL/pending count/last error — the deploy-time verification probe.
- Like `price_refresh_cron.sql`: **never set a webhook while only running locally** — Telegram cannot reach localhost, updates would pile up against a dead URL AND getUpdates dev polling would 409. Webhook setup belongs in the deploy checkpoint plan, gated the same way PRICE-02 is.

Confidence: HIGH (all API semantics official; 409-concurrency detail MEDIUM via consistent community sources — [node-telegram-bot-api #550](https://github.com/yagop/node-telegram-bot-api/issues/550) and others).

---

## Q4: sendMessage — call shape, parse_mode, error taxonomy, rate limits

**Call shape (HIGH — verified 2026-07-16):**

```
POST https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/sendMessage
Content-Type: application/json

{ "chat_id": 123456789, "text": "...", "parse_mode": "HTML",
  "link_preview_options": { "is_disabled": true } }
```

- Required: `chat_id` (Integer or String), `text` (String, **max 4096 chars** — truncate alert text defensively before send; over-length is a 400).
- Success: `{ "ok": true, "result": { ...Message } }`. Failure: `{ "ok": false, "error_code": <int>, "description": "<human string>", "parameters": { ... }? }`. **`ok` must be checked — HTTP 200 handling alone is insufficient**, and non-2xx statuses also carry this JSON body.
- `disable_notification: true` exists if a "quiet" alert option is ever wanted; not needed for v1.

**parse_mode — prescriptive: use `"HTML"`, never MarkdownV2:**

- MarkdownV2 requires backslash-escaping **18 characters** everywhere in dynamic text: `_ * [ ] ( ) ~ ` > # + - = | { } . !` — note `.` and `-` appear in *every* price string (`1082.40`, `-2.3%`). Unescaped → the entire send fails with 400 "can't parse entities". This is the platform's best-known footgun.
- HTML mode needs only `&`→`&amp;`, `<`→`&lt;`, `>`→`&gt;` escaped in interpolated values (3-line pure function), and supports `<b> <i> <u> <s> <code> <pre> <a href>` — everything a price alert needs. (Tag list verified against the formatting-options docs.)
- Legacy `Markdown` mode exists but is explicitly superseded; do not use.

**Error taxonomy the outbox dispatcher must classify (this is the Telegram-facing contract for ALRT-05's sibling design):**

| error_code | description (substring to match) | Meaning | Outbox action |
|-----------|----------------------------------|---------|---------------|
| 429 | "Too Many Requests: retry after N" + `parameters.retry_after` (Integer, seconds) | Rate limited | **Retryable** — reschedule not-before now+retry_after; never hammer |
| 403 | "bot was blocked by the user" | User blocked the bot | **Permanent for this chat** — mark chat unreachable, deactivate its sends; only the user can unblock |
| 403 | (can't initiate conversation) | Chat never started the bot | **Permanent** — shouldn't occur if allowlist = handshake-bound chat_ids only |
| 400 | "chat not found" | Bad/stale chat_id | **Permanent** — bad allowlist entry; flag for re-link |
| 400 | "can't parse entities" / "message is too long" | Our payload bug | **Permanent for this payload** — fix builder, don't retry same bytes |
| 5xx / network error / timeout | — | Telegram-side or transit | **Retryable** with backoff |

Official-source status: the 429 shape + `retry_after` + `migrate_to_chat_id` in `ResponseParameters` and the `ok/error_code/description` envelope are **HIGH** (verified verbatim in the Bot API reference, including the example `"Too Many Requests: retry after 23"`). The exact 403/400 description strings are **MEDIUM** — the official reference does not enumerate description strings; they're corroborated by extensive community documentation ([tgkit error list](https://tgkit.io/telegram-error-codes/), library issue trackers). **Prescription: classify on `error_code` first and match description by case-insensitive substring, never exact equality — Telegram says error_code semantics are "subject to change" and descriptions doubly so.** Also HIGH and load-bearing: "Bots can't start conversations with users. A user must either add them to a group or send them a message first" (quoted from core.telegram.org/bots) — the handshake is a hard prerequisite for any send.

**Rate limits (HIGH — quoted from the official Bots FAQ):**
- Per chat: "avoid sending more than one message per second… eventually you'll begin receiving 429 errors."
- Per group: max 20 messages/minute (irrelevant — private chats only).
- Bulk: "not able to broadcast more than about 30 messages per second" (free tier; paid Stars broadcasting raises it — irrelevant at this scale).
- **Impact on outbox dispatch:** for a single-user portfolio app the limits are unreachable in practice, but the dispatcher should still (a) send sequentially per chat_id, not Promise.all-blast, and (b) honor `retry_after` globally when a 429 arrives. That's the entire compliance story; no token-bucket machinery warranted.

---

## Q5: Library choice — raw fetch vs node-telegram-bot-api vs grammY

**Health check (verified against the npm registry, 2026-07-16 — both are alive and current):**

| Library | Latest | Published | Notes |
|---------|--------|-----------|-------|
| `node-telegram-bot-api` | 1.2.0 | 2026-07-14 | Actively maintained; EventEmitter/polling-loop design assumes a long-lived process |
| `grammy` | 1.45.0 | 2026-07-16 | Excellent, 4 deps, has serverless webhook adapters; middleware framework |
| raw `fetch` | — | — | Node 18+/Next.js native; zero deps |

**Prescription: raw fetch.** Evidence-based reasoning, not just preference:
1. Phase 5 needs exactly **four HTTP calls**: `sendMessage`, `getUpdates`, `setWebhook`/`deleteWebhook`, `getMe`. Each is a single JSON POST. A library abstracts nothing we need.
2. The outbox (ALRT-05) requires **owning the raw error envelope** (`error_code`, `description`, `parameters.retry_after`) to drive retry classification. Libraries wrap/re-throw these in library-specific error types — an extra translation layer between us and the contract in Q4.
3. Both libraries are built around **long-running process** patterns (persistent polling loops, middleware pipelines) that fight the Server Action / route-handler shape of this app. grammY's serverless adapter helps for webhooks but is still unnecessary surface.
4. **Direct project precedent:** `src/lib/prices/fetch-prices.ts` — a pure network wrapper that never throws for the batch, returns explicit per-item error results, and keeps parsing in a separately-tested pure function. `src/lib/telegram/` should clone this shape: e.g. `send-message.ts` (network only) + pure `build-alert-message.ts`/`classify-send-error.ts`/`parse-start-payload.ts` (TDD'd now, token-free).

If a library were ever mandated, grammY is the healthier, better-architected choice — but nothing here mandates one. Confidence: HIGH.

---

## Don't Hand-Roll

| Problem | Don't build | Use instead |
|---------|-------------|-------------|
| Link-token entropy | Custom random-string logic | `crypto.randomBytes(32).toString('base64url')` — charset exactly matches deep-link rules |
| MarkdownV2 escaper | 18-char escape function + tests | Sidestep entirely: HTML parse_mode, 3-entity escape |
| Rate-limit token bucket | Client-side throttling machinery | Honor `retry_after` from real 429s; sequential per-chat sends |
| Webhook signature scheme | Custom HMAC of payloads | Telegram's built-in `secret_token` header (that IS the mechanism; Telegram offers no payload signing) |

## Common Pitfalls

1. **MarkdownV2 with unescaped `.`/`-`** → every price alert 400s. Avoid: HTML mode (above).
2. **Setting a webhook, then dev polling 409s** → symptom looks like "polling is broken". Avoid: never setWebhook pre-deploy; on 409 surface "webhook active — deleteWebhook for local dev" honestly (never-fabricate discipline: a 409 is not "no new messages").
3. **Trusting HTTP status alone** → Telegram errors carry the real signal in the JSON body (`ok:false`, `error_code`, `description`, `parameters`). Parse the body on every response.
4. **Retrying 403-blocked forever** → outbox grinds on a permanently dead chat. Classify permanent vs retryable per Q4's table.
5. **Encoding user identity in the deep-link payload** → guessable = hijackable binding. Payload must be a random single-use token only.
6. **Exact-matching error description strings** → they're not contractual. error_code + substring.
7. **Storing chat_id as JS-safe int assumption** → official docs: signed 64-bit; use Postgres `bigint`.

## Prescriptions for the planner

1. **Files:** `src/lib/telegram/` split pure-vs-network exactly like `src/lib/prices/`: pure `parse-start-payload.ts`, `escape-html.ts` (or inline in a `build-*-message.ts`), `classify-send-error.ts`, `link-token.ts`; network `api.ts` (or per-method wrappers) doing raw fetch to `api.telegram.org`. One TDD plan can cover all pure functions with `scripts/telegram-logic-test.ts` (node:assert/strict) — **verifiable now, no token**.
2. **Env:** `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET` in `.env.local` with labeled placeholders until BotFather is run (user action — call it out as a checkpoint prerequisite, like migration-push consent).
3. **Handshake (ALRT-01):** settings-page Server Action generates single-use 43-char base64url token (15-min TTL) → renders `t.me/<username>?start=<token>` → "I've sent /start" button triggers an on-demand `getUpdates(timeout:0, allowed_updates:["message"])` Server Action that redeems tokens and binds `chat.id` (bigint). **No persistent poller. No webhook in dev.**
4. **Webhook plan is deploy-gated** — author `api/telegram/webhook/route.ts` (secret header checked before any Supabase touch, clone of `/api/prices/refresh` guard ordering) but mark live `setWebhook` + verification as deferred, same ledger treatment as `price_refresh_cron.sql`.
5. **Outbox dispatcher contract (feeds sibling ALRT-05 design):** sequential per-chat sends; on 429 reschedule using `parameters.retry_after`; 403-blocked/400-chat-not-found mark the chat dead (and surface in settings for re-link); payload errors (parse/too-long) are builder bugs, not retries; 5xx/network retry with backoff. `sendMessage` wrapper returns explicit result objects, never throws for a batch (fetchPrices precedent).
6. **parse_mode: HTML everywhere.** Truncate to ≤4096 chars before send.
7. **Live-verify checkpoint split:** token-gated checks (getMe, real /start handshake E2E from localhost, real sendMessage, deliberate block→403 observation) can run the moment BotFather is done — no deploy needed; webhook and any cron-driven trigger verification wait for deploy.

## Sources

### Primary (HIGH — fetched 2026-07-16)
- https://core.telegram.org/bots/api — Bot API 10.2 (2026-07-14): getUpdates/setWebhook/deleteWebhook/getWebhookInfo/sendMessage params, Update/Message objects, ResponseParameters, error envelope, formatting/parse modes, token URL scheme
- https://core.telegram.org/bots/features — deep linking (64-char `[A-Za-z0-9_-]` payload, `/start <payload>` delivery), BotFather `/newbot`, token format, username rules
- https://core.telegram.org/bots — "Bots can't start conversations with users…" (quoted)
- https://core.telegram.org/bots/faq — rate limits: 1 msg/sec/chat, 20/min/group, ~30/sec bulk, 429 behavior
- npm registry (live queries) — node-telegram-bot-api 1.2.0 (2026-07-14), grammy 1.45.0 (2026-07-16)
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` (Next.js 16.2.9 bundled docs) — route handler signature for the webhook route

### Secondary (MEDIUM)
- https://tgkit.io/telegram-error-codes/ + https://github.com/yagop/node-telegram-bot-api/issues/550 and similar community reports — exact 403/400 description strings; 409 on concurrent getUpdates. Prescription already hedges: match error_code + substring.

### Recall only (LOW, flagged)
- `chat.id === from.id` in private chats — consistent long-standing behavior, unverified verbatim; not load-bearing (we only use chat.id).

## Metadata

**Confidence breakdown:** API mechanics HIGH (official docs, current version); error description strings MEDIUM (community-corroborated, hedged); library health HIGH (live registry). **Research date:** 2026-07-16. **Valid until:** ~2026-08-16 (Bot API is stable/additive; re-check version banner at plan execution).
