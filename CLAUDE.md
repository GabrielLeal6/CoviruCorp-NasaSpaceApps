# context.md — Member 1: Data Engineering

Project: **Lunar Landing Site Navigator, Tier 3 Terrain-Aware Horizon Engine** (NASA Space Apps Challenge 2026, 5 people, 48 hours).
This file is everything you (or an agent working for you) need to build the data layer in parallel with the rest of the team. The full blueprint is the long-form reference; this file is the working copy for Member 1.

Labels: **[Confirmed]** = stated in NASA/JPL documentation I retrieved. **[Judgment]** = engineering recommendation. **[Verify]** = check it yourself in the first hours and log the answer in `docs/decisions.md`.

---

## 1. Your mission in one paragraph

Get the LOLA terrain data into a clean, validated, canonical form that Member 5 (horizon engine) can read without thinking about file formats, projections or units. Provide a catalog that picks the right tile for any site, tell Member 4 (API) whether a coordinate is covered, cache expensive results, and later build and deploy the Docker image. You own `data/`, `datasets.yaml`, `sites.yaml`, the ingestion package and the deployment.

You do **not** own: the horizon algorithm (Member 5), SPICE/ephemeris (Member 2), the API (Member 4), the frontend (Member 3).

---

## 2. Shared conventions (never break these)

- Body-fixed frame everywhere: **MOON_ME** (LOLA polar products are in the DE421 mean-Earth frame [Confirmed]).
- Reference sphere radius **R = 1,737,400 m**. The polar products use a south polar stereographic projection on that sphere, true scale at the pole [Confirmed].
- DEM heights are **meters above that sphere**. Some products store radius instead of height, and units may be km, so you normalize and log every conversion [Confirmed that height and radius variants exist].
- Latitude: planetocentric degrees, south negative. Longitude: east-positive degrees in [-180, 180].
- Terrain code uses meters. Ephemeris code uses kilometers. Never mix without a named conversion function.
- Azimuth: degrees clockwise from north. Times: ISO 8601 UTC at the API.

---

## 3. What you deliver (interfaces other people code against)

### 3.1 `DemTile` (Member 5 depends on this by hour 10)

```python
@dataclass
class DemTile:
    data: np.ndarray        # float32 (or int16 + scale), meters above the 1,737,400 m sphere, NaN = nodata
    x0: float               # projected x of the upper-left pixel CENTER (m)
    y0: float               # projected y of the upper-left pixel CENTER (m)
    dx: float               # pixel size in meters, square pixels
    crs: str                # south polar stereographic, lat_0=-90, lon_0=0, R=1737400
    frame: str              # 'MOON_ME'
    source: str             # e.g. 'LDEM_80S_20MPP_ADJ'
    res_m: float
    coverage_lat_max: float # northern edge of coverage in degrees (e.g. -80.0)
    filled_fraction: float  # fraction of NaNs that were filled
```

### 3.2 Catalog functions (Member 4 and 5 call these)

```python
def select_tile(lat: float, lon: float, max_range_km: float, obs_h_m: float = 2.0) -> DemTile
def coverage_check(lat: float, lon: float, max_range_km: float) -> CoverageResult
    # CoverageResult: covered: bool, truncated: bool, dem_source: str, reason: str | None
def list_datasets() -> list[DatasetInfo]
```

Priority rule: use the highest-priority tile whose bounds fully contain the observer plus `max_range_km`. Otherwise fall back to the next coarser tile and flag it. Always return the chosen `source`.

### 3.3 Files

| File | Purpose |
|---|---|
| `datasets.yaml` | Catalog: id, path, format, resolution, priority, bounds, units, checksum, source URL |
| `sites.yaml` | Curated sites: id, name, lat, lon, source of the coordinates, notes |
| `data/processed/` | Canonical tiles plus JSON sidecar metadata |
| `scripts/fetch_data.py` | Download with checksums and resume |
| `scripts/inspect_dem.py` | Print CRS, transform, pixel size, nodata, value range |
| `scripts/crop_dem.py` | Crop, normalize units, downsample, optional hillshade PNG |
| `docs/validation_report_dem.md` | Output of the validation checks for every dataset |

### 3.4 Synthetic DEMs (Member 5 needs these by hour 4)

Provide `make_synthetic_dem(kind, **params) -> DemTile` in the canonical frame. Analytic test cases:

| Kind | Construction | Expected horizon |
|---|---|---|
| `flat` | All zeros, observer at the pole | About 0° (tiny negative, about -step/(2R) in radians) |
| `rim` | Ring of height 1000 m, radius 10 km, width 200 m, centered on the pole, observer at the pole | About +5.55° at every azimuth |
| `cone` | Cone of height H, base radius B, centered 20 km from the observer | Compute from geometry, include curvature |
| `wall` | One 1 km wall, 10 km from the observer | About +5.55° across its azimuth span, about 0° elsewhere |

Check for the `rim` value: elevation = atan((H - s²/(2R)) / s) with H = 1000 m, s = 10,000 m, R = 1,737,400 m, which gives about 5.55°. Curvature drop at 10 km is about 28.8 m. Give Member 5 the formula as well as the tiles.

---

## 4. Datasets and sizes

| Dataset | Source | Size | Role | Priority |
|---|---|---|---|---|
| LOLA 20 m south polar DEM, ADJ (LDEM_80S_20MPP_ADJ), 80°S to pole | [NASA PGDA product 90](https://pgda.gsfc.nasa.gov/products/90) | About 2.6 GB GeoTIFF [Confirmed] (PDS IMG about 1.76 GB, JP2 about 194 MB [Confirmed]) | Primary, offline high resolution | 1 |
| LOLA 40 m DEM (LDEM_80S_40MPP_ADJ) | Same page | About 685 MB [Confirmed] | Development and online fallback | 2 |
| LOLA 80 m DEM | [PDS south pole listing](https://imbrium.mit.edu/BROWSE/LOLA_GDR/POLAR/SOUTH_POLE) | PDS IMG about 111 MB [Confirmed] | Online tier for custom coordinates | 3 |
| 5 m site DEMs | [NASA PGDA product 78](https://pgda.gsfc.nasa.gov/products/78) | Per-site sizes [Verify] | Optional (P1). About 90% interpolated pixels, so do not oversell resolution [Confirmed] | 0 for those sites |
| 87.5°S to pole 5 m DEM | PDS listing above | IMG about 1.76 GB, JP2 about 163 MB [Confirmed] | Optional | — |
| LDEC count map and error layers | PGDA | Hundreds of MB to GB | Optional data-quality indicator | — |

Format documentation: [PDS GDR DEM page](https://ode.rsl.wustl.edu/moon/pagehelp/Content/Missions_Instruments/LRO/LOLA/GDR/GDRDEM.htm).

**Memory arithmetic** (20 m grid is 30,400 × 30,400 pixels [Confirmed]; the rest is arithmetic):

| Raster | float32 | int16 |
|---|---|---|
| Full 20 m | about 3.7 GB | about 1.85 GB |
| Full 40 m | about 0.92 GB | about 0.46 GB |
| Full 80 m | about 231 MB | about 116 MB |
| 200 km window at 20 m | about 400 MB | about 200 MB |
| 200 km window at 40 m | about 100 MB | about 50 MB |
| 200 km window at 80 m | about 25 MB | about 12 MB |

**Two-tier strategy [Judgment].** Offline on your laptop, read windows directly from the 20 m cloud-optimized GeoTIFF with Rasterio (windowed reads, never load the full file). The deployed app ships only precomputed horizons plus the 80 m (or 40 m) int16 tier for custom coordinates, labeled reduced resolution. Free hosts have small memory limits [Verify].

int16 encoding: 0.5 m steps cover about ±16 km of relief, which is enough for the polar region [Judgment]. Record the scale in the sidecar JSON.

Downsampling: averaging lowers peaks, max-pooling raises them. Pick one, record it in metadata, and tell Member 5.

---

## 5. Validation checks (run on every dataset, write the results to the report)

| Check | Pass condition | If it fails |
|---|---|---|
| Projection | Polar stereographic, latitude of origin -90, central meridian 0, sphere radius 1,737,400 m | Reject, or reproject only if the source CRS is clearly documented |
| Frame | Source states MOON_ME (DE421 or aligned) | Reject unless the offset is documented |
| Pixels | Square, size matches the product name | Reject |
| Values | Heights within about -10 to +10 km. Around 1.7e6 means radius in meters, around 1737 means kilometers | Auto-convert, warn, log |
| Coverage | Bounds contain the site plus max_range | Warn: horizon will be truncated |
| Nodata | Fraction below a threshold (about 5%) in the working window | Warn, or pick another tile |
| Pole position | The pole (x=0, y=0) falls at the DEM's center pixel | Stop and investigate axis or offset |
| Known point | A point with known lat/lon projects to the expected pixel and its height is plausible | Stop and investigate |

The last two checks guard against mirrored or shifted terrain. This is the most expensive silent bug in the project, so do them before anything else, and share the result with Members 2 and 5.

Geometry to remember: one degree of latitude is about 30.3 km, so the 80°S products reach about 304 km from the pole [Confirmed]. A site must satisfy distance_from_pole + max_range ≤ about 304 km, otherwise flag `truncated`.

---

## 6. Ingestion design

Adapter registry keyed by format. Adding a dataset means writing one function, not changing the pipeline.

```python
ADAPTERS = {
  'geotiff': read_geotiff,   # Rasterio, windowed reads (primary)
  'pds3_img': read_pds3,     # GDAL PDS driver with detached .LBL [Verify]
  'jp2': read_jp2,           # only if the local GDAL build has the driver [Verify]
}

def ingest(path) -> tuple[DemTile, ValidationReport]:
    fmt = detect_format(path)
    raw = ADAPTERS[fmt](path)
    report = validate(raw)            # collect all failures, do not stop at the first
    tile = normalize(raw, report)     # meters above sphere, float32, NaN for nodata, square pixels
    return tile, report
```

Do **not** assume challenge-day datasets are compatible. Evaluate them with the rubric below.

### Challenge-day dataset rubric (you run the 45-minute spike)

1. Does it cover our curated sites?
2. Is the frame and CRS documented and compatible with MOON_ME? If not, can a documented transform fix it in under 30 minutes?
3. Does it improve something we show, or let us validate something we claim (for example precomputed illumination to cross-check our illumination %)?
4. Does it load through an existing adapter, or does it need a new one (budget about 90 minutes)?
5. Is it needed for P0? If not, integrate only after the P0 acceptance test passes.
6. If the spike fails at 45 minutes, drop it and log why.

---

## 7. Cache and storage

- Horizon cache key: hash of (dem_source, algorithm_version, lat rounded to 1e-4, lon rounded to 1e-4, obs_height_m, az_step_deg, max_range_km). Store JSON on disk plus an in-memory dictionary. No database server [Judgment].
- Shared Moon-centered Sun/Earth vectors are cached by Member 2, not you.
- Everything the deployed app needs is baked into the Docker image: processed tiles, precomputed horizons, kernels (Member 2's files). No runtime downloads.

---

## 8. Your timeline (hour 0 = start)

| Hours | Tasks | Handoffs and checkpoints |
|---|---|---|
| **0–4** | Start the DEM downloads **at hour 0** (40 m first, then 20 m). Run `inspect_dem.py`. Write `make_synthetic_dem`. Learning sprint: raster basics, CRS, polar stereographic, windowed reads. Write a one-page cheat sheet in `docs/` | **H4:** synthetic DEMs delivered to Member 5. Frame/units findings in `docs/decisions.md` |
| **4–10** | Ingestion adapters, validation report, `DemTile` v1, pole-at-center and known-point tests with Members 2 and 5 | **H10:** DemTile v1 delivered. One real DEM crop works for Member 5's first horizon |
| **10–16** | Caches, `datasets.yaml`, 80 m tier, `select_tile` and `coverage_check` | **H16:** real end-to-end scenario works for the UI |
| **16–22** | Custom-coordinate validation, coverage and truncation warnings, curated `sites.yaml` with sources | **H22:** three-scenario comparison on curated sites |
| **22–28** | **Sleep (about 6 h) in shift A** | — |
| **28–34** | First Docker image and deploy. Challenge-day dataset spike if the rubric says yes | **H34:** a working URL or local run |
| **34–40** | Fix data bugs, memory and size pass, README for data | **H40:** feature freeze |
| **40–48** | Smoke tests on the deployed app, offline fallback laptop, backup demo video support | **H44:** code freeze |

---

## 9. Acceptance tests for your part

- [ ] Every dataset has a validation report with all eight checks.
- [ ] Pole falls at the center pixel and a known point lands on the expected pixel (documented).
- [ ] `select_tile` returns the highest-priority fully covering tile and reports `source`.
- [ ] `coverage_check` returns `covered=False` for a point at 75°S and `truncated=True` for a point near the DEM edge.
- [ ] Unit conversion path is tested (a fake radius-in-meters tile and a fake kilometers tile both normalize to height in meters).
- [ ] Synthetic `rim` DEM gives Member 5 the analytic horizon of about 5.55°.
- [ ] The deployed image starts with no network access and no runtime downloads.

---

## 10. Dependencies and communication

| With | What | When |
|---|---|---|
| Member 5 | Synthetic DEMs (H4), DemTile v1 (H10), tile resolution and downsampling choice | Early and often |
| Member 2 | Shared frame checklist (MOON_ME, sphere radius, pole test) | H4 to H10 |
| Member 4 | `coverage_check` contract, error codes (COORD_OUT_OF_COVERAGE, DATASET_UNAVAILABLE) | H4 |
| Member 3 | Optional hillshade PNG for the map | H28 or later (P1) |

Backup role: terrain QA (review Member 5's horizon tests) and the challenge-day dataset spike.

---

## 11. Known hazards

1. **Mirrored or shifted terrain** from a wrong axis orientation or pixel-center versus pixel-corner offset. Run the pole and known-point tests first.
2. **Units**: height versus radius, meters versus kilometers. Auto-convert but always log.
3. **Memory**: never load the full 20 m grid into RAM. Use windowed reads.
4. **ME versus PA frame**: the two lunar frames differ by about 0.029°, roughly 875 m on the surface [Confirmed]. Only MOON_ME matches LOLA.
5. **Interpolated pixels**: 5 m products are mostly interpolated [Confirmed]. Do not claim real 5 m accuracy.
6. **Coverage edge**: sites near 80°S with a 100 km range hit the DEM edge. Flag `truncated`, do not silently clip.
7. **Mid-latitude points**: a coordinate such as the one in the QuickMap example (about 10.9°S) is outside the polar DEMs. Return `COORD_OUT_OF_COVERAGE`. A global LOLA DEM is not in scope unless time remains.
8. **GDAL driver gaps**: PDS3 and JPEG2000 support depends on the local build [Verify]. Prefer the GeoTIFF/COG products.

---

## 12. Verify list for Member 1

| # | Item | Why |
|---|---|---|
| 1 | Axis orientation and sign conventions of the south polar stereographic grid in the actual file | Prevents mirrored terrain |
| 2 | Units of the downloaded DEM (height versus radius, meters versus kilometers) | Silent scale errors |
| 3 | Whether the local GDAL build reads PDS3 IMG/LBL and JPEG2000 | Decides which adapters are needed |
| 4 | Sizes and exact file names of the 5 m site DEMs | Download planning |
| 5 | Free-tier memory and build limits of the chosen host | Deployment plan |
| 6 | Curated site coordinates and their sources (the candidate-region lists I found date from 2022 and may have changed) | Credibility of the site list |

Log every answer in `docs/decisions.md` with the date and the source.

---

## 13. Rules for agents working on this file

1. Work only in the directories you own: `src/lunarnav/ingest/`, `src/lunarnav/cache/`, `scripts/`, `data/`, `datasets.yaml`, `sites.yaml`, `Dockerfile`.
2. Do not change `conventions.py`, the shared dataclasses, or the API schema without the integration lead (Member 4) approving it.
3. Prefer the smallest change that passes the tests. No new dependencies without telling the team.
4. Every conversion, fill or downsampling step must be logged and reflected in the tile metadata.
5. When a [Verify] item gets an answer, record it. Never turn a guess into a hard-coded assumption.
6. Do not claim scientific accuracy beyond what the data supports. State resolution and fill fraction honestly.
7. If a test fails, report the failure and the likely cause instead of adjusting the test to pass.
