#!/usr/bin/env python3
"""Download files from one or more GitHub Contents listing JSON arrays."""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request

ROOT = "/workspace/workforce-platform"


def mirror_entries(entries: list[dict]) -> int:
    written = 0
    for ent in entries:
        if ent.get("type") == "dir":
            continue
        path = ent["path"]
        url = ent.get("download_url")
        if not url:
            continue
        dest = os.path.join(ROOT, path)
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        req = urllib.request.Request(url, headers={"User-Agent": "workforce-platform-mirror"})
        with urllib.request.urlopen(req) as resp:
            body = resp.read()
        with open(dest, "wb") as handle:
            handle.write(body)
        written += 1
    return written


def main() -> None:
    total = 0
    for arg in sys.argv[1:]:
        with open(arg, encoding="utf-8") as handle:
            data = json.load(handle)
        if isinstance(data, dict):
            data = [data]
        total += mirror_entries(data)
    print(json.dumps({"written": total}))


if __name__ == "__main__":
    main()
