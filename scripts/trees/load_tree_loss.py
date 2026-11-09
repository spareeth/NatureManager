"""Store the isolated-tree loss analysis in analysis_result (for the Biodiversity page).

Reads data/trees/isolated/trees_dec2025.geojson and summary.json (from isolated_trees.py). Only mature
crowns (20 m2 or more) are mapped: smaller ones were not reliable on checking. The summary keeps both
size classes, the vegetated area per date and the checks.

Usage: scripts/imagery/.venv/bin/python scripts/trees/load_tree_loss.py | \
         docker exec -i supabase_db_terragarden_platform psql -U postgres -q -1 -v ON_ERROR_STOP=1
"""

from __future__ import annotations

import json
from pathlib import Path

D = Path(__file__).resolve().parents[2] / "data/trees"
MATURE_M2 = 20


def q(v) -> str:
    return "'" + str(v).replace("'", "''") + "'"


def main() -> None:
    trees = json.loads((D / "isolated/trees_dec2025.geojson").read_text())["features"]
    iso = json.loads((D / "isolated/summary.json").read_text())
    crowns = json.loads((D / "crowns/summary.json").read_text())

    def stats(sel):
        ts = [t["properties"] for t in trees if sel(t["properties"]["area_m2"])]
        c = {s: sum(1 for t in ts if t["status"] == s) for s in
             ("lost by Apr 2026", "lost Apr to Oct 2026", "still there", "flicker", "unclear")}
        lost = c["lost by Apr 2026"] + c["lost Apr to Oct 2026"]
        err = c["flicker"] / max(c["still there"] + c["flicker"], 1)
        return {"isolated": len(ts), "lost": lost, "lost_by_apr": c["lost by Apr 2026"],
                "lost_apr_to_oct": c["lost Apr to Oct 2026"], "still_there": c["still there"],
                "unclear": c["unclear"], "flicker_rate": round(err, 3),
                "lost_low": max(0, round(lost - err * c["still there"])),
                "lost_crown_m2": round(sum(t["area_m2"] for t in ts if t["status"].startswith("lost")))}

    summary = {
        "mature": stats(lambda a: a >= MATURE_M2),
        "small": stats(lambda a: a < MATURE_M2),
        "mature_min_crown_m2": MATURE_M2,
        "vegetated_ha": {"dec2025": 46.7, "apr2026": 45.5, "oct2026": 41.4},
        "checked_by_eye": {"mature_real": "about 10 of 12", "small_real": "about 4 of 12"},
        "detector_pixel_accuracy": crowns["held_out_pixel_accuracy"]["pixel_accuracy"],
        "rules": iso["rules"],
    }
    feats = [{"type": "Feature", "geometry": t["geometry"],
              "properties": {"crown_m2": t["properties"]["area_m2"], "when": t["properties"]["status"]}}
             for t in trees
             if t["properties"]["area_m2"] >= MATURE_M2 and t["properties"]["status"].startswith("lost")]
    fc = {"type": "FeatureCollection", "features": feats}
    method = ("Visible bands only, three dates (Pleiades Neo 28 Dec 2025; SuperView Neo 24 Apr and 10 Oct 2026) on "
              "one 30 cm grid. A vegetation model learned the December colours from the December NDVI, then "
              "mapped all dates the same way. Isolated trees: compact patches of 4 to 150 m2 with almost no "
              "vegetation within 3 m. Each tree judged on its own footprint after per-block registration. "
              "Lost: absent in October (and when absent in April too, lost by April). Trees that vanish in "
              "April and return in October give the error rate. Exploratory: confirm on site.")
    print(f"""insert into analysis_result (organisation_id, site_id, code, title, period_from, period_to, summary,
  features, method)
select s.organisation_id, s.id, 'tree_loss_2025_2026', 'Isolated trees lost, Dec 2025 to Oct 2026',
  '2025-12-28', '2026-10-10', {q(json.dumps(summary))}::jsonb, {q(json.dumps(fc))}::jsonb, {q(method)}
from site s join organisation o on o.id = s.organisation_id where o.slug = 'terra' and s.code = 'TG'
on conflict (site_id, code) do update set summary = excluded.summary, features = excluded.features,
  method = excluded.method, title = excluded.title;""")


if __name__ == "__main__":
    main()
