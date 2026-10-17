# RentReceipts

Look up a Toronto rental address and see the building's condition and what's going on around it,
built only from City of Toronto open data, with every fact traceable to a source row.

Two parts so far:

- **Data layer**: drop the City's files into `data/raw/`, check them, and load them into
  Supabase (Postgres + PostGIS).
- **Briefing**: SQL functions build a facts-only brief for an address, and a Next.js API route
  serves it. Every fact cites the dataset row it came from. The UI and AI summary come next.

## Layout

```
data/raw/<dataset>/      drop downloaded files here (each folder's README says which file)
etl/                     Python loader (`bb` command)
  blockbrief_etl/sources/  one module per dataset: how its file is read and cleaned
supabase/migrations/     0001 tables, 0002 read-only API access + brief functions,
                         0004 RentSafeTO city stats (0003 is taken by the integrate/best-of-both branch)
web/                     Next.js app (API routes for now)
```

## Brief API

```sh
cd web
cp .env.example .env.local     # add the Supabase publishable key
npm install
npm run dev
```

Pages: `/` (search) and `/building/<address_point_id>?r=500` (the brief).

- `GET /api/brief?address=100 Queen St W&radius=500` (radius 100–1000 m, default 500), or
  `?id=<address_point_id>` to pick one of the returned `alternatives`.
- `GET /api/geocode?q=100 queen` returns up to 5 address matches, for autocomplete.

The brief has these sections, each fact with a `cite` (`dataset`, `file`, `row`, or `row_count`
plus `sample_rows` for counts): `address`, `area` (neighbourhood, ward), `building` (RentSafeTO
score, history, lowest-scoring items, percentile), `permits_at_address`, `construction_nearby`
(active permits, notable projects), `development_applications` (open ones nearby),
`service_requests_311` (placed requests nearby, plus ward totals), `crime` (neighbourhood vs city
rates), `census` (rent, renters, shelter costs, income, dwellings, commute vs the neighbourhood
median). `summary` is `null` until the AI summary is built.

The logic lives in `supabase/migrations/0002_brief.sql` (`bb_geocode`, `bb_brief`). The API
roles can only read tables and run these functions; Supabase's anonymous role has a 3 s
statement timeout, and a brief takes ~0.2–0.8 s (the first one after a data load is slower).

## Setup (once)

Needs [uv](https://docs.astral.sh/uv/). It installs Python 3.12 for this project by itself.

```sh
cd etl
uv sync
cp ../.env.example ../.env     # then paste your Supabase session pooler URL into ../.env
uv run bb init-db              # creates the tables (safe to re-run)
# after changing supabase/migrations: uv run bb reset-db --yes  (drops and recreates, then reload)
```

## Workflow

```sh
uv run bb status                    # which folders have files
uv run bb check rentsafe            # clean the files and preview the result (no database needed)
uv run bb load address_points       # load into Supabase; replaces that dataset's rows
uv run bb load all                  # everything, in dependency order
uv run bb near "100 Queen St W"     # smoke test: what's loaded around an address
```

`bb load all` loads in dependency order. Rows with a location are written in spatial order so a
radius query reads a few disk pages, not one per row (6x fewer for permits downtown). Loading one at a time: `address_points` before
`building_permits` (permits get their location from their `GEO_ID` address point), and
`intersections` before `service_requests_311` (requests reported at a corner get its point).

## Datasets

| Folder | Dataset | Table(s) |
|---|---|---|
| `address_points` | Address Points (Municipal) | `address_points` |
| `wards` | City Wards, 25-ward model | `wards` |
| `neighbourhoods` | Neighbourhoods, 158 model | `neighbourhoods` |
| `rentsafe` | Apartment Building Evaluations (RentSafeTO) | `rentsafe_evaluations` |
| `building_permits` | Building Permits: all active, cleared ones completed since 2025 | `building_permits` |
| `development_applications` | Development Applications | `development_applications` |
| `intersections` | Intersection File (Centreline Intersection) | `intersections` |
| `service_requests_311` | 311 Service Requests, customer initiated (one year only) | `service_requests_311`, `sr311_request_types` |
| `crime_rates` | Neighbourhood Crime Rates (TPS) | `crime_rates`, `neighbourhood_population` |
| `neighbourhood_profiles` | Neighbourhood Profiles, 2021 Census | `neighbourhood_profiles`, `neighbourhood_profile_variables` |
| `ward_profiles` | Ward Profiles, 2021 Census | `ward_profiles` |

Every row stores `source_id` (→ `sources`: dataset + file name) and `source_row_id` (the file's
`_id`, or its row number when it has none), so the AI can cite exactly which record a claim
came from.

## Storage budget (Supabase free tier, 500 MB)

All of the above comes to ~457 MB, leaving ~40 MB for app data (users, reviews; photos go to
Supabase Storage, which has its own quota). To fit, cleared permits are limited to those
completed since 2025 (`CLEARED_SINCE` in `sources/building_permits.py`) and 311 to one year.

## Things the data does and doesn't contain

- **311 requests have no coordinates and no closed date.** Location is a postal FSA (e.g. `M4L`),
  an intersection, or the ward, so "time to resolve" can't come from this file. Requests
  reported at an intersection (~19%) are placed on it when the two street names identify
  exactly one intersection: 71,799 of 82,511 in 2026. The rest have no point. The City's
  Open311 API, which had locations, was retired in 2021 and now returns 403.
  The 2026 file is Windows-1252 encoded, and about 9% of its rows have an unquoted comma
  ("Environment, Climate & Forestry"). The loader repairs both and prints any row it can't.
- **Building permits have no coordinates.** They are placed via `GEO_ID` = Address Points
  `ADDRESS_POINT_ID`.
- **Development applications use X/Y in EPSG:7991** (NAD27 / MTM zone 10). Checked against
  RentSafeTO rows that have both: median error ~10 m. 43 rows are in UTM 17N instead and are
  converted as such; points outside Toronto are dropped.
- **Crime is per neighbourhood per year**, not per incident. Rates per 100k are TPS's own.
  Blank cells mean no incidents (the file never contains a literal 0) and are stored as 0.
- **RentSafeTO** has two files with different scoring categories. One row's year evaluated
  is "202510"; impossible years are stored as null (its evaluation date is intact). Shared fields are columns;
  the per-category scores are in `item_scores` (JSON).
- Staff contact details (development applications) and builder names (permits) are not loaded.
