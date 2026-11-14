"""Integration check for select_tile (requires a downloaded COG; skips otherwise)."""

import os

import numpy as np
import pytest

from lunarnav import select_tile

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_40M = os.path.join(REPO, "data", "raw", "LDEM_80S_40MPP_ADJ.TIF")


@pytest.mark.skipif(not os.path.exists(DATA_40M), reason="40 m COG not downloaded")
def test_select_tile_returns_valid_window(monkeypatch):
    monkeypatch.chdir(REPO)
    t = select_tile(-89.67, 129.78, 50.0, path=os.path.join(REPO, "datasets.yaml"))

    # Which tier wins depends on download state; both are valid.
    assert t.source in ("LDEM_80S_20MPP_ADJ", "LDEM_80S_40MPP_ADJ")
    assert t.data.ndim == 2
    n = t.data.shape[0]
    # ~50 km range at 20 m or 40 m -> ~2500 or ~5000 px
    assert 2000 <= n <= 6000
    valid = t.data[np.isfinite(t.data)]
    assert valid.size > 0
    assert -10_000.0 <= valid.min() and valid.max() <= 10_000.0
