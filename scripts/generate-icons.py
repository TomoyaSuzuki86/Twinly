#!/usr/bin/env python3
"""Generate lossless PWA PNGs directly from the user-provided Twinly artwork.

The archived source is a 512px, high-quality WebP derived DIRECTLY from the
user's 1536px uploaded original, not from any previous 192px install icon.
Do not upscale an existing 192px icon or resave generated PNGs as the source.
"""
from pathlib import Path
from hashlib import sha256
from PIL import Image

ROOT = Path(__file__).resolve().parents[1] / "public" / "icons"
SOURCE = ROOT / "source-twinly-512-v7.webp"
EXPECTED_SOURCE_SHA256 = "ef228ee999c501d9e5091a5460f0484e92e256cd119eb9967f9dfadb981964bb"
OUTPUTS = {
    "icon-192-v7.png": 192,
    "icon-512-v7.png": 512,
    "icon-192-maskable-v7.png": 192,
    "icon-512-maskable-v7.png": 512,
    "apple-touch-icon-v7.png": 180,
    "favicon-32-v7.png": 32,
}

def main():
    source_bytes = SOURCE.read_bytes()
    assert sha256(source_bytes).hexdigest() == EXPECTED_SOURCE_SHA256, "The high-quality source asset has changed"
    with Image.open(SOURCE) as loaded:
        loaded.verify()
    with Image.open(SOURCE) as loaded:
        assert loaded.format == "WEBP" and loaded.size == (512, 512), "Source image must be 512x512 WebP"
        source = loaded.convert("RGB")
        # Maskable and normal versions intentionally use the SAME full-bleed
        # artwork. We inspected the round Android crop and kept all motifs in
        # its safe circle; no extra inset square or artificial border.
        for filename, size in OUTPUTS.items():
            output = source if size == 512 else source.resize((size, size), Image.Resampling.LANCZOS)
            path = ROOT / filename
            output.save(path, format="PNG", optimize=True)
            with Image.open(path) as check:
                check.verify()
            with Image.open(path) as check:
                assert check.format == "PNG" and check.mode == "RGB" and check.size == (size, size), path
            print(f"{path.name} {size}x{size} sha256={sha256(path.read_bytes()).hexdigest()}")

if __name__ == "__main__":
    main()
