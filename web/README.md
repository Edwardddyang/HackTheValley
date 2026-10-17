# Block Brief web app

Next.js app: the address search, the brief page (map + cited sections) and the API routes.
Setup, the data pipeline and how the brief is built are in the [root README](../README.md).

```sh
cp .env.example .env.local   # add the Supabase publishable key
npm install                  # also copies MapLibre's worker into public/
npm run dev                  # http://localhost:3000
```

| Path | What it is |
|---|---|
| `src/app/page.tsx` | Landing page and brief page |
| `src/app/api/brief`, `src/app/api/geocode` | JSON API routes |
| `src/components/` | Map, search box, brief sections, citation tags |
| `src/lib/brief.ts` | Types and calls to the SQL functions (`bb_geocode`, `bb_brief`) |
| `src/lib/load.ts` | Cached loader used by the page |
| `src/lib/format.ts` | Number/date formatting and label lookups |
