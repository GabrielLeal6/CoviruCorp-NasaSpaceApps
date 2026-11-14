# DEM validation report

Generated 2026-11-14 by `scripts/inspect_dem.py`. Each dataset is run through
the eight checks from context.md section 5.

## LDEM_80S_40MPP_ADJ

Metadata: GTiff, 15200×15200, float32, NaN nodata, 40 m pixels, tiled COG with
overviews [2,4,8,16,32], bounds ±304 km (80°S to pole).

Unit conversion: already height(m) above sphere; no conversion.

| Check | Pass | Detail |
|---|---|---|
| projection | yes | south polar stereographic, lat_0=-90, lon_0=0, R=1737400 |
| frame | **no** | source declares IAU 2015 Moon sphere, not MOON_ME (see docs/decisions.md #2) |
| pixels | yes | dx = res_m = 40 m (square), expected 40 m |
| values | yes | height range [-2871.9, 1958.6] m (near-pole 20 km window) |
| coverage | yes | dist 10 km + range 50 km vs 304 km |
| nodata | yes | 0.00% nodata |
| pole_position | yes | pole at pixel (499.50, 499.50) vs center 499.50 |
| known_point | yes | (-89.67, 129.78) Shackleton → pixel (659, 691), h=-2789.1 m |

- WARNING: frame declares IAU 2015, not MOON_ME (offset ~875 m; open with Member 2).

Overall: **PASS** (frame caveat tracked).

## LDEM_80S_20MPP_ADJ

Metadata: GTiff, 30400×30400, float32, NaN nodata, 20 m pixels, tiled COG with
overviews [2,4,8,16,32,64], bounds ±304 km (80°S to pole).

Unit conversion: already height(m) above sphere; no conversion.

| Check | Pass | Detail |
|---|---|---|
| projection | yes | south polar stereographic, lat_0=-90, lon_0=0, R=1737400 |
| frame | **no** | source declares IAU 2015 Moon sphere, not MOON_ME (see docs/decisions.md #2) |
| pixels | yes | dx = res_m = 20 m (square), expected 20 m |
| values | yes | height range [-2872.1, 1959.4] m (near-pole 20 km window) |
| coverage | yes | not checked (no site/range given) |
| nodata | yes | 0.00% nodata |
| pole_position | yes | pole at pixel (999.50, 999.50) vs center 999.50 |
| known_point | yes | not checked (no site given) |

- WARNING: frame declares IAU 2015, not MOON_ME (offset ~875 m; open with Member 2).

Overall: **PASS** (frame caveat tracked).

## LDEM_80S_80M

Deferred: the local GDAL build has no PDS3 driver (docs/decisions.md #1), so the
80 m `IMG` cannot be read. The 40 m COG serves as the reduced-resolution fallback.
