# coordinates.py
import numpy as np
from pathlib import Path
from numpy.linalg import norm
from numpy import cross, degrees, arcsin, arctan2
import spiceypy as spice
from kernel import load_kernels
from conventions import R_MOON_KM, BODY_FIXED_FRAME

# ---- diretório de kernels (absoluto, baseado no __file__) ----
KERNEL_DIR = Path(__file__).resolve().parent.parent.parent.parent / "data" / "kernels"

# ---- carrega os kernels no SpiceyPy UMA vez, no import ----
load_kernels()


# ============================================================
# Helpers
# ============================================================
def unit(lat_deg, lon_deg):
    """Vetor unitário (direção) em coordenadas Z-up a partir de lat/lon em graus."""
    lat = np.radians(lat_deg)
    lon = np.radians(lon_deg)
    return np.array([
        np.cos(lat) * np.cos(lon),
        np.cos(lat) * np.sin(lon),
        np.sin(lat),
    ])


def spkpos_many(body, ets, frame, abcorr, observer):
    """Retorna array (N,3) com posições em km, uma linha por ET."""
    out = np.empty((len(ets), 3))
    for i, et in enumerate(ets):
        pos, _lt = spice.spkpos(body, et, frame, abcorr, observer)
        out[i] = pos
    return out


# ============================================================
# Alt-az via SpiceyPy
# ============================================================
def body_altaz(lat, lon, obs_height_m, ets, body):
    """
    Retorna (elev_deg, az_deg) de `body` visto de (lat, lon, obs_height_m)
    na superfície da Lua, em BODY_FIXED_FRAME (MOON_ME).
    elev_deg: elevação em graus; az_deg: azimute em graus (0=Norte, 90=Leste).
    """
    v = spkpos_many(body, ets, BODY_FIXED_FRAME, 'LT+S', 'MOON')   # (N,3) km

    r = (R_MOON_KM + obs_height_m / 1000.0) * unit(lat, lon)       # (3,) km
    d = v - r                                                      # (N,3) km

    up = r / norm(r)                                               # (3,)
    east_raw = cross([0.0, 0.0, 1.0], up)
    east = east_raw / norm(east_raw)                               # (3,) unitário
    north = cross(up, east)                                        # (3,) unitário

    elev_deg = degrees(arcsin((d @ up) / norm(d, axis=1)))         # (N,) graus
    az_deg = degrees(arctan2(d @ east, d @ north)) % 360.0         # (N,) graus
    return elev_deg, az_deg
