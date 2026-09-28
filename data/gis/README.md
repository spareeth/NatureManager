# GIS inputs (Terra Garden)

| File | Features | CRS | Notes |
| --- | --- | --- | --- |
| `TG_boundary.geojson` | 1 MultiPolygon | CRS84 (WGS 84 lon/lat) | Site boundary, 29,876 m2 (computed in EPSG:3997) |
| `TG_beds_new.geojson` | 48 MultiPolygons, field `Name` (EG-01 .. WG-10), `fid` | CRS84 | QGIS layer `terra_beds_new`; 6,275 m2 of beds in total (EG 2,170, NG 1,433, SG 1,163, WG 1,509); smallest bed 17 m2, largest 560 m2 |
| `qa_tree_points_outside_beds.csv` | 95 rows | n/a | Hortis tree points that fall outside every bed polygon, with distance to their recorded bed (m) and whether they are inside the boundary |

Source: copied from `C:\ECD_work\TerraGarden\Analysis\` (same file sizes as `TG_beds_new.geojson`
and `TG_boundary.geojson` in the OneDrive TerraGardens folder). All 48 bed names match the 48 Hortis
location names exactly. All geometries are valid and all beds lie inside the boundary.

Checks run on 28 Sep 2026 against the Hortis export (396 tree points):

- 301 points fall inside their recorded bed.
- 95 points fall outside every bed: median 0.7 m, max 5.9 m from their bed; 72 are within 2 m.
  Treat as position error; do not move automatically. 14 of them are also just outside the boundary
  (0.3 to 3.1 m), all in West Garden beds WG-03, WG-07 and WG-08.
- Of the 37 tags whose bed prefix differs from Location name, 33 points lie inside the recorded
  Location bed and none inside the bed named in the tag (4 are outside all beds). So the location
  is right and the tag prefix is out of date: propose re-tagging, curator to confirm.

Proposed Terra Garden site grid origin (EPSG:3997): E 481808, N 2761399 (boundary south-west
corner minus 10 m, rounded). The garden then spans about x 0 to 237 m, y 0 to 229 m.
Not yet checked: CRS of the CAD drawing `92001-SDW-C144200-LT-200001(C).dxf`.
