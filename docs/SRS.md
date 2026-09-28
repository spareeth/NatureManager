# Software Requirements Specification (pilot)

Status: proposed, for the Terra pilot. Priority: **M** must (pilot), **S** should (pilot if time), **C** could (post-pilot).

## 1. Purpose and context

A web and mobile platform to record, monitor and maintain outdoor living sites on a map. Pilot
organisation: Terra, Expo City Dubai. Pilot site: Terra Garden (botanical garden, 4 zones,
48 beds). Expo Valley (nature reserve with ponds) is the second site, after the pilot. The design must support many client organisations later
(garden and reserve management as a service).

## 2. Roles

| Code | Role | Summary |
| --- | --- | --- |
| `owner` | Owner | Read-only dashboards and reports for the organisation |
| `manager` | Manager | Full control of catalogues, schedules, SOPs, alert rules; approve, verify, close |
| `field_manager` | Field manager | Plan and dispatch work, verify on site, manage teams |
| `curator` | Curator / ecologist | Taxonomy, species status fields, review AI suggestions |
| `green_team` | Green team | Execute living-asset work, log observations, raise requests |
| `field_engineer` | Field engineer | Execute built-asset work, log readings, parts used, condition |
| `platform_admin` | Platform admin | Cross-organisation admin (service operator only) |

A user can hold several roles in one organisation (`membership.roles text[]`).

## 3. Functional requirements

### 3.1 Organisation, sites and spatial model (SITE)

| ID | Requirement | Pri |
| --- | --- | --- |
| FR-SITE-01 | Create organisations; every business record belongs to exactly one organisation. | M |
| FR-SITE-02 | Each organisation has sites; each site has a boundary polygon. | M |
| FR-SITE-03 | Sites contain a hierarchy of locations: zone > bed / habitat / water body > sub-area, each with a polygon, code and name. | M |
| FR-SITE-04 | Import locations from GeoJSON or GeoPackage (QField output) with validation of geometry and parent. | M |
| FR-SITE-05 | Linear features (paths, irrigation lines, streams) stored as lines with type. | S |
| FR-SITE-06 | Base maps: OSM, satellite imagery, and a site orthophoto (XYZ or COG) per site. | M |
| FR-SITE-07 | Point-in-polygon: any point record (plant, asset, observation) auto-resolves its location. | M |
| FR-SITE-08 | Site grid: each site has a local metric grid (origin in EPSG:3997, rotation, scale) with exact two-way transforms to WGS 84 (docs/COORDINATES.md). | M |
| FR-SITE-09 | Every asset shows WGS 84 lat/lon and site grid x, y; map cursor readout in both. | M |
| FR-SITE-10 | Control points: register surveyed markers; admin page shows residuals between surveyed and computed positions. | M |
| FR-SITE-11 | Place or move an asset by offset (dx, dy or distance and bearing) from a control point or bed corner; store position source and accuracy. | M |
| FR-SITE-12 | Align a CAD drawing or base map not in EPSG:3997 by a similarity fit from 3 or more control points; store RMSE. | S |

### 3.2 Taxonomy and species (TAX)

| ID | Requirement | Pri |
| --- | --- | --- |
| FR-TAX-01 | Taxon table with family, genus, species, infraspecific rank, cultivar, authorship, accepted name link for synonyms. | M |
| FR-TAX-02 | Per-organisation species attributes: in-house species code, IUCN category, level of protection, native/endemic flag, zone(s) of presence, notes. | M |
| FR-TAX-03 | Fauna taxa supported with the same structure (kingdom Animalia). | M |
| FR-TAX-04 | Search by scientific name, common name (English and Arabic), in-house code. | M |
| FR-TAX-05 | Curator-only edit of status fields, with change history. | M |
| FR-TAX-06 | Optional name matching against GBIF Backbone on import. | S |

### 3.3 Asset register (AST)

| ID | Requirement | Pri |
| --- | --- | --- |
| FR-AST-01 | Assets have a class: `living` (accession, plant, tree, planting group) or `built` (valve, pump, controller, bench, sign, bin, camera trap, sensor, aerator, fountain, fence, other). | M |
| FR-AST-02 | Asset types are a per-organisation catalogue with custom attribute schema (JSON Schema) and default PM templates. | M |
| FR-AST-03 | Each asset has geometry (point or polygon), location, status, condition (1 to 5), criticality (1 to 5), install or planting date, photos. | M |
| FR-AST-04 | Living assets link to a taxon, an accession (source, provenance, date received) and a lineage (parent plant). | M |
| FR-AST-05 | Unique tag per asset using Terra's in-house pattern `<ZONE><BED>-T<NN>_<SPECIES>` (e.g. `WG07-T04_PRO`), encoded as QR; Code 128 barcode also supported for existing labels. | M |
| FR-AST-06 | Print label sheets (PDF, A4, 24 per page) with QR, code, scientific name, common name. | M |
| FR-AST-07 | Asset history timeline: work orders, observations, condition changes, photos. | M |
| FR-AST-08 | Bulk edit and CSV import/export of assets. | S |
| FR-AST-09 | Plant status lifecycle: planned, planted, established, declining, dead, removed, with reason. | M |

### 3.4 Work orders (WO)

| ID | Requirement | Pri |
| --- | --- | --- |
| FR-WO-01 | Work order types: `preventive`, `reactive`, `inspection`, `project`. | M |
| FR-WO-02 | Statuses: requested, approved, scheduled, in_progress, on_hold, completed, verified, closed, cancelled. | M |
| FR-WO-03 | Allowed transitions and roles as in the table in section 3.4.1; enforced in the database. | M |
| FR-WO-04 | A work order targets one or more assets and/or one location. | M |
| FR-WO-05 | Fields: title, type, priority (P1 to P4), due date, planned start/end, assignee user or team, SOP, estimated and actual labour minutes, parts or materials used (free text list in pilot), photos before/after, completion notes. | M |
| FR-WO-06 | Work requests: any user (and later a public QR form) can raise a request with photo and point. | M |
| FR-WO-07 | Every transition writes an immutable event with user, time, from, to, note, GPS if on phone. | M |
| FR-WO-08 | Calendar and Kanban views for managers; map view with status colours. | M |
| FR-WO-09 | Re-plan: drag a work order to another day or assignee; bulk move a day's work (e.g. weather). | S |
| FR-WO-10 | Verification checklist for supervisors; a failed verification returns to in_progress with a reason. | M |
| FR-WO-11 | SLA per priority (P1 4 h response, P2 24 h, P3 3 days, P4 14 days, configurable); overdue flags. | M |

#### 3.4.1 Transition rules

| From | To | Allowed roles |
| --- | --- | --- |
| requested | approved, cancelled | manager, field_manager |
| approved | scheduled | manager, field_manager |
| scheduled | in_progress | assignee, field_manager |
| in_progress | on_hold, completed | assignee, field_manager |
| on_hold | in_progress | assignee, field_manager |
| completed | verified | manager, field_manager (not the assignee) |
| completed | in_progress | manager, field_manager (verification failed) |
| verified | closed | manager, field_manager, or auto after 24 h |

Preventive work orders are created directly in `scheduled`.

### 3.5 Preventive maintenance (PM)

| ID | Requirement | Pri |
| --- | --- | --- |
| FR-PM-01 | PM schedule = template (type, SOP, checklist, duration, team) + target (asset, asset type in a location, or location) + rule. | M |
| FR-PM-02 | Rules: every N days/weeks/months, specific weekdays, specific month days, seasonal window (start and end month). | M |
| FR-PM-03 | Generator runs nightly (`pg_cron`) and creates work orders for a rolling 14-day horizon, without duplicates. | M |
| FR-PM-04 | Load spreading: when a schedule targets many assets (e.g. 48 beds weekly), spread across working days with a max per day. | M |
| FR-PM-05 | Working calendar per organisation: working days, hours, public holidays, Ramadan hours. | S |
| FR-PM-06 | Meter-based PM (e.g. pump run hours from sensor) | C |

### 3.6 SOPs (SOP)

| ID | Requirement | Pri |
| --- | --- | --- |
| FR-SOP-01 | SOP library with version, title, purpose, PPE, hazards, steps (text, image, required flag, input type: tick, number, text, photo). | M |
| FR-SOP-02 | SOPs linked to work order types and PM templates; the phone shows the SOP version at the time of dispatch. | M |
| FR-SOP-03 | Required steps block completion; responses stored per work order. | M |
| FR-SOP-04 | SOPs available offline; English and Arabic text fields. | S |
| FR-SOP-05 | Approval of new SOP versions by manager. | S |

### 3.7 Observations (OBS)

| ID | Requirement | Pri |
| --- | --- | --- |
| FR-OBS-01 | Observation types: flora sighting, fauna sighting, phenology (leafing, flowering, fruiting, senescence), pest or disease, plant health, water quality, general note. | M |
| FR-OBS-02 | Fields: time, point (GPS with accuracy), location (auto), observer, photos, audio, count, life stage, notes, linked asset (optional). | M |
| FR-OBS-03 | AI suggestion on photo or audio (see AI_INTEGRATION.md); user picks one or "unknown". | M |
| FR-OBS-04 | Verification status: ai_suggested, observer_confirmed, curator_verified, rejected. | M |
| FR-OBS-05 | One tap "create work order from observation". | M |
| FR-OBS-06 | Protected or IUCN CR/EN/VU taxa: coordinates obscured for non-curator roles on shared views. | M |
| FR-OBS-07 | Darwin Core CSV export of verified observations. | S |
| FR-OBS-08 | Camera trap batch upload with MegaDetector + SpeciesNet processing. | S |

### 3.8 Sensors and alerts (ALR)

| ID | Requirement | Pri |
| --- | --- | --- |
| FR-ALR-01 | Sensors are assets with datastreams (property, unit). Readings table with time, value, quality flag. | M |
| FR-ALR-02 | Simulated feed generator for pilot (soil moisture, pond DO, pH, temperature, turbidity, water level). | M |
| FR-ALR-03 | Alert rules: threshold (above/below for N minutes), no data for N hours, overdue work order, observation of protected taxon, asset condition <= 2. | M |
| FR-ALR-04 | Alert actions: notify roles (in-app, email), optionally create a reactive work order from a template. | M |
| FR-ALR-05 | Alert states: open, acknowledged, resolved; with who and when. | M |
| FR-ALR-06 | Push notifications (Web Push) on the field app. | S |
| FR-ALR-07 | OGC SensorThings (FROST) ingestion adapter. | C |

### 3.9 Item requests and procurement hand-off (REQ)

Detail in docs/PROCUREMENT_HANDOFF.md. No purchasing in this platform.

| ID | Requirement | Pri |
| --- | --- | --- |
| FR-REQ-01 | Item catalogue per organisation (category, unit, optional taxon and size, external code). | M |
| FR-REQ-02 | Raise item requests with lines (item, qty, unit, reason maintain/replace/procure_new, linked asset, work order, bed, needed-by, optional cost). | M |
| FR-REQ-03 | Auto-draft a replacement request when a plant is recorded dead or removed, and when an asset condition drops to 1 or 2. | M |
| FR-REQ-04 | Add items needed from inside a work order on the phone (offline capable). | M |
| FR-REQ-05 | Lifecycle draft, submitted, approved, rejected, sent, acknowledged, rejected_by_receiver, fulfilled, cancelled; enforced by `ir_transition`. | M |
| FR-REQ-06 | Hand-off by CSV/XLSX export (download or scheduled email) of approved, unsent lines, marked sent with a batch id. | M |
| FR-REQ-07 | Read-only pull API with per-receiver API key, plus acknowledge endpoint that sets external reference and status. | M |
| FR-REQ-08 | Signed webhook per approved request with retries. | S |
| FR-REQ-09 | Reports: open requests by status and reason, replacement rate by zone, items needed for the next 14 days of PM. | S |

### 3.10 Dashboards and reports (DSH)

| ID | Requirement | Pri |
| --- | --- | --- |
| FR-DSH-01 | Operations: open work by status, overdue by team, completion rate this week, PM compliance (%). | M |
| FR-DSH-02 | Collections: taxa and plants by zone, IUCN-listed and protected taxa by zone, plant status changes. | M |
| FR-DSH-03 | Biodiversity: observations by taxon group and week, new species records, verification backlog. | M |
| FR-DSH-04 | Water: latest readings per pond, 14-day trend, alert count. | M |
| FR-DSH-05 | Export any list to CSV; fortnightly PDF summary for owners. | S |

### 3.11 Field app (FLD)

| ID | Requirement | Pri |
| --- | --- | --- |
| FR-FLD-01 | "My day": today's work orders sorted by location, with map. | M |
| FR-FLD-02 | Scan QR/barcode to open an asset, start its open job or raise a request. | M |
| FR-FLD-03 | Complete SOP steps, photos (compressed to max 1600 px), notes, parts used. | M |
| FR-FLD-04 | Offline for a full shift: cached jobs, SOPs, assets in assigned zones, map tiles for the site; outbox sync with retry. | M |
| FR-FLD-05 | New observation in under 3 taps from home screen. | M |
| FR-FLD-06 | Large touch targets, sunlight-readable theme, works with gloves (min 48 px targets). | M |
| FR-FLD-07 | English and Arabic UI with RTL layout. | S |

### 3.12 Hortis migration (MIG)

| ID | Requirement | Pri |
| --- | --- | --- |
| FR-MIG-01 | Load Hortis CSV exports to staging tables unchanged. | M |
| FR-MIG-02 | Map to taxon, species attributes, accession, plant asset, location (see HORTIS_MIGRATION.md). | M |
| FR-MIG-03 | Reconciliation report: counts in, loaded, rejected with reason. | M |
| FR-MIG-04 | Keep `legacy_hortis_id` on every migrated row. | M |
| FR-MIG-05 | Re-runnable (idempotent upsert on legacy key) for the parallel-run period. | M |
| FR-MIG-06 | Derive `inhouse_code` from the tag suffix and zone from the bed prefix; flag bed-prefix mismatches and duplicate tags for curator decision. | M |

## 4. Non-functional requirements

| ID | Requirement |
| --- | --- |
| NFR-01 Security | RLS on all business tables; JWT auth; storage bucket policies by organisation; audit trail on edits. |
| NFR-02 Performance | Map loads 10,000 point features in under 2 s on 4G (use clustering and bbox queries). List pages under 1 s. |
| NFR-03 Offline | Field app usable for 8 h without network; sync of 200 queued items in under 60 s. |
| NFR-04 Availability | Pilot: best effort. Service: 99.5% monthly. |
| NFR-05 Data | Daily database backup, 30-day retention; photo originals kept. |
| NFR-06 Standards | ITF2-aligned plant records, Darwin Core observations, GeoJSON/GeoPackage exchange, OGC SensorThings later. |
| NFR-07 Localisation | English first; Arabic strings and RTL ready (i18next). Units metric. Time zone Asia/Dubai, stored as UTC. |
| NFR-08 Accessibility | WCAG 2.1 AA on web app. |
| NFR-09 Portability | Self-hostable with Docker Compose; no hard dependency on a single cloud. |
| NFR-10 Licences | Hosted service uses permissive licences only; register kept in `docs/LICENCE_REGISTER.md`. |
| NFR-11 Privacy | Obscure sensitive species locations; personal data limited to staff name, email, role. |

## 5. Out of scope for the pilot

Purchase orders, supplier management, stock and inventory costing, invoicing (these stay in the
receiving procurement/ERP system); Expo Valley site; native store apps; sensor hardware; public
visitor app; client billing and self-service onboarding.
