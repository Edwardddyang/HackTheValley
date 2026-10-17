# AGENTS.md: Block Brief (Hack the Valley 11)
Stack: Next.js 16 (App Router, TypeScript, Tailwind) on Vercel + Supabase (Postgres + PostGIS) + Gemini. npm only. No user accounts.
Read docs/BRIEF.md (demo script, must/won't list, data table) before you start.

## Commands
- `npm ci` install · `npm run dev` run locally
- `npm run check` lint + typecheck + build; run before every PR
- `npm run etl -- <dataset>` (re)load one Toronto dataset into Supabase; `npm run etl -- all` loads everything. Needs `SUPABASE_DB_URL` in `.env.local`.

## Who owns what (stay in your area; ask before editing someone else's)
| Area | Owner | Paths |
|---|---|---|
| Frontend: search, report page, map, ward panel UI | Satwik | src/app/, src/components/ |
| Data: loaders, tables, SQL functions | Edward | etl/ |
| Paste-a-listing, AI brief, viewing checklist, rent-control logic | Ariaz | src/lib/ai/, src/app/api/brief/, src/app/api/listing/ |
| Shared types | Ariaz | src/contracts/types.ts |
| Ward content, CMHC, sources and limitations copy, Devpost | 4th member | src/content/, docs/ |
| package.json, lockfile | Ariaz | |

## Data rules
- 311 has no per-address location (postal area/FSA or intersection only). Never say "at this building".
- Crime only at neighbourhood level, per capita, with the TPS caveat. Never rank "worst" neighbourhoods.
- The AI only sees rows we retrieved, and every sentence it writes cites a row id from them.
- Never call the City's CKAN API from the browser or during the demo; read from Supabase.
- Label seeded reviews or rents as "sample data" in the UI.

## Never
1. Never commit .env files or keys; put variable names in .env.example.
2. Never give a secret a `NEXT_PUBLIC_` prefix (SUPABASE_SECRET_KEY, SUPABASE_DB_URL, GEMINI_API_KEY stay server-side).
3. Never run DROP or TRUNCATE on public tables by hand; reload with `npm run etl`.
4. Never push or force-push to main.
5. Never edit package.json or src/contracts without the owner.

## Team rules
- Branch per task -> small PR -> merge it yourself when CI is green.
- Pull main after every merge.
- Tasks and status live in ClickUp, not in repo files.
- Edit AGENTS.md only; CLAUDE.md just imports it.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
