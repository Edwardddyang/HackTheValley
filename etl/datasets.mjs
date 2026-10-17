// Registry of Toronto datasets loaded into Supabase.
// `datastore` sources are fetched as the CKAN datastore dump (one CSV, geometry as GeoJSON text).
// `zip` sources download each listed resource and load every CSV inside.
// Each dataset is staged into raw.<key> (all text), then etl/sql/<key>.sql builds the public table(s).
// Order matters: later transforms join to earlier tables (permits geocode via address_points).

export const DATASETS = [
  { key: "wards", kind: "datastore", pkg: "city-wards", resource: "City Wards Data" },
  { key: "neighbourhoods", kind: "datastore", pkg: "neighbourhoods", resource: "Neighbourhoods" },
  {
    key: "address_points",
    kind: "datastore",
    pkg: "address-points-municipal-toronto-one-address-repository",
    resource: "Address Points",
  },
  {
    key: "building_evaluations",
    kind: "datastore",
    pkg: "apartment-building-evaluation",
    resource: "Apartment Building Evaluations 2023 - current",
  },
  {
    key: "building_registration",
    kind: "datastore",
    pkg: "apartment-building-registration",
    resource: "Apartment Building Registration Data",
  },
  { key: "dev_applications", kind: "datastore", pkg: "development-applications", resource: "Development Applications" },
  {
    key: "building_permits",
    kind: "datastore",
    pkg: "building-permits-active-permits",
    resource: "building-permits-active-permits",
  },
  {
    // ~1M rows; aggregated to monthly counts per FSA/ward/type in Node before upload (see load.mjs).
    key: "sr311",
    kind: "zip",
    pkg: "311-service-requests-customer-initiated",
    resources: ["311 Service Requests 2025", "311 Service Requests 2026"],
    aggregate: "sr311",
  },
  { key: "parks_rec", kind: "datastore", pkg: "parks-and-recreation-facilities", resource: "Parks and Recreation Facilities" },
  { key: "libraries", kind: "datastore", pkg: "library-branch-general-information", resource: "tpl-branch-general-information" },
];
