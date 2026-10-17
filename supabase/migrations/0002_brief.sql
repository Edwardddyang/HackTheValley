-- Block Brief: read access + the functions that build an address briefing.
--
--   bb_geocode(q)                  -> candidate address points for a typed address
--   bb_brief(address_point_id, r)  -> one jsonb document with every section of the brief
--
-- Every fact carries a "cite" object pointing at the row(s) it came from:
--   {"dataset": <table>, "file": <file name>, "row": <source_row_id>}            one row
--   {"dataset": ..., "file": ..., "row_count": n, "sample_rows": [...]}          an aggregate
-- The brief only reports what is in the tables; interpretation is left to the reader
-- (or to an AI summary that must cite these objects).

-- Read-only access for the API ----------------------------------------------
-- Supabase exposes the public schema over its API. RLS with a select-only policy lets the
-- anon/authenticated roles read this open data and nothing else; the ETL connects as the
-- table owner, which bypasses RLS.
do $$
declare t text;
begin
    foreach t in array array[
        'sources', 'address_points', 'rentsafe_evaluations', 'building_permits',
        'development_applications', 'intersections', 'sr311_request_types',
        'service_requests_311', 'neighbourhoods', 'wards', 'crime_rates',
        'neighbourhood_population', 'neighbourhood_profile_variables',
        'neighbourhood_profiles', 'ward_profiles'
    ] loop
        -- Supabase grants ALL on new tables to the API roles by default, and RLS does not
        -- cover TRUNCATE, so privileges are cut back to SELECT as well.
        execute format('revoke all on table %I from anon, authenticated', t);
        execute format('grant select on table %I to anon, authenticated', t);
        execute format('alter table %I enable row level security', t);
        execute format('drop policy if exists read_open_data on %I', t);
        execute format('create policy read_open_data on %I for select to anon, authenticated using (true)', t);
    end loop;
end $$;

-- Older databases: sources gained period columns after 0001 was first applied.
alter table sources add column if not exists period_from date;
alter table sources add column if not exists period_to   date;

alter table rentsafe_evaluations add column if not exists is_latest boolean not null default false;

-- The census section compares a neighbourhood with all 158 for each variable.
create index if not exists neighbourhood_profiles_row on neighbourhood_profiles (row_number);

-- Citations ------------------------------------------------------------------
create or replace function bb_cite(p_source_id smallint, p_row bigint)
returns jsonb language sql stable as $$
    select jsonb_build_object('dataset', s.dataset, 'file', s.file_name, 'row', p_row)
      from sources s where s.source_id = p_source_id
$$;

create or replace function bb_cite_many(p_source_id smallint, p_rows bigint[])
returns jsonb language sql stable as $$
    select jsonb_build_object('dataset', s.dataset, 'file', s.file_name,
                              'row_count', coalesce(cardinality(p_rows), 0),
                              'sample_rows', to_jsonb(p_rows[1:5]))
      from sources s where s.source_id = p_source_id
$$;

-- Geocoding --------------------------------------------------------------------
-- Address Points spell addresses like "100 Queen St W". Normalise common long forms so
-- "100 queen street west, Toronto ON" matches, and require the house number to match exactly
-- (trigram similarity alone ranks "1000 Queen St W" close to "100 Queen St W").
create or replace function bb_normalize_address(q text)
returns text language sql immutable as $$
    select trim(regexp_replace(
           regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
           regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
           regexp_replace(regexp_replace(regexp_replace(regexp_replace(
               lower(split_part(q, ',', 1)),                     -- drop ", Toronto, ON M5V ..."
               '^\s*(unit|apt|suite|#)\s*\S+\s*[-,]?\s*', ''),    -- leading unit
               '^\s*\d+\s*-\s*(\d+)', '\1'),                       -- "1203-100 ..." -> "100 ..."
               '\mstreet\M', 'st', 'g'), '\mavenue\M', 'ave', 'g'),
               '\mroad\M', 'rd', 'g'), '\mdrive\M', 'dr', 'g'),
               '\mboulevard\M', 'blvd', 'g'), '\mcrescent\M', 'cres', 'g'),
               '\mcourt\M', 'crt', 'g'), '\mplace\M', 'pl', 'g'),
               '\mterrace\M', 'terr', 'g'), '\msquare\M', 'sq', 'g'),
               '\m(west)\M', 'w', 'g'), '\m(east)\M', 'e', 'g'),
               '\s+', ' ', 'g'))
$$;

create or replace function bb_geocode(q text, max_results int default 5)
returns table (address_point_id bigint, address text, municipality text, ward_number smallint,
               lat double precision, lon double precision, similarity real)
language sql stable as $$
    with n as (select bb_normalize_address(q) as nq,
                      substring(bb_normalize_address(q) from '^(\d+[a-z]?)\s') as num)
    select a.address_point_id, a.address_full, a.municipality, a.ward_number,
           st_y(a.geom), st_x(a.geom), similarity(lower(a.address_full), n.nq)
      from address_points a, n
     where lower(a.address_full) % n.nq
       and (n.num is null or lower(a.address_full) like n.num || ' %')
     order by similarity(lower(a.address_full), n.nq) desc, a.address_point_id
     limit max_results
$$;

-- The brief --------------------------------------------------------------------
create or replace function bb_brief(p_address_point_id bigint, p_radius_m int default 500)
returns jsonb language plpgsql stable as $$
declare
    a         address_points%rowtype;
    pt        geography;
    result    jsonb := '{}';
    v         jsonb;
begin
    select * into a from address_points where address_point_id = p_address_point_id;
    if not found then
        return null;
    end if;
    pt := a.geom::geography;

    -- Address -------------------------------------------------------------------
    result := result || jsonb_build_object('address', jsonb_build_object(
        'address_point_id', a.address_point_id,
        'address', a.address_full,
        'municipality', a.municipality,
        'lat', st_y(a.geom), 'lon', st_x(a.geom),
        'radius_m', p_radius_m,
        'cite', bb_cite(a.source_id, a.source_row_id)));

    -- Area: neighbourhood and ward containing the point -------------------------
    select jsonb_build_object(
        'neighbourhood', (select jsonb_build_object('hood_id', n.hood_id, 'name', n.area_name,
                                 'classification', n.classification,
                                 'cite', bb_cite(n.source_id, n.source_row_id))
                            from neighbourhoods n where st_covers(n.geom, a.geom) limit 1),
        'ward', (select jsonb_build_object('ward_number', w.ward_number, 'name', w.ward_name,
                        'cite', bb_cite(w.source_id, w.source_row_id))
                   from wards w where st_covers(w.geom, a.geom) limit 1))
      into v;
    result := result || jsonb_build_object('area', v);

    -- Building condition (RentSafeTO) -------------------------------------------
    -- RentSafeTO covers apartment buildings with 3+ storeys and 10+ units. The building is
    -- the evaluated building whose site address equals this address (within 100 m, to keep
    -- the lookup on the spatial index). Evaluated buildings nearby are listed separately.
    with cand as (
        select r.*, st_distance(r.geom::geography, pt) as dist
          from rentsafe_evaluations r
         where st_dwithin(r.geom::geography, pt, 100)
           and upper(r.site_address) = upper(a.address_full)
    ), bldg as (
        select rsn from cand order by evaluation_date desc nulls last limit 1
    ), evals as (
        select r.* from rentsafe_evaluations r join bldg using (rsn)
    ), latest as (
        select * from evals order by evaluation_date desc nulls last limit 1
    ), latest_city as (   -- each building's latest evaluation, when it uses the 2023+ scoring
        select score from rentsafe_evaluations
         where is_latest and schema_version = '2023+' and score is not null
    )
    select case when not exists (select 1 from latest) then jsonb_build_object(
               'in_rentsafe', false,
               'note', 'No RentSafeTO evaluation with this exact address. RentSafeTO only covers apartment buildings with 3+ storeys and 10+ units.')
           else (select jsonb_build_object(
               'in_rentsafe', true,
               'rsn', l.rsn,
               'site_address', l.site_address,
               'property_type', l.property_type,
               'year_built', l.year_built,
               'storeys', l.storeys,
               'units', l.units,
               'latest_evaluation', jsonb_build_object(
                   'date', l.evaluation_date,
                   'score', l.score,
                   'score_scale', '0-100',
                   'item_scale_max', case l.schema_version when '2023+' then 3 else 5 end,
                   'percent_of_buildings_scoring_lower', case when l.schema_version = '2023+' then
                        (select round(100.0 * count(*) filter (where c.score < l.score) / nullif(count(*), 0), 1)
                           from latest_city c) end,
                   'lowest_items', (select jsonb_agg(jsonb_build_object('item', key, 'score', value::int) order by value::int, key)
                                      from (select key, value from jsonb_each_text(l.item_scores)
                                             where value ~ '^\d+$' order by value::int, key limit 5) low),
                   'cite', bb_cite(l.source_id, l.source_row_id)),
               'history', (select jsonb_agg(jsonb_build_object('date', e.evaluation_date, 'score', e.score,
                                     'cite', bb_cite(e.source_id, e.source_row_id)) order by e.evaluation_date desc)
                             from evals e))
             from latest l) end
      into v;
    result := result || jsonb_build_object('building', v);

    -- Permits at this exact address (GEO_ID = address point) --------------------
    select coalesce(jsonb_agg(jsonb_build_object(
               'permit_num', p.permit_num, 'group', p.permit_group, 'type', p.permit_type,
               'work', p.work, 'status', p.status, 'application_date', p.application_date,
               'issued_date', p.issued_date, 'completed_date', p.completed_date,
               'description', p.description, 'est_const_cost', p.est_const_cost,
               'cite', bb_cite(p.source_id, p.source_row_id))
               order by coalesce(p.completed_date, p.issued_date, p.application_date) desc), '[]')
      into v
      from (select * from building_permits where geo_id = p_address_point_id
             order by coalesce(completed_date, issued_date, application_date) desc limit 25) p;
    result := result || jsonb_build_object('permits_at_address', jsonb_build_object(
        'note', 'All active permits; cleared permits only if completed since 2025-01-01.',
        'items', v));

    -- Construction nearby: active permits within the radius ---------------------
    -- "Notable" = new buildings, demolitions, or estimated cost of $1M+. Plumbing,
    -- mechanical and similar small permits are counted but not listed.
    with near as (
        select p.*, st_distance(p.geom::geography, pt) as dist
          from building_permits p
         where p.permit_group = 'active' and st_dwithin(p.geom::geography, pt, p_radius_m)
    )
    select jsonb_build_object(
        'active_permit_count', (select count(*) from near),
        'by_type', (select coalesce(jsonb_agg(jsonb_build_object('type', permit_type, 'count', n) order by n desc), '[]')
                      from (select permit_type, count(*) n from near group by 1 order by 2 desc limit 8) t),
        'notable_definition', 'New Building or Demolition permits, or estimated construction cost of $1,000,000 or more',
        'notable', (select coalesce(jsonb_agg(jsonb_build_object(
                        'permit_num', permit_num, 'type', permit_type, 'status', status,
                        'address', street_address, 'distance_m', round(dist),
                        'issued_date', issued_date, 'description', description,
                        'est_const_cost', est_const_cost, 'dwelling_units_created', dwelling_units_created,
                        'cite', bb_cite(source_id, source_row_id))
                        order by coalesce(est_const_cost, 0) desc, dist), '[]')
                      from (select * from near
                             where permit_type in ('New Building', 'Demolition Folder (DM)')
                                or est_const_cost >= 1000000
                             order by coalesce(est_const_cost, 0) desc, dist limit 10) x),
        'cite', (select bb_cite_many(min(source_id), (array_agg(source_row_id order by dist))[1:5])
                   from near))
      into v;
    result := result || jsonb_build_object('construction_nearby', v);

    -- Development applications within the radius --------------------------------
    -- Status groups (from the City's status values): closed = Closed/Refused/Inactive;
    -- approved = approval granted (incl. by the OMB/OLT); otherwise in review or appeal.
    with near as (
        select d.*, st_distance(d.geom::geography, pt) as dist,
               case when d.status in ('Closed', 'Refused', 'Inactive') then 'closed'
                    when d.status in ('Council Approved', 'OMB Approved', 'Approved', 'Draft Plan Approved',
                                      'Final Approval Completed', 'NOAC Issued', 'Amend Drft Plan App') then 'approved'
                    else 'in_review' end as status_group
          from development_applications d
         where st_dwithin(d.geom::geography, pt, p_radius_m)
    )
    select jsonb_build_object(
        'counts', (select jsonb_object_agg(status_group, n)
                     from (select status_group, count(*) n from near group by 1) t),
        'type_labels', jsonb_build_object('OZ', 'Official Plan / Zoning By-law Amendment',
                                          'SA', 'Site Plan Control', 'CD', 'Draft Plan of Condominium',
                                          'SB', 'Draft Plan of Subdivision', 'PL', 'Part Lot Control'),
        'open', (select coalesce(jsonb_agg(jsonb_build_object(
                     'application_number', application_number, 'type', application_type,
                     'status', status, 'status_group', status_group, 'address', street_address,
                     'distance_m', round(dist), 'date_submitted', date_submitted,
                     'description', description, 'url', application_url,
                     'community_meeting_date', community_meeting_date,
                     'cite', bb_cite(source_id, source_row_id))
                     order by date_submitted desc nulls last), '[]')
                   from (select * from near where status_group <> 'closed'
                          order by date_submitted desc nulls last limit 20) x))
      into v;
    result := result || jsonb_build_object('development_applications', v);

    -- 311 requests ---------------------------------------------------------------
    -- Nearby: only requests reported at an intersection could be placed (~17% of all).
    -- Ward: every request in the ward, which covers all location types.
    with near as (
        select s.* from service_requests_311 s
         where s.geom is not null and st_dwithin(s.geom::geography, pt, p_radius_m)
    ), ward as (
        select s.* from service_requests_311 s
         where s.ward_number = a.ward_number
    )
    select jsonb_build_object(
        'period', (select jsonb_build_object('from', min(period_from), 'to', max(period_to))
                     from sources where dataset = 'service_requests_311'),
        'nearby', jsonb_build_object(
            'note', 'Only requests reported at a street intersection have a location; requests reported by postal code are not included here.',
            'count', (select count(*) from near),
            'top_types', (select coalesce(jsonb_agg(jsonb_build_object(
                              'type', request_type, 'count', n, 'still_open', open_n,
                              'cite', bb_cite_many(sid, rows)) order by n desc), '[]')
                            from (select request_type, count(*) n,
                                         count(*) filter (where status in ('New', 'In Progress')) open_n,
                                         min(source_id) sid, (array_agg(source_row_id order by created_at desc))[1:5] rows
                                    from near group by 1 order by 2 desc limit 8) t)),
        'ward', jsonb_build_object(
            'ward_number', a.ward_number,
            'count', (select count(*) from ward),
            'top_types', (select coalesce(jsonb_agg(jsonb_build_object(
                              'type', request_type, 'count', n, 'still_open', open_n,
                              'cite', bb_cite_many(sid, rows)) order by n desc), '[]')
                            from (select request_type, count(*) n,
                                         count(*) filter (where status in ('New', 'In Progress')) open_n,
                                         min(source_id) sid, (array_agg(source_row_id order by created_at desc))[1:5] rows
                                    from ward group by 1 order by 2 desc limit 8) t)))
      into v;
    result := result || jsonb_build_object('service_requests_311', v);

    -- Crime: neighbourhood rates vs the whole city ------------------------------
    -- Rates per 100k are TPS's own. The city rate is total incidents / total neighbourhood
    -- population for the latest year with population figures.
    with hood as (
        select n.hood_id from neighbourhoods n where st_covers(n.geom, a.geom) limit 1
    ), yr as (
        select max(year) as y from crime_rates
    ), city as (
        select c.offence, round(100000.0 * sum(c.count) / nullif(sum(p.population), 0), 1) as city_rate
          from crime_rates c join neighbourhood_population p on p.hood_id = c.hood_id and p.year = c.year
         where c.year = (select y from yr) group by 1
    )
    select jsonb_build_object(
        'year', (select y from yr),
        'note', 'Rates are incidents per 100,000 people, published by Toronto Police Service per neighbourhood.',
        'offences', (select coalesce(jsonb_agg(jsonb_build_object(
                         'offence', c.offence, 'count', c.count, 'rate_per_100k', round(c.rate_per_100k, 1),
                         'city_rate_per_100k', city.city_rate,
                         'previous_year_rate', (select round(c2.rate_per_100k, 1) from crime_rates c2
                                                 where c2.hood_id = c.hood_id and c2.offence = c.offence
                                                   and c2.year = c.year - 1),
                         'cite', bb_cite(c.source_id, c.source_row_id)) order by c.offence), '[]')
                       from crime_rates c join hood using (hood_id)
                       left join city using (offence)
                      where c.year = (select y from yr)))
      into v;
    result := result || jsonb_build_object('crime', v);

    -- Census context (2021 Census, neighbourhood level) --------------------------
    -- A fixed set of renter-relevant variables, matched by topic + label. Counts are turned
    -- into shares of their total so neighbourhoods of different sizes compare fairly; each
    -- value is shown next to the median across Toronto's 158 neighbourhoods.
    with hood as (
        select n.hood_id from neighbourhoods n where st_covers(n.geom, a.geom) limit 1
    ), wanted(key, topic_prefix, label, share_of) as (values
        ('population',                  'Total - Age groups of the population', 'Total - Age groups of the population - 25% sample data', null),
        ('households',                  'Total - Private households by tenure', 'Total - Private households by tenure - 25% sample data', null),
        ('renter_households',           'Total - Private households by tenure', 'Renter', 'households'),
        ('median_rent_monthly',         'Total - Tenant households', 'Median monthly shelter costs for rented dwellings ($)', null),
        ('pct_tenants_30pct_on_shelter','Total - Tenant households', '% of tenant households spending 30% or more of its income on shelter costs', null),
        ('pct_tenants_subsidized',      'Total - Tenant households', '% of tenant households in subsidized housing', null),
        ('median_household_income',     'Total - Income statistics for private households', 'Median total income of household in 2020 ($)', null),
        ('dwellings',                   'Total - Occupied private dwellings by structural type', 'Total - Occupied private dwellings by structural type of dwelling - 25% sample data', null),
        ('apartments_5plus_storeys',    'Total - Occupied private dwellings by structural type', 'Apartment in a building that has five or more storeys', 'dwellings'),
        ('dwellings_condition_total',   'Total - Occupied private dwellings by dwelling condition', 'Total - Occupied private dwellings by dwelling condition - 25% sample data', null),
        ('dwellings_major_repairs',     'Total - Occupied private dwellings by dwelling condition', 'Major repairs needed', 'dwellings_condition_total'),
        ('commuters',                   'Total - Main mode of commuting', 'Total - Main mode of commuting', null),
        ('commute_transit',             'Total - Main mode of commuting', 'Public transit', 'commuters'),
        ('commute_walk',                'Total - Main mode of commuting', 'Walked', 'commuters'),
        ('commute_bicycle',             'Total - Main mode of commuting', 'Bicycle', 'commuters')
    ), vars as (
        select w.key, w.share_of, v.row_number, v.variable
          from wanted w join neighbourhood_profile_variables v
            on v.topic like w.topic_prefix || '%' and v.variable like w.label || '%'
    ), vals as (            -- every neighbourhood's value for every wanted variable
        select p.hood_id, vars.key, p.value_num, p.source_id, vars.row_number
          from neighbourhood_profiles p join vars using (row_number)
    ), stat as (            -- the number to compare: a share (%) for counts, else the value
        select v.hood_id, v.key,
               case when w.share_of is null then v.value_num
                    else round(100.0 * v.value_num / nullif(d.value_num, 0), 1) end as stat,
               v.value_num, d.value_num as total, v.source_id, v.row_number, d.row_number as total_row
          from vals v join vars w on w.key = v.key
          left join vals d on d.hood_id = v.hood_id and d.key = w.share_of
    )
    select jsonb_build_object(
        'source_note', '2021 Census, City of Toronto Neighbourhood Profiles (158 neighbourhoods). Shares are computed here from the published counts.',
        'values', (select jsonb_object_agg(s.key, jsonb_strip_nulls(jsonb_build_object(
                       'label', w.variable,
                       'value', s.value_num,
                       'of_total', s.total,
                       'percent', case when w.share_of is not null then s.stat end,
                       'toronto_neighbourhood_median', (select round(percentile_cont(0.5) within group (order by s2.stat)::numeric, 1)
                                                          from stat s2 where s2.key = s.key),
                       'compared_as', case when w.share_of is not null then 'percent' else 'value' end,
                       'cite', (select jsonb_build_object('dataset', src.dataset, 'file', src.file_name,
                                                          'row', s.row_number, 'total_row', s.total_row,
                                                          'column_hood_id', s.hood_id)
                                  from sources src where src.source_id = s.source_id))))
                     from stat s join vars w on w.key = s.key join hood on hood.hood_id = s.hood_id
                    where s.key not in ('dwellings_condition_total')))
      into v;
    result := result || jsonb_build_object('census', v);

    return result;
end $$;

grant execute on function bb_geocode(text, int) to anon, authenticated;
grant execute on function bb_brief(bigint, int) to anon, authenticated;
