"""Validation checks against synthetic tiles."""

import numpy as np

from lunarnav.conventions import CRS, FRAME
from lunarnav.ingest.adapters import RawTile
from lunarnav.ingest.validate import check_frame, check_projection, validate
from lunarnav.synthetic import make_synthetic_dem


def test_projection_check_canonical():
    ok, _ = check_projection(CRS)
    assert ok


def test_frame_check_iau_warns_not_error():
    # LOLA polar COGs declare IAU 2015, not MOON_ME -> warn, do not reject.
    wkt = 'PROJCS["Moon (2015) - Sphere / Ocentric / South Polar",GEOGCS["Moon (2015) - Sphere / Ocentric",DATUM["Moon (2015) - Sphere",SPHEROID["Moon (2015) - Sphere",1737400,0,AUTHORITY["IAU","30100"]]]]'
    ok, detail = check_frame(wkt)
    assert ok is False
    assert "IAU" in detail


def test_validate_synthetic_rim_passes_geometry():
    tile = make_synthetic_dem("rim")
    raw = RawTile(tile=tile, source_crs=CRS, source_nodata=None,
                  width=tile.data.shape[1], height=tile.data.shape[0])
    rep = validate(raw, expected_res_m=100.0, site_lat=-90.0, site_lon=0.0,
                   max_range_m=20_000.0)
    assert rep.passed
    assert rep.checks["projection"][0]
    assert rep.checks["pole_position"][0]
    assert rep.checks["values"][0]
