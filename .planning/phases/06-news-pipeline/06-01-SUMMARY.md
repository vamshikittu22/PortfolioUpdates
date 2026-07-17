---
phase: 06-news-pipeline
plan: 01
subsystem: database
tags: [postgres, supabase, rls, migration, news, dedup]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: "news_items table (Phase-1 mock-era, symbol-keyed, service-role-write-only RLS)"
  - phase: 02-portfolio-identity
    provides: "instruments table with (isin, exchange) identity"
provides:
  - "news_items extended with title_hash (NEWS-02 dedup), summary_status, summarized_at (NEWS-04 persist-once state)"
  - "news_item_instruments join table linking articles to real instrument identity with FK integrity"
  - "RLS isolation coverage for the new join table's closed write posture"
affects: [06-news-pipeline (all downstream plans: dedup writer, matcher, summarizer, feed reads all depend on this schema)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ALTER-in-a-new-migration for pre-provisioned zero-row tables (price_cache/news_items precedent, no backfill needed)"
    - "Partial-unique-index dedup backstop (title_hash WHERE NOT NULL), mirroring uniq_notifications_outbox_dedupe"
    - "Join table for one-article-to-many-instruments FK integrity, replacing bare TEXT[] symbol arrays"

key-files:
  created:
    - supabase/migrations/20260717120000_news_pipeline.sql
  modified:
    - scripts/rls-isolation-test.ts

key-decisions:
  - "ALTER news_items in place (not drop/recreate) since it holds zero live rows — same argument the price_fx_schema migration used for price_cache"
  - "news_item_instruments carries the exact closed RLS posture as news_items (authenticated SELECT only, no write policy) rather than any per-user ownership shape, since linking is a service-role ingest concern"

patterns-established:
  - "Phase 6 schema foundation: title_hash + url are the two NEWS-02 dedup keys; summary_status ('pending'|'summarized'|'degraded') is the NEWS-04/05 state machine future plans must read/write via service-role client only"

requirements-completed: [NEWS-02, NEWS-04]

# Metrics
duration: 10min
completed: 2026-07-17
---

# Phase 06 Plan 01: News Pipeline Schema Foundation Summary

**New migration ALTERs the pre-provisioned `news_items` table with a title-hash dedup key and a summarize-once state machine, and adds a `news_item_instruments` join table giving news real ISIN+exchange instrument identity — both preserving the deliberately-closed service-role-write-only RLS posture.**

## Performance

- **Duration:** ~10 min
- **Tasks:** 2 completed
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments
- `news_items` extended with `title_hash TEXT`, `summary_status TEXT` (pending/summarized/degraded, default pending), `summarized_at TIMESTAMPTZ` — zero rows, zero backfill risk
- Partial-unique index `uniq_news_items_title_hash` added as the second NEWS-02 dedup key alongside the pre-existing `url UNIQUE`
- New `news_item_instruments` join table (`news_item_id`, `instrument_id` FKs both `ON DELETE CASCADE`, composite PK, optional `matched_via` provenance column) fixes the pre-Phase-2-identity flaw in `affected_symbols TEXT[]` (INFY-NSE vs INFY-NYSE now distinct)
- `news_item_instruments` carries the exact closed RLS posture as `news_items`: authenticated SELECT `USING (TRUE)`, no authenticated write policy
- `scripts/rls-isolation-test.ts` extended with a new check (10th in the file's numbered list) asserting authenticated INSERT into `news_item_instruments` is rejected and authenticated SELECT still works

## Task Commits

Each task was committed atomically:

1. **Task 1: New migration — extend news_items + news_item_instruments join table** - `c820060` (feat)
2. **Task 2: Extend the two-user RLS isolation test for news_item_instruments** - `e8c2df7` (test)

**Plan metadata:** (this commit) - `docs(06-01): complete news-pipeline-schema plan`

## Files Created/Modified
- `supabase/migrations/20260717120000_news_pipeline.sql` - ALTER news_items (title_hash/summary_status/summarized_at + partial-unique index) + new news_item_instruments table with closed RLS
- `scripts/rls-isolation-test.ts` - Extended with news_item_instruments write-hole + read-works assertions (check 10), docstring updated

## Decisions Made
- ALTER news_items in a new migration rather than drop/recreate, since it holds zero live rows (mirrors the `price_fx_schema.sql` treatment of `price_cache`).
- news_item_instruments' RLS posture is a byte-for-byte copy of news_items' closed shape (authenticated read-only), not an ownership-CRUD shape, because linking an article to instruments is exclusively a service-role ingest-time operation, never a user action.

## Deviations from Plan

None - plan executed exactly as written. The migration filename `20260717120000_news_pipeline.sql` specified in the plan already sorted after the latest existing migration (`20260716221450_alerts_telegram.sql`), so no timestamp bump was needed.

## Issues Encountered
None. A concurrent executor (06-02) committed `package.json`/`package-lock.json` changes between this plan's two task commits (`c5e8af3`, landing on top of `e8c2df7`) — verified via `git log --oneline` and `git show <hash> --stat` on both of this plan's commits by exact hash that neither commit's content was swept or altered; both remain clean single-file commits with the migration commit as the test commit's direct parent.

## User Setup Required

None - no external service configuration required. Live migration apply is consent-gated and DEFERRED to the 06-10 checkpoint, per this plan's frontmatter and the project's standing no-Docker/defer-verification convention.

## Next Phase Readiness

- Schema foundation is in place for the rest of Phase 6: the dedup writer (title_hash), the instrument matcher (news_item_instruments), and the summarizer (summary_status/summarized_at) all have their target columns/tables ready to write to via the service-role admin client.
- `npx tsc --noEmit` clean project-wide.
- `npm run test:rls` re-run and honest-FAILs at `import_batches not found` (Phase 4's migration, Phase 5's migration, and now this plan's migration are all still unapplied live) — confirms the deferred state is real, not fabricated, matching the 03-06/04-07/05-09 precedent. Live push (this migration + the two still-pending ones) remains consent-gated, batched at the 06-10 checkpoint.
- No blockers for downstream 06-0x plans that build on this schema.

---
*Phase: 06-news-pipeline*
*Completed: 2026-07-17*

## Self-Check: PASSED

- FOUND: supabase/migrations/20260717120000_news_pipeline.sql
- FOUND: scripts/rls-isolation-test.ts (news_item_instruments assertions present)
- FOUND commit: c820060
- FOUND commit: e8c2df7
