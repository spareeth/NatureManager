# Build phases

Proposed pilot plan, about 11 weeks part-time. Work one phase at a time. Each task lists the
SRS IDs it covers. Finish the phase checks before moving on. At the end of each task, list the
changed files.

Suggested way to start each phase in Claude Code:

> Read CLAUDE.md, docs/SRS.md and docs/DATA_MODEL.md. We are on Phase N in docs/BUILD_PHASES.md.
> Do task N.1 only. Show the plan first, then implement, then run the checks.

---

## Phase 0: Foundations (weeks 1 to 2)

| Task | Covers |
| --- | --- |
| 0.1 Monorepo scaffold: `apps/web` (Vite React TS, Tailwind, react-leaflet, TanStack Query, i18next, vite-plugin-pwa), `services/ai` (FastAPI), `supabase/`, `scripts/`. Add `.env.example`, ESLint, Prettier, Vitest, pytest. | NFR-09 |
| 0.2 Migrations: organisation, team, membership, RLS helper functions `auth_org_ids`, `has_role`, audit trigger. | FR-SITE-01, NFR-01 |
| 0.3 Migrations: site (with grid columns), location, line_feature, control_point with GiST indexes; point-in-polygon helper `resolve_location(geom)`; `site_to_local` / `site_from_local` with a round-trip test (1,000 random points, error under 1 mm). | FR-SITE-02..08 |
| 0.4 Migrations: taxon, org_taxon, asset_type, accession, asset, asset_status_change, media. | FR-TAX, FR-AST |
| 0.5 Seed: organisation Terra; site TG from `TG_boundary.geojson` with its site grid (`scripts/setup_site_grid.py`); teams; one user per role (`owner@`, `manager@`, `fieldmanager@`, `curator@`, `green1@`, `green2@`, `engineer1@`); asset type catalogue. | FR-AST-02 |
| 0.6 RLS test script: create second organisation, prove zero cross-reads on every table. | NFR-01 |
| 0.7 Web shell: login (magic link), organisation switcher, role-aware nav, empty map page. | |
| 0.8 Hortis profile: run `scripts/hortis/profile.py` on the 27 April 2026 export and compare with `data/hortis/PROFILE_2026-04-27.md`. Check the CRS of `TG_beds_new` and the CAD drawing (COORDINATES.md section 5). | FR-MIG-01 |

**Checks:** `supabase db reset` clean; RLS test passes; grid round-trip test passes; login as each seeded role works; Hortis profile matches.

---

## Phase 1: Map and asset register (weeks 3 to 4)

| Task | Covers |
| --- | --- |
| 1.1 Import `TG_beds_new.geojson` as 48 beds (`scripts/import_locations.py`), dissolve to zones EG, NG, SG, WG; check codes match the 48 Hortis location names. | FR-SITE-04 |
| 1.2 Map page: base layers (OSM, imagery, `CAD_basemap.tif` as COG), bed polygons by zone, asset points, legend, layer toggles, cursor readout in lat/lon and site grid x, y. | FR-SITE-06, 09, NFR-02 |
| 1.3 Asset list and detail pages; detail shows timeline (events, photos, status changes). | FR-AST-03, 07 |
| 1.4 Create and edit asset from map (click to place, draw polygon for planting groups); attributes form rendered from `asset_type.attribute_schema`. | FR-AST-01..04 |
| 1.5 Tag code generator and QR route `/a/:tag`; label sheet PDF (24 per A4). | FR-AST-05, 06 |
| 1.6 Hortis migration per HORTIS_MIGRATION.md: stage, transform (species codes from tags, zones from bed prefix), validate, curator flag CSV, promote, reconciliation. | FR-MIG-01..06 |
| 1.8 Control points page and offset placement (dx, dy or distance and bearing) on web and phone. | FR-SITE-10, 11 |
| 1.7 Taxon search (scientific, common, in-house code) and curator edit of org_taxon with history. | FR-TAX-04, 05 |

**Gate 1:** Hortis records reconciled (report reviewed, rejects explained); Terra Garden map (48 beds, site grid, control points) signed off.

---

## Phase 2: Work orders, PM, SOPs and field app (weeks 5 to 7)

| Task | Covers |
| --- | --- |
| 2.1 Migrations: sop, sop_step, wo_template, pm_schedule, work_order, work_order_asset, work_order_event, sop_response. Number sequence per organisation. | FR-WO, FR-PM, FR-SOP |
| 2.2 `wo_transition()` with the transition table, SOP completeness check, self-verification block. Unit tests for every allowed and forbidden transition. | FR-WO-02, 03, 07, 10 |
| 2.3 PM generator `pm_generate(org, until_date)` with rule parser and load spreading; nightly `pg_cron` job; idempotent. | FR-PM-01..04 |
| 2.4 Manager UI: request inbox, approve, schedule; calendar (week) and Kanban; map view by status; SLA and overdue badges. | FR-WO-06, 08, 11 |
| 2.5 SOP library UI with step editor (EN/AR fields), versioning, approve. | FR-SOP-01..05 |
| 2.6 Field PWA `/field`: My day, job detail, SOP runner, photos, notes, materials, complete. | FR-FLD-01, 03, 06 |
| 2.7 QR/barcode scan with `@zxing/browser`: open asset, start its job, raise request. | FR-FLD-02 |
| 2.8 Offline: Dexie stores (jobs, sops, assets, outbox), service worker tile cache for site bbox zoom 15 to 19, sync worker with retry and `client_uuid`. | FR-FLD-04, NFR-03 |
| 2.9 Verification screen for field manager, with fail reason. | FR-WO-10 |
| 2.10 Item requests: item catalogue (plants generated from taxa), request and lines, `ir_transition`, auto-draft on plant death and low condition, add items from a work order on the phone. | FR-REQ-01..05 |
| 2.11 Hand-off: CSV/XLSX export of approved lines with batch id, pull API with API key and acknowledge endpoint, transactional outbox. | FR-REQ-06, 07 |

**Gate 2:** one preventive work order runs end to end with the phone in flight mode: open, SOP, photos, add an item, complete, then sync, verify, close; the item request is approved and appears in the export.

---

## Phase 3: Observations and AI (weeks 8 to 9)

| Task | Covers |
| --- | --- |
| 3.1 Migrations: observation, ai_suggestion. | FR-OBS |
| 3.2 Field "New observation" flow (type, photo or audio, GPS, count, notes) in 3 taps; offline queue. | FR-OBS-01, 02, FR-FLD-05 |
| 3.3 AI service `/identify` (see AI_INTEGRATION.md): Pl@ntNet adapter, BioCLIP 2 local with species list, result normalisation and collection check. | FR-OBS-03 |
| 3.4 Suggestion picker on the phone; curator review queue on web (accept, change taxon, reject). | FR-OBS-04 |
| 3.5 Create work order from observation (pest, damage, dead plant). | FR-OBS-05 |
| 3.6 Sensitive taxa obscuring in shared views. | FR-OBS-06 |
| 3.7 Darwin Core CSV export. | FR-OBS-07 |
| 3.8 (S) Camera trap batch: MegaDetector MIT/Apache variant + SpeciesNet `--country ARE`. | FR-OBS-08 |

**Checks:** a plant photo returns ranked suggestions with in-house codes; a protected-taxon observation raises an alert once Phase 4 rules exist (stub now).

---

## Phase 4: Alerts, dashboards, simulation and demo (weeks 10 to 11)

| Task | Covers |
| --- | --- |
| 4.1 Migrations: datastream, sensor_reading, alert_rule, alert, notification. | FR-ALR |
| 4.2 Simulated sensor generator (`scripts/simulation/sensors.py`): diurnal curves, noise, scripted excursions. | FR-ALR-02 |
| 4.3 Alert evaluator `alerts_evaluate()` every 5 minutes via `pg_cron`; actions notify and optional work order. | FR-ALR-03, 04 |
| 4.4 Alert inbox with acknowledge and resolve; in-app notifications; email via Supabase SMTP. | FR-ALR-05 |
| 4.5 Dashboards: operations, collections, biodiversity, irrigation, item requests. | FR-DSH-01..04, FR-REQ-09 |
| 4.6 14-day simulation per SIMULATION.md with a simulated clock and a demo script. | |
| 4.7 Licence register review and README for the team. | NFR-10 |

**Gate 3:** demo to the Terra team following `docs/SIMULATION.md`.

---

## After the pilot (not planned in detail)

Expo Valley nature reserve as the second site (habitats, ponds, water quality, camera traps),
Arabic UI and RTL, Web Push, webhook hand-off and ERP connector, FROST SensorThings adapter, native apps (Expo) if PWA limits bite,
public QR plant pages, client onboarding and billing, white-label theming, GBIF/BGCI publishing,
EO layers from TerraWatch (NDVI, LST per bed).
