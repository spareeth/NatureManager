# Coordinates: WGS 84, Dubai Local TM and the site grid

Terra Garden is small (about 200 m by 220 m) and tagged trees stand a few metres apart, so phone
GPS alone (typically several metres of error) is not enough to place or find a single tree.
The platform therefore uses three linked coordinate systems. The links are exact transforms,
so any point can be shown in all three.

| Layer | CRS | Role |
| --- | --- | --- |
| Canonical storage | EPSG:4326, WGS 84 lat/lon | All `geometry` columns, web maps, GPS, Hortis lat/lon, exchange |
| Metric working CRS | EPSG:3997, WGS 84 / Dubai Local TM (`+proj=tmerc +lon_0=55.3333333333333 +k=1 +x_0=500000 +y_0=0 +datum=WGS84 +units=m`) | Areas, distances, buffers, CAD and survey import. Area of use covers Dubai (lon 54.84 to 55.55 E); Terra Garden at 55.154 E is inside |
| Site grid | Per site, SRID 0 (local), metres | Field placement by tape offsets, bed plans, labels, printed plans |

## 1. Site grid definition

Stored on `site` (see DATA_MODEL.md):

| Column | Meaning |
| --- | --- |
| `grid_origin_e`, `grid_origin_n` | Origin of the site grid in EPSG:3997 metres |
| `grid_rotation_deg` | Angle, counter-clockwise, from the EPSG:3997 easting axis to the site grid x axis. 0 = grid aligned to Dubai Local TM |
| `grid_scale` | Scale factor, default 1.0 (use only when aligning a CAD drawing drawn in mm or with a wrong scale) |
| `grid_name` | e.g. "Terra Garden Grid 2026" |

Default for Terra Garden (set by `scripts/setup_site_grid.py`): origin = south-west corner of the
`TG_boundary` bounding box in EPSG:3997, rounded down to the whole metre, minus 10 m on each axis
so every point in the garden has positive x, y. Rotation 0 unless the curator wants the grid
aligned to the main path axis; in that case measure the path bearing from the beds layer and
set the rotation once, before any local coordinates are published. Never change a published grid;
create a new grid version instead.

## 2. Transform functions (PostGIS)

```sql
-- WGS 84 (or any SRID) geometry -> local site grid (SRID 0)
create or replace function site_to_local(p_site uuid, p_geom geometry)
returns geometry language sql stable as $$
  select st_scale(
           st_rotate(
             st_translate(st_transform(p_geom, 3997), -s.grid_origin_e, -s.grid_origin_n),
             -radians(s.grid_rotation_deg), 0, 0),
           1 / s.grid_scale, 1 / s.grid_scale)
  from site s where s.id = p_site
$$;

-- local x, y -> WGS 84 point
create or replace function site_from_local(p_site uuid, p_x double precision, p_y double precision)
returns geometry language sql stable as $$
  select st_transform(
           st_setsrid(
             st_translate(
               st_rotate(st_scale(st_makepoint(p_x, p_y), s.grid_scale, s.grid_scale),
                         radians(s.grid_rotation_deg), 0, 0),
               s.grid_origin_e, s.grid_origin_n),
             3997),
           4326)
  from site s where s.id = p_site
$$;
```

The built `site_to_local` wraps the result in `st_setsrid(..., 0)` explicitly (PostGIS keeps
SRID 3997 otherwise). Test (`supabase/tests/0003_spatial.test.sql`): 1,000 random points inside
the real boundary, `site_from_local(site_to_local(g))` within 1 mm of `g`, for rotation 0 and for
rotation 23.7 degrees with scale 1.0005.

`asset.local_x`, `asset.local_y` (numeric, 2 decimals) are kept by a trigger on insert/update of
`geom`, using the centroid for polygons.

## 3. Control points

Table `control_point` (DATA_MODEL.md). 6 to 10 permanent markers (bed corners, pins or kerb marks)
spread across the four zones. Source for each: RTK GNSS survey, CAD drawing, or the georeferencing
points file of the Hortis template base map (`(Template) Landscape base for hortis.jpg_gcpPoints.points`,
QGIS georeferencer format: mapX, mapY, sourceX, sourceY).

Uses:
- check the grid: residual between surveyed and computed coordinates, shown on an admin page;
- align a CAD drawing or base map that is not in EPSG:3997, by a 4-parameter similarity (Helmert)
  fit from at least 3 control points; store the fit and its RMSE with the layer;
- give field staff a start point for offset measurements.

## 4. Placing a tree by offset (field app)

1. Pick a control point or a bed corner.
2. Enter dx, dy in metres on the site grid, or distance and bearing.
3. The app calls `site_from_local(site, x0 + dx, y0 + dy)` through an RPC and shows the result on the
   map before saving. Source of position is stored: `gps`, `rtk`, `offset`, `cad`, `hortis`, `bed_centroid`.

As built (task 1.8): the map offers "Add by offset" (from a control point or a snapped bed corner),
"Move on map" with a click or an offset, and "Move by offset" (dx, dy from the current position,
also for planting group polygons through `asset_move_offset`). Bearings are clockwise from **grid
north** (+y) (decision 11 Oct 2026): dx = d sin(b), dy = d cos(b). With rotation 0, grid north and
true north differ by under 0.1 degrees here; compass bearings need the local magnetic declination
added first. Typed positions (WGS 84, Dubai TM E/N, or grid x/y) are converted by `site_point`.

## 5. Open checks before Phase 1

- [x] CRS of `TG_beds_new` and `TG_boundary`: CRS84 (WGS 84 lon/lat), checked 28 Sep 2026. Load directly as EPSG:4326.
- [x] CRS of the CAD drawing `92001-SDW-C144200-LT-200001(C).dxf`: **EPSG:3997 (Dubai Local TM), metres,
      aligned with our layers**, checked 11 Oct 2026 with `scripts/gis/check_cad_alignment.sh`. The drawing
      extents contain the TG boundary in EPSG:3997 (UTM 40N would put eastings near 300,000). Against the
      CAD line work, the 1,448 bed polygon corners have a mean offset of 0.012 m E, -0.007 m N (no systematic
      shift, no Helmert correction needed) and a median distance of 0.15 m (86% within 0.5 m, 97% within
      1 m; same in every zone): the beds were traced from this drawing with about 15 cm scatter. The CAD
      can be used as a basemap and for control point reference positions without transformation.
      Visual check in QGIS (CAD extract over `TG_beds_new`, EPSG:3997) confirmed the match, 11 Oct 2026.
- [x] Hortis tree points vs beds: 301 of 396 inside their bed; 95 outside all beds (median 0.7 m, max 5.9 m away).
      This is the positional error the site grid and control points are meant to remove. See `data/gis/README.md`.
- [ ] Are there surveyed markers on site already?

Proposed origin from the real boundary: **E 481808, N 2761399** (EPSG:3997), rotation 0, scale 1.
The garden then spans about x 0 to 237 m and y 0 to 229 m.
