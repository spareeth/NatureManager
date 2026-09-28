# Licence register

Rule: the hosted service uses permissive licences (MIT, Apache-2.0, BSD, PostgreSQL, ISC).
Anything else is flagged here before use. Update this file when adding a dependency.

| Component | Use | Licence | Status |
| --- | --- | --- | --- |
| PostgreSQL | Database | PostgreSQL Licence | OK |
| PostGIS | Spatial | GPL-2.0 (database extension, not distributed with our code) | OK, standard practice |
| Supabase (self-hosted) | Auth, REST, Storage | Apache-2.0 | OK |
| React, Vite, TanStack Query | Web | MIT | OK |
| Leaflet, react-leaflet | Map | BSD-2 / Hippocratic-2.1 (check react-leaflet version) | Check |
| Dexie | Offline store | Apache-2.0 | OK |
| @zxing/browser | QR/barcode | Apache-2.0 | OK |
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
| SheetJS (xlsx) or openpyxl | Item request XLSX export | Apache-2.0 / MIT | OK |
