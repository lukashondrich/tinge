#!/usr/bin/env python3
"""
Generate a scannable QR code from a URL.

Examples:
  python qr_from_url.py https://example.com
  python qr_from_url.py example.com -o out.svg --ecl H --border 4
"""

import argparse
from pathlib import Path
from urllib.parse import urlparse
import sys

import segno  # pip install segno


def normalize_url(u: str) -> str:
    u = u.strip()
    parsed = urlparse(u)
    if not parsed.scheme:
        # Treat bare domains as HTTPS by default so phones open them as links
        u = "https://" + u
    return u


def main():
    p = argparse.ArgumentParser(description="Turn a URL into a QR code (PNG/SVG/PDF/EPS).")
    p.add_argument("url", help="URL to encode (https:// will be prefixed if missing).")
    p.add_argument(
        "-o", "--output", default="qr.png",
        help="Output file path (.png, .svg, .pdf, .eps). Default: qr.png"
    )
    p.add_argument(
        "--ecl", choices=list("LMQH"), default="H",
        help="Error correction level (L, M, Q, H). Higher is safer; default H."
    )
    p.add_argument(
        "--border", type=int, default=4,
        help="Quiet zone border (modules). 4+ is recommended; default 4."
    )
    p.add_argument(
        "--scale", type=int, default=10,
        help="Module size (pixels) for raster formats (PNG/PPM). Default 10."
    )
    p.add_argument("--dark", default="#000000", help="Dark module color (hex). Default #000000")
    p.add_argument("--light", default="#FFFFFF", help="Light/background color (hex). Default #FFFFFF")
    p.add_argument("--micro", action="store_true", help="Allow Micro QR when possible (smaller codes).")

    args = p.parse_args()

    url = normalize_url(args.url)
    try:
        qr = segno.make(url, error=args.ecl, micro=args.micro, boost_error=True)
    except Exception as e:
        print(f"Failed to generate QR: {e}", file=sys.stderr)
        sys.exit(1)

    out = Path(args.output)
    ext = out.suffix.lower()

    try:
        if ext in (".png", ".ppm"):
            qr.save(out, scale=args.scale, border=args.border, dark=args.dark, light=args.light)
        elif ext in (".svg", ".pdf", ".eps"):
            # Vector formats (great for print); scale handled by consumer app
            qr.save(out, border=args.border, dark=args.dark, light=args.light)
        else:
            print("Unsupported extension. Use .png, .svg, .pdf or .eps", file=sys.stderr)
            sys.exit(2)
    except Exception as e:
        print(f"Failed to save file: {e}", file=sys.stderr)
        sys.exit(1)

    print(f"Saved QR to: {out.resolve()}")
    # Useful debug info
    try:
        print(f"QR version: {qr.version}  |  Error correction: {qr.error}  |  Micro: {qr.is_micro}")
    except Exception:
        pass


if __name__ == "__main__":
    main()
