"""Acceptance checks for the analytic synthetic DEMs (context.md section 9)."""

import math

import numpy as np

from lunarnav.conventions import R_MOON
from lunarnav.synthetic import make_synthetic_dem


def grids(tile):
    n = tile.data.shape[0]
    xs = tile.x0 + np.arange(n) * tile.dx
    ys = tile.y0 - np.arange(n) * tile.dx
    return np.meshgrid(xs, ys)


def test_flat_is_zero_and_pole_centered():
    t = make_synthetic_dem("flat")
    assert t.data.shape[0] == t.data.shape[1]
    assert t.data.shape[0] % 2 == 1
    assert np.all(t.data == 0.0)
    X, Y = grids(t)
    # center pixel is the pole
    c = t.data.shape[0] // 2
    assert X[c, c] == 0.0 and Y[c, c] == 0.0


def test_rim_geometry_and_analytic_horizon():
    t = make_synthetic_dem("rim")
    X, Y = grids(t)
    r = np.hypot(X, Y)

    in_ring = np.abs(r - 10_000.0) <= 100.0
    assert np.all(t.data[in_ring] == 1000.0)
    assert np.all(t.data[r < 9_000.0] == 0.0)   # inside the ring is flat

    # Analytic horizon: elevation = atan((H - s^2/(2R)) / s), ~5.55 deg
    H, s = 1000.0, 10_000.0
    drop = s * s / (2.0 * R_MOON)
    elev = math.degrees(math.atan((H - drop) / s))
    assert abs(elev - 5.55) < 0.05, elev


def test_cone_apex_and_base():
    t = make_synthetic_dem("cone", H=2000.0, B=4000.0, center=(20_000.0, 0.0))
    X, Y = grids(t)
    d = np.hypot(X - 20_000.0, Y)
    # apex height
    assert np.max(t.data) == 2000.0
    # outside base radius is zero
    assert np.all(t.data[d >= 4000.0] == 0.0)


def test_wall_sector():
    t = make_synthetic_dem("wall", az_center=0.0, az_span=20.0)
    X, Y = grids(t)
    r = np.hypot(X, Y)
    az = np.degrees(np.arctan2(X, Y)) % 360.0
    in_sector = (np.abs(r - 10_000.0) <= 100.0) & (az <= 10.0)
    assert np.all(t.data[in_sector] == 1000.0)
    # opposite azimuth (south) is flat
    opposite = (np.abs(r - 10_000.0) <= 100.0) & (az > 170.0) & (az < 190.0)
    assert np.all(t.data[opposite] == 0.0)
