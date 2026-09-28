# CLAUDE.md: Terra Garden & Reserve Management Platform (pilot)

Read this file first in every session. Then read the doc named in the current task.

## What we are building

A map-first, multi-tenant platform to manage outdoor living sites: botanical gardens, nature
reserves and water bodies. It combines:

- a spatial asset register (living plants and built assets) with QR/barcode tags
- CMMS/CAFM work orders, preventive schedules and SOP checklists
- field observations of flora and fauna with AI species suggestions
- sensor readings, alert rules and dashboards

Pilot tenant: **Terra, Expo City Dubai**. Pilot site: **Terra Garden only** (botanical garden,
about 200 m by 220 m, 4 zones EG/NG/SG/WG, 48 beds EG-01..EG-12, NG-01..NG-15, SG-01..SG-11,
WG-01..WG-10). **Expo Valley** nature reserve is the second site, after the pilot; keep the model
generic (habitats, water bodies) but do not build Expo Valley features now.

Hortis (current flora database) is migrated once from the 27 April 2026 export (77 taxa,
77 accessions, 666 plant records, 396 tagged trees with coordinates). After migration this
platform is the master.

The platform also records item requests (maintain, replace, procure) and hands approved
requests to external procurement/ERP systems. It does not do purchasing itself.

## Docs (source of truth)

| File | Use it for |
| --- | --- |
| `docs/SRS.md` | Functional and non-functional requirements (IDs like FR-WO-03) |
| `docs/DATA_MODEL.md` | Tables, columns, enums, RLS rules |
| `docs/BUILD_PHASES.md` | Phase-by-phase tasks and acceptance checks |
| `docs/HORTIS_MIGRATION.md` | Mapping Hortis export to our schema |
| `docs/AI_INTEGRATION.md` | The `/identify` service and model choices |
| `docs/SIMULATION.md` | The 14-day work order seed and demo script |
| `docs/COORDINATES.md` | WGS 84, Dubai Local TM and the Terra Garden site grid |
| `docs/PROCUREMENT_HANDOFF.md` | Item requests and the export/API hand-off |
| `data/hortis/PROFILE_2026-04-27.md` | What the real Hortis export contains |
| `data/gis/README.md` | Boundary and 48 bed polygons (GeoJSON, CRS84) and the point QA results |

If code and docs disagree, stop and ask. Do not silently change the data model.

## Stack (fixed for the pilot)

- **Database:** PostgreSQL 16 + PostGIS 3, via Supabase (local: `supabase start`).
- **Auth and storage:** Supabase Auth (email magic link), Supabase Storage buckets `photos`, `sop-media`, `audio`.
- **Web app:** React 18 + TypeScript + Vite, Leaflet (react-leaflet), TanStack Query, Tailwind.
- **Field app:** same Vite codebase, route `/field`, installable PWA (vite-plugin-pwa), offline queue in IndexedDB (Dexie), QR/barcode scanning with `@zxing/browser`.
- **Jobs:** `pg_cron` + SQL functions for PM generation and alert evaluation.
- **AI service:** Python 3.11, FastAPI, in `services/ai/`, Docker image.
- **Sensors (simulated in pilot):** readings written to `sensor_reading`; FROST SensorThings adapter is a later phase.
- **Tests:** Vitest (web), pytest (AI service), pgTAP or SQL test scripts for RLS.

## Repo layout

```
/supabase/migrations/     numbered SQL migrations, never edit a merged one
/supabase/seed/           seed SQL and CSV (sites, zones, beds, users, catalogues)
/apps/web/                React app (web + /field PWA)
/services/ai/             FastAPI identify service
/scripts/hortis/          Python migration scripts
/scripts/simulation/      14-day simulation generator
/data/hortis/             Hortis export (raw, git-ignored) and profile report
/data/gis/                TG_boundary.geojson, TG_beds_new.geojson (CRS84), QA tables
/docs/                    specs listed above
```

## Rules for Claude Code

1. **Multi-tenant always.** Every business table has `organisation_id uuid not null` and an RLS policy. Never write a query that relies on the client to filter by organisation.
2. **Geometry:** store in EPSG:4326 (`geometry(..., 4326)`). Compute areas and distances in EPSG:3997 (WGS 84 / Dubai Local TM, metres). Field and plan coordinates use the site grid via `site_to_local()` / `site_from_local()` only (see `docs/COORDINATES.md`); never hand-roll the transform in the frontend.
3. **Names:** use the table and column names in `docs/DATA_MODEL.md` exactly. snake_case in SQL, camelCase in TypeScript via generated types (`supabase gen types`).
4. **Work order state changes** only through the SQL function `wo_transition(wo_id, to_status, note)`, which checks role permissions and writes `work_order_event`. No direct `update work_order set status`.
5. **Offline:** field app writes go to the Dexie outbox first, then sync. Each outbox item has a client-generated UUID so replays are idempotent.
6. **Licences:** only MIT, Apache-2.0, BSD or similar in the hosted service. Record any new dependency with its licence in `docs/LICENCE_REGISTER.md`. Flag AGPL, GPL or non-commercial items before adding.
7. **One phase at a time.** Work from `docs/BUILD_PHASES.md`. Finish the acceptance checks of a phase before starting the next.
8. **State changed files** at the end of each task, as a list of paths.
9. **No em dashes** in UI copy or docs. Use commas or full stops.
10. **Secrets** only in `.env.local` (git-ignored). Provide `.env.example`.

## Commands

```
supabase start                      # local Postgres, Auth, Storage
supabase db reset                   # apply migrations + seed
supabase gen types typescript --local > apps/web/src/types/db.ts
cd apps/web && npm run dev          # web on :5173, field app at /field
cd services/ai && uvicorn app.main:app --reload --port 8088
python scripts/simulation/run.py --days 14 --start 2026-11-01
```

## Definition of done (every task)

- Migrations apply cleanly on `supabase db reset`.
- RLS test proves a user in organisation B cannot read organisation A rows.
- Type check and lint pass. New logic has a test.
- Changed files listed.
