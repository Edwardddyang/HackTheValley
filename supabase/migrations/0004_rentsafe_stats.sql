-- City-wide RentSafeTO context for the inspection panel.
--
-- 0003 is used by the integrate/best-of-both branch (apartment registrations, CMHC rents) and
-- is already applied to the shared database, so this file is 0004 to avoid a number clash.

create or replace function bb_rentsafe_stats()
returns jsonb language sql stable as $$
    -- Each building's latest evaluation that uses the 2023+ scoring (older scores aren't comparable).
    select jsonb_build_object(
        'median_score', percentile_cont(0.5) within group (order by score),
        'buildings', count(*),
        'scoring', '2023+',
        'note', 'Median of each RentSafeTO building''s latest evaluation under the 2023+ scoring.')
      from rentsafe_evaluations
     where is_latest and schema_version = '2023+' and score is not null
$$;

grant execute on function bb_rentsafe_stats() to anon, authenticated;
