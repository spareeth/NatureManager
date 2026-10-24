# Licence register

Rule: the hosted service uses permissive licences (MIT, Apache-2.0, BSD, PostgreSQL, ISC).
Anything else is flagged here before use. Update this file when adding a dependency.

| Component | Use | Licence | Status |
| --- | --- | --- | --- |
| PostgreSQL | Database | PostgreSQL Licence | OK |
| PostGIS | Spatial | GPL-2.0 (database extension, not distributed with our code) | OK, standard practice |
| Supabase (self-hosted) | Auth, REST, Storage | Apache-2.0 | OK |
| React, Vite, TanStack Query | Web | MIT | OK |
| Leaflet | Map | BSD-2-Clause | OK |
| react-leaflet | Map (React bindings) | Hippocratic-2.1 (all versions, 4.x and 5.x) | Not used. Decision 2026-09-28: plain Leaflet with in-house wrapper `apps/web/src/components/LeafletMap.tsx` |
| Dexie 4.4 | Offline store (field app, task 2.8) | Apache-2.0 | OK |
| fake-indexeddb 6.2 (dev only) | IndexedDB for unit tests | Apache-2.0 | OK |
| @zxing/browser 0.2.1 | QR/barcode scanning in the field app | MIT (corrected 2026-10-12, npm metadata) | OK |
| @zxing/library 0.23.0 | Decoder used by @zxing/browser | Apache-2.0 | OK |
| FastAPI | AI service | MIT | OK |
| open_clip + BioCLIP 2 weights | Species ID | MIT | OK |
| SpeciesNet | Camera traps | Apache-2.0 | OK |
| MegaDetector | Camera traps | MIT / Apache-2.0 / AGPL-3.0 by variant | Use MIT or Apache variant only |
| BirdNET models | Bird audio | CC BY-NC-SA 4.0 | Pilot only; licence before paid use |
| Pl@ntNet API | Plant ID | Service terms | Free plan pilot; Pro plan for service |
| IUCN Red List data | Status field | IUCN terms, no commercial use or redistribution without permission | Pilot only as stored field; permission before service |
| QField / QFieldCloud | Surveys (separate tool) | GPL-2.0+ | OK, not linked into our code |
| openMAINT, Atlas CMMS | Reference only | AGPL-3.0 | Do not copy code |
| pyproj / PROJ | CRS transforms in scripts | MIT | OK |
| SheetJS (xlsx) or openpyxl | Item request XLSX export | Apache-2.0 / MIT | Not used: the npm release of SheetJS is old (0.18.5) with known advisories; see write-excel-file |
| write-excel-file 4.1 | Item request XLSX export in the browser (task 2.11) | MIT | OK |
| fflate 0.8 | Zip for write-excel-file | MIT | OK |
| Supabase Edge Runtime (Deno) | Pull API function `supabase/functions/api` (task 2.11) | MIT | OK |
| React Router (react-router-dom) | Web routing | MIT | OK |
| Tailwind CSS, @tailwindcss/vite | Web styling | MIT | OK |
| i18next, react-i18next | Localisation (NFR-07) | MIT | OK |
| vite-plugin-pwa (Workbox) | Field PWA | MIT | OK |
| TypeScript | Web build | Apache-2.0 | OK |
| ESLint, typescript-eslint, eslint-plugin-react-hooks, eslint-plugin-react-refresh | Lint (dev only) | MIT | OK |
| Prettier | Formatting (dev only) | MIT | OK |
| Vitest, jsdom, Testing Library | Web tests (dev only) | MIT | OK |
| Uvicorn | AI service server | BSD-3-Clause | OK |
| pydantic-settings | AI service config | MIT | OK |
| pytest, httpx, ruff | AI service tests and lint (dev only) | MIT / BSD-3-Clause / MIT | OK |
| Supabase CLI | Local dev stack | MIT | OK |
| @supabase/supabase-js | Web client for Supabase Auth, REST, Storage | MIT | OK |
| Shapely | Point-in-polygon and distances in scripts | BSD-3-Clause | OK |
| Google Map Tiles API (satellite 2D tiles) | Satellite base layer (decision 1 Oct 2026) | Google Maps Platform terms, paid API with key | Check: official API only (no undocumented tile URLs); show viewport attribution; no offline caching of tiles, so not usable for the task 2.8 offline tile cache |
| jsPDF (and its MIT deps fflate, fast-png; optional html2canvas MIT, canvg MIT, DOMPurify used under Apache-2.0) | Label sheet PDF | MIT | OK |
| qrcode (node-qrcode) | QR codes on labels | MIT | OK |
| pg8000 (and scramp, MIT-0) | Database driver for the migration scripts (psycopg2 and psycopg 3 are LGPL, avoided) | BSD-3-Clause | OK |
| GDAL / OGR (system package, ogr2ogr) | Extract CAD (DXF) line work in scripts | MIT | OK, dev tool, not distributed |
