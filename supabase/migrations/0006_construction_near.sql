-- Major construction near an address, by distance (for the construction & noise score, counts and heatmap).
--
-- bb_brief's construction_nearby.notable lists only the 10 costliest major permits in the radius: a short list of
-- the biggest projects for the Construction tab. Counting or scoring from it misses cheaper projects close by,
-- so this returns every major project site within 500 m (a fixed distance, whatever radius the brief uses),
-- nearest first. "Major" is bb_brief's definition: New Building or Demolition permits, or an estimated cost of
-- $1M or more. Several permits at one point (a new building and its drain permit) are one site, described by its
-- heaviest permit: a new building or demolition first, then the costliest.
--
-- Adds a function only; nothing existing changes.

create or replace function bb_construction_near(p_address_point_id bigint)
returns jsonb language sql stable as $$
    with pt as (
        select geom::geography as g from address_points where address_point_id = p_address_point_id
    ), major as (
        select p.*, st_distance(p.geom::geography, pt.g) as dist,
               (p.permit_type in ('New Building', 'Demolition Folder (DM)')) as heavy,
               round(st_y(p.geom)::numeric, 5) as site_lat, round(st_x(p.geom)::numeric, 5) as site_lon
          from building_permits p, pt
         where p.permit_group = 'active' and p.geom is not null
           and st_dwithin(p.geom::geography, pt.g, 500)
           and (p.permit_type in ('New Building', 'Demolition Folder (DM)') or p.est_const_cost >= 1000000)
    ), sites as (
        select distinct on (site_lat, site_lon) *, count(*) over (partition by site_lat, site_lon) as permits
          from major
         order by site_lat, site_lon, heavy desc, est_const_cost desc nulls last, dist
    )
    select case when not exists (select 1 from pt) then null else jsonb_build_object(
        'within_m', 500,
        'definition', 'Active New Building or Demolition permits, or estimated construction cost of $1,000,000 or more; several permits at one point count as one site',
        'sites_within_250', (select count(*) from sites where dist <= 250),
        'sites_within_500', (select count(*) from sites),
        'sites', (select coalesce(jsonb_agg(jsonb_build_object(
                      'permit_num', permit_num, 'type', permit_type, 'status', status, 'address', street_address,
                      'distance_m', round(dist), 'lat', st_y(geom), 'lon', st_x(geom),
                      'est_const_cost', est_const_cost, 'issued_date', issued_date, 'permits', permits,
                      'cite', bb_cite(source_id, source_row_id)) order by dist), '[]')
                    from (select * from sites order by dist limit 60) s)
    ) end
$$;

grant execute on function bb_construction_near(bigint) to anon, authenticated;
