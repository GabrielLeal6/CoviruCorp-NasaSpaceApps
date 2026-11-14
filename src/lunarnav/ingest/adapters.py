"""Format detection and raw readers (adapters) for the ingestion layer.

Each adapter turns a source file into a ``RawTile``: a ``DemTile`` plus the
source CRS/nodata needed by the validator. Windowed reads are the default for
large COGs; the full 20 m grid must never be loaded into RAM.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Optional

import numpy as np

from ..conventions import CRS, FRAME
from ..tiles import DemTile


@dataclass
class RawTile:
    tile: DemTile
    source_crs: str
    source_nodata: Optional[float]
    width: int
    height: int
    unit_note: str = ""


def detect_format(path: str) -> str:
    low = path.lower()
    if low.endswith((".tif", ".tiff")):
        return "geotiff"
    if low.endswith((".img", ".jp2", ".j2k")):
        return "pds3_img"  # requires a GDAL build with those drivers (gap, see docs)
    raise ValueError(f"unrecognized DEM format for {path!r}")


def geotiff_meta(path: str) -> dict:
    """Read GeoTIFF metadata without loading pixel data."""
    import rasterio

    with rasterio.open(path) as ds:
        return {
            "driver": ds.driver,
            "width": ds.width,
            "height": ds.height,
            "count": ds.count,
            "dtype": ds.dtypes[0],
            "nodata": ds.nodata,
            "crs": ds.crs.to_wkt() if ds.crs else None,
            "transform": tuple(ds.transform),
            "res": tuple(ds.res),
            "bounds": tuple(ds.bounds),
            "overviews": list(ds.overviews(1)),
            "is_tiled": getattr(ds, "is_tiled", None),
        }


def window_from_xy(ds, x: float, y: float, half_width_m: float):
    """Return a rasterio Window of ~2*half_width_m centered on projected (x, y)."""
    from rasterio.windows import Window

    dx = abs(ds.transform.a)
    n = max(1, int(round(2.0 * half_width_m / dx)))
    row, col = ds.index(x, y)
    row_off = row - n // 2
    col_off = col - n // 2
    # clamp so the window stays inside the raster
    row_off = max(0, min(ds.height - n, row_off)) if ds.height >= n else 0
    col_off = max(0, min(ds.width - n, col_off)) if ds.width >= n else 0
    w = min(n, ds.width - col_off)
    h = min(n, ds.height - row_off)
    return Window(col_off, row_off, w, h)


def read_geotiff(path: str, *, window=None) -> RawTile:
    """Read a GeoTIFF (optionally a window) into a DemTile in the canonical frame."""
    import rasterio

    with rasterio.open(path) as ds:
        if window is not None:
            data = ds.read(1, window=window)
            t = ds.window_transform(window)
        else:
            data = ds.read(1)
            t = ds.transform

        # DemTile stores pixel-CENTER origins; rasterio's transform is the
        # top-left CORNER. Shift by half a pixel.
        dx = float(abs(t.a))
        x0 = float(t.c + dx / 2.0)
        y0 = float(t.f - dx / 2.0)

        nodata = ds.nodata
        arr = np.asarray(data, dtype=np.float32)
        # DemTile contract: NaN = nodata. Normalize a numeric nodata to NaN.
        if nodata is not None and not (isinstance(nodata, float) and np.isnan(nodata)):
            arr = np.where(arr == nodata, np.nan, arr)

        tile = DemTile(
            data=arr,
            x0=x0,
            y0=y0,
            dx=dx,
            crs=CRS,
            frame=FRAME,
            source=os.path.splitext(os.path.basename(path))[0],
            res_m=dx,
            coverage_lat_max=-80.0,
            filled_fraction=0.0,
        )
        return RawTile(
            tile=tile,
            source_crs=ds.crs.to_wkt() if ds.crs else "",
            source_nodata=nodata,
            width=arr.shape[1],
            height=arr.shape[0],
        )


ADAPTERS = {
    "geotiff": read_geotiff,
    # 'pds3_img': read_pds3,  # local GDAL build lacks the PDS3 driver
    # 'jp2': read_jp2,        # local GDAL build lacks the JPEG2000 driver
}
