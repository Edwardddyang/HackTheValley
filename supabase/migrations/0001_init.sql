-- Block Brief: base schema for Toronto open data.
--
-- Conventions
--   * Citations: every data row has (source_id, source_row_id). source_id points to `sources`
--     (which dataset and file); source_row_id is the file's "_id" column, or its data row
--     number when the file has none. Together they identify the exact row a fact came from.
--   * Geometry is geometry(..., 4326). Radius queries use metres via geography:
--       ST_DWithin(geom::geography, point::geography, 500)
--     Point tables are indexed on (geom::geography) so those queries are fast.
--   * Kept compact for the Supabase free tier (500 MB): no repeated file names, no duplicate
--     indexes, repeated labels moved into lookup tables.
--   * Safe to re-run: everything is IF NOT EXISTS.

create extension if not exists postgis;
create extension if not exists pg_trgm;

create table if not exists sources (
    source_id  smallint generated always as identity primary key,
    dataset    text not null,          -- table name the file was loaded into
    file_name  text not null,
    loaded_at  timestamptz not null default now(),
    unique (dataset, file_name)
);

-- Address lookup -------------------------------------------------------------
-- Source: Address Points (Municipal) - Toronto One Address Repository
create table if not exists address_points (
    address_point_id bigint primary key,
    address_full     text not null,
    municipality     text,
    ward_number      smallint,
    place_name       text,
    source_id        smallint not null references sources,
    source_row_id    bigint not null,
    geom             geometry(Point, 4326) not null
);
create index if not exists address_points_geom      on address_points using gist (geom);
create index if not exists address_points_full_trgm on address_points using gin (lower(address_full) gin_trgm_ops);

-- Building condition ---------------------------------------------------------
-- Source: Apartment Building Evaluations (RentSafeTO), 2023-current and pre-2023 files.
-- The two files score different categories, so per-category scores live in item_scores.
create table if not exists rentsafe_evaluations (
    source_id        smallint not null references sources,
    source_row_id    bigint not null,
    schema_version   text not null,          -- '2023+' or 'pre-2023'
    rsn              bigint,
    site_address     text,
    property_type    text,
    ward_number      smallint,
    ward_name        text,
    year_built       smallint,
    year_registered  smallint,
    year_evaluated   smallint,
    storeys          smallint,
    units            int,
    evaluation_date  date,
    score            numeric,
    proactive_score  numeric,                -- 2023+ only
    reactive_score   numeric,                -- 2023+ only
    result_text      text,                   -- pre-2023 only (RESULTS_OF_SCORE)
    areas_evaluated  smallint,
    item_scores      jsonb,
    geom             geometry(Point, 4326),
    primary key (source_id, source_row_id)
);
create index if not exists rentsafe_geom_geog on rentsafe_evaluations using gist ((geom::geography));
create index if not exists rentsafe_rsn       on rentsafe_evaluations (rsn);

-- Construction / nearby activity --------------------------------------------
-- Source: Building Permits - Active Permits, and Cleared Permits since 2017.
-- These files have no coordinates; geom is filled by joining geo_id to
-- address_points.address_point_id (verified to be the same identifier).
create table if not exists building_permits (
    source_id              smallint not null references sources,
    source_row_id          bigint not null,
    permit_group           text not null check (permit_group in ('active', 'cleared')),
    permit_num             text,
    revision_num           text,
    permit_type            text,
    structure_type         text,
    work                   text,
    street_address         text,
    postal_fsa             text,
    geo_id                 bigint,
    application_date       date,
    issued_date            date,
    completed_date         date,
    status                 text,
    description            text,
    current_use            text,
    proposed_use           text,
    dwelling_units_created int,
    dwelling_units_lost    int,
    est_const_cost         numeric,
    geom                   geometry(Point, 4326),
    primary key (source_id, source_row_id)
);
create index if not exists building_permits_geom_geog on building_permits using gist ((geom::geography));
create index if not exists building_permits_geo_id    on building_permits (geo_id);

-- Source: Development Applications. X/Y are NAD27 MTM zone 10 (EPSG:7991), converted on load.
create table if not exists development_applications (
    source_id                  smallint not null references sources,
    source_row_id              bigint not null,
    application_number         text,
    application_type           text,
    street_address             text,
    postal_fsa                 text,
    date_submitted             date,
    status                     text,
    description                text,
    reference_file             text,
    folder_rsn                 text,
    parent_folder_number       text,
    ward_number                smallint,
    ward_name                  text,
    community_meeting_date     date,
    community_meeting_time     text,
    community_meeting_location text,
    application_url            text,
    geom                       geometry(Point, 4326),
    primary key (source_id, source_row_id)
);
create index if not exists dev_apps_geom_geog on development_applications using gist ((geom::geography));

-- Source: 311 Service Requests - Customer Initiated (one yearly file).
-- NOTE: no coordinates and no closed date in this dataset. Location is a postal FSA,
-- or an intersection (when fsa is null), plus the ward.
-- Division and section depend only on request_type (checked: 570 types, no conflicts),
-- so they live in sr311_request_types. Ward names are in `wards`.
create table if not exists sr311_request_types (
    request_type text primary key,
    division     text,
    section      text
);

create table if not exists service_requests_311 (
    source_id             smallint not null references sources,
    source_row_id         bigint not null,  -- data row number within the CSV
    created_at            timestamp,
    status                text,
    fsa                   text,
    intersection_street_1 text,
    intersection_street_2 text,
    ward_number           smallint,
    request_type          text references sr311_request_types,
    primary key (source_id, source_row_id)
);
create index if not exists sr311_fsa_type  on service_requests_311 (fsa, request_type);
create index if not exists sr311_ward_type on service_requests_311 (ward_number, request_type);

-- Area context ---------------------------------------------------------------
-- Source: Neighbourhoods (158-neighbourhood model)
create table if not exists neighbourhoods (
    hood_id             smallint primary key,
    area_name           text,
    classification      text,
    classification_code text,
    source_id           smallint not null references sources,
    source_row_id       bigint not null,
    geom                geometry(MultiPolygon, 4326) not null
);
create index if not exists neighbourhoods_geom on neighbourhoods using gist (geom);

-- Source: City Wards Data (25-ward model)
create table if not exists wards (
    ward_number   smallint primary key,
    ward_name     text,
    source_id     smallint not null references sources,
    source_row_id bigint not null,
    geom          geometry(MultiPolygon, 4326) not null
);
create index if not exists wards_geom on wards using gist (geom);

-- Source: Neighbourhood Crime Rates (Toronto Police Service), reshaped from wide to long.
-- rate_per_100k is the rate published by TPS, not recomputed here. Blank cells = 0.
create table if not exists crime_rates (
    hood_id       smallint not null,
    offence       text not null,
    year          smallint not null,
    count         int,
    rate_per_100k numeric,
    source_id     smallint not null references sources,
    source_row_id bigint not null,
    primary key (hood_id, offence, year)
);

create table if not exists neighbourhood_population (
    hood_id       smallint not null,
    year          smallint not null,
    population    int,
    source_id     smallint not null references sources,
    source_row_id bigint not null,
    primary key (hood_id, year)
);

-- Source: Neighbourhood Profiles, 2021 Census, 158-neighbourhood model.
-- row_number is the spreadsheet row; it identifies the variable (labels repeat, e.g.
-- "0 to 14 years"). topic is the "Total - ..." header the variable sits under.
create table if not exists neighbourhood_profile_variables (
    row_number int primary key,
    topic      text,
    variable   text not null
);

create table if not exists neighbourhood_profiles (
    hood_id     smallint not null,
    row_number  int not null references neighbourhood_profile_variables,
    value_num   numeric,
    value_text  text,
    source_id   smallint not null references sources,
    primary key (hood_id, row_number)
);

-- Source: Ward Profiles (25-ward model), sheet "2021 One Variable". ward_number 0 = all of Toronto.
create table if not exists ward_profiles (
    ward_number   smallint not null,
    row_number    int not null,
    section       text,
    variable      text not null,
    value_num     numeric,
    value_text    text,
    source_id     smallint not null references sources,
    primary key (ward_number, row_number)
);
