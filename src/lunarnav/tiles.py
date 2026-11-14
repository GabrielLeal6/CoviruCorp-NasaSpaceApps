"""Shared dataclasses for the terrain layer.

``DemTile`` is the interface Member 5 (horizon engine) codes against; do not
change its fields without coordinating with the integration lead (Member 4).
"""

from dataclasses import dataclass
from typing import Optional, Tuple

import numpy as np


@dataclass
class DemTile:
    data: np.ndarray          # float32, meters above the 1,737,400 m sphere, NaN = nodata
    x0: float                 # projected x of the upper-left pixel CENTER (m)
    y0: float                 # projected y of the upper-left pixel CENTER (m)
    dx: float                 # pixel size in meters (square pixels)
    crs: str                  # south polar stereographic, lat_0=-90, lon_0=0, R=1737400
    frame: str                # 'MOON_ME'
    source: str               # e.g. 'LDEM_80S_20MPP_ADJ'
    res_m: float
    coverage_lat_max: float   # northern edge of coverage in degrees (e.g. -80.0)
    filled_fraction: float = 0.0  # fraction of NaNs that were filled


@dataclass
class DatasetInfo:
    id: str
    path: str
    format: str
    resolution: float
    priority: int
    bounds: Optional[Tuple[float, float, float, float]]  # (min_lat, min_lon, max_lat, max_lon)
    units: str
    checksum: Optional[str] = None
    source_url: Optional[str] = None


@dataclass
class CoverageResult:
    covered: bool
    truncated: bool
    dem_source: str
    reason: Optional[str] = None
