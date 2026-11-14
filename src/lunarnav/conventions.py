"""Shared constants and unit conversions for the lunar terrain layer.

Kept in one place so terrain code (meters) and ephemeris code (kilometers)
never mix units without a named conversion. See context.md section 2.

NOTE (frame question): the LOLA polar COGs downloaded from PGDA declare
``Moon (2015) - Sphere / Ocentric`` (IAU 2015), not the DE421 mean-Earth
(``MOON_ME``) frame the project spec assumes. Resolve with Member 2 before
treating the frame as settled; the difference is on the order of the ME-vs-PA
offset (~0.029 deg, ~875 m).
"""

import math

# Reference sphere radius for the LOLA polar products (meters).
R_MOON = 1_737_400.0

# Body-fixed frame for the terrain layer.
FRAME = "MOON_ME"

# South polar stereographic CRS on the reference sphere, true scale at the pole.
CRS = "+proj=stere +lat_0=-90 +lat_ts=-90 +lon_0=0 +R=1737400 +units=m +no_defs"

# Approximate kilometers per degree of latitude on the reference sphere.
KM_PER_DEG = R_MOON * math.pi / 180.0 / 1000.0  # ~30.3 km


def meters_to_km(m: float) -> float:
    """Named conversion: terrain meters -> ephemeris kilometers."""
    return m / 1000.0


def km_to_meters(km: float) -> float:
    """Named conversion: ephemeris kilometers -> terrain meters."""
    return km * 1000.0
