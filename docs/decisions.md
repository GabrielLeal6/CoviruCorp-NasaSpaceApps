# Decisions log (Member 1: Data Engineering)

Each entry records a [Verify] answer or an engineering decision, dated, with the
source. Never turn a guess into a hard-coded assumption; this file is where the
guess goes until it is verified.

## 2026-11-14

### 1. GDAL build only reads GeoTIFF (driver gap)
- **Answer:** The bundled GDAL 3.12.2 in rasterio 1.5.2 ships only the `GTiff`
  driver. There is no PDS3 (`IMG`/`.LBL`) driver and no JPEG2000 driver.
- **Evidence:** `rasterio._base._raster_driver_extensions` lists only
  `tif`/`tiff` → `GTiff`. Opening `LDEM_80S_80M.IMG` fails even with the `.LBL`
  beside it.
- **Consequence:** The 80 m PDS3 IMG is deferred. The 40 m COG
  (`LDEM_80S_40MPP_ADJ.TIF`) is the development/fallback tier; the 20 m COG is
  primary once its download completes. `ADAPTERS` only registers `geotiff`.

### 2. Source CRS is IAU 2015, not MOON_ME
- **Answer:** The PGDA COGs declare `Moon (2015) - Sphere / Ocentric`
  (IAU datum 30100, projected CRS 30135), **not** the DE421 mean-Earth frame
  (`MOON_ME`) the project spec assumes.
- **Evidence:** `rasterio` CRS WKT on `LDEM_80S_40MPP_ADJ.TIF` names
  `AUTHORITY["IAU","30100"]` / `30135`.
- **Impact:** The ME-vs-PA offset is about 0.029° (~875 m on the surface).
  The projection *math* (south polar stereographic, lat_0=-90, lon_0=0,
  R=1,737,400 m) is identical, so terrain geometry is correct; only the absolute
  frame label differs.
- **Decision:** Keep `DemTile.frame = "MOON_ME"` for the shared contract, but
  log a **warning** in every validation report and surface it here. **Open
  question for Member 2:** confirm whether to treat IAU 2015 as equivalent to
  MOON_ME for this scope or apply the ~875 m offset.

### 3. 40 m COG is already height in meters
- **Answer:** `LDEM_80S_40MPP_ADJ.TIF` stores height above the 1,737,400 m
  sphere in meters (float32, NaN nodata). No unit conversion needed.
- **Evidence:** center-pixel value ~1,286 m; near-pole window range
  [-2,872, +1,959] m. The unit detector reports "already height(m)".

### 4. Even grid: the pole is at a pixel corner, not a single center pixel
- **Answer:** The COGs are 15,200 × 15,200 (even) with the pole (0, 0) falling
  exactly on the corner between the four central pixels.
- **Evidence:** transform origin (-304000, 304000), 40 m pixels → pixel index
  7599.5 for x=0. The pole-position check therefore uses a ±0.5-pixel tolerance
  against center = (n-1)/2.
- **Note:** synthetic DEMs use an *odd* grid so the pole centers on one pixel,
  which is what Member 5's tests assume. Both are handled by the validator.

### 5. Download resilience (PGDA flaky TLS)
- **Decision:** `scripts/fetch_data.py` uses curl with `--http1.1`,
  `--retry-all-errors`, resume (`-C -`). Plain `--retry` does **not** retry the
  `exit 56 (SSL_read: unexpected eof)` failures PGDA returns; `--retry-all-errors`
  does.

### 6. Downsampling choice
- **Decision:** averaging (`np.nanmean`) is the default for downsampled tiers,
  because it preserves the mean surface that the horizon engine integrates
  against. Max-pooling is available via `--method max` if Member 5 wants a
  conservative (occluding) estimate. The method is recorded in the sidecar JSON
  and passed to Member 5.

### 7. 20 m download still in progress
- **Status:** `LDEM_80S_20MPP_ADJ.TIF` is downloading (~2.6 GB). Until it
  finishes, `select_tile` falls back to the 40 m COG; the fallback is automatic
  (a read on the incomplete COG fails and the next priority is tried).
