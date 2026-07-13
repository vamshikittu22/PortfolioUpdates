# Codebase Concerns

**Analysis Date:** 2026-07-13

## Tech Debt

**Mock Data Embedded Throughout Codebase:**
- Issue: 1147 lines of hardcoded mock research data and 246 lines of mock YouTube data. Demo credentials in login flow. Production code depends on fallback mock systems.
- Files: `src/lib/research/mock-research-data.ts`, `src/lib/mock-youtube-data.ts`, `src/app/login/page.tsx`, `src/store/usePortfolioStore.ts`
- Impact: Cannot distinguish between real and demo data. Mock data complicates production deployment. Hard to test actual integrations.
- Fix approach: Migrate mock data to separate fixtures directory. Implement feature flags to control mock vs. real data paths. Create actual authentication system before production.

**Fragile HTML Scraping with Regex:**
- Issue: YouTube channel scraping relies on regex patterns to extract channel IDs, names, and handles from HTML. Patterns are brittle and fail silently.
- Files: `src/lib/youtube-scraper.ts` (lines 45-98)
- Impact: Channel scraping will break when YouTube changes HTML structure. No graceful degradation beyond error message.
- Fix approach: Use YouTube's official API instead of scraping. Implement pattern versioning with fallbacks. Add monitoring for regex match failures.

**Oversized API Routes:**
- Issue: Research analysis route is 683 lines with embedded prompt templates, fallback generation logic, and data transformation. YouTube scanning route is 246 lines.
- Files: `src/app/api/research/analyze/route.ts`, `src/app/api/youtube/scan/route.ts`
- Impact: Hard to test, maintain, and debug. Single points of failure. Difficult to extend without affecting entire route.
- Fix approach: Extract prompt generation to `src/lib/prompts/research.ts`. Extract fallback report generation to `src/lib/research/fallback-report.ts`. Extract YouTube analysis to `src/lib/youtube/analysis.ts`.

**File System Caching with No Cleanup:**
- Issue: Research reports cached to `src/lib/research/cache` directory. No cache invalidation strategy, no size limits, no cleanup policy.
- Files: `src/app/api/research/analyze/route.ts` (lines 39-54)
- Impact: Cache can grow unbounded. Stale data served indefinitely. Cache bypass not possible without manual deletion.
- Fix approach: Implement Redis-based caching instead of file system. Add TTL (time-to-live) of 24 hours for research reports. Add cache invalidation endpoint for manual refreshes.

**Inconsistent Error Handling:**
- Issue: Error handling varies across files. Some use try-catch with console.error, others silently fail and return null. Generic catch blocks swallow important details.
- Files: `src/lib/research/yahoo-finance.ts` (lines 117-120), `src/lib/youtube-scraper.ts` (lines 61, 124, 181)
- Impact: Difficult to debug failures in production. Missing context about what went wrong. Silent failures lead to fallback chains that mask root causes.
- Fix approach: Create centralized error handling utility. Use structured logging with error context. Implement error boundaries at API routes. Track error types and rates.

---

## Known Bugs

**Cookie Parsing Race Condition:**
- Symptoms: Login sometimes fails or redirects incorrectly. Cookie value may not be decoded properly.
- Files: `src/app/(dashboard)/layout.tsx` (lines 90-92)
- Trigger: User logs in and navigates to dashboard immediately. Cookie regex: `/(^| )foliointel-session=([^;]+)/` may match partial values.
- Workaround: Refresh page or try logging in again. Currently, the code uses a simple regex to extract the email from the cookie string without proper URL decoding in all cases.

**JSON Parse Errors from AI APIs Not Caught:**
- Symptoms: API returns 500 error even though request appeared to succeed. Report not generated.
- Files: `src/app/api/research/analyze/route.ts` (line 342)
- Trigger: Gemini API returns malformed JSON or wraps response in unexpected markdown. `JSON.parse()` throws but is caught by generic handler, triggering fallback.
- Workaround: Fallback mechanism generates partial mock data. Real issue hidden.

**Yahoo Finance Data Fetch Silently Fails:**
- Symptoms: Stock prices show as 0.0 or fallback values. Real live data never appears even when API is available.
- Files: `src/lib/research/yahoo-finance.ts` (lines 46-120)
- Trigger: Network timeout, rate limiting, or Yahoo changing response structure. Function returns `null` with no logging of actual error.
- Workaround: None—fallback to simulated data. User never knows if prices are real or mock.

---

## Security Considerations

**Critical: Hardcoded Demo Credentials in Source Code:**
- Risk: Login page contains hardcoded credentials (`abc@g.com` / `asdfg`) that allow anyone with source code access to authenticate. Credentials appear in client-side code and git history.
- Files: `src/app/login/page.tsx` (lines 8-9, 42)
- Current mitigation: Credentials are marked as "Demo Account" in UI banner. Code is in private repo.
- Recommendations: 
  - Remove hardcoded credentials immediately. Implement real Supabase authentication.
  - Use environment variables for demo credentials (separate from source).
  - Implement login form that delegates to Supabase Auth instead of client-side validation.
  - Use proper JWT tokens instead of simple cookies.

**Critical: Insecure Authentication via Plain Cookie:**
- Risk: Session cookie `foliointel-session` contains raw email with no encryption, signature, or expiration validation. Can be forged by client.
- Files: `src/app/login/page.tsx` (line 44), `src/utils/supabase/middleware.ts` (lines 31-32)
- Current mitigation: Validation only checks if cookie exists (line 38 in middleware). No verification of content.
- Recommendations:
  - Replace with Supabase session tokens (use `@supabase/ssr` already imported).
  - Implement JWT with signature verification.
  - Add session expiration (current: 7 days, no refresh logic).
  - Validate session server-side, not just client presence.

**Critical: Unprotected API Endpoint for API Key Storage:**
- Risk: `POST /api/settings/keys` endpoint accepts API keys from any request and writes them to `.env.local` file system. No authentication check.
- Files: `src/app/api/settings/keys/route.ts` (lines 16-54)
- Current mitigation: None—any request can set API keys.
- Recommendations:
  - Add authentication check: verify `auth.uid()` from Supabase session.
  - Encrypt API keys in database instead of file system.
  - Use Supabase vault or AWS Secrets Manager for key storage.
  - Add rate limiting to prevent brute force key injection.
  - Log all key mutations for audit trail.

**High: API Keys Written to Source Directory:**
- Risk: Keys written to `src/lib/research/cache` via fs operations. Could be accidentally committed or exposed in backups.
- Files: `src/app/api/research/analyze/route.ts` (line 54)
- Current mitigation: `.env.local` is in .gitignore, but sync file operations are fragile. Potential for race conditions.
- Recommendations:
  - Move cache to system temp directory or Redis.
  - Never write secrets to source tree. Use secure storage.
  - Implement file permissions check to ensure cache is not world-readable.

**High: No Input Validation on API Requests:**
- Risk: API routes accept user input with minimal validation. `ticker` param accepts any string, `provider` in research route not validated against allowed list.
- Files: `src/app/api/research/analyze/route.ts` (line 18), `src/app/api/youtube/analyze/route.ts` (line 15)
- Current mitigation: Ticker is checked against `REGISTERED_STOCKS` (line 60), but provider is not validated.
- Recommendations:
  - Validate all inputs with schema validation (use Zod or similar).
  - Whitelist allowed providers: `['gemini', 'openai', 'claude']`.
  - Add rate limiting per user/IP.
  - Implement request signing for API endpoints.

**Medium: Headers Used for YouTube Scraping May Be Detected:**
- Risk: Using Chrome user-agent and standard headers for YouTube scraping may get flagged or blocked.
- Files: `src/lib/youtube-scraper.ts` (lines 5-10)
- Current mitigation: Standard browser headers provided.
- Recommendations:
  - Switch to YouTube API (official).
  - If scraping required, rotate user-agents and add delays.
  - Implement circuit breaker to stop scraping when rate-limited.

---

## Performance Bottlenecks

**Blocking File System Operations in API Routes:**
- Problem: `fs.writeFileSync()` and `fs.readFileSync()` block the entire request handler thread.
- Files: `src/app/api/settings/keys/route.ts` (lines 29, 47)
- Cause: Using synchronous I/O in Node.js request handlers. Each key update blocks other requests.
- Improvement path: 
  - Replace with async `fs/promises` operations.
  - Better: Move to database (Supabase storage or Postgres).
  - Add queueing system (Bull, RabbitMQ) for async key updates.

**AI API Rate Limiting Not Implemented:**
- Problem: Gemini API has rate limits (15 req/min for free tier). No throttling or queue management.
- Files: `src/app/api/research/analyze/route.ts` (line 95), `src/lib/ai-provider.ts`
- Cause: Each request immediately calls AI API. No backpressure or queuing.
- Improvement path:
  - Implement request queue with max concurrency.
  - Add exponential backoff for rate-limit responses.
  - Cache popular research requests.
  - Implement user-level quota system.

**Multiple Fallback Chains Compound Latency:**
- Problem: Research analysis has 4-layer fallback (Gemini → Yahoo Finance → Hybrid → Mock). Each failure adds latency.
- Files: `src/app/api/research/analyze/route.ts` (lines 29-423)
- Cause: Sequential fallbacks without early exit optimization.
- Improvement path:
  - Implement parallel requests where possible (fetch all data upfront).
  - Pre-warm cache for popular stocks.
  - Use stale-while-revalidate strategy.
  - Set timeout limits to fail fast instead of waiting.

**Large Gemini Prompts Not Optimized:**
- Problem: Research prompt is 331 lines with full schema and examples embedded. Sent with every request.
- Files: `src/app/api/research/analyze/route.ts` (lines 103-331)
- Cause: Full schema specification in every prompt. No prompt caching or template reuse.
- Improvement path:
  - Extract schema to separate file, reference by URL or ID.
  - Use Gemini prompt caching feature if available.
  - Create prompt templates with placeholders.
  - Pre-compute and cache common scenarios.

---

## Fragile Areas

**YouTube Channel Scraping (HTML Pattern Matching):**
- Files: `src/lib/youtube-scraper.ts`
- Why fragile: Depends on exact HTML structure from YouTube. Four fallback regex patterns for channel ID extraction (lines 66-70). If all fail, generic error returned.
- Safe modification: 
  - Add comprehensive logging of HTML snippets that fail to match.
  - Implement pattern versioning (old patterns keep working).
  - Test against archived YouTube HTML to verify patterns.
  - Plan migration to YouTube API.
- Test coverage: None. No unit tests for regex extraction patterns.

**JSON Parsing from LLM APIs (Gemini, Claude):**
- Files: `src/app/api/research/analyze/route.ts` (lines 336-342), `src/lib/ai-provider.ts` (lines 87-107)
- Why fragile: AI models sometimes wrap JSON in markdown (```json...```), sometimes return invalid JSON. Regex-based cleanup (lines 336-340) may not catch all edge cases.
- Safe modification:
  - Add comprehensive error logging with actual response body.
  - Test with 20+ real Gemini responses to verify cleanup logic.
  - Implement schema validation after parsing (Zod).
  - Add retry logic with prompt adjustment.
- Test coverage: None. No tests for malformed JSON responses.

**Fallback Report Generation (Hybrid Fallback):**
- Files: `src/app/api/research/analyze/route.ts` (lines 430-683)
- Why fragile: 254-line function that generates fake but realistic-looking financial data. If schema changes, this function must be manually updated.
- Safe modification:
  - Extract to separate `src/lib/research/fallback-report.ts`.
  - Add type-safety checks to ensure generated report matches `ResearchReport` schema.
  - Unit test with TypeScript strict mode.
  - Create function to auto-generate skeleton reports from schema.
- Test coverage: None. No tests for report structure validity.

**Cookie-Based Session Management:**
- Files: `src/app/login/page.tsx`, `src/utils/supabase/middleware.ts`, `src/app/(dashboard)/layout.tsx`
- Why fragile: Cookie value is plain email. Regex parsing with `/(^| )foliointel-session=([^;]+)/`. No signature, expiration, or validation.
- Safe modification:
  - Never rely on cookie value for auth. Use server-side session lookup.
  - Implement Supabase JWT tokens instead.
  - Add signature verification (HS256).
  - Set secure, httpOnly, sameSite=Strict flags.
- Test coverage: None. No tests for session lifecycle.

---

## Scaling Limits

**File System Cache (src/lib/research/cache):**
- Current capacity: Unlimited growth. Single directory stores all cached reports.
- Limit: Filesystem constraints (inode count, disk space). No cleanup means eventually runs out of space. Response times degrade as directory grows.
- Scaling path:
  - Migrate to Redis for in-memory caching with TTL.
  - Implement SQLite for persistent cache with time-based cleanup.
  - Use cloud storage (S3) with lifecycle policies.
  - Add cache size monitoring and alerts.

**Mock Data in Memory:**
- Current capacity: 3 hardcoded accounts with ~50 holdings each. Mock arrays duplicated across files.
- Limit: Adding new mock data requires code changes. No dynamic mock generation. Cannot scale to 100+ accounts.
- Scaling path:
  - Move mock data to database with seeder scripts.
  - Remove mock data entirely and use real Supabase data.
  - For testing, generate random mock data on startup.

**AI API Concurrency:**
- Current capacity: Gemini free tier = 15 requests/minute. No queue management.
- Limit: 15 simultaneous users requesting research → queue of 100+ requests within 5 seconds. Requests fail with rate limit error.
- Scaling path:
  - Implement request queue (Bull, RabbitMQ).
  - Add user-level quotas (e.g., 5 reports/day per user).
  - Cache popular research (top 50 stocks cached for 24h).
  - Upgrade to Gemini paid tier if scaling beyond hobby use.

**Database RLS Policies:**
- Current capacity: Supabase auto-scales, but RLS policy evaluation cost unknown.
- Limit: Row-level security policies are checked on every query. With complex policies on 10+ tables and 10M+ rows, query latency increases.
- Scaling path:
  - Profile RLS query performance.
  - Use Supabase analytics to identify slow policies.
  - Consider caching policy results at application level.
  - Archive old holdings/news data to separate schema.

---

## Dependencies at Risk

**@google/generative-ai (^0.24.1):**
- Risk: Early-stage SDK. API stability not guaranteed. Free tier has rate limits and may change.
- Impact: If API changes, entire research feature breaks. No vendor-neutral abstraction layer.
- Migration plan:
  - Create `src/lib/ai-interface.ts` that abstracts AI provider details.
  - Implement adapters for Claude, OpenAI as alternates.
  - Current code attempts this but incompletely (see `src/lib/ai-provider.ts`).

**youtube-transcript (^1.3.1):**
- Risk: Unmaintained library. YouTube API changes may break it. No official support.
- Impact: Transcript fetching will fail without warning when YouTube changes APIs.
- Migration plan:
  - Replace with `youtube-captions-extractor` or YouTube Data API.
  - Implement fallback to manual captions if API fails.
  - Add monitoring for transcript fetch failures.

**Supabase (@supabase/supabase-js, @supabase/ssr):**
- Risk: Production dependency on external service. If Supabase goes down, app loses auth and data access.
- Impact: Complete outage for users (no auth, no holdings, no news).
- Migration plan:
  - This is acceptable for early-stage app. Plan for self-hosted PostreSQL if needed at scale.
  - Implement offline-first architecture with service worker caching.
  - Add fallback to mock data when Supabase unavailable.

**Next.js 16.2.9:**
- Risk: Very recent version. May have bugs or breaking changes in minor updates.
- Impact: Build failures, unexpected behavior, security vulnerabilities in newer versions.
- Migration plan:
  - Use exact version in package.json (currently uses `^` which allows any 16.x.x).
  - Monitor Next.js security advisories.
  - Test thoroughly before upgrading patch versions.

---

## Missing Critical Features

**Authentication:**
- Problem: No real authentication. Demo cookie-based system only. Cannot support multiple real users.
- Blocks: User data isolation, multi-account management, secure API key storage.

**API Key Management UI:**
- Problem: API keys can be set via POST endpoint but no UI to view or revoke them. No audit log.
- Blocks: User-friendly configuration. Cannot see which API keys are active.

**Error Logging & Monitoring:**
- Problem: Console.error and console.warn only. No error aggregation, no production monitoring, no alerts.
- Blocks: Detecting issues in production. Cannot diagnose user-reported problems.

**Testing:**
- Problem: Zero automated tests. No unit tests, integration tests, or E2E tests.
- Blocks: Confidence in deployments. Cannot safely refactor. High bug risk.

**Rate Limiting & Quotas:**
- Problem: No rate limiting on API endpoints. No user quotas. DoS vulnerability.
- Blocks: Scaling to production. API can be abused.

**Data Validation & Schema Enforcement:**
- Problem: Minimal input validation. No schema validation library. Relies on TypeScript (compile-time only).
- Blocks: Runtime safety. Invalid data can corrupt database or AI API calls.

---

## Test Coverage Gaps

**AI Provider Analysis (youtube-transcript, gemini):**
- What's not tested: Malformed JSON responses, timeout scenarios, fallback logic for missing transcripts, multilingual transcript handling.
- Files: `src/lib/ai-provider.ts`, `src/app/api/youtube/analyze/route.ts`
- Risk: Gemini API changes or returns unexpected format → app crashes silently with generic error. Fallback chain makes debugging hard.
- Priority: High

**Research Report Compilation:**
- What's not tested: Fallback report generation structure validity, schema compliance for all conditional paths, Gemini prompt injection scenarios.
- Files: `src/app/api/research/analyze/route.ts`
- Risk: Invalid reports cached and served to users. Schema updates break fallback generation.
- Priority: High

**YouTube Channel Scraping:**
- What's not tested: Regex extraction patterns against real YouTube HTML, rate limiting behavior, channel metadata edge cases.
- Files: `src/lib/youtube-scraper.ts`
- Risk: Scraper silently fails to extract channel ID. Pattern changes break without notice.
- Priority: Medium

**Authentication & Session Management:**
- What's not tested: Session lifecycle (creation, expiration, renewal), cookie validation, CSRF protection, unauthorized access scenarios.
- Files: `src/app/login/page.tsx`, `src/utils/supabase/middleware.ts`
- Risk: Security vulnerabilities in auth flow not caught. Session fixation attacks possible.
- Priority: Critical

**Database RLS Policies:**
- What's not tested: Row-level security enforcement, cross-user data access prevention, policy edge cases.
- Files: `supabase/schema.sql`
- Risk: Users can access other users' data due to misconfigured RLS.
- Priority: Critical

**Error Scenarios & Edge Cases:**
- What's not tested: Network timeouts, partial data failures, race conditions, concurrent requests, out-of-memory scenarios.
- Files: All API routes
- Risk: Unpredictable behavior under load or poor network conditions.
- Priority: Medium

---

*Concerns audit: 2026-07-13*
