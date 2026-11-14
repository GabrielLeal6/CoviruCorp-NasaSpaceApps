import numpy as np
from numpy import arcsin, arctan2, cross, degrees
from numpy.linalg import norm
import spiceypy as spice

from lunarnav.conventions import BODY_FIXED_FRAME, R_MOON_KM
from .kernel import load_kernels

load_kernels()


def unit(lat_deg: float, lon_deg: float) -> np.ndarray:
    """Unit vector in Z-up body-fixed coordinates from lat/lon in degrees."""
    lat = np.radians(lat_deg)
    lon = np.radians(lon_deg)
    return np.array([
        np.cos(lat) * np.cos(lon),
        np.cos(lat) * np.sin(lon),
        np.sin(lat),
    ])


def utc_to_ets(utc_strings: list[str]) -> np.ndarray:
    """Convert ISO-8601 UTC strings to SPICE Ephemeris Time (ET) seconds."""
    load_kernels()
    return np.array([spice.str2et(s.rstrip("Z")) for s in utc_strings], dtype=np.float64)


def spkpos_many(body: str, ets: np.ndarray, frame: str, abcorr: str, observer: str) -> np.ndarray:
    """Return (N, 3) array of positions in km, one row per ET."""
    out = np.empty((len(ets), 3))
    for i, et in enumerate(ets):
        pos, _lt = spice.spkpos(body, float(et), frame, abcorr, observer)
        out[i] = pos
    return out


def body_altaz(lat: float, lon: float, obs_height_m: float, ets: np.ndarray, body: str) -> tuple[np.ndarray, np.ndarray]:
    """
    Return (elev_deg, az_deg) of `body` seen from (lat, lon, obs_height_m)
    on the Moon in BODY_FIXED_FRAME (MOON_ME).
    """
    load_kernels()
    v = spkpos_many(body, ets, BODY_FIXED_FRAME, "LT+S", "MOON")  # (N, 3) km

    r = (R_MOON_KM + obs_height_m / 1000.0) * unit(lat, lon)     # (3,) km
    d = v - r                                                    # (N, 3) km

    up = r / norm(r)
    east_raw = cross([0.0, 0.0, 1.0], up)
    if norm(east_raw) < 1e-12:
        lon_rad = np.radians(lon)
        east = np.array([-np.sin(lon_rad), np.cos(lon_rad), 0.0])
    else:
        east = east_raw / norm(east_raw)
    north = cross(up, east)

    elev_deg = degrees(arcsin((d @ up) / norm(d, axis=1)))
    az_deg = degrees(arctan2(d @ east, d @ north)) % 360.0
    return elev_deg, az_deg