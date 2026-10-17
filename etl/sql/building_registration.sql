-- Apartment Building Registration joined with the latest RentSafeTO evaluation: one row per building.
-- Source: Toronto Open Data "apartment-building-registration". Requires building_evaluations and address_points.
-- Coverage: RentSafeTO only covers buildings with 3+ storeys and 10+ units.
create table if not exists public.buildings (
  rsn int primary key,
  site_address text not null,
  fsa text,                          -- first 3 chars of the postal code; joins 311 counts
  ward_number int,
  year_built int,                    -- drives the rent-control flag (first occupied after 2018-11-15 = likely exempt)
  year_registered int,
  storeys int,
  units int,
  property_type text,
  property_manager text,
  heating_type text,
  heating_equipment_status text,
  heating_equipment_year int,
  air_conditioning_type text,
  has_cooling_room boolean,
  pets_allowed text,
  elevators int,
  latest_evaluation_id int,          -- public.building_evaluations.id
  latest_score int,
  latest_evaluated_on date,
  registration jsonb,                -- full registration record (cite as buildings:<rsn>)
  geom geometry(Point, 4326)
);
create index if not exists buildings_geom_idx on public.buildings using gist (geom);
create index if not exists buildings_address_idx on public.buildings (upper(site_address) text_pattern_ops);

truncate public.buildings;

with reg as (
  select distinct on (raw.num(rsn)) *
  from raw.building_registration
  where raw.num(rsn) is not null
  order by raw.num(rsn), raw.num(year_registered) desc nulls last, raw.num(id) desc
),
latest as (
  select distinct on (rsn) *
  from public.building_evaluations
  order by rsn, evaluated_on desc nulls last, id desc
),
base as (
  select
    raw.num(r.rsn)::int as rsn,
    regexp_replace(upper(trim(r.site_address)), '\s+', ' ', 'g') as site_address,
    upper(raw.txt(r.pcode)) as fsa,
    raw.num(r.ward)::int as ward_number,
    raw.num(r.year_built)::int as year_built,
    raw.num(r.year_registered)::int as year_registered,
    coalesce(raw.num(r.confirmed_storeys), raw.num(r.no_of_storeys))::int as storeys,
    coalesce(raw.num(r.confirmed_units), raw.num(r.no_of_units))::int as units,
    raw.txt(r.property_type) as property_type,
    raw.txt(r.prop_management_company_name) as property_manager,
    raw.txt(r.heating_type) as heating_type,
    raw.txt(r.heating_equipment_status) as heating_equipment_status,
    raw.num(r.heating_equipment_year_installed)::int as heating_equipment_year,
    raw.txt(r.air_conditioning_type) as air_conditioning_type,
    case upper(coalesce(raw.txt(r.is_there_a_cooling_room), raw.txt(r.is_there_a_cooling_room_2)))
      when 'YES' then true when 'NO' then false end as has_cooling_room,
    raw.txt(r.pets_allowed) as pets_allowed,
    raw.num(r.no_of_elevators)::int as elevators,
    jsonb_strip_nulls((
      select jsonb_object_agg(kv.key, raw.txt(kv.value))
      from jsonb_each_text(to_jsonb(r) - 'id') kv
    )) as registration
  from reg r
)
insert into public.buildings
select
  b.rsn, b.site_address, b.fsa, coalesce(b.ward_number, l.ward_number),
  coalesce(b.year_built, l.year_built), b.year_registered, b.storeys, b.units, b.property_type,
  b.property_manager, b.heating_type, b.heating_equipment_status, b.heating_equipment_year,
  b.air_conditioning_type, b.has_cooling_room, b.pets_allowed, b.elevators,
  l.id, l.score, l.evaluated_on, b.registration,
  coalesce(l.geom, (
    -- fallback geocode: "181-183 GERRARD ST E" -> exact match on "181 GERRARD ST E"
    select a.geom from public.address_points a
    where upper(a.address_full) = regexp_replace(b.site_address, '^(\d+)[A-Z]?-\d+[A-Z]?\s', '\1 ')
    limit 1
  ))
from base b
left join latest l on l.rsn = b.rsn
union all
-- buildings that were evaluated but are missing from the registration file
select
  l.rsn, regexp_replace(upper(trim(l.site_address)), '\s+', ' ', 'g'), null, l.ward_number,
  l.year_built, null, null, null, null, null, null, null, null, null, null, null, null,
  l.id, l.score, l.evaluated_on, null, l.geom
from latest l
where not exists (select 1 from base b where b.rsn = l.rsn) and l.site_address is not null;

select raw.enable_public_read('public.buildings');
