-- bb_construction_near, second version: the brief's radius, and 311 noise complaints at a fixed reach.
--
-- 1. Sites now reach the brief's radius when it is larger than 500 m (the map's 1 km view), while the counts
--    within 250 m and 500 m, which the construction & noise score uses, stay fixed.
-- 2. 311 noise complaints within 500 m come back too, grouped by intersection, so the score doesn't depend on the
--    radius the reader picked (the brief's own 311 points cover only that radius, capped at the 800 most recent).
--
-- Replaces 0006's one-argument function; the new one keeps p_address_point_id and gives the radius a default, so
-- callers that pass only the address still work.

drop function if exists bb_construction_near(bigint);

create or replace function bb_construction_near(p_address_point_id bigint, p_radius_m int default 500)
returns jsonb language sql stable as $$
    with pt as (
        select geom::geography as g from address_points where address_point_id = p_address_point_id
    ), major as (
        select p.*, st_distance(p.geom::geography, pt.g) as dist,
               (p.permit_type in ('New Building', 'Demolition Folder (DM)')) as heavy,
               round(st_y(p.geom)::numeric, 5) as site_lat, round(st_x(p.geom)::numeric, 5) as site_lon
          from building_permits p, pt
         where p.permit_group = 'active' and p.geom is not null
           and st_dwithin(p.geom::geography, pt.g, greatest(p_radius_m, 500))
           and (p.permit_type in ('New Building', 'Demolition Folder (DM)') or p.est_const_cost >= 1000000)
    ), sites as (
        select distinct on (site_lat, site_lon) *, count(*) over (partition by site_lat, site_lon) as permits
          from major
         order by site_lat, site_lon, heavy desc, est_const_cost desc nulls last, dist
    ), noise as (
        select r.source_row_id, r.created_at, st_y(r.geom) as lat, st_x(r.geom) as lon,
               st_distance(r.geom::geography, pt.g) as dist
          from service_requests_311 r, pt
         where r.geom is not null and r.request_type ilike '%noise%'
           and st_dwithin(r.geom::geography, pt.g, 500)
    ), corners as (
        select round(lat::numeric, 6) as lat, round(lon::numeric, 6) as lon, min(dist) as dist, count(*) as n,
               (array_agg(source_row_id order by created_at desc))[1:5] as sample_rows
          from noise group by 1, 2
    )
    select case when not exists (select 1 from pt) then null else jsonb_build_object(
        'within_m', greatest(p_radius_m, 500),
        'definition', 'Active New Building or Demolition permits, or estimated construction cost of $1,000,000 or more; several permits at one point count as one site',
        'sites_within_250', (select count(*) from sites where dist <= 250),
        'sites_within_500', (select count(*) from sites where dist <= 500),
        'sites_within_radius', (select count(*) from sites),
        'sites', (select coalesce(jsonb_agg(jsonb_build_object(
                      'permit_num', permit_num, 'type', permit_type, 'status', status, 'address', street_address,
                      'distance_m', round(dist), 'lat', st_y(geom), 'lon', st_x(geom),
                      'est_const_cost', est_const_cost, 'issued_date', issued_date, 'permits', permits,
                      'cite', bb_cite(source_id, source_row_id)) order by dist), '[]')
                    from (select * from sites order by dist limit 300) s),
        'noise_within_m', 500,
        'noise_complaints', (select coalesce(sum(n), 0) from corners),
        'noise_corners', (select coalesce(jsonb_agg(jsonb_build_object(
                              'lat', lat, 'lon', lon, 'distance_m', round(dist), 'count', n, 'sample_rows', sample_rows)
                              order by dist), '[]') from corners),
        'noise_source', (select jsonb_build_object('dataset', dataset, 'file', file_name, 'from', period_from, 'to', period_to)
                           from sources where dataset = 'service_requests_311' order by period_to desc nulls last limit 1)
    ) end
$$;

grant execute on function bb_construction_near(bigint, int) to anon, authenticated;
