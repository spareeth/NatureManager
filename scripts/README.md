# Scripts

Python 3.11+. Set up once:

```
uv venv scripts/.venv && uv pip install -p scripts/.venv -r scripts/requirements.txt
```

| Script | Use |
| --- | --- |
| `setup_site_grid.py` | Compute the site grid from a boundary GeoJSON (COORDINATES.md section 1) and write `supabase/seed/02_site_tg.sql`. Rerun only if the boundary changes and before any local coordinates are published. |
| `gis/check_cad_alignment.sh` | Extract the CAD drawing's line work near the site with GDAL (GeoPackage, EPSG:3997, for QGIS) and measure bed corners against it in PostGIS. Needs `ogr2ogr` and the local stack. |
| `check_seed_logins.py` | After `supabase db reset`: every seeded user signs in by magic link and sees their own membership. |
| `hortis/profile.py` | Recompute the Hortis export profile and compare with `data/hortis/PROFILE_2026-04-27.expected.json` (task 0.8). Needs the raw export in `data/hortis/raw/2026-04-27/`. |
| `hortis/` | Hortis migration (task 1.6). |
| `simulation/` | 14-day simulation (docs/SIMULATION.md). |

Tests: `scripts/.venv/bin/python -m pytest scripts/tests`.
