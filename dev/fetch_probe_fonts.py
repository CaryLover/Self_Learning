"""Fetch pinned Typst font assets for local license and rendering evaluation."""
from pathlib import Path
import urllib.request

root = Path(__file__).resolve().parent / "typst-cache" / "fonts"
root.mkdir(parents=True, exist_ok=True)
base = "https://cdn.jsdelivr.net/gh/typst/typst-assets@v0.13.1/"
files = {
    "NewCM10-Regular.otf": "files/fonts/NewCM10-Regular.otf",
    "NewCMMath-Regular.otf": "files/fonts/NewCMMath-Regular.otf",
    "NOTICE": "NOTICE",
}
for name, relative in files.items():
    url = base + relative
    print("Fetching " + url, flush=True)
    with urllib.request.urlopen(url, timeout=60) as response:
        data = response.read(20_000_001)
    if not data or len(data) > 20_000_000:
        raise ValueError(f"Invalid size: {name}")
    if name.endswith(".otf") and not (data.startswith(b"OTTO") or data.startswith(b"\x00\x01\x00\x00")):
        raise ValueError(f"Not an OpenType font: {name}")
    (root / name).write_bytes(data)
    print(f"Saved {name}: {len(data)} bytes")
