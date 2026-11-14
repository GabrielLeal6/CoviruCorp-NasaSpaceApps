"""Projection helpers: pole at origin, 80S ~304 km, round-trip."""

import math

import pytest

from lunarnav.projection import (
    coverage_radius_m,
    distance_from_pole_m,
    geo_to_xy,
    xy_to_geo,
)


def test_pole_is_origin():
    x, y = geo_to_xy(-90.0, 0.0)
    assert x == pytest.approx(0.0, abs=1e-6)
    assert y == pytest.approx(0.0, abs=1e-6)


def test_80s_distance():
    x, y = geo_to_xy(-80.0, 0.0)
    assert x == pytest.approx(0.0, abs=1e-6)
    assert y == pytest.approx(304_005.0, abs=10.0)
    assert distance_from_pole_m(-80.0) == pytest.approx(304_005.0, abs=10.0)
    assert coverage_radius_m(-80.0) == pytest.approx(304_005.0, abs=10.0)


def test_east_axis():
    x, y = geo_to_xy(-80.0, 90.0)
    assert x == pytest.approx(304_005.0, abs=10.0)
    assert y == pytest.approx(0.0, abs=1e-6)


def test_roundtrip():
    lat, lon = -85.5, 120.0
    x, y = geo_to_xy(lat, lon)
    rlat, rlon = xy_to_geo(x, y)
    assert rlat == pytest.approx(lat, abs=1e-9)
    assert rlon == pytest.approx(lon, abs=1e-9)
