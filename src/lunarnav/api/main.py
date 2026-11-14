from datetime import datetime, timedelta, timezone
import math
import time
from pathlib import Path
from typing import Any, Optional

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from lunarnav.conventions import (
    BODY_FIXED_FRAME,
    CURATED_SITES,
    DEFAULT_AZ_STEP_DEG,
    DEFAULT_MAX_RANGE_KM,
    DEFAULT_OBS_HEIGHT_M,
    DEFAULT_STEP_MINUTES,
    DEFAULT_WINDOW_HOURS,
)

app = FastAPI(title="Lunar Landing Site Navigator API", version="0.1.0-mock")
RESOURCES_DIR = Path(__file__).resolve().parents[1] / "resources"

# Allow separate local development frontends.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Unified Error Handling (Section 6) ---
class APIError(Exception):
    def __init__(self, status_code: int, code: str, message: str, details: Optional[dict[str, Any]] = None):
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details or {}


@app.exception_handler(APIError)
async def api_error_handler(_: Request, exc: APIError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": exc.code, "message": exc.message, "details": exc.details}},
    )


# --- Request / Option Schemas ---
class SiteSelector(BaseModel):
    site_id: Optional[str] = None
    lat: Optional[float] = Field(default=None, ge=-90.0, le=90.0)
    lon: Optional[float] = Field(default=None, ge=-180.0, le=180.0)


class ScenarioRequest(BaseModel):
    id: str = "A"
    site: SiteSelector
    start_utc: str = "2027-03-01T00:00:00Z"
    window_hours: int = Field(default=DEFAULT_WINDOW_HOURS, ge=1, le=2160)
    step_minutes: int = Field(default=DEFAULT_STEP_MINUTES, ge=5, le=240)


class AnalysisOptions(BaseModel):
    obs_height_m: float = DEFAULT_OBS_HEIGHT_M
    az_step_deg: float = DEFAULT_AZ_STEP_DEG
    max_range_km: float = DEFAULT_MAX_RANGE_KM
    sun_criterion: str = "center"
    min_sun_elev_deg: float = 0.0
    min_earth_elev_deg: float = 0.0


class CompareRequest(BaseModel):
    scenarios: list[ScenarioRequest]
    options: AnalysisOptions = Field(default_factory=AnalysisOptions)


class HorizonRequest(BaseModel):
    site: SiteSelector
    obs_height_m: float = DEFAULT_OBS_HEIGHT_M
    az_step_deg: float = DEFAULT_AZ_STEP_DEG
    max_range_km: float = DEFAULT_MAX_RANGE_KM


# --- Deterministic Mock Generators ---
def _resolve_site(site: SiteSelector) -> tuple[float, float, str, list[str]]:
    warnings: list[str] = []
    if site.site_id:
        if site.site_id not in CURATED_SITES:
            raise APIError(422, "INVALID_INPUT", f"Unknown site_id '{site.site_id}'.", {"site_id": site.site_id})
        s = CURATED_SITES[site.site_id]
        return s["lat"], s["lon"], "LDEM_80S_20MPP_ADJ", warnings

    if site.lat is None or site.lon is None:
        raise APIError(422, "INVALID_INPUT", "Provide either 'site_id' or both 'lat' and 'lon'.")

    if site.lat > -80.0:
        raise APIError(
            422,
            "COORD_OUT_OF_COVERAGE",
            "Site is outside the loaded south polar DEM (-80 deg max latitude).",
            {"lat": site.lat, "lon": site.lon, "dem_min_lat": -80.0},
        )

    warnings.append("Custom coordinate evaluated using reduced-resolution 80 m DEM (mock).")
    return site.lat, site.lon, "LDEM_80S_80MPP_ADJ", warnings


def _mock_horizon(lat: float, lon: float, az_step_deg: float) -> list[float]:
    n = int(round(360.0 / az_step_deg))
    phase = math.radians(lon)
    amp = 1.2 + (abs(lat + 90.0) * 0.15)
    return [
        round(max(-1.5, amp * math.sin(2 * math.radians(i * az_step_deg) + phase) + 0.6 * math.cos(5 * math.radians(i * az_step_deg))), 3)
        for i in range(n)
    ]


def _build_scenario_result(req: ScenarioRequest, opts: AnalysisOptions) -> dict[str, Any]:
    lat, lon, dem_source, warnings = _resolve_site(req.site)
    try:
        start_dt = datetime.fromisoformat(req.start_utc.replace("Z", "+00:00")).astimezone(timezone.utc)
    except ValueError as exc:
        raise APIError(422, "INVALID_INPUT", "Invalid ISO 8601 UTC timestamp.", {"start_utc": req.start_utc}) from exc

    horizon_elev = _mock_horizon(lat, lon, opts.az_step_deg)
    n_az = len(horizon_elev)

    epochs = max(2, int((req.window_hours * 60) // req.step_minutes))
    t_utc, sun_el, sun_az, sun_margin, sun_vis = [], [], [], [], []
    earth_el, earth_az, earth_margin, earth_vis = [], [], [], []

    for i in range(epochs):
        dt = start_dt + timedelta(minutes=i * req.step_minutes)
        t_utc.append(dt.strftime("%Y-%m-%dT%H:%M:%SZ"))
        days = (dt - datetime(2027, 3, 1, tzinfo=timezone.utc)).total_seconds() / 86400.0

        # Synthetic lunar cycles (~29.53d synodic Sun, ~27.32d nodical Earth libration)
        s_az = (days * (360.0 / 29.53) + lon) % 360.0
        s_el = 1.45 * math.sin(2 * math.pi * days / 29.53)
        h_at_s = horizon_elev[int(s_az / opts.az_step_deg) % n_az]
        s_m = s_el - h_at_s - opts.min_sun_elev_deg

        e_az = (180.0 - lon + 6.5 * math.sin(2 * math.pi * days / 27.32)) % 360.0
        e_el = 4.2 * math.cos(2 * math.pi * days / 27.32) - (lat + 90.0) * 0.2
        h_at_e = horizon_elev[int(e_az / opts.az_step_deg) % n_az]
        e_m = e_el - h_at_e - opts.min_earth_elev_deg

        sun_az.append(round(s_az, 3))
        sun_el.append(round(s_el, 3))
        sun_margin.append(round(s_m, 3))
        sun_vis.append(s_m > 0)

        earth_az.append(round(e_az, 3))
        earth_el.append(round(e_el, 3))
        earth_margin.append(round(e_m, 3))
        earth_vis.append(e_m > 0)

    sun_pct = round(100.0 * sum(sun_vis) / epochs, 1)
    earth_pct = round(100.0 * sum(earth_vis) / epochs, 1)
    step_h = req.step_minutes / 60.0

    return {
        "id": req.id,
        "site": {
            "lat": lat,
            "lon": lon,
            "ground_height_m": 1234.5,
            "dem_source": dem_source,
            "horizon_truncated": False,
        },
        "horizon": {"az_step_deg": opts.az_step_deg, "elev_deg": horizon_elev},
        "series": {
            "t_utc": t_utc,
            "sun": {"elev_deg": sun_el, "az_deg": sun_az, "margin_deg": sun_margin, "visible": sun_vis},
            "earth": {"elev_deg": earth_el, "az_deg": earth_az, "margin_deg": earth_margin, "visible": earth_vis},
        },
        "metrics": {
            "sun_illumination_pct": sun_pct,
            "earth_visibility_pct": earth_pct,
            "sun_windows": [
                {"start": t_utc[0], "end": t_utc[min(epochs - 1, int(epochs * 0.4))], "hours": round(epochs * 0.4 * step_h, 1), "open_start": sun_vis[0], "open_end": False}
            ] if any(sun_vis) else [],
            "earth_windows": [
                {"start": t_utc[0], "end": t_utc[min(epochs - 1, int(epochs * 0.5))], "hours": round(epochs * 0.5 * step_h, 1), "open_start": earth_vis[0], "open_end": False}
            ] if any(earth_vis) else [],
            "time_to_terrain_sunset_h": round(epochs * 0.4 * step_h, 1) if sun_vis[0] else None,
            "time_to_terrain_earthset_h": round(epochs * 0.5 * step_h, 1) if earth_vis[0] else None,
            "longest_dark_h": round((100.0 - sun_pct) / 100.0 * req.window_hours, 1),
            "longest_no_earth_h": round((100.0 - earth_pct) / 100.0 * req.window_hours, 1),
        },
        "warnings": warnings,
    }


# --- 7 Endpoints (Section 6) ---
@app.get("/api/v1/health")
def health() -> dict[str, Any]:
    return {"status": "ok", "mode": "mock", "frame": BODY_FIXED_FRAME, "kernels_loaded": False, "dem_loaded": False}


@app.get("/api/v1/datasets")
def list_datasets() -> dict[str, Any]:
    return {
        "datasets": [
            {"id": "LDEM_80S_20MPP_ADJ", "res_m": 20.0, "coverage_lat_max": -80.0, "priority": 1, "mock": True},
            {"id": "LDEM_80S_80MPP_ADJ", "res_m": 80.0, "coverage_lat_max": -80.0, "priority": 2, "mock": True},
        ]
    }


@app.get("/api/v1/sites")
def list_sites() -> dict[str, Any]:
    return {"sites": list(CURATED_SITES.values())}


@app.post("/api/v1/sites/validate")
def validate_site(site: SiteSelector) -> dict[str, Any]:
    lat, lon, dem_source, warnings = _resolve_site(site)
    return {"valid": True, "lat": lat, "lon": lon, "dem_source": dem_source, "warnings": warnings}


@app.post("/api/v1/horizon")
def get_horizon(req: HorizonRequest) -> dict[str, Any]:
    lat, lon, dem_source, warnings = _resolve_site(req.site)
    return {
        "site": {"lat": lat, "lon": lon, "dem_source": dem_source, "horizon_truncated": False},
        "horizon": {"az_step_deg": req.az_step_deg, "elev_deg": _mock_horizon(lat, lon, req.az_step_deg)},
        "warnings": warnings,
    }


@app.post("/api/v1/timeline")
def get_timeline(req: ScenarioRequest) -> dict[str, Any]:
    return _build_scenario_result(req, AnalysisOptions())


@app.post("/api/v1/compare")
def compare_scenarios(req: CompareRequest) -> dict[str, Any]:
    t0 = time.perf_counter()
    results = [_build_scenario_result(sc, req.options) for sc in req.scenarios]
    elapsed_ms = int((time.perf_counter() - t0) * 1000)
    return {
        "scenarios": results,
        "meta": {
            "engine_version": "0.1.0-mock",
            "kernels": ["naif0012.tls", "de440s.bsp", "moon_pa_de440_200625.bpc"],
            "frame": BODY_FIXED_FRAME,
            "computed_ms": elapsed_ms,
        },
    }


@app.api_route("/", methods=["GET", "HEAD"], include_in_schema=False)
def serve_frontend() -> FileResponse:
    return FileResponse(RESOURCES_DIR / "template" / "index.html")


app.mount("/", StaticFiles(directory=RESOURCES_DIR, html=True), name="frontend")