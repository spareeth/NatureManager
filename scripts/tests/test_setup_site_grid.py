import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import setup_site_grid as g  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]


def test_terra_garden_grid_matches_coordinates_doc() -> None:
    grid = g.compute_grid(g.load_boundary(ROOT / "data/gis/TG_boundary.geojson"))
    # docs/COORDINATES.md: proposed origin E 481808, N 2761399; spans about x 0..237, y 0..229.
    assert (grid.origin_e, grid.origin_n) == (481808, 2761399)
    assert grid.extent_x == pytest.approx(237, abs=1.5)
    assert grid.extent_y == pytest.approx(229, abs=1.5)


def test_origin_is_floor_minus_margin() -> None:
    # 1 m square whose SW corner is at a known EPSG:3997 point.
    inv = g.Transformer.from_crs("EPSG:3997", "OGC:CRS84", always_xy=True)
    ring = [inv.transform(e, n) for e, n in
            [(482000.7, 2761500.2), (482001.7, 2761500.2), (482001.7, 2761501.2), (482000.7, 2761500.2)]]
    grid = g.compute_grid({"type": "Polygon", "coordinates": [ring]})
    assert (grid.origin_e, grid.origin_n) == (481990, 2761490)


def test_rejects_non_polygon() -> None:
    with pytest.raises(ValueError):
        g.compute_grid({"type": "Point", "coordinates": [55.15, 24.96]})


def test_sql_quotes_names() -> None:
    sql = g.site_sql({"type": "Polygon", "coordinates": []}, g.Grid(1, 2, 3, 4), org_slug="terra",
                     code="TG", name="O'Hara Garden", site_type="botanical_garden",
                     grid_name="G", source="x")
    assert "'O''Hara Garden'" in sql
