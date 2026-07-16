# Deferred Items — Phase 05

## 05-06 execution session (2026-07-16)

- **`DispatchSummary` not exported from `src/lib/notifications/outbox.ts`** —
  `npx tsc --noEmit` fails on `src/app/api/prices/refresh/route.ts` and
  `src/server-actions/prices.ts`, both of which `import { ..., type
  DispatchSummary } from '@/lib/notifications/outbox'` but that module only
  re-exports `enqueueNotifications`/`dispatchOutbox`, not the `DispatchSummary`
  type (it's declared in `src/lib/notifications/types.ts`). Both affected
  files are owned by the concurrently-running 05-05 executor
  (`src/app/api/prices/refresh/route.ts`, `src/server-actions/prices.ts` —
  explicitly out of scope for 05-06 per the executor's environment notes).
  Out of scope for 05-06: not caused by this plan's changes (`src/lib/telegram/redeem.ts`,
  `src/lib/telegram/read.ts`, `src/server-actions/telegram.ts`,
  `src/app/api/telegram/webhook/route.ts`), and not this plan's files to
  touch. Left unfixed; 05-05's own executor should either re-export
  `DispatchSummary` from `outbox.ts` or import it directly from
  `./types` in its own files.
