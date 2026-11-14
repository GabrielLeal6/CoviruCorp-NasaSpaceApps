# coordinates.py
import numpy as np
from pathlib import Path
from numpy.linalg import norm
from numpy import cross, degrees, arcsin, arctan2
import spiceypy as spice
from astroquery.jplhorizons import Horizons
from kernel import load_kernels
from conventions import R_MOON_KM, BODY_FIXED_FRAME
import csv

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


# ============================================================
# Execução principal
# ============================================================
if __name__ == "__main__":
    # --------------------------------------------------------
    # 1) SpiceyPy: Sol e Terra vistos do polo sul da Lua
    # --------------------------------------------------------
    epochs = np.array([
        spice.str2et("2026-11-14T00:00:00"),
        spice.str2et("2026-11-14T06:00:00"),
        spice.str2et("2026-11-14T12:00:00"),
    ])

    lat = -89.5
    lon = 30.0
    obs_height_m = 0.0

    sun_elev_deg, sun_az_deg = body_altaz(lat, lon, obs_height_m, epochs, "SUN")
    earth_elev_deg, earth_az_deg = body_altaz(lat, lon, obs_height_m, epochs, "EARTH")

    print("=== SpiceyPy ===")
    print("sun_elev_deg   :", sun_elev_deg)
    print("sun_az_deg     :", sun_az_deg)
    print("earth_elev_deg :", earth_elev_deg)
    print("earth_az_deg   :", earth_az_deg)
    print()

#horizons

observer = {
    'lon': 30.0,          # degrees east
    'lat': -89.5,         # degrees north
    'elevation': 0.0,     # km
    'body': 301           # 301 = Moon
}

epochs_dict = {'start': '2026-11-14 00:00',
               'stop': '2026-11-14 12:00',
               'step': '6h'}

sun_h = Horizons(id='10', location=observer, epochs=epochs_dict)
earth_h = Horizons(id='399', location=observer, epochs=epochs_dict)

sun_eph = sun_h.ephemerides(cache=False)
earth_eph = earth_h.ephemerides(cache=False)

# Extract AZ, EL (Horizons returns azimuth measured from north eastward, consistent with your definition)
h_sun_az_deg = sun_eph['AZ'].data
h_sun_elev_deg = sun_eph['EL'].data
h_earth_az_deg = earth_eph['AZ'].data
h_earth_elev_deg = earth_eph['EL'].data

# ---- 3. Build comparison rows ----
rows = []
for i, t in enumerate(epochs):
    rows.append({
        'utc': t,
        'body': 'SUN',
        'spice_az_deg': round(float(sun_az_deg[i]), 6),
        'spice_elev_deg': round(float(sun_elev_deg[i]), 6),
        'horizons_az_deg': round(float(h_sun_az_deg[i]), 6),
        'horizons_elev_deg': round(float(h_sun_elev_deg[i]), 6),
        'd_az_deg': round(float(sun_az_deg[i] - h_sun_az_deg[i]), 6),
        'd_elev_deg': round(float(sun_elev_deg[i] - h_sun_elev_deg[i]), 6),
    })
    rows.append({
        'utc': t,
        'body': 'EARTH',
        'spice_az_deg': round(float(earth_az_deg[i]), 6),
        'spice_elev_deg': round(float(earth_elev_deg[i]), 6),
        'horizons_az_deg': round(float(h_earth_az_deg[i]), 6),
        'horizons_elev_deg': round(float(h_earth_elev_deg[i]), 6),
        'd_az_deg': round(float(earth_az_deg[i] - h_earth_az_deg[i]), 6),
        'd_elev_deg': round(float(earth_elev_deg[i] - h_earth_elev_deg[i]), 6),
    })

# ---- 4. Write CSV ----
with open('spice_vs_horizons.csv', 'w', newline='') as f:
    writer = csv.DictWriter(f, fieldnames=rows[0].keys())
    writer.writeheader()
    writer.writerows(rows)

print('Wrote spice_vs_horizons.csv')
