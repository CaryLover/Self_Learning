"""Fetch fixed Typst packages and their declared preview imports for the local probe."""
from pathlib import Path
import io
import re
import tarfile
import urllib.request

ROOT = Path(__file__).resolve().parent / "typst-cache"
ROOT.mkdir(exist_ok=True)
pending = [("typed-physics", "0.3.0")]
seen = set()
pattern = re.compile(rb"@preview/([a-zA-Z0-9_-]+):([0-9]+\.[0-9]+\.[0-9]+)")
while pending:
    name, version = pending.pop()
    if (name, version) in seen:
        continue
    if len(seen) >= 30:
        raise RuntimeError("Too many package dependencies")
    seen.add((name, version))
    filename = f"{name}-{version}.tar.gz"
    url = f"https://packages.typst.org/preview/{filename}"
    print(f"Fetching {url}", flush=True)
    with urllib.request.urlopen(url, timeout=60) as response:
        data = response.read(20_000_001)
    if len(data) > 20_000_000:
        raise RuntimeError(f"Package too large: {filename}")
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as archive:
        for member in archive:
            if member.isfile() and member.name.endswith(".typ") and member.size <= 2_000_000:
                f = archive.extractfile(member)
                if f:
                    pending.extend((n.decode(), v.decode()) for n, v in pattern.findall(f.read()))
    (ROOT / filename).write_bytes(data)
print(f"Downloaded {len(seen)} package(s) to {ROOT}")
