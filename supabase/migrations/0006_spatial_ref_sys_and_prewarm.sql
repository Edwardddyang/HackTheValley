-- Address search reads the trigram index and the matching address_points rows. When the project's disk I/O is
-- throttled, a few dozen uncached page reads push bb_geocode past the API's 3 s statement timeout. pg_prewarm
-- loads both into shared buffers (about 80 MB of 224 MB). Buffers are cleared on restart: re-run the two
-- pg_prewarm calls after a restart or an ETL reload if search slows down.
--
-- Not fixable here: the Security Advisor's "RLS disabled" on public.spatial_ref_sys. PostGIS's table is owned by
-- supabase_admin, which also granted the API roles write access to it, so neither ALTER TABLE ... ENABLE ROW
-- LEVEL SECURITY nor REVOKE works from the postgres role (the REVOKE is silently a no-op). The publishable key
-- is only used server-side by the app, so it isn't shipped to browsers.
create extension if not exists pg_prewarm with schema extensions;
select extensions.pg_prewarm('public.address_points_full_trgm');
select extensions.pg_prewarm('public.address_points');
