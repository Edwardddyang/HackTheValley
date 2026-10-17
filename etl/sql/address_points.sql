-- Address Points (One Address Repository): every civic address in Toronto with a point.
-- Powers address search (prefix match on address_full) and geocoding of permits.
create table if not exists public.address_points (
  address_point_id int primary key,
  address_full text not null,
  lo_num int,
  street text,
  place_name text,
  ward_number int,
  geom geometry(Point, 4326) not null
);
create index if not exists address_points_geom_idx on public.address_points using gist (geom);
create index if not exists address_points_prefix_idx on public.address_points (upper(address_full) text_pattern_ops);

truncate public.address_points;
insert into public.address_points (address_point_id, address_full, lo_num, street, place_name, ward_number, geom)
select distinct on (raw.num(address_point_id))
  raw.num(address_point_id)::int,
  address_full,
  raw.num(lo_num)::int,
  raw.txt(linear_name_full),
  raw.txt(place_name),
  raw.num(regexp_replace(coalesce(ward, ''), '\D', '', 'g'))::int,
  raw.point(geometry)
from raw.address_points
where raw.num(address_point_id) is not null and raw.txt(address_full) is not null and raw.point(geometry) is not null
order by raw.num(address_point_id);

select raw.enable_public_read('public.address_points');
