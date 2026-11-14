"""Unit-conversion path (acceptance: radius-m and km tiles normalize to height)."""

import numpy as np

from lunarnav.conventions import R_MOON
from lunarnav.ingest.normalize import normalize_units


def test_radius_meters():
    data = np.full((4, 4), R_MOON + 500.0, dtype=np.float32)
    out, note = normalize_units(data)
    assert np.allclose(out, 500.0)
    assert "radius(m)" in note


def test_radius_kilometers():
    data = np.full((4, 4), R_MOON / 1000.0 + 0.5, dtype=np.float32)
    out, note = normalize_units(data)
    assert np.allclose(out, 500.0)
    assert "radius(km)" in note


def test_height_kilometers():
    data = np.array([[-5.0, 5.0], [-2.5, 0.0]], dtype=np.float32)
    out, note = normalize_units(data)
    assert np.allclose(out, data * 1000.0)
    assert "height(km)" in note


def test_height_meters_already():
    data = np.array([[-2871.9, 1958.6], [0.0, 1293.1]], dtype=np.float32)
    out, note = normalize_units(data)
    assert np.allclose(out, data)
    assert "already height(m)" in note


def test_nodata_ignored():
    data = np.array([[100.0, np.nan], [300.0, 400.0]], dtype=np.float32)
    out, note = normalize_units(data)
    assert np.allclose(out[~np.isnan(data)], data[~np.isnan(data)])
    assert np.isnan(out[0, 1])
    assert "already height(m)" in note
