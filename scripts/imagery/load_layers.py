"""Register the built layers (raster_overlay, site_basemap) and load per-bed values (bed_raster_stat).

Stress class per bed, relative to the garden for that layer: z = (bed mean - median of bed means) /
(1.4826 x MAD). High below -1.5, moderate below -0.75, else none. A relative proxy only: it flags beds
that are less green than the rest of the garden, not a measured water status.

Usage:  scripts/imagery/.venv/bin/python scripts/imagery/load_layers.py | \
          docker exec -i supabase_db_terragarden_platform psql -U postgres -q -1 -v ON_ERROR_STOP=1
"""

from __future__ import annotations

import csv
import json
import statistics
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
STATS = ROOT / "data/imagery/stats"
TILES = ROOT / "apps/web/public/tiles"

RAMP_NDVI = [[0.15, "#e6c878"], [0.3, "#aad26e"], [0.5, "#5aaa46"], [0.7, "#1e6e28"]]
RAMP_VARI = [[0.05, "#e6c878"], [0.12, "#aad26e"], [0.2, "#5aaa46"], [0.3, "#1e6e28"]]

OVERLAYS = [
    # code, name, kind, module, acquired, file, stats, legend, notes, sort, max_zoom
    ("oct2026_rgb", "Satellite image, 10 Oct 2026 (30 cm)", "imagery", "both", "2026-10-10", "oct2026_rgb", None, [],
     "SuperView Neo, true colour, Expo City Dubai extent.", 0, 18),
    ("feb2025_ndvi", "NDVI, Feb 2025 (15 cm)", "ndvi", "both", "2025-02-15", "feb2025_ndvi", "feb2025_ndvi", RAMP_NDVI,
     "Vegetation index from near-infrared (GIS team). Reference year: the newest image with near-infrared over Terra.",
     10, 18),
    ("oct2026_greenness", "Greenness, 10 Oct 2026 (visible bands)", "greenness", "both", "2026-10-10",
     "oct2026_greenness", "oct2026_greenness", RAMP_VARI,
     "VARI = (G - R) / (G + R - B). The October image has no near-infrared, so this is a visible-band proxy "
     "for vigour and water stress, weaker than NDVI. Shown on vegetation-coloured pixels only.", 20, 18),
    ("sep2026_ndvi", "Relative NDVI, Sep 2026 (north ECD only)", "ndvi", "both", None, "sep2026_ndvi", None,
     [["low", "#e6c878"], ["", "#aad26e"], ["", "#5aaa46"], ["high", "#1e6e28"]],
     "Near-infrared from the September 4-band image. It covers the north of Expo City Dubai only, not Terra "
     "Garden. Raw digital numbers (not reflectance), so values are relative within this image.", 30, 18),
    ("veg_change_2025_2026", "Vegetation change, Feb 2025 to Oct 2026", "stress", "biodiversity", "2026-10-10",
     "veg_change_2025_2026", None, [["lost", "#dc2828"], ["new", "#286edc"], ["unchanged", "#96c878"]],
     "Vegetation in Feb 2025 (NDVI over 0.2) against vegetation in Oct 2026 (classifier on the colour image, "
     "trained on the February classes). Patches of 10 m2 or more. About 2% of vegetation is wrongly called "
     "lost (checked on Terra Garden). Exploratory: confirm sites on the ground.", 40, 18),
]


def q(v) -> str:
    if v is None:
        return "null"
    if isinstance(v, (int, float)):
        return repr(v)
    return "'" + str(v).replace("'", "''") + "'"


def stress(rows: list[dict]) -> dict[str, str]:
    means = [float(r["mean"]) for r in rows]
    if len(means) < 5:
        return {r["bed"]: "none" for r in rows}
    med = statistics.median(means)
    mad = statistics.median(abs(m - med) for m in means) * 1.4826 or 1e-9
    out = {}
    for r in rows:
        z = (float(r["mean"]) - med) / mad
        out[r["bed"]] = "high" if z < -1.5 else "moderate" if z < -0.75 else "none"
    return out


def main() -> None:
    print("create temp table _site as select s.id site, s.organisation_id org from site s join organisation o "
          "on o.id = s.organisation_id where o.slug = 'terra' and s.code = 'TG';")
    for code, name, kind, module, acq, file, stats, legend, notes, sort, maxz in OVERLAYS:
        if not (TILES / f"{file}.pmtiles").exists():
            print(f"-- skipped {code}: no tiles yet")
            continue
        print(f"""insert into raster_overlay (organisation_id, site_id, module, code, name, kind, acquired_on, url,
  min_zoom, max_zoom, legend, notes, sort_order)
select org, site, {q(module)}, {q(code)}, {q(name)}, {q(kind)}, {q(acq)}, {q('/tiles/' + file + '.pmtiles')}, 12, {maxz},
  {q(json.dumps(legend))}::jsonb, {q(notes)}, {sort} from _site
on conflict (site_id, code) do update set name = excluded.name, url = excluded.url, legend = excluded.legend,
  notes = excluded.notes, acquired_on = excluded.acquired_on, max_zoom = excluded.max_zoom, sort_order = excluded.sort_order;""")
        if stats and (STATS / f"{stats}.csv").exists():
            rows = list(csv.DictReader((STATS / f"{stats}.csv").open()))
            cls = stress(rows)
            print(f"delete from bed_raster_stat where overlay_id = (select o.id from raster_overlay o, _site "
                  f"where o.site_id = _site.site and o.code = {q(code)});")
            for r in rows:
                print(f"""insert into bed_raster_stat (organisation_id, overlay_id, location_id, mean, p10, p90, valid_share, stress)
select _site.org, o.id, l.id, {r['mean']}, {r['p10']}, {r['p90']}, {r['valid_share']}, {q(cls[r['bed']])}
from _site join raster_overlay o on o.site_id = _site.site and o.code = {q(code)}
join location l on l.site_id = _site.site and l.code = {q(r['bed'])} and l.kind = 'bed';""")
    if (TILES / "dec2025_rgb.pmtiles").exists():
        print("""insert into site_basemap (organisation_id, site_id, name, kind, url, attribution, min_zoom, max_zoom,
  max_native_zoom, offline_allowed, is_default, sort_order)
select org, site, 'Satellite image, 28 Dec 2025 (Pleiades Neo)', 'pmtiles', '/tiles/dec2025_rgb.pmtiles',
  'Pleiades Neo, Expo City Dubai GIS', 12, 22, 19, false, false, 35 from _site
where not exists (select 1 from site_basemap b where b.site_id = _site.site and b.url = '/tiles/dec2025_rgb.pmtiles');""")
    if (TILES / "cad_plan.pmtiles").exists():
        print("""insert into site_basemap (organisation_id, site_id, name, kind, url, attribution, min_zoom, max_zoom,
  max_native_zoom, offline_allowed, is_default, sort_order)
select org, site, 'CAD plan (Terra Garden)', 'pmtiles', '/tiles/cad_plan.pmtiles', 'Terra landscape CAD', 15, 23, 22,
  false, false, 40 from _site
where not exists (select 1 from site_basemap b where b.site_id = _site.site and b.kind = 'pmtiles'
                  and b.url = '/tiles/cad_plan.pmtiles');""")


if __name__ == "__main__":
    main()
