-- Phase 7: schedule the daily digest via pg_cron + pg_net, once a day.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- DEFERRED / DEPLOY-GATED — DO NOT APPLY THIS MIGRATION WHILE RUNNING LOCALLY.
-- ═══════════════════════════════════════════════════════════════════════════
-- This job POSTs to a PUBLIC URL that Supabase's cloud infrastructure must be
-- able to reach. This project currently runs only on localhost:3000, which
-- Supabase's cloud cannot reach. Applying this migration before a real deploy
-- exists would schedule a pg_cron job that silently fails every single day
-- (net.http_post against an unreachable/placeholder URL). It joins
-- `20260714220438_price_refresh_cron.sql` on the never-apply-locally hold-back
-- list (see .planning/STATE.md "STILL OPEN" item 1/2) — apply ONLY at deploy
-- time, alongside that file, and this is additionally recorded as a
-- deploy-deferred item in 07-05.
--
-- One-time operator setup (NEVER via a migration file, so no secret ever enters
-- git history) — run ONCE against the live project after deploying:
--   ALTER DATABASE postgres SET app.settings.digest_run_url = 'https://<deployed-domain>/api/digest/run';
--   ALTER DATABASE postgres SET app.settings.digest_run_secret = '<value of DIGEST_RUN_SECRET from .env.local / Vercel env>';
-- Until that's done, current_setting(..., true) returns NULL and net.http_post's
-- target URL is NULL — the job fails LOUDLY (visible in cron.job_run_details),
-- never silently, matching the price_refresh_cron.sql precedent.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- pg_cron evaluates cron expressions in UTC. Once daily at 03:15 UTC == 08:45
-- IST (IST is a fixed UTC+5:30 offset, no DST) — deliberately 15 minutes after
-- the 03:00 UTC tick of the 3-hourly price refresh (price_refresh_cron.sql),
-- so the digest composes from prices at most ~15 minutes old.
SELECT cron.schedule(
  'daily-digest-0845-ist',
  '15 3 * * *', -- 03:15 UTC == 08:45 IST daily; runs 15 min after the 03:00 UTC price refresh
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.digest_run_url', true),
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.digest_run_secret', true),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
