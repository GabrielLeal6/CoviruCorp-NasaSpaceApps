from pathlib import Path
import spiceypy as spice

KERNEL_DIR = Path(__file__).resolve().parents[3] / "data" / "kernels"
REQUIRED_KERNELS = [
    "naif0012.tls",              # leapseconds
    "de440s.bsp",                # planetary/lunar ephemeris
    "moon_pa_de440_200625.bpc",  # lunar principal-axes orientation
    "moon_de440_250416.tf",      # defines MOON_ME / MOON_PA frames
]

_LOADED = False


def load_kernels() -> bool:
    global _LOADED
    if _LOADED:
        return True
    for name in REQUIRED_KERNELS:
        path = KERNEL_DIR / name
        if not path.exists():
            raise FileNotFoundError(f"Missing SPICE kernel: {path}")
        spice.furnsh(str(path))
    _LOADED = True
    return True


def kernels_loaded() -> bool:
    try:
        return load_kernels()
    except Exception:
        return False