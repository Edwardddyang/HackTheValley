-- Active building permits that mean real construction nearby (noise, dust, cranes).
-- Source: Toronto Open Data "building-permits-active-permits". Requires address_points (permits have no coordinates).
create table if not exists public.building_permits (
  id int primary key,                -- CKAN _id; cite as building_permits:<id>
  permit_number text,
  permit_type text,
  structure_type text,
  work text,
  address text,
  postal text,
  application_date date,
  issued_date date,
  status text,
  description text,
  current_use text,
  proposed_use text,
  dwelling_units_created int,
  dwelling_units_lost int,
  geom geometry(Point, 4326)
);
create index if not exists building_permits_geom_idx on public.building_permits using gist (geom);

truncate public.building_permits;
with p as (
  select *,
    nullif(trim(concat_ws(' ', raw.txt(street_num), raw.txt(street_name), raw.txt(street_type), raw.txt(street_direction))), '') as addr
  from raw.building_permits
  where permit_type in (
    'New Building', 'New Houses', 'Demolition Folder (DM)', 'Building Additions/Alterations',
    'Residential Building Permit', 'Non-Residential Building Permit', 'Multiple Use Permit', 'Partial Permit'
  )
)
insert into public.building_permits
select distinct on (raw.num(p.id))
  raw.num(p.id)::int, raw.txt(p.permit_num), raw.txt(p.permit_type), raw.txt(p.structure_type), raw.txt(p.work),
  p.addr, raw.txt(p.postal), raw.day(p.application_date), raw.day(p.issued_date), raw.txt(p.status),
  raw.txt(p.description), raw.txt(p.current_use), raw.txt(p.proposed_use),
  raw.num(p.dwelling_units_created)::int, raw.num(p.dwelling_units_lost)::int,
  coalesce(a1.geom, a2.geom)
from p
-- GEO_ID is assumed to be the address point id; the street-number check stops a wrong-ID-space join from
-- silently misplacing permits.
left join public.address_points a1
  on a1.address_point_id = raw.num(p.geo_id)::int and a1.lo_num = raw.num(p.street_num)::int
left join lateral (
  select a.geom from public.address_points a where upper(a.address_full) = upper(p.addr) limit 1
) a2 on a1.geom is null
where raw.num(p.id) is not null
order by raw.num(p.id);

select raw.enable_public_read('public.building_permits');
