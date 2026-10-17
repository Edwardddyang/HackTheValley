-- Toronto Public Library branches. Source: Toronto Open Data "library-branch-general-information".
create table if not exists public.libraries (
  branch_code text primary key,
  name text not null,
  address text,
  website text,
  phone text,
  hours text,
  public_washroom boolean,
  ward_number int,
  geom geometry(Point, 4326) not null
);
create index if not exists libraries_geom_idx on public.libraries using gist (geom);

truncate public.libraries;
insert into public.libraries
select distinct on (branchcode)
  branchcode, branchname, raw.txt(address), raw.txt(website), raw.txt(telephone), raw.txt(hours),
  raw.txt(publicwashroom) = '1', raw.num(wardno)::int,
  coalesce(raw.point(geometry),
    case when raw.num(lat) is not null then ST_SetSRID(ST_MakePoint(raw.num(long)::float8, raw.num(lat)::float8), 4326) end)
from raw.libraries
where raw.txt(physicalbranch) = '1' and raw.txt(branchcode) is not null
order by branchcode;

delete from public.libraries where geom is null;
select raw.enable_public_read('public.libraries');
