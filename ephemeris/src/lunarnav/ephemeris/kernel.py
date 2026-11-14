from pathlib import Path
import spiceypy as spice

KERNEL_DIR = Path(__file__).resolve().parent.parent.parent.parent / "data" / "kernels"

def load_kernels():
    for name in [
        "naif0012.tls",               # leapseconds
        "de440s.bsp",                 # planetary/lunar ephemeris
        "moon_pa_de440_200625.bpc",   # lunar principal-axes orientation
        "moon_de440_250416.tf",       # defines MOON_ME / MOON_PA frames
    ]:
        spice.furnsh(str(KERNEL_DIR / name))

