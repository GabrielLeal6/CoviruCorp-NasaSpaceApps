#!/usr/bin/env python3
"""Print CRS, transform, pixel size, nodata, and value range for a DEM.

Also runs the full eight-check validation and prints it as markdown, so it
doubles as the generator for docs/validation_report_dem.md.

Usage:
    python scripts/inspect_dem.py data/raw/LDEM_80S_40MPP_ADJ.TIF \
        --res 40 --site-lat -89.67 --site-lon 129.78 --max-range-km 50
"""

from __future__ import annotations

import argparse

from lunarnav.ingest import geotiff_meta, ingest, window_from_xy


def main() -> None:
    ap = argparse.ArgumentParser(description="Inspect and validate a DEM file.")
    ap.add_argument("path")
    ap.add_argument("--res", type=float, default=None, help="expected pixel size (m)")
    ap.add_argument("--cx", type=float, default=0.0, help="window center x (m)")
    ap.add_argument("--cy", type=float, default=0.0, help="window center y (m)")
    ap.add_argument("--half-width", type=float, default=20_000.0, help="window half width (m)")
    ap.add_argument("--site-lat", type=float, default=None)
    ap.add_argument("--site-lon", type=float, default=None)
    ap.add_argument("--max-range-km", type=float, default=None)
    args = ap.parse_args()

    meta = geotiff_meta(args.path)
    print("== Metadata ==")
    for k, v in meta.items():
        print(f"  {k}: {v}")

    import rasterio

    with rasterio.open(args.path) as ds:
        w = window_from_xy(ds, args.cx, args.cy, args.half_width)
    print(f"\n== Window (center ({args.cx}, {args.cy}), half {args.half_width} m) ==")
    print(f"  {w}")

    max_range_m = args.max_range_km * 1000.0 if args.max_range_km else None
    _, report = ingest(
        args.path,
        window=w,
        expected_res_m=args.res,
        site_lat=args.site_lat,
        site_lon=args.site_lon,
        max_range_m=max_range_m,
    )
    print("\n" + report.to_markdown())


if __name__ == "__main__":
    main()
