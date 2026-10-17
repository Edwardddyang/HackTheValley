# Block Brief (working name): Hack the Valley 11

## Problem and user
**User:** a Toronto renter who is about to view an apartment or sign a lease. About half of Toronto households rent (2021 Census; confirm the exact figure before the pitch).

**Problem:** what the City already knows about a building and its block is spread across a dozen portals:
- inspection scores;
- the building's age, which decides whether rent control likely applies;
- heating and AC equipment;
- towers proposed next door;
- what neighbours complain to 311 about.

Renters sign blind, and once they've signed a lease they have little leverage.

**What we build:** type an address and get a one-page, plain-language "before you sign" brief for that building and its surroundings. Every claim cites the public record it came from, and the brief ends with questions to ask the landlord at the viewing.

**Prior art (put it on a slide):** [RentSafeTO.com](https://www.rentsafeto.com/) already looks up RentSafeTO inspection scores. We differ in four ways:
1. Context around the building: construction coming, area complaints, rent benchmark.
2. A grounded AI brief and a viewing checklist.
3. A rent-control flag.
4. A ward panel for the Oct 26, 2026 election.

## Prize tracks
- **Main target: School of Cities** ($500/$300/$100). Its brief names housing and affordability first, and "grounded, location-specific explanation rather than a generic chatbot".
- Themes: Sustainable FinTech & Economic Inclusion, and AI for Social Impact.
- MLH Best Use of Gemini (Gemini is our model).
- GoDaddy Registry domain.
- DEV Writing Challenge (after the event).
- Every team is considered for Top 3.

## 2-minute demo script (this is the acceptance test)
1. **Paste a listing:** a judge pastes a real Kijiji or Facebook Marketplace rental ad (text or a screenshot). Gemini pulls out the address, asking rent and bedrooms, and the building page loads in under 5 s, showing the asking rent against CMHC's typical rent for that zone and bedroom count. Typing an address works too.
2. **Building card:** RentSafeTO score against the city median, the weakest inspection areas, and the year built, which drives "likely rent-controlled" or "likely exempt (first occupied after Nov 15, 2018), confirm with the landlord". It also shows the heating equipment's age, whether there's AC or a cooling room, and the property manager.
3. **AI brief:** each sentence has a citation chip, and tapping one shows the source row.
4. **Viewing checklist:** questions for the landlord, generated from the weak inspection areas.
5. **What's changing nearby:** a map of development applications and active permits within 500 m, with their status and any community meeting dates.
6. **Area context:** renter-relevant 311 requests in the postal area (FSA) and ward compared with the city, and CMHC's typical rent for the zone.
7. **Your ward:** renter share, the ward's average RentSafeTO score, a link to the City's official candidate list, and neutral questions renters could ask any candidate.
8. **"What this data can't tell you"** panel.

## Must ship
- Paste a listing (text or screenshot): Gemini extracts the address, asking rent and bedrooms, then runs the same flow (Ariaz). The user pastes it; we never fetch or scrape listing sites.
- Address search with autocomplete (Address Points + RentSafeTO buildings).
- Building card (Evaluations + Registration, joined on `RSN`).
- Grounded Gemini brief plus viewing checklist, citing source rows and cached per address.
- Map of development applications and active permits within 500 m.
- 311 by FSA and ward (renter-relevant types only) and the CMHC rent benchmark.
- Ward panel with the official candidate-list link (non-partisan).
- Sources page, limitations panel, and a live URL.

## Should ship (only if Must is done by Sat 6 PM)
- Nearby essentials from OpenStreetMap (preloaded, not live), flagging discount grocers.
- Nearest TTC stops.
- Tenant reviews, seeded and visibly labelled "sample data".
- Neighbourhood-level, per-capita crime trend with the TPS caveat. Never pins, never "worst neighbourhood" rankings.

## Parked (revisit if time allows)
- **Ward renter report cards:** roll every building in a ward into one card (building count, median inspection score, buildings below 70, heat complaints, units in the development pipeline) plus neutral questions for any candidate. It's the strongest answer to "how does this relate to the election?" and something RentSafeTO.com can't do, and it needs only data we already load.

## Won't ship
- Scraping Rentals.ca or REALTOR.ca (against their terms).
- Property tax and sale prices (not open data).
- School rankings and block-level crime.
- User accounts, Solana, and a separate backend service.

## Data (checked against the City's open-data API on 2026-10-16)
| Dataset | CKAN id | Join | Notes |
|---|---|---|---|
| Apartment Building Evaluations 2023–current | `apartment-building-evaluation` | `RSN`, lat/long, `WARD` | 6,902 rows. Each item is scored 1–3. Refreshed daily. Active, not retired. |
| Apartment Building Registration | `apartment-building-registration` | `RSN` | 3,611 buildings: year built, heating year, AC, cooling room, pets, property manager. |
| Development Applications | `development-applications` | X/Y (MTM, EPSG:2952) | 26,648 rows, with status, community meeting dates and application URL. Refreshed daily. |
| Building Permits: Active | `building-permits-active-permits` | `GEO_ID` (probably joins Address Points; verify) | 202k rows, mostly small. Filter to new building and demolition. No coordinates. |
| Address Points | `address-points-municipal-toronto-one-address-repository` | | About 500k points. Refreshed daily. |
| City Wards | `city-wards` | | 25-ward GeoJSON. |
| 311 Service Requests | `311-service-requests-customer-initiated` | FSA or intersection, plus ward | About 930k requests from Jan 2025 to Sep 2026, stored as monthly counts in `sr311_monthly`. **There is no per-address location and no closed date**, so never say "at this building" and never show resolution times. Type names change between years. |
| CMHC Rental Market Survey | CMHC HMIP (manual download) | zone | Static; download once. |

The CKAN API is at `https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/`. It sends no CORS header and returns at most 32k rows per call, so preload everything into the database. Never call it live during the demo.

**Limitations to state:**
- RentSafeTO covers only buildings with 3+ storeys and 10+ units, so no condos, basement units or houses.
- 311 location is coarse.
- Census data is from 2021.
- Rent control is "likely" only, because year built stands in for first occupancy.

## Team and slices
| Person | Slice |
|---|---|
| Satwik | Frontend: search, building page, map, ward panel UI |
| Edward | Data: loaders for all datasets into the database, plus the building, 500 m and area queries |
| Ariaz | Paste-a-listing, AI (grounded brief, checklist, rent-control logic), shared types in `src/contracts/types.ts`, repo and deploy |
| 4th member | Ward panel data, CMHC, sources and limitations pages, then the Devpost write-up, pitch and backup video |

## Milestones
- **Fri ~1 AM:** stack confirmed, repo scaffolded, `BuildingReport` type plus one real-building sample JSON agreed, data loading started.
- **Sat 10 AM:** core datasets loaded; the frontend renders the building page from the sample JSON.
- **Sat 2 PM:** one real address works end to end (search, building, brief).
- **Sat 6 PM:** everything under Must ship is live on the deployed URL.
- **Sat 9 PM:** initial Devpost entry submitted with all members, categories and the GitHub link. Click Submit, not just Save.
- **Sun 4 AM:** feature freeze; record the backup demo video.
- **Sun 7:30 AM:** final Devpost submit. The deadline is 8:00 or 9:30 depending on the page; ask an organizer.

## Decisions (one line each, max 15)
- 2026-10-16 23:00: tenant due-diligence app on Toronto open data, aimed at School of Cities (team; adapted from our ideas).
- 2026-10-16 23:50: 311 is shown at FSA and ward level only, because the data has no per-address location (verified).
- 2026-10-16 23:50: crime is neighbourhood-level and per-capita only, and a "should", not a "must".
- 2026-10-17 00:00: stack is Next.js on Vercel + Supabase (PostGIS) + Gemini. No Tiger Data, Vultr or separate backend (Ariaz).
- 2026-10-17 00:00: no user accounts. Saved buildings use local storage, and reviews use seeded sample data (Ariaz).
- 2026-10-17 00:10: data is loaded by `npm run etl` (Node + `pg`). Raw rows are staged, transformed and dropped to stay under the 500 MB free tier.
- 2026-10-17 00:40: paste-a-listing moves to Must ship and becomes the demo opener (Ariaz owns it). Ward renter report cards are parked.
