-- Parks and Recreation Facilities. Source: Toronto Open Data "parks-and-recreation-facilities".
create table if not exists public.parks_rec (
  id int primary key,                -- CKAN _id
  location_id text,
  name text not null,
  type text,
  amenities text,
  address text,
  url text,
  geom geometry(Point, 4326) not null
);
create index if not exists parks_rec_geom_idx on public.parks_rec using gist (geom);

truncate public.parks_rec;
insert into public.parks_rec
select raw.num(id)::int, raw.txt(locationid), asset_name, raw.txt(type), raw.txt(amenities),
  raw.txt(address), raw.txt(url), raw.point(geometry)
from raw.parks_rec
where raw.num(id) is not null and raw.txt(asset_name) is not null and raw.point(geometry) is not null;

select raw.enable_public_read('public.parks_rec');
