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
from dataclasses import dataclass
import numpy as np

# Lunar reference sphere & coordinate conventions (Section 5)
R_MOON_M: float = 1_737_400.0   # meters (LOLA south polar stereographic sphere)
R_MOON_KM: float = 1_737.4      # kilometers (ephemeris code unit)
BODY_FIXED_FRAME: str = "MOON_ME"
R_MOON_M: float = 1_737_400.0   # meters (LOLA south polar stereographic sphere)
R_MOON: float = R_MOON_M        # alias used by projection.py
R_MOON_KM: float = 1_737.4      # kilometers (ephemeris code unit)
BODY_FIXED_FRAME: str = "MOON_ME"
FRAME: str = BODY_FIXED_FRAME   # alias used by synthetic.py and adapters.py

# South polar stereographic CRS on the reference sphere, true scale at the pole.
CRS = "+proj=stere +lat_0=-90 +lat_ts=-90 +lon_0=0 +R=1737400 +units=m +no_defs"

# Approximate kilometers per degree of latitude on the reference sphere.
KM_PER_DEG = R_MOON_M * math.pi / 180.0 / 1000.0  # ~30.3 km


def meters_to_km(m: float) -> float:
    """Named conversion: terrain meters -> ephemeris kilometers."""
    return m / 1000.0


def km_to_meters(km: float) -> float:
    """Named conversion: ephemeris kilometers -> terrain meters."""
    return km * 1000.0

# Default terrain & visibility parameters (Sections 6 & 8)
DEFAULT_OBS_HEIGHT_M: float = 2.0
DEFAULT_AZ_STEP_DEG: float = 0.5
DEFAULT_MAX_RANGE_KM: float = 100.0
DEFAULT_WINDOW_HOURS: int = 720
DEFAULT_STEP_MINUTES: int = 60

@dataclass
class HorizonProfile:
    az_deg: np.ndarray      # 0..360, step az_step_deg
    elev_deg: np.ndarray    # max terrain elevation angle per azimuth (deg)
    lat: float
    lon: float
    obs_height_m: float
    dem_source: str
    max_range_km: float
    filled_fraction: float
