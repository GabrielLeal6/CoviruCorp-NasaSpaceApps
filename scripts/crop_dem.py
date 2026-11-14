#!/usr/bin/env python3
"""Crop a window from a DEM, normalize units, downsample, write GeoTIFF + sidecar.

Usage:
    python scripts/crop_dem.py data/raw/LDEM_80S_40MPP_ADJ.TIF out.tif \
        --lat -89.67 --lon 129.78 --range-km 50 \
        --downsample 2 --method average [--hillshade out.png]
"""

from __future__ import annotations

import argparse
import json

import numpy as np
import rasterio
from rasterio.transform import from_origin

from lunarnav.ingest import normalize_units, read_geotiff, window_from_xy
from lunarnav.projection import geo_to_xy


def _downsample(data: np.ndarray, factor: int, method: str) -> tuple[np.ndarray, float]:
    if factor <= 1:
        return data, 1.0
    h, w = data.shape
    h2, w2 = h // factor, w // factor
    data = data[: h2 * factor, : w2 * factor]
    blocks = data.reshape(h2, factor, w2, factor)
    if method == "max":
        out = np.nanmax(blocks, axis=(1, 3))
    else:  # average
        with np.errstate(invalid="ignore"):
            out = np.nanmean(blocks, axis=(1, 3))
    return out.astype(np.float32), float(factor)


def main() -> None:
    ap = argparse.ArgumentParser(description="Crop and downsample a DEM.")
    ap.add_argument("src")
    ap.add_argument("dst")
    ap.add_argument("--lat", type=float, required=True)
    ap.add_argument("--lon", type=float, required=True)
    ap.add_argument("--range-km", type=float, default=50.0)
    ap.add_argument("--downsample", type=int, default=1)
    ap.add_argument("--method", choices=["average", "max"], default="average")
    ap.add_argument("--hillshade", default=None)
    args = ap.parse_args()

    x, y = geo_to_xy(args.lat, args.lon)
    half = args.range_km * 1000.0

    with rasterio.open(args.src) as ds:
        w = window_from_xy(ds, x, y, half)
        raw = read_geotiff(args.src, window=w)

    data, note = normalize_units(raw.tile.data)
    dx = raw.tile.dx
    if args.downsample > 1:
        data, scale = _downsample(data, args.downsample, args.method)
        dx *= scale

    transform = from_origin(raw.tile.x0, raw.tile.y0, dx, dx)
    profile = {
        "driver": "GTiff",
        "height": data.shape[0],
        "width": data.shape[1],
        "count": 1,
        "dtype": "float32",
        "crs": raw.tile.crs,
        "transform": transform,
        "nodata": float("nan"),
    }
    with rasterio.open(args.dst, "w", **profile) as out:
        out.write(data, 1)

    sidecar = {
        "source": raw.tile.source,
        "x0": raw.tile.x0,
        "y0": raw.tile.y0,
        "dx": float(dx),
        "res_m": float(dx),
        "unit_conversion": note,
        "downsample": args.downsample,
        "method": args.method,
        "crs": raw.tile.crs,
        "frame": raw.tile.frame,
        "coverage_lat_max": raw.tile.coverage_lat_max,
    }
    with open(args.dst + ".json", "w") as f:
        json.dump(sidecar, f, indent=2)

    print(f"wrote {args.dst} ({data.shape}) + sidecar; unit: {note}")

    if args.hillshade:
        from matplotlib import pyplot as plt

        plt.imsave(args.hillshade, data, cmap="gray", vmin=-3000, vmax=3000)
        print(f"wrote hillshade {args.hillshade}")


if __name__ == "__main__":
    main()
