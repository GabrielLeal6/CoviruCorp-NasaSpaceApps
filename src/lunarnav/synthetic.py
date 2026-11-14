"""Analytic synthetic DEMs for Member 5's horizon-engine tests.

All tiles are in the canonical frame: south polar stereographic on the
1,737,400 m sphere, observer at the pole (x=0, y=0), heights in meters above
the sphere.

Kinds and their expected horizons (see context.md section 3.4):
  flat  -- all zeros; horizon ~0 deg
  rim   -- ring height 1000 m, radius 10 km, width 200 m; horizon ~+5.55 deg
  cone  -- cone height H, base radius B, centered 20 km from the observer
  wall  -- 1 km wall at 10 km across an azimuth sector; ~+5.55 deg in-sector
"""

from __future__ import annotations

import numpy as np

from .conventions import CRS, FRAME
from .tiles import DemTile

_DEFAULT_HALF_WIDTH = 25_000.0   # meters; grid spans +-25 km from the pole
_DEFAULT_DX = 100.0              # meters per pixel


def _grid(half_width: float, dx: float):
    """Build projected coordinate grids with the pole at a pixel center."""
    n = int(round(2 * half_width / dx))
    if n % 2 == 0:
        n += 1                      # odd so pixel (n//2, n//2) centers on (0, 0)
    x0 = -(n // 2) * dx             # easting of the upper-left pixel center
    y0 = (n // 2) * dx              # northing of the upper-left pixel center
    xs = x0 + np.arange(n) * dx     # column centers (easting)
    ys = y0 - np.arange(n) * dx     # row centers (northing), top row first
    X, Y = np.meshgrid(xs, ys)      # indexed [row, col]
    return n, x0, y0, X, Y


def make_synthetic_dem(kind: str, *, half_width: float = _DEFAULT_HALF_WIDTH,
                       dx: float = _DEFAULT_DX, **params) -> DemTile:
    """Build an analytic test DEM in the canonical frame."""
    n, x0, y0, X, Y = _grid(half_width, dx)
    r = np.hypot(X, Y)              # distance from the pole (m)

    if kind == "flat":
        z = np.zeros_like(r, dtype=np.float32)

    elif kind == "rim":
        H = params.get("H", 1000.0)
        R = params.get("R", 10_000.0)
        W = params.get("W", 200.0)
        z = np.where(np.abs(r - R) <= W / 2.0, H, 0.0).astype(np.float32)

    elif kind == "cone":
        H = params.get("H", 1000.0)
        B = params.get("B", 5_000.0)
        cx, cy = params.get("center", (20_000.0, 0.0))
        d = np.hypot(X - cx, Y - cy)
        z = (H * np.clip(1.0 - d / B, 0.0, None)).astype(np.float32)

    elif kind == "wall":
        H = params.get("H", 1000.0)
        R = params.get("R", 10_000.0)
        thickness = params.get("thickness", 200.0)
        az_center = params.get("az_center", 0.0)   # deg clockwise from north
        az_span = params.get("az_span", 20.0)      # deg
        az = np.degrees(np.arctan2(X, Y)) % 360.0
        daz = np.abs((az - az_center + 180.0) % 360.0 - 180.0)
        in_wall = (np.abs(r - R) <= thickness / 2.0) & (daz <= az_span / 2.0)
        z = np.where(in_wall, H, 0.0).astype(np.float32)

    else:
        raise ValueError(f"unknown synthetic kind: {kind!r}")

    return DemTile(
        data=z,
        x0=float(x0),
        y0=float(y0),
        dx=float(dx),
        crs=CRS,
        frame=FRAME,
        source=f"synthetic_{kind}",
        res_m=float(dx),
        coverage_lat_max=-80.0,
        filled_fraction=0.0,
    )
