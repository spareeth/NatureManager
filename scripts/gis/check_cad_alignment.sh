#!/usr/bin/env bash
# Check that a CAD drawing (DXF) lines up with the bed polygons (docs/COORDINATES.md section 5).
#
#   scripts/gis/check_cad_alignment.sh path/to/drawing.dxf [out.gpkg]
#
# 1. GDAL extracts the drawing's line work near Terra Garden into a GeoPackage in EPSG:3997
#    (seconds, little memory; also handy to open in QGIS next to data/gis/TG_beds_new.geojson).
# 2. PostGIS measures every bed corner against the nearest CAD line and reports the distances and
#    the mean offset (a systematic shift would need the Helmert fit in COORDINATES.md section 3).
# Uses a temporary schema scratch_cad in the local database and drops it afterwards.
# Needs GDAL (ogr2ogr) and the local Supabase stack.
set -euo pipefail

dxf=${1:?usage: check_cad_alignment.sh drawing.dxf [out.gpkg]}
out=${2:-${dxf%.*}_site.gpkg}
# Terra Garden boundary box in EPSG:3997 with a 50 m margin (data/gis/TG_boundary.geojson).
bbox=(481768 2761359 482095 2761678)
pg="host=127.0.0.1 port=54322 dbname=postgres user=postgres password=postgres active_schema=scratch_cad"

rm -f "$out"
ogr2ogr -f GPKG "$out" "$dxf" -a_srs EPSG:3997 -spat "${bbox[@]}" -nln cad_lines \
  -nlt PROMOTE_TO_MULTI -skipfailures --config DXF_INLINE_BLOCKS TRUE 2>/dev/null
echo "extract: $out"

psql_() { docker exec -i supabase_db_terragarden_platform psql -U postgres -qAt -v ON_ERROR_STOP=1 "$@"; }
psql_ -c "drop schema if exists scratch_cad cascade" -c "create schema scratch_cad" 2>/dev/null
trap 'psql_ -c "drop schema if exists scratch_cad cascade" >/dev/null 2>&1' EXIT
ogr2ogr -f PostgreSQL "PG:$pg" "$out" cad_lines -nln cad_lines -lco GEOMETRY_NAME=geom -nlt GEOMETRY -skipfailures 2>/dev/null
psql_ < "$(dirname "$0")/cad_alignment.sql"
