"""Catalog: coverage_check and dataset loading (acceptance section 9)."""

import os

from lunarnav.catalog import coverage_check, load_datasets

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATASETS = os.path.join(REPO, "datasets.yaml")


def test_load_datasets():
    ds = load_datasets(DATASETS)
    ids = [d.id for d in ds]
    assert "LDEM_80S_20MPP_ADJ" in ids
    assert "LDEM_80S_40MPP_ADJ" in ids
    assert all(d.priority >= 1 for d in ds)


def test_coverage_mid_latitude_out_of_coverage():
    r = coverage_check(-75.0, 0.0, 100.0, path=DATASETS)
    assert r.covered is False
    assert r.reason == "COORD_OUT_OF_COVERAGE"


def test_coverage_near_edge_truncated():
    r = coverage_check(-80.0, 0.0, 100.0, path=DATASETS)
    assert r.covered is True
    assert r.truncated is True


def test_coverage_near_pole_covered():
    r = coverage_check(-89.0, 0.0, 10.0, path=DATASETS)
    assert r.covered is True
    assert r.truncated is False
    assert r.dem_source != ""
