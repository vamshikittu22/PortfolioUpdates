-- Phase 3: schedule the price refresh via pg_cron + pg_net, every 3 hours.
--
-- DEFERRED verification: this environment has no Docker / live Supabase (see
-- .planning/STATE.md), so this job has never actually executed. It is reviewed for
-- correctness now (SQL review + typecheck of the endpoint it calls); live execution
-- is confirmed in plan 03-06's checkpoint once a real Supabase project + deployed
-- domain exist.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- The refresh URL and secret are read from Postgres custom settings, NOT hardcoded, so
-- this file contains no secret and is safe to commit. Before this job can run for real,
-- an operator runs the following ONCE against the live project (never via a migration
-- file, so the secret never enters git history):
--   ALTER DATABASE postgres SET app.settings.price_refresh_url = 'https://<deployed-domain>/api/prices/refresh';
--   ALTER DATABASE postgres SET app.settings.price_refresh_secret = '<value of PRICE_REFRESH_SECRET from .env.local / Vercel env>';
-- Until that's done, current_setting(..., true) returns NULL and net.http_post's target
-- URL is NULL — the job fails loudly (visible in cron.job_run_details), not silently.

SELECT cron.schedule(
  'refresh-price-cache-every-3h',
  '0 */3 * * *', -- every 3 hours, on the hour
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.price_refresh_url', true),
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.price_refresh_secret', true),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
