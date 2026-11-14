"""Dataset catalog and tile selection (interfaces for Members 4 and 5)."""

from __future__ import annotations

import os

import yaml

from .ingest.adapters import read_geotiff, window_from_xy
from .projection import coverage_radius_m, distance_from_pole_m, geo_to_xy
from .tiles import CoverageResult, DatasetInfo, DemTile

_DEFAULT_DATASETS = "datasets.yaml"


def load_datasets(path: str = _DEFAULT_DATASETS) -> list[DatasetInfo]:
    with open(path) as f:
        raw = yaml.safe_load(f)
    out = []
    for d in raw["datasets"]:
        bounds = tuple(d["bounds"]) if d.get("bounds") else None
        out.append(
            DatasetInfo(
                id=d["id"],
                path=d["path"],
                format=d["format"],
                resolution=float(d["resolution"]),
                priority=int(d["priority"]),
                bounds=bounds,
                units=d.get("units", "m"),
                checksum=d.get("checksum"),
                source_url=d.get("source_url"),
            )
        )
    return out


def list_datasets(path: str = _DEFAULT_DATASETS) -> list[DatasetInfo]:
    return load_datasets(path)


def _coverage_lat_max(info: DatasetInfo) -> float:
    if info.bounds:
        return float(info.bounds[2])  # max_lat
    return -80.0


def coverage_check(
    lat: float, lon: float, max_range_km: float, path: str = _DEFAULT_DATASETS
) -> CoverageResult:
    datasets = sorted(load_datasets(path), key=lambda d: d.priority)
    if lat > -80.0:
        return CoverageResult(False, False, "", "COORD_OUT_OF_COVERAGE")
    range_m = max_range_km * 1000.0
    dist_m = distance_from_pole_m(lat)
    for info in datasets:
        radius = coverage_radius_m(_coverage_lat_max(info))
        if dist_m + range_m <= radius:
            return CoverageResult(True, False, info.id, None)
    best = datasets[-1] if datasets else None
    return CoverageResult(True, True, best.id if best else "", "truncated")


def select_tile(
    lat: float,
    lon: float,
    max_range_km: float,
    obs_h_m: float = 2.0,  # reserved for Member 5's horizon; not used for selection
    path: str = _DEFAULT_DATASETS,
) -> DemTile:
    datasets = sorted(load_datasets(path), key=lambda d: d.priority)
    x, y = geo_to_xy(lat, lon)
    range_m = max_range_km * 1000.0
    dist_m = distance_from_pole_m(lat)

    # Highest-priority dataset whose coverage fully contains observer + range.
    for info in datasets:
        if not os.path.exists(info.path):
            continue
        radius = coverage_radius_m(_coverage_lat_max(info))
        if dist_m + range_m <= radius:
            tile = _read_window(info, x, y, range_m)
            if tile is not None:
                return tile

    # Fallback: best available (coarsest) tile; call coverage_check to flag it.
    for info in reversed(datasets):
        if not os.path.exists(info.path):
            continue
        tile = _read_window(info, x, y, range_m)
        if tile is not None:
            return tile
    raise FileNotFoundError("no readable DEM dataset files available for tile selection")


def _read_window(info: DatasetInfo, x: float, y: float, range_m: float) -> DemTile | None:
    import rasterio

    try:
        with rasterio.open(info.path) as ds:
            w = window_from_xy(ds, x, y, range_m)
        return read_geotiff(info.path, window=w).tile
    except Exception:  # noqa: BLE001  (corrupt/incomplete tile -> skip to next dataset)
        return None
