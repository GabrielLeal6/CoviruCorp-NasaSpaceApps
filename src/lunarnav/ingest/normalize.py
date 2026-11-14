"""Unit normalization for DEM values.

DEMs ship as height-above-sphere in meters, radius in meters, radius in
kilometers, or height in kilometers. This module detects and converts to the
canonical form: height above the 1,737,400 m sphere, in meters. Every
conversion is returned as a log note so it can be reflected in tile metadata.
"""

from __future__ import annotations

import numpy as np

from ..conventions import R_MOON
from .adapters import RawTile


def normalize_units(data: np.ndarray) -> tuple[np.ndarray, str]:
    """Return ``(data_in_meters_above_sphere, log_note)``.

    Detection is by the value range of the valid pixels:
      * all in [1e6, 2e6]      -> radius in meters     -> subtract R_MOON
      * all in (1e3, 2.5e3)    -> radius in kilometers -> (v - R_MOON/1000) * 1000
      * all in (-100, 100)     -> height in kilometers -> * 1000
      * otherwise              -> already height in meters
    """
    valid = data[np.isfinite(data)]
    if valid.size == 0:
        return data, "no valid pixels; units assumed meters above sphere"

    lo, hi = float(valid.min()), float(valid.max())

    if lo > 1_000_000.0 and hi < 2_000_000.0:
        out = data - R_MOON
        note = f"radius(m) -> height(m): subtracted {R_MOON:.1f}"
    elif lo > 1_000.0 and hi < 2_500.0:
        out = (data - R_MOON / 1000.0) * 1000.0
        note = f"radius(km) -> height(m): (v - {R_MOON / 1000.0:.1f}) * 1000"
    elif lo > -100.0 and hi < 100.0:
        out = data * 1000.0
        note = "height(km) -> height(m): * 1000"
    else:
        out = data
        note = "already height(m) above sphere; no conversion"

    return out.astype(np.float32), note


def normalize(raw: RawTile) -> RawTile:
    """Apply unit normalization in place and record the log note."""
    data, note = normalize_units(raw.tile.data)
    raw.tile.data = data
    raw.unit_note = note
    return raw
