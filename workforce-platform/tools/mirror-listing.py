#!/usr/bin/env python3
"""Apply a GitHub Contents API directory listing JSON (from MCP) to disk."""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request

ROOT = "/workspace/workforce-platform"


def main() -> None:
    raw = sys.stdin.read()
    data = json.loads(raw)
    if isinstance(data, dict):
        entries = [data]
    else:
        entries = data

    subdirs: list[str] = []
    written = 0
    for ent in entries:
        path = ent["path"]
        if ent["type"] == "dir":
            subdirs.append(path)
            continue
        url = ent.get("download_url")
        if not url:
            print(f"skip (no download_url): {path}", file=sys.stderr)
            continue
        dest = os.path.join(ROOT, path)
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        req = urllib.request.Request(url, headers={"User-Agent": "workforce-platform-mirror"})
        try:
            with urllib.request.urlopen(req) as resp:
                body = resp.read()
        except urllib.error.HTTPError as exc:
            print(f"HTTP {exc.code} for {path}", file=sys.stderr)
            raise
        with open(dest, "wb") as handle:
            handle.write(body)
        written += 1

    json.dump({"written": written, "subdirs": subdirs}, sys.stdout)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
