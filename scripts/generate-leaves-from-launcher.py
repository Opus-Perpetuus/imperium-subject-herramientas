#!/usr/bin/env python3
"""Generate pages[].leaf from monorepo launcher-leaf.ts into this subject's manifest.json.

Usage:
  python3 scripts/generate-leaves-from-launcher.py \
    --leaves /path/to/imperium-SIC-.../frontend/src/app/components/subject-home/launcher-leaf.ts \
    --slug herramientas \
    --manifest manifest.json
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

SCHEMA = "https://schemas.opus-perpetuus.dev/imperium/kirlet-manifest/1.0.json"


def extract_slug_entries(text: str, slug: str) -> list[dict]:
    entries = []
    for match in re.finditer(rf"slug:\s*'{re.escape(slug)}'", text):
        start = text.rfind("{", 0, match.start())
        depth = 0
        end = None
        for j in range(start, len(text)):
            if text[j] == "{":
                depth += 1
            elif text[j] == "}":
                depth -= 1
                if depth == 0:
                    end = j + 1
                    break
        block = text[start:end]

        def g(k: str):
            mm = re.search(rf"{k}:\s*'([^']*)'", block)
            return mm.group(1) if mm else None

        def extract_obj(key: str):
            mm = re.search(rf"{key}:\s*\{{", block)
            if not mm:
                return None
            s = mm.end() - 1
            d = 0
            for j in range(s, len(block)):
                if block[j] == "{":
                    d += 1
                elif block[j] == "}":
                    d -= 1
                    if d == 0:
                        raw = block[s : j + 1]
                        pairs = re.findall(r"([A-Za-z_][A-Za-z0-9_]*)\s*:\s*'([^']*)'", raw)
                        return {k: v for k, v in pairs}
            return None

        entries.append(
            {
                "page_id": g("page_id"),
                "segment": g("segment"),
                "path": g("path"),
                "kind": g("kind"),
                "icon": g("icon"),
                "name": g("name"),
                "app_base": g("app_base"),
                "list_headers": extract_obj("list_headers"),
                "form_labels": extract_obj("form_labels"),
            }
        )
    return entries


def apply(manifest: dict, entries: list[dict], slug: str) -> tuple[list[str], list[str]]:
    prefix = f"m/subject-{slug}/"
    by_id = {e["page_id"]: e for e in entries}
    matched, skipped = [], []
    for page in manifest.get("pages", []):
        src = by_id.get(page.get("id"))
        if not src:
            skipped.append(page.get("id"))
            continue
        kind = src["kind"]
        leaf: dict = {"kind": kind}
        app_base = src.get("app_base")
        if app_base:
            if app_base.startswith(prefix):
                app_base = app_base[len(prefix) :]
            leaf["appBase"] = app_base
        elif kind == "crud":
            leaf["appBase"] = src.get("segment") or str(page.get("path", "")).lstrip("/")
        if src.get("icon"):
            leaf["icon"] = src["icon"]
        headers = src.get("list_headers")
        forms = src.get("form_labels")
        if headers:
            leaf["listHeaders"] = {"es": headers}
        if forms:
            leaf["formLabels"] = {"es": forms}
        elif headers and kind == "crud":
            leaf["formLabels"] = {"es": dict(headers)}
        perm = page.get("permission") or ""
        if not str(perm).endswith(".read"):
            leaf["permission"] = re.sub(r"\.write$", ".read", str(perm)) or (
                f"subject.{slug}.{str(page.get('path','')).lstrip('/')}.read"
            )
        if isinstance(page.get("path"), str) and page["path"].startswith("/"):
            page["path"] = page["path"].lstrip("/")
        page["leaf"] = leaf
        matched.append(page["id"])
    return matched, skipped


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--leaves", required=True, type=Path)
    ap.add_argument("--slug", required=True)
    ap.add_argument("--manifest", default="manifest.json", type=Path)
    args = ap.parse_args()
    entries = extract_slug_entries(args.leaves.read_text(), args.slug)
    raw = json.loads(args.manifest.read_text())
    ordered = {"$schema": SCHEMA, "manifestVersion": 1}
    for k, v in raw.items():
        if k in ("$schema", "manifestVersion"):
            continue
        ordered[k] = v
    matched, skipped = apply(ordered, entries, args.slug)
    args.manifest.write_text(json.dumps(ordered, ensure_ascii=False, indent=2) + "\n")
    print(f"leaves_source={len(entries)} matched={len(matched)} skipped={len(skipped)}")
    print("matched:", ", ".join(matched))
    if skipped:
        print("skipped (no LEAVES):", ", ".join(skipped))
    return 0


if __name__ == "__main__":
    sys.exit(main())
