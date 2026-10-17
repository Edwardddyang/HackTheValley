"""One module per dataset. Each module defines:

FOLDER       data/raw/<FOLDER>/ is where the user drops the files
TITLE        human name
DATASET_URL  where to download it
EXPECTS      which file(s) to download from that page
DEPENDS_ON   folders that must be loaded first (optional)
transform(files) -> {table_name: DataFrame}   columns must match supabase/migrations
PERIOD_COLUMNS {table: date column} to record each file's date range in `sources` (optional)
enrich(conn, tables) -> tables   fill in fields that need the database, before loading (optional)
"""

from . import (
    address_points,
    building_permits,
    crime_rates,
    intersections,
    development_applications,
    neighbourhood_profiles,
    neighbourhoods,
    rentsafe,
    service_requests_311,
    ward_profiles,
    wards,
)

# Load order matters: building_permits get their coordinates from address_points, and
# service_requests_311 from intersections.
ALL = [
    address_points,
    wards,
    neighbourhoods,
    rentsafe,
    building_permits,
    development_applications,
    intersections,
    service_requests_311,
    crime_rates,
    neighbourhood_profiles,
    ward_profiles,
]
BY_FOLDER = {m.FOLDER: m for m in ALL}
