-- Neighbourhoods (158-neighbourhood model). Source: Toronto Open Data "neighbourhoods".
create table if not exists public.neighbourhoods (
  neighbourhood_number int primary key,
  name text not null,
  geom geometry(MultiPolygon, 4326) not null
);
create index if not exists neighbourhoods_geom_idx on public.neighbourhoods using gist (geom);

truncate public.neighbourhoods;
insert into public.neighbourhoods (neighbourhood_number, name, geom)
select raw.num(area_short_code)::int, area_name, ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(geometry), 4326))
from raw.neighbourhoods;

select raw.enable_public_read('public.neighbourhoods');
