# Scripts

Python 3.11+. Set up once:

```
uv venv scripts/.venv && uv pip install -p scripts/.venv -r scripts/requirements.txt
```

| Script | Use |
| --- | --- |
| `setup_site_grid.py` | Compute the site grid from a boundary GeoJSON (COORDINATES.md section 1) and write `supabase/seed/02_site_tg.sql`. Rerun only if the boundary changes and before any local coordinates are published. |
| `check_seed_logins.py` | After `supabase db reset`: every seeded user signs in by magic link and sees their own membership. |
| `hortis/` | Hortis migration (tasks 0.8, 1.6). |
| `simulation/` | 14-day simulation (docs/SIMULATION.md). |

Tests: `scripts/.venv/bin/python -m pytest scripts/tests`.
