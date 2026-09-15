#!/usr/bin/env python3
"""Write repo files from newline-delimited JSON: {"path": "...", "content": "..."}."""

from __future__ import annotations

import json
import os
import sys

ROOT = "/workspace/workforce-platform"


def main() -> None:
    written = 0
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        row = json.loads(line)
        path = row["path"]
        content = row["content"]
        dest = os.path.join(ROOT, path)
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        with open(dest, "w", encoding="utf-8") as handle:
            handle.write(content)
            if not content.endswith("\n"):
                handle.write("\n")
        written += 1
    print(json.dumps({"written": written}))


if __name__ == "__main__":
    main()
