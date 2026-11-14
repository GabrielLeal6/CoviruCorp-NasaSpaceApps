from dataclasses import dataclass
import numpy as np

# Lunar reference sphere & coordinate conventions (Section 5)
R_MOON_M: float = 1_737_400.0   # meters (LOLA south polar stereographic sphere)
R_MOON_KM: float = 1_737.4      # kilometers (ephemeris code unit)
BODY_FIXED_FRAME: str = "MOON_ME"

# Default terrain & visibility parameters (Sections 6 & 8)
DEFAULT_OBS_HEIGHT_M: float = 2.0
DEFAULT_AZ_STEP_DEG: float = 0.5
DEFAULT_MAX_RANGE_KM: float = 100.0
DEFAULT_WINDOW_HOURS: int = 720
DEFAULT_STEP_MINUTES: int = 60

# Curated site registry (replace placeholder coords with verified NASA sources per Verify #8)
CURATED_SITES: dict[str, dict] = {
    "site_01": {
        "id": "site_01",
        "name": "Connecting Ridge (Candidate)",
        "lat": -89.53,
        "lon": -150.05,
        "notes": "High-illumination ridge near Shackleton crater.",
    },
    "site_02": {
        "id": "site_02",
        "name": "Peak Near Shackleton (Candidate)",
        "lat": -88.81,
        "lon": 123.76,
        "notes": "Elevated massif with strong Earth line-of-sight.",
    },
    "site_03": {
        "id": "site_03",
        "name": "Malapert Massif (Candidate)",
        "lat": -86.00,
        "lon": 0.00,
        "notes": "Lower-latitude massif farther from the pole.",
    },
}


@dataclass
class DemTile:
    data: np.ndarray        # float32, meters above 1,737,400 m sphere, NaN = nodata
    x0: float               # projected x of upper-left pixel center (m)
    y0: float               # projected y of upper-left pixel center (m)
    dx: float               # square pixel size (m)
    crs: str                # south polar stereographic, lat_0=-90, R=1737400
    frame: str              # 'MOON_ME'
    source: str
    res_m: float
    coverage_lat_max: float


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