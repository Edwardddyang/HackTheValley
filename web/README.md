# Block Brief web app

Next.js app: the address search, the brief page (map + cited sections) and the API routes.
Setup, the data pipeline and how the brief is built are in the [root README](../README.md).

```sh
cp .env.example .env.local   # add the Supabase publishable key
npm install                  # also copies MapLibre's worker into public/
npm run dev                  # http://localhost:3000
```

The visual design and components come from the `feature/frontend` branch (Satwik, ogd-ola),
wired to the real data from the SQL functions.

| Path | What it is |
|---|---|
| `src/app/page.tsx` | Landing page: address search and examples (old `/?address=` links redirect) |
| `src/app/building/[id]/page.tsx` | The brief for one address point (`?r=250\|500\|1000` for the radius) |
| `src/app/api/brief`, `src/app/api/geocode` | JSON API routes |
| `src/components/dashboard/` | One panel per brief section, plus the shared panel frame |
| `src/components/map/` | Neighbourhood map, layer controls and the accessible location list |
| `src/components/search/`, `src/hooks/` | Address combobox and its search hook |
| `src/components/reviews/` | Tenant reviews (UI only, "coming soon": not saved yet) |
| `src/components/Cite.tsx` | Source tag showing the dataset, file and row behind a figure |
| `src/lib/brief.ts` | Types and calls to the SQL functions (`bb_geocode`, `bb_brief`, `bb_rentsafe_stats`) |
| `src/lib/load.ts` | Cached loaders used by the pages |
| `src/lib/format.ts` | Number/date formatting and label lookups |
