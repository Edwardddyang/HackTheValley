-- The app's API key queries as the anon role, which Supabase limits to 3 s per statement. When the address search
-- or a brief has to read from a cold cache on the project's throttled disk, both of the app's tries (brief.ts rpc)
-- could pass 3 s and the page showed "didn't respond in time". 8 s matches the authenticated role's default.
-- PostgREST applies role settings per request once it reloads its config.
alter role anon set statement_timeout = '8s';
notify pgrst, 'reload config';
