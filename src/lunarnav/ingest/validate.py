"""The eight validation checks from context.md section 5."""

from __future__ import annotations

import warnings
from dataclasses import dataclass, field

import numpy as np
from pyproj import CRS

from ..conventions import FRAME, R_MOON
from ..projection import coverage_radius_m, distance_from_pole_m, geo_to_xy
from .adapters import RawTile


@dataclass
class ValidationReport:
    dataset: str
    checks: dict = field(default_factory=dict)  # name -> (passed: bool, detail: str)
    warnings: list = field(default_factory=list)
    errors: list = field(default_factory=list)
    unit_note: str = ""

    @property
    def passed(self) -> bool:
        return not self.errors

    def to_markdown(self) -> str:
        lines = [f"## {self.dataset}", ""]
        if self.unit_note:
            lines += [f"Unit conversion: {self.unit_note}", ""]
        lines += ["| Check | Pass | Detail |", "|---|---|---|"]
        for name, (ok, detail) in self.checks.items():
            lines.append(f"| {name} | {'yes' if ok else '**NO**'} | {detail} |")
        lines += [""]
        for w in self.warnings:
            lines.append(f"- WARNING: {w}")
        for e in self.errors:
            lines.append(f"- ERROR: {e}")
        lines.append("")
        lines.append(f"Overall: **{'PASS' if self.passed else 'FAIL'}**")
        return "\n".join(lines)


def _pget(proj4: str, key: str):
    for tok in proj4.split():
        if tok.startswith("+" + key + "="):
            return tok.split("=", 1)[1]
    return None


def check_projection(source_crs: str) -> tuple[bool, str]:
    try:
        c = CRS.from_user_input(source_crs)
    except Exception as e:  # noqa: BLE001
        return False, f"unparseable CRS: {e}"
    # Converting WKT -> PROJ string drops the datum name, which is fine here:
    # we only need proj/lat_0/lon_0/R, all of which are preserved.
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        p = c.to_proj4()
    proj = _pget(p, "proj")
    lat0 = _pget(p, "lat_0")
    lon0 = _pget(p, "lon_0")
    r = _pget(p, "R") or _pget(p, "a")
    try:
        ok_lat = abs(float(lat0) + 90.0) < 1e-6 if lat0 is not None else False
        ok_lon = abs(float(lon0 or 0.0)) < 1e-6
        ok_r = abs(float(r or 0.0) - R_MOON) < 1.0
    except (TypeError, ValueError):
        return False, f"could not read projection params from {p!r}"
    if proj == "stere" and ok_lat and ok_lon and ok_r:
        return True, "south polar stereographic, lat_0=-90, lon_0=0, R=1737400"
    return False, f"mismatch (proj={proj}, lat_0={lat0}, lon_0={lon0}, R={r})"


def check_frame(source_crs: str) -> tuple[bool, str]:
    wkt = source_crs or ""
    if any(t in wkt for t in ("MOON_ME", "DE421", "Mean Earth", "mean earth")):
        return True, "declares MOON_ME / DE421"
    # The LOLA polar COGs declare IAU 2015 Moon sphere: a documented ~0.029 deg
    # (~875 m) offset from MOON_ME. Warn, do not reject; resolve with Member 2.
    return False, "source declares IAU 2015 Moon sphere, not MOON_ME (see docs/decisions.md)"


def validate(
    raw: RawTile,
    *,
    expected_res_m: float | None = None,
    site_lat: float | None = None,
    site_lon: float | None = None,
    max_range_m: float | None = None,
) -> ValidationReport:
    tile = raw.tile
    rep = ValidationReport(dataset=tile.source, unit_note=raw.unit_note)

    # 1 Projection
    ok, detail = check_projection(raw.source_crs)
    rep.checks["projection"] = (ok, detail)
    if not ok:
        rep.errors.append(f"projection: {detail}")

    # 2 Frame
    ok, detail = check_frame(raw.source_crs)
    rep.checks["frame"] = (ok, detail)
    if not ok:
        rep.warnings.append(f"frame: {detail}")

    # 3 Pixels square + size
    ok = tile.dx > 0 and abs(tile.dx - tile.res_m) < 1e-9
    detail = f"dx = res_m = {tile.dx:.4g} m (square)"
    if expected_res_m is not None:
        ok = ok and abs(tile.dx - expected_res_m) < 0.5
        detail += f", expected {expected_res_m} m"
    rep.checks["pixels"] = (ok, detail)
    if not ok:
        rep.errors.append(f"pixels: {detail}")

    # 4 Values within -10..+10 km
    valid = tile.data[np.isfinite(tile.data)]
    if valid.size:
        lo, hi = float(valid.min()), float(valid.max())
        ok = -10_000.0 <= lo and hi <= 10_000.0
        detail = f"height range [{lo:.1f}, {hi:.1f}] m"
    else:
        ok, detail = False, "no valid pixels"
    rep.checks["values"] = (ok, detail)
    if not ok:
        rep.errors.append(f"values: {detail}")

    # 5 Coverage (needs a site and range)
    if site_lat is not None and max_range_m is not None:
        dist = distance_from_pole_m(site_lat)
        radius = coverage_radius_m(tile.coverage_lat_max)
        ok = dist + max_range_m <= radius
        detail = f"dist {dist / 1e3:.1f} km + range {max_range_m / 1e3:.1f} km vs {radius / 1e3:.1f} km"
        rep.checks["coverage"] = (ok, detail)
        if not ok:
            rep.warnings.append(f"coverage: {detail} -> horizon truncated")
    else:
        rep.checks["coverage"] = (True, "not checked (no site/range given)")

    # 6 Nodata fraction
    total = tile.data.size
    nan_frac = float(np.isnan(tile.data).sum()) / total if total else 1.0
    ok = nan_frac <= 0.05
    detail = f"{nan_frac:.2%} nodata"
    rep.checks["nodata"] = (ok, detail)
    if not ok:
        rep.warnings.append(f"nodata: {detail} exceeds 5%")

    # 7 Pole position (only if the tile contains (0, 0))
    n = tile.data.shape[0]
    x0, y0, dx = tile.x0, tile.y0, tile.dx
    contains_pole = (x0 <= 0.0 <= x0 + n * dx) and (y0 - n * dx <= 0.0 <= y0)
    if contains_pole:
        col = (0.0 - x0) / dx
        row = (y0 - 0.0) / dx
        center = (n - 1) / 2.0
        ok = abs(col - center) < 0.5 and abs(row - center) < 0.5
        detail = f"pole at pixel ({row:.2f}, {col:.2f}) vs center {center:.2f}"
    else:
        ok, detail = True, "tile does not contain the pole (windowed read)"
    rep.checks["pole_position"] = (ok, detail)
    if not ok:
        rep.errors.append(f"pole_position: {detail}")

    # 8 Known point (needs a site)
    if site_lat is not None and site_lon is not None:
        px, py = geo_to_xy(site_lat, site_lon)
        col = (px - x0) / dx
        row = (y0 - py) / dx
        if 0 <= row < n and 0 <= col < n:
            h = float(tile.data[int(row), int(col)])
            ok = np.isfinite(h) and -10_000.0 <= h <= 10_000.0
            detail = f"({site_lat}, {site_lon}) -> pixel ({int(row)}, {int(col)}), h={h:.1f} m"
        else:
            ok, detail = False, f"site outside tile extent (row {row:.1f}, col {col:.1f})"
        rep.checks["known_point"] = (ok, detail)
        if not ok:
            rep.errors.append(f"known_point: {detail}")
    else:
        rep.checks["known_point"] = (True, "not checked (no site given)")

    return rep
