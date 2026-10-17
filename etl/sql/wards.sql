-- City Wards (25-ward model). Source: Toronto Open Data "city-wards".
create table if not exists public.wards (
  ward_number int primary key,
  ward_name text not null,
  geom geometry(MultiPolygon, 4326) not null
);
create index if not exists wards_geom_idx on public.wards using gist (geom);

truncate public.wards;
insert into public.wards (ward_number, ward_name, geom)
select raw.num(area_short_code)::int, area_name, ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(geometry), 4326))
from raw.wards;

select raw.enable_public_read('public.wards');
