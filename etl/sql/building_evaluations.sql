-- RentSafeTO Apartment Building Evaluations, 2023-current (items scored 1-3, weighted overall score).
-- Source: Toronto Open Data "apartment-building-evaluation". One row per evaluation; buildings have several.
create table if not exists public.building_evaluations (
  id int primary key,               -- CKAN _id; cite as building_evaluations:<id>
  rsn int not null,                 -- building id, joins public.buildings
  site_address text,
  ward_number int,
  year_built int,
  year_evaluated int,
  evaluated_on date,
  score int,                        -- current building evaluation score
  proactive_score int,
  reactive_score int,
  areas_evaluated int,
  items jsonb not null,             -- {"common_area_pests": 3, ...}; N/A items omitted
  geom geometry(Point, 4326)
);
create index if not exists building_evaluations_rsn_idx on public.building_evaluations (rsn, evaluated_on desc);
create index if not exists building_evaluations_geom_idx on public.building_evaluations using gist (geom);

truncate public.building_evaluations;
insert into public.building_evaluations
select
  raw.num(e.id)::int,
  raw.num(e.rsn)::int,
  raw.txt(e.site_address),
  raw.num(e.ward)::int,
  raw.num(e.year_built)::int,
  raw.num(e.year_evaluated)::int,
  raw.day(e.evaluation_completed_on),
  raw.num(e.current_building_eval_score)::int,
  raw.num(e.proactive_building_score)::int,
  raw.num(e.current_reactive_score)::int,
  raw.num(e.no_of_areas_evaluated)::int,
  coalesce((
    select jsonb_object_agg(kv.key, kv.value::int)
    from jsonb_each_text(to_jsonb(e) - array[
      'id', 'rsn', 'year_registered', 'year_built', 'year_evaluated', 'property_type', 'ward', 'wardname',
      'site_address', 'confirmed_storeys', 'confirmed_units', 'evaluation_completed_on',
      'current_building_eval_score', 'proactive_building_score', 'current_reactive_score',
      'no_of_areas_evaluated', 'grid', 'latitude', 'longitude', 'x', 'y'
    ]) kv
    where kv.value ~ '^[1-5]$'
  ), '{}'::jsonb),
  case when raw.num(e.latitude) is not null and raw.num(e.longitude) is not null
    then ST_SetSRID(ST_MakePoint(raw.num(e.longitude)::float8, raw.num(e.latitude)::float8), 4326) end
from raw.building_evaluations e
where raw.num(e.id) is not null and raw.num(e.rsn) is not null;

select raw.enable_public_read('public.building_evaluations');
