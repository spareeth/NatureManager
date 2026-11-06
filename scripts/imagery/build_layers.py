"""Satellite and CAD layers for the Biodiversity and Water pages (demo, 5 Nov 2026).

Reads the large source rasters once and writes small, web-ready layers:

  * one PMTiles archive per layer (WebP or PNG tiles, zoom 13 to 18, read by range requests),
  * per-bed statistics as CSV (loaded into bed_raster_stat by load_layers.py).

Layers
  oct2026_rgb        SuperView Neo 30 cm true colour, 10 Oct 2026, Expo City Dubai extent
  oct2026_greenness  VARI = (G - R) / (G + R - B) from the same image, on vegetation-coloured pixels only
                     (visible bands: a greenness proxy, weaker than NDVI)
  sep2026_ndvi       NDVI from the September 30 cm 4-band image (band 4 near-infrared); it covers the
                     north of the ECD extent only, not Terra
  feb2025_ndvi       NDVI from the GIS team's very high resolution product, Feb 2025 (reference)
  cad_plan           Terra Garden CAD plan (base map)

The extent is the ECD buildings outline plus 300 m (data/gis/ECD_extent.geojson) until an official
boundary is supplied. Sources are not copied into the repo.

Usage:  scripts/imagery/.venv/bin/python scripts/imagery/build_layers.py [layer ...]
"""

from __future__ import annotations

import csv
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from osgeo import gdal, ogr, osr

gdal.UseExceptions()

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "apps/web/public/tiles"          # served by the web app (git-ignored)
WORK = ROOT / "data/imagery"                  # intermediate files (git-ignored)
STATS = ROOT / "data/imagery/stats"
BEDS = ROOT / "data/gis/TG_beds_new.geojson"
EXTENT = ROOT / "data/gis/ECD_extent.geojson"

SRC = {
    "sep2026": "/mnt/d/ECD_satellite_data/20260423 - 2026 Sep/30cm_Native_Imagery.tif",
    "oct2026": "/mnt/d/ECD_satellite_data/20261010 - 2026 Oct/SVN1-01_20261010_L2A0001683424_30cm_RGB_8bit.tif",
    "ndvi2025": "/mnt/c/ECD_work/OneDrive - Expocitydubai/ECD_documents/Work/Terra_research/ECD_Biodiversity/ndvi_feb2025.tif",
    "cad": "/mnt/c/ECD_work/OneDrive - Expocitydubai/ECD_documents/Work/Terra_research/TerraGardens/CAD_basemap.tif",
    "buildings": "/mnt/c/ECD_work/OneDrive - Expocitydubai/ECD_documents/Work/ECD_Water/ECD_buildings.gpkg",
}
Z18 = 0.5971642834779395  # metres per pixel at zoom 18 (EPSG:3857)

# Colour ramps (value, r, g, b, a): brown (bare) to green (vigorous).
RAMP_NDVI = [(-0.2, 160, 120, 80, 0), (0.05, 205, 170, 120, 0), (0.15, 230, 200, 120, 170),
             (0.3, 170, 210, 110, 200), (0.5, 90, 170, 70, 220), (0.7, 30, 110, 40, 230)]
RAMP_VARI = [(-0.3, 160, 120, 80, 0), (0.0, 205, 170, 120, 0), (0.05, 230, 200, 120, 170),
             (0.12, 170, 210, 110, 200), (0.2, 90, 170, 70, 220), (0.3, 30, 110, 40, 230)]


def run(*args: str) -> None:
    print("+", " ".join(args), flush=True)
    subprocess.run(args, check=True)


def extent_3857() -> tuple[float, float, float, float]:
    """ECD extent: buildings outline + 300 m, written once as GeoJSON (CRS84)."""
    if not EXTENT.exists():
        ds = ogr.Open(SRC["buildings"])
        lyr = ds.GetLayer(0)
        union = ogr.Geometry(ogr.wkbMultiPolygon)
        for f in lyr:
            g = f.GetGeometryRef().Clone()
            g.FlattenTo2D()
            union = union.Union(g)
        hull = union.ConvexHull().Buffer(300)
        src = lyr.GetSpatialRef()
        dst = osr.SpatialReference()
        dst.ImportFromEPSG(4326)
        dst.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
        hull.Transform(osr.CoordinateTransformation(src, dst))
        EXTENT.write_text(json.dumps({
            "type": "FeatureCollection",
            "features": [{"type": "Feature", "properties": {
                "name": "Expo City Dubai (approximate: buildings outline + 300 m)"},
                "geometry": json.loads(hull.ExportToJson())}],
        }))
    g = ogr.CreateGeometryFromJson(json.dumps(json.loads(EXTENT.read_text())["features"][0]["geometry"]))
    s = osr.SpatialReference(); s.ImportFromEPSG(4326); s.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    d = osr.SpatialReference(); d.ImportFromEPSG(3857)
    g.Transform(osr.CoordinateTransformation(s, d))
    minx, maxx, miny, maxy = g.GetEnvelope()
    return minx, miny, maxx, maxy


def warp_3857(src: str, dst: Path, bounds, res: float, srs: str | None = None, resampling="average",
              dtype: str | None = None, alpha: bool = False) -> Path:
    if dst.exists():
        return dst
    opts = ["-t_srs", "EPSG:3857", "-te", *map(str, bounds), "-tr", str(res), str(res), "-r", resampling,
            "-co", "COMPRESS=DEFLATE", "-co", "TILED=YES", "-co", "BIGTIFF=IF_SAFER", "-multi", "-wo", "NUM_THREADS=ALL_CPUS"]
    if srs:
        opts = ["-s_srs", srs, *opts]
    if dtype:
        opts = ["-ot", dtype, *opts]
    if alpha:
        opts = ["-dstalpha", *opts]
    run("gdalwarp", "-overwrite", *opts, src, str(dst))
    return dst


def colourise(src: Path, dst: Path, ramp) -> Path:
    table = WORK / f"{dst.stem}_ramp.txt"
    table.write_text("nv 0 0 0 0\n" + "\n".join(" ".join(map(str, r)) for r in ramp) + "\n")
    run("gdaldem", "color-relief", "-alpha", str(src), str(table), str(dst), "-co", "COMPRESS=DEFLATE")
    return dst


def to_pmtiles(src: Path, name: str, fmt: str = "WEBP", quality: int = 80, strategy: str = "UPPER") -> Path:
    """MBTiles with overviews (zoom 13 to 18), then one PMTiles archive."""
    OUT.mkdir(parents=True, exist_ok=True)
    mb = WORK / f"{name}.mbtiles"
    if mb.exists():
        mb.unlink()
    run("gdal_translate", "-of", "MBTILES", "-co", f"TILE_FORMAT={fmt}", "-co", f"QUALITY={quality}",
        "-co", f"ZOOM_LEVEL_STRATEGY={strategy}", "-co", "RESAMPLING=AVERAGE", str(src), str(mb))
    levels = ["2", "4", "8", "16", "32"]
    run("gdaladdo", "-r", "average", str(mb), *levels)
    pm = OUT / f"{name}.pmtiles"
    run(str(Path(sys.executable).parent / "pmtiles-convert"), str(mb), str(pm), "--overwrite")
    print(f"  {pm.name}: {pm.stat().st_size / 1e6:.1f} MB", flush=True)
    return pm


def bed_stats(raster: Path, name: str) -> Path:
    """Mean, p10, p90 and the share of valid pixels per bed (raster in EPSG:3857)."""
    STATS.mkdir(parents=True, exist_ok=True)
    ds = gdal.Open(str(raster))
    band = ds.GetRasterBand(1)
    arr = band.ReadAsArray().astype("float64")
    nod = band.GetNoDataValue()
    valid = np.isfinite(arr) if nod is None else (arr != nod) & np.isfinite(arr)
    mem = gdal.GetDriverByName("MEM").Create("", ds.RasterXSize, ds.RasterYSize, 1, gdal.GDT_Int16)
    mem.SetGeoTransform(ds.GetGeoTransform())
    mem.SetProjection(ds.GetProjection())
    # Beds in EPSG:3857 in memory, each with a numeric id to burn.
    beds_ds = ogr.Open(str(BEDS))
    src = beds_ds.GetLayer(0)
    s4326 = src.GetSpatialRef() or osr.SpatialReference()
    if not src.GetSpatialRef():
        s4326.ImportFromEPSG(4326)
    s4326.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    d3857 = osr.SpatialReference(); d3857.ImportFromEPSG(3857)
    tr = osr.CoordinateTransformation(s4326, d3857)
    v = ogr.GetDriverByName("Memory").CreateDataSource("beds")
    vl = v.CreateLayer("beds", d3857, ogr.wkbMultiPolygon)
    vl.CreateField(ogr.FieldDefn("rid", ogr.OFTInteger))
    vl.CreateField(ogr.FieldDefn("Name", ogr.OFTString))
    codes = []
    for k, f in enumerate(src, start=1):
        g = f.GetGeometryRef().Clone(); g.Transform(tr)
        o = ogr.Feature(vl.GetLayerDefn()); o.SetField("rid", k); o.SetField("Name", f.GetField("Name"))
        o.SetGeometry(g); vl.CreateFeature(o); codes.append(f.GetField("Name"))
    gdal.RasterizeLayer(mem, [1], vl, options=["ATTRIBUTE=rid", "ALL_TOUCHED=FALSE"])
    ids = mem.GetRasterBand(1).ReadAsArray()
    out = STATS / f"{name}.csv"
    with out.open("w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["bed", "mean", "p10", "p90", "valid_share", "pixels"])
        vl.ResetReading()
        for f in vl:
            m = ids == f.GetField("rid")
            n = int(m.sum())
            ok = m & valid
            if n == 0 or ok.sum() == 0:
                continue
            vals = arr[ok]
            w.writerow([f.GetField("Name"), round(float(vals.mean()), 4), round(float(np.percentile(vals, 10)), 4),
                        round(float(np.percentile(vals, 90)), 4), round(float(ok.sum()) / n, 3), n])
    print(f"  stats: {out} ({len(codes)} beds)", flush=True)
    return out


# ---------------------------------------------------------------------------

def layer_oct2026(bounds) -> None:
    vrt = WORK / "oct2026.vrt"
    # The GeoTIFF's own georeference is about 17 m off. The delivered ArcGIS world file (.tfwx, with a
    # small scale and rotation, CRS UTM 40N in the .aux.xml) is the corrected one: use it. Checked against
    # the surveyed Terra beds and the Feb 2025 NDVI (both within about 2 m afterwards).
    run("gdal_translate", "-q", "-of", "VRT", "-a_srs", "EPSG:32640", SRC["oct2026"], str(vrt))
    a, d, b, e, c, f = (float(x) for x in Path(SRC["oct2026"]).with_suffix(".tfwx").read_text().split())
    gt = (c - a / 2 - b / 2, a, b, f - d / 2 - e / 2, d, e)  # world file: centre of the top-left pixel
    v = gdal.Open(str(vrt), gdal.GA_Update)
    v.SetGeoTransform(gt)
    v = None
    rgb = warp_3857(str(vrt), WORK / "oct2026_rgb_z18.tif", bounds, Z18)
    to_pmtiles(rgb, "oct2026_rgb", "WEBP", 78)

    # Greenness at full resolution (0.3 m) for bed statistics; at zoom 18 for the map.
    for res, tag in ((Z18 / 2, "z19"), (Z18, "z18")):
        rgb_r = rgb if tag == "z18" else warp_3857(str(vrt), WORK / "oct2026_rgb_z19.tif", bounds, Z18 / 2)
        vari = WORK / f"oct2026_vari_{tag}.tif"
        if not vari.exists():
            ds = gdal.Open(str(rgb_r))
            r, g, b = (ds.GetRasterBand(i).ReadAsArray().astype("float32") for i in (1, 2, 3))
            a = ds.GetRasterBand(4).ReadAsArray() if ds.RasterCount >= 4 else np.full(r.shape, 255)
            den = g + r - b
            with np.errstate(divide="ignore", invalid="ignore"):
                # Only where the pixel looks like vegetation: green clearly above red and blue, not in deep
                # shadow. On grey and bluish roofs G + R - B is small and VARI explodes, so they are left out
                # (transparent) instead of showing as "green".
                veg = (a > 0) & ((r + g + b) > 45) & (g > r * 1.04) & (g > b * 1.04) & (den > 20)
                v = np.where(veg, (g - r) / den, np.nan)
            v = np.clip(v, -1, 1).astype("float32")
            v[np.isnan(v)] = -9999
            drv = gdal.GetDriverByName("GTiff")
            o = drv.Create(str(vari), ds.RasterXSize, ds.RasterYSize, 1, gdal.GDT_Float32,
                           ["COMPRESS=DEFLATE", "TILED=YES", "PREDICTOR=3"])
            o.SetGeoTransform(ds.GetGeoTransform()); o.SetProjection(ds.GetProjection())
            o.GetRasterBand(1).WriteArray(v); o.GetRasterBand(1).SetNoDataValue(-9999)
            o = None
    bed_stats(WORK / "oct2026_vari_z19.tif", "oct2026_greenness")
    col = colourise(WORK / "oct2026_vari_z18.tif", WORK / "oct2026_vari_rgba.tif", RAMP_VARI)
    to_pmtiles(col, "oct2026_greenness", "WEBP", 85)


def layer_ndvi2025(bounds) -> None:
    ndvi_z19 = warp_3857(SRC["ndvi2025"], WORK / "ndvi2025_z19.tif", bounds, Z18 / 2, dtype="Float32")
    bed_stats(ndvi_z19, "feb2025_ndvi")
    ndvi = warp_3857(str(ndvi_z19), WORK / "ndvi2025_z18.tif", bounds, Z18, dtype="Float32")
    col = colourise(ndvi, WORK / "ndvi2025_rgba.tif", RAMP_NDVI)
    to_pmtiles(col, "feb2025_ndvi", "WEBP", 85)


def layer_sep2026(bounds) -> None:
    """Relative NDVI from the September 4-band image (digital numbers, not reflectance: band gains
    differ, so values are compared within this image only; colours stretched to its 2nd to 98th
    percentile)."""
    four = warp_3857(SRC["sep2026"], WORK / "sep2026_z18.tif", bounds, Z18, dtype="Float32")
    out = WORK / "sep2026_ndvi_z18.tif"
    if not out.exists():
        ds = gdal.Open(str(four))
        red = ds.GetRasterBand(1).ReadAsArray().astype("float32")
        nir = ds.GetRasterBand(4).ReadAsArray().astype("float32")
        with np.errstate(divide="ignore", invalid="ignore"):
            v = np.where((red > 0) & (nir > 0), (nir - red) / (nir + red), np.nan)
        v[~np.isfinite(v)] = -9999
        o = gdal.GetDriverByName("GTiff").Create(str(out), ds.RasterXSize, ds.RasterYSize, 1, gdal.GDT_Float32,
                                                 ["COMPRESS=DEFLATE", "TILED=YES", "PREDICTOR=3"])
        o.SetGeoTransform(ds.GetGeoTransform()); o.SetProjection(ds.GetProjection())
        o.GetRasterBand(1).WriteArray(v); o.GetRasterBand(1).SetNoDataValue(-9999)
        o = None
    nds = gdal.Open(str(out))
    arr = nds.GetRasterBand(1).ReadAsArray()
    nds = None
    ok = arr[arr > -9999]
    lo, hi = (float(x) for x in np.percentile(ok, [2, 98]))
    print(f"  relative NDVI 2-98%: {lo:.3f} to {hi:.3f}", flush=True)
    span = hi - lo
    ramp = [(lo - 1, 160, 120, 80, 0), (lo + 0.45 * span, 205, 170, 120, 0), (lo + 0.6 * span, 230, 200, 120, 170),
            (lo + 0.75 * span, 170, 210, 110, 200), (lo + 0.88 * span, 90, 170, 70, 220), (hi, 30, 110, 40, 230)]
    (STATS / "sep2026_ndvi_range.json").parent.mkdir(parents=True, exist_ok=True)
    (STATS / "sep2026_ndvi_range.json").write_text(json.dumps({"lo": lo, "hi": hi}))
    col = colourise(out, WORK / "sep2026_ndvi_rgba.tif", ramp)
    to_pmtiles(col, "sep2026_ndvi", "WEBP", 85)


def layer_cad(_bounds) -> None:
    ds = gdal.Open(SRC["cad"])
    gt = ds.GetGeoTransform()
    b = (gt[0], gt[3] + gt[5] * ds.RasterYSize, gt[0] + gt[1] * ds.RasterXSize, gt[3])
    s = osr.SpatialReference(); s.ImportFromEPSG(4326); s.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    d = osr.SpatialReference(); d.ImportFromEPSG(3857)
    t = osr.CoordinateTransformation(s, d)
    x0, y0, _ = t.TransformPoint(b[0], b[1]); x1, y1, _ = t.TransformPoint(b[2], b[3])
    # The plan is fine line work (source about 3 cm): keep it to zoom 22 (about 4 cm), averaged so thin
    # lines stay visible as grey instead of dropping out.
    # The corners left by the rotation become transparent (alpha band), not black.
    cad = warp_3857(SRC["cad"], WORK / "cad_z22a.tif", (x0, y0, x1, y1), Z18 / 16, resampling="average", alpha=True)
    rgba = WORK / "cad_rgba.tif"
    if not rgba.exists():
        # The sheet's own black margin (outside the drawing) is black like the paved areas inside it.
        # Only black regions connected to the image edge become transparent.
        from scipy import ndimage

        cds = gdal.Open(str(cad))
        grey = cds.GetRasterBand(1).ReadAsArray()
        alpha = cds.GetRasterBand(2).ReadAsArray() if cds.RasterCount > 1 else np.full(grey.shape, 255, "uint8")
        dark, _ = ndimage.label((grey < 40) | (alpha == 0))
        edge = np.unique(np.concatenate([dark[0], dark[-1], dark[:, 0], dark[:, -1]]))
        outside = np.isin(dark, edge[edge > 0])
        out = gdal.GetDriverByName("GTiff").Create(str(rgba), cds.RasterXSize, cds.RasterYSize, 4, gdal.GDT_Byte,
                                                    ["COMPRESS=DEFLATE", "TILED=YES"])
        out.SetGeoTransform(cds.GetGeoTransform()); out.SetProjection(cds.GetProjection())
        for i in (1, 2, 3):
            out.GetRasterBand(i).WriteArray(grey)
        out.GetRasterBand(4).WriteArray(np.where(outside, 0, 255).astype("uint8"))
        out.GetRasterBand(4).SetColorInterpretation(gdal.GCI_AlphaBand)
        out = None
        cds = None
    to_pmtiles(rgba, "cad_plan", "WEBP", 90, "LOWER")  # zoom 22 at most (MBTiles limit)


def layer_change(_bounds) -> None:
    """Vegetation change Feb 2025 to Oct 2026 (from scripts/imagery/canopy_change.py): red lost, blue new,
    pale green unchanged."""
    to_pmtiles(WORK / "change" / "change_rgba.tif", "veg_change_2025_2026", "WEBP", 90)


LAYERS = {"change": layer_change, "sep2026": layer_sep2026, "oct2026": layer_oct2026, "ndvi2025": layer_ndvi2025, "cad": layer_cad}

if __name__ == "__main__":
    WORK.mkdir(parents=True, exist_ok=True)
    bounds = extent_3857()
    print("ECD extent (EPSG:3857):", [round(v) for v in bounds])
    for name in sys.argv[1:] or list(LAYERS):
        print(f"== {name}", flush=True)
        LAYERS[name](bounds)
