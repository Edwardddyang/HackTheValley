-- Runs before every load. Idempotent.
create extension if not exists postgis with schema extensions;
set search_path to public, extensions;

-- Staging schema: not exposed through the Supabase API.
create schema if not exists raw;
revoke all on schema raw from anon, authenticated;

-- Safe casts for all-text staging columns. CKAN dumps write missing values as '', 'None' or 'N/A'.
create or replace function raw.txt(t text) returns text language sql immutable as $$
  select case when trim(t) in ('', 'None', 'N/A', 'null') then null else trim(t) end
$$;

create or replace function raw.num(t text) returns numeric language sql immutable as $$
  select case when t ~ '^\s*-?\d+(\.\d+)?\s*$' then trim(t)::numeric end
$$;

create or replace function raw.day(t text) returns date language plpgsql immutable as $$
begin
  if raw.txt(t) is null then return null; end if;
  if t ~ '^\s*\d{4}-\d{2}-\d{2}' then return left(trim(t), 10)::date; end if;
  return trim(t)::date;
exception when others then
  return null;
end
$$;

-- Point from GeoJSON text (Point or MultiPoint) in WGS84.
create or replace function raw.point(geojson text) returns extensions.geometry language sql immutable as $$
  select case when raw.txt(geojson) is null then null
    else extensions.ST_GeometryN(extensions.ST_Multi(extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(geojson), 4326)), 1) end
$$;

-- Public tables hold open data only: anyone may read, nobody may write through the API.
create or replace function raw.enable_public_read(t regclass) returns void language plpgsql as $$
begin
  execute format('alter table %s enable row level security', t);
  execute format('drop policy if exists "public read" on %s', t);
  execute format('create policy "public read" on %s for select to anon, authenticated using (true)', t);
end
$$;
