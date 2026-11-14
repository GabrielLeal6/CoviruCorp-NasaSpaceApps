"""Projection helpers: geographic (planetocentric) <-> south polar stereographic.

The canonical CRS is a south polar stereographic projection on the 1,737,400 m
sphere, true scale at the pole (see conventions.py). These helpers convert the
planetocentric latitude (south negative) / east-positive longitude used across
the project to projected meters, and compute distances from the pole.
"""

from __future__ import annotations

import math

from pyproj import CRS, Transformer

from .conventions import CRS as CRS_STR, R_MOON

_PROJ_CRS = CRS.from_user_input(CRS_STR)
_GEO_CRS = _PROJ_CRS.geodetic_crs
_TO_XY = Transformer.from_crs(_GEO_CRS, _PROJ_CRS, always_xy=True)
_TO_GEO = Transformer.from_crs(_PROJ_CRS, _GEO_CRS, always_xy=True)


def geo_to_xy(lat: float, lon: float) -> tuple[float, float]:
    """Planetocentric lat (deg, south negative), east lon (deg) -> (x, y) meters."""
    x, y = _TO_XY.transform(lon, lat)
    return float(x), float(y)


def xy_to_geo(x: float, y: float) -> tuple[float, float]:
    """(x, y) meters -> (lat, lon) planetocentric/east-positive degrees."""
    lon, lat = _TO_GEO.transform(x, y)
    return float(lat), float(lon)


def distance_from_pole_m(lat: float) -> float:
    """Projected distance from the pole for a latitude, in meters (analytic)."""
    c = math.radians(90.0 + lat)  # colatitude from the south pole
    return 2.0 * R_MOON * math.tan(c / 2.0)


def coverage_radius_m(lat_max: float) -> float:
    """Radius (m) of the disk covered down to ``lat_max`` (e.g. -80.0)."""
    return distance_from_pole_m(lat_max)
