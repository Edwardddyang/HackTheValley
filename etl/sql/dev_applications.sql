-- Development Applications (rezonings, site plans, condos, minor variances...).
-- Source: Toronto Open Data "development-applications". X/Y are MTM zone 10 (EPSG:2952).
create table if not exists public.dev_applications (
  id int primary key,                -- CKAN _id; cite as dev_applications:<id>
  application_number text,
  application_type text,             -- OZ rezoning, SA site plan, CD condo, SB subdivision, ...
  address text,
  postal text,
  date_submitted date,
  status text,
  description text,
  ward_number int,
  community_meeting_date date,
  community_meeting_time text,
  community_meeting_location text,
  application_url text,
  geom geometry(Point, 4326)
);
create index if not exists dev_applications_geom_idx on public.dev_applications using gist (geom);

truncate public.dev_applications;
insert into public.dev_applications
select
  raw.num(id)::int,
  raw.txt(application),
  raw.txt(application_type),
  nullif(trim(concat_ws(' ', raw.txt(street_num), raw.txt(street_name), raw.txt(street_type), raw.txt(street_direction))), ''),
  raw.txt(postal),
  raw.day(date_submitted),
  raw.txt(status),
  raw.txt(description),
  raw.num(ward_number)::int,
  raw.day(community_meeting_date),
  raw.txt(community_meeting_time),
  raw.txt(community_meeting_location),
  raw.txt(application_url),
  case when raw.num(x) is not null and raw.num(y) is not null
    then ST_Transform(ST_SetSRID(ST_MakePoint(raw.num(x)::float8, raw.num(y)::float8), 2952), 4326) end
from raw.dev_applications
where raw.num(id) is not null;

select raw.enable_public_read('public.dev_applications');
