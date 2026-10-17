-- RentReceipts: building registration and area rents, served next to the brief.
--
--   bb_extras(address_point_id)  -> {"registration": {...} | null, "rent_benchmark": {...} | null}
--
-- Same conventions as 0001/0002: every row has (source_id, source_row_id), facts carry a cite
-- from bb_cite(), and the API roles can only read. Both tables are small (~3,600 + 110 rows,
-- well under 1 MB). Safe to re-run.

-- Source: Apartment Building Registration (City of Toronto). What the landlord registered for
-- each RentSafeTO building (3+ storeys, 10+ units); rsn is the same building id as in
-- rentsafe_evaluations. Only the fields the brief shows are kept (the file has ~70).
create table if not exists apartment_registrations (
    rsn                      bigint primary key,
    site_address             text,
    year_built               smallint,
    heating_type             text,              -- HOT WATER, FORCED AIR GAS, ELECTRIC
    heating_equipment_status text,              -- ORIGINAL or REPLACED
    heating_equipment_year   smallint,          -- HEATING_EQUIPMENT_YEAR_INSTALLED
    air_conditioning_type    text,              -- NONE, INDIVIDUAL UNITS, CENTRAL AIR
    has_cooling_room         boolean,           -- IS_THERE_A_COOLING_ROOM (or ..._ROOM?)
    pets_allowed             text,
    property_manager         text,              -- PROP_MANAGEMENT_COMPANY_NAME
    elevators                smallint,          -- NO_OF_ELEVATORS
    laundry_room             text,
    source_id                smallint not null references sources,
    source_row_id            bigint not null
);

-- Source: CMHC Rental Market Survey (October), Rental Market Report data tables, Toronto CMA:
-- Table 1.1.2 (average rent) and Table 1.1.9 (vacant vs occupied units). Purpose-built private
-- apartments only. City of Toronto rows: zones 1-17 and the group rows "Former City of Toronto
-- (Zones 1-4)", "Etobicoke (Zones 5-7)", "Scarborough (Zones 10-12)", "North York (Zones 13-17)"
-- and "City of Toronto (Zones 1-17)". Suppressed values ("**") are null.
-- average_rent covers every surveyed unit, including long-time tenants on old rents;
-- vacant_unit_rent is what units empty in October rented for, the fair comparison for a listing.
create table if not exists cmhc_rents (
    area                           text not null,
    municipality                   text,         -- address_points.municipality this row covers (6 rows of 22)
    bedrooms                       text not null check (bedrooms in ('studio', 'one', 'two', 'three_plus', 'total')),
    survey_year                    smallint not null,
    average_rent                   int,          -- Table 1.1.2, latest October
    average_rent_reliability       text,         -- a excellent, b very good, c good, d poor
    vacant_unit_rent               int,          -- Table 1.1.9
    vacant_unit_rent_reliability   text,
    occupied_unit_rent             int,          -- Table 1.1.9
    occupied_unit_rent_reliability text,
    source_id                      smallint not null references sources,
    source_row_id                  bigint not null,  -- the area's spreadsheet row (the same in both tables)
    primary key (area, bedrooms, survey_year)
);

-- Read-only access for the API, as in 0002 ---------------------------------------
do $$
declare t text;
begin
    foreach t in array array['apartment_registrations', 'cmhc_rents'] loop
        execute format('revoke all on table %I from anon, authenticated', t);
        execute format('grant select on table %I to anon, authenticated', t);
        execute format('alter table %I enable row level security', t);
        execute format('drop policy if exists read_open_data on %I', t);
        execute format('create policy read_open_data on %I for select to anon, authenticated using (true)', t);
    end loop;
end $$;

-- The extras ---------------------------------------------------------------------
create or replace function bb_extras(p_address_point_id bigint)
returns jsonb language plpgsql stable as $$
-- plpgsql for the same reason as bb_geocode (0002): the API's arguments stay visible to the planner.
declare
    a             address_points%rowtype;
    pt            geography;
    building_rsn  bigint;
    registration  jsonb;
    rent          jsonb;
begin
    select * into a from address_points where address_point_id = p_address_point_id;
    if not found then
        return null;
    end if;
    pt := a.geom::geography;

    -- Registration of the building bb_brief reports for this address: the RentSafeTO building
    -- whose site address equals this address (within 100 m), the most recently evaluated if
    -- several. Keep in step with the "Building condition" block of bb_brief.
    select r.rsn into building_rsn
      from rentsafe_evaluations r
     where st_dwithin(r.geom::geography, pt, 100)
       and upper(r.site_address) = upper(a.address_full)
     order by r.evaluation_date desc nulls last
     limit 1;

    select jsonb_build_object(
               'rsn', g.rsn,
               'heating_type', g.heating_type,
               'heating_equipment_status', g.heating_equipment_status,
               'heating_equipment_year', g.heating_equipment_year,
               'air_conditioning_type', g.air_conditioning_type,
               'has_cooling_room', g.has_cooling_room,
               'pets_allowed', g.pets_allowed,
               'property_manager', g.property_manager,
               'elevators', g.elevators,
               'laundry_room', g.laundry_room,
               'cite', bb_cite(g.source_id, g.source_row_id))
      into registration
      from apartment_registrations g
     where g.rsn = building_rsn;

    -- CMHC rents for the address's former municipality, latest survey loaded ---------
    select jsonb_build_object(
               'area', min(c.area),
               'survey', 'CMHC Rental Market Survey, October ' || min(c.survey_year),
               'survey_year', min(c.survey_year),
               'by_bedrooms', jsonb_object_agg(c.bedrooms, jsonb_build_object(
                                  'vacant_units', c.vacant_unit_rent,
                                  'all_units', c.average_rent)) filter (where c.bedrooms <> 'total'),
               'note', 'Purpose-built private apartments. vacant_units = units vacant in October (closest to a new lease); all_units includes long-time tenants.',
               'cite', bb_cite(min(c.source_id), min(c.source_row_id)))
      into rent
      from cmhc_rents c
     where c.municipality = a.municipality
       and c.survey_year = (select max(survey_year) from cmhc_rents where municipality = a.municipality)
    having count(*) > 0;

    return jsonb_build_object('registration', registration, 'rent_benchmark', rent);
end $$;

grant execute on function bb_extras(bigint) to anon, authenticated;
