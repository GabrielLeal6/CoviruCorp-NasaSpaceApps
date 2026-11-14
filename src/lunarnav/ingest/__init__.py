"""Ingestion: read raw DEM files, normalize units, validate, return a DemTile."""

from .adapters import (
    ADAPTERS,
    RawTile,
    detect_format,
    geotiff_meta,
    read_geotiff,
    window_from_xy,
)
from .normalize import normalize, normalize_units
from .validate import ValidationReport, validate


def ingest(
    path: str,
    *,
    window=None,
    expected_res_m: float | None = None,
    site_lat: float | None = None,
    site_lon: float | None = None,
    max_range_m: float | None = None,
) -> tuple:
    """Read, normalize, and validate a DEM file. Returns ``(DemTile, ValidationReport)``."""
    fmt = detect_format(path)
    if fmt not in ADAPTERS:
        raise ValueError(
            f"no adapter for format {fmt!r} (file {path!r}); see docs/decisions.md"
        )
    raw = ADAPTERS[fmt](path, window=window)
    raw = normalize(raw)
    report = validate(
        raw,
        expected_res_m=expected_res_m,
        site_lat=site_lat,
        site_lon=site_lon,
        max_range_m=max_range_m,
    )
    return raw.tile, report


__all__ = [
    "ADAPTERS",
    "RawTile",
    "detect_format",
    "geotiff_meta",
    "read_geotiff",
    "window_from_xy",
    "normalize",
    "normalize_units",
    "ValidationReport",
    "validate",
    "ingest",
]
