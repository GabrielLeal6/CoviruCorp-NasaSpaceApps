#!/usr/bin/env python3
"""Download a DEM with resume and optional checksum verification.

Uses curl (the tool known to handle PGDA's flaky TLS with --http1.1 and
retry-all-errors). Resume is automatic; verification is optional because PGDA
does not publish sha256 sums for these products.

Usage:
    python scripts/fetch_data.py URL DEST [--sha256 HEX] [--expected-size BYTES]
"""

from __future__ import annotations

import argparse
import hashlib
import subprocess
import sys


def download(url: str, dest: str) -> bool:
    cmd = [
        "curl", "-L", "-C", "-", "--http1.1",
        "--retry", "5", "--retry-all-errors", "--retry-delay", "3",
        "--connect-timeout", "30", "-sS", "-o", dest, url,
    ]
    return subprocess.run(cmd).returncode == 0


def sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> None:
    ap = argparse.ArgumentParser(description="Resume-able DEM download.")
    ap.add_argument("url")
    ap.add_argument("dest")
    ap.add_argument("--sha256", default=None, help="expected sha256 hex")
    ap.add_argument("--expected-size", type=int, default=None, help="expected bytes")
    args = ap.parse_args()

    ok = download(args.url, args.dest)
    if not ok:
        print("download did not complete; re-run to resume", file=sys.stderr)
        sys.exit(1)

    if args.expected_size is not None:
        import os

        size = os.path.getsize(args.dest)
        if size != args.expected_size:
            print(f"size mismatch: got {size}, expected {args.expected_size}", file=sys.stderr)
            sys.exit(1)
        print(f"size ok: {size} bytes")

    if args.sha256 is not None:
        got = sha256(args.dest)
        if got != args.sha256.lower():
            print(f"sha256 mismatch:\n  got      {got}\n  expected {args.sha256}", file=sys.stderr)
            sys.exit(1)
        print("sha256 ok")

    print(f"done: {args.dest}")


if __name__ == "__main__":
    main()
