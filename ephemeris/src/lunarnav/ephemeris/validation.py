# validation.py
import sys
import csv
import numpy as np
import spiceypy as spice
from astroquery.jplhorizons import Horizons
from coordinates import body_altaz


def validate_results(rows, tolerance_deg=0.5):
    """
    Valida os resultados comparando SpiceyPy vs Horizons.
    Retorna True se todos os erros estiverem dentro da tolerância, False caso contrário.
    """
    print("\n=== VALIDATION ===")
    all_passed = True

    for row in rows:
        d_az = abs(row['d_az_deg'])
        d_el = abs(row['d_elev_deg'])

        # Se qualquer erro passar da tolerância, falha
        if d_az > tolerance_deg or d_el > tolerance_deg:
            print(f"FAIL: {row['body']} em {row['utc']} excedeu a tolerância.")
            print(f"   d_az={d_az:.6f}°, d_el={d_el:.6f}° (tolerância: {tolerance_deg}°)")
            all_passed = False

    if all_passed:
        print(f" PASS: Todos os resultados estão dentro da tolerância de {tolerance_deg}°")

    return all_passed


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

    # horizons
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

    is_valid = validate_results(rows, tolerance_deg=0.5)

    if not is_valid:
        sys.exit(1)
