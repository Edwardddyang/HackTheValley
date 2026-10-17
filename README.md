# Block Brief (working name)

Before you sign a lease in Toronto, see what the City already knows about the building and the block: RentSafeTO inspection scores, building age and likely rent-control status, construction coming nearby, renter-relevant 311 complaints in the area, and your ward, in one plain-language brief that cites its sources.

Built at **Hack the Valley 11** (UTSC, Oct 16–18, 2026). The plan, demo script and data notes are in [docs/BRIEF.md](docs/BRIEF.md).

## Run it locally

Requires Node 24.

```bash
npm ci
cp .env.example .env.local   # fill in the Supabase and Gemini values
npm run dev
```

Load or refresh the Toronto open data in Supabase (downloads go to `etl/.cache/`, which is gitignored):

```bash
npm run etl -- all                  # or one dataset, e.g. npm run etl -- building_evaluations
npm run etl -- all --download-only  # fetch and pre-aggregate without touching the database
```

`npm run check` runs lint, typecheck and build; CI runs it on every pull request.

## Data sources

All City data is from [Toronto Open Data](https://open.toronto.ca/) under the Open Government Licence – Toronto: Apartment Building Evaluations (RentSafeTO), Apartment Building Registration, Development Applications, Building Permits – Active Permits, 311 Service Requests – Customer Initiated, Address Points, City Wards, Neighbourhoods, Parks and Recreation Facilities, and Toronto Public Library branches.

## AI tools we used

MLH asks teams to be open about AI use.

- Ariaz: Claude Code (scaffolding, data loaders, SQL)
- Edward: Claude (idea research, dataset survey)
- Satwik: _fill in_
- 4th member: _fill in_
