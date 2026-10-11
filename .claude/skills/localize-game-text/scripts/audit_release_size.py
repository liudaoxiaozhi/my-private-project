#!/usr/bin/env python3
"""Audit ZIP size by deterministic asset category and group large byte-identical members."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import zipfile
from pathlib import Path, PurePosixPath


CATEGORIES = ("fonts", "story_text", "ui_bundles", "installer_config_docs", "other")
FONT_EXTENSIONS = {".otf", ".ttf", ".ttc", ".woff", ".woff2"}
TEXT_EXTENSIONS = {".ass", ".csv", ".jsonl", ".po", ".srt", ".sub", ".txt", ".vtt"}
INSTALLER_EXTENSIONS = {
    ".cmd",
    ".ini",
    ".json",
    ".license",
    ".md",
    ".ps1",
    ".toml",
    ".yaml",
    ".yml",
}
STORY_MARKERS = ("/adv/", "/scenario/", "/scenarios/", "/scr/", "/story/", "/stories/")
UI_MARKERS = ("/gui/", "/interface/", "/ui/")
INSTALLER_MARKERS = ("/analysis/", "/installer/", "/manager/")


def normalize_member(name: str) -> str:
    normalized = name.replace("\\", "/")
    if normalized.startswith("/") or re.match(r"^[A-Za-z]:", normalized):
        raise ValueError(f"absolute archive member: {name}")
    parts = normalized.split("/")
    if any(part in ("", ".", "..") for part in parts):
        raise ValueError(f"archive member is not normalized or is unsafe: {name}")
    return PurePosixPath(normalized).as_posix()


def classify(path: str) -> str:
    pure = PurePosixPath(path)
    suffix = pure.suffix.casefold()
    lower = "/" + path.casefold()
    if suffix in FONT_EXTENSIONS:
        return "fonts"
    if any(marker in lower for marker in STORY_MARKERS):
        return "story_text"
    if any(marker in lower for marker in UI_MARKERS):
        return "ui_bundles"
    if (
        any(marker in lower for marker in INSTALLER_MARKERS)
        or suffix in INSTALLER_EXTENSIONS
        or (len(pure.parts) == 1 and suffix in TEXT_EXTENSIONS)
        or pure.name.casefold().startswith(("install", "uninstall", "patchmanager", "test-patch"))
    ):
        return "installer_config_docs"
    if suffix in TEXT_EXTENSIONS:
        return "story_text"
    return "other"


def digest_member(archive: zipfile.ZipFile, info: zipfile.ZipInfo) -> str:
    digest = hashlib.sha256()
    with archive.open(info, "r") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def empty_categories() -> dict[str, dict[str, int]]:
    return {
        name: {"members": 0, "uncompressed_bytes": 0, "compressed_bytes": 0}
        for name in CATEGORIES
    }


def audit_archive(path: Path, large_threshold: int, allow_empty: bool) -> dict:
    resolved = path.resolve(strict=True)
    categories = empty_categories()
    failures: list[dict] = []
    members: list[dict] = []
    large_members: list[dict] = []
    seen: set[str] = set()
    with zipfile.ZipFile(resolved, "r") as archive:
        for info in archive.infolist():
            if info.is_dir():
                continue
            try:
                member_path = normalize_member(info.filename)
            except ValueError as exc:
                failures.append({"path": info.filename, "error": str(exc)})
                continue
            key = member_path.casefold()
            if key in seen:
                failures.append(
                    {"path": member_path, "error": "duplicate or case-colliding archive path"}
                )
                continue
            seen.add(key)
            category = classify(member_path)
            item = {
                "path": member_path,
                "category": category,
                "uncompressed_bytes": info.file_size,
                "compressed_bytes": info.compress_size,
            }
            members.append(item)
            category_totals = categories[category]
            category_totals["members"] += 1
            category_totals["uncompressed_bytes"] += info.file_size
            category_totals["compressed_bytes"] += info.compress_size
            if info.file_size >= large_threshold:
                large_members.append({**item, "sha256": digest_member(archive, info)})

    if not members and not allow_empty:
        failures.append({"error": "archive contains no files"})

    duplicate_index: dict[tuple[int, str], list[dict]] = {}
    for item in large_members:
        duplicate_index.setdefault(
            (item["uncompressed_bytes"], item["sha256"]), []
        ).append(item)
    duplicate_groups = []
    for (size, digest), items in sorted(duplicate_index.items()):
        if len(items) < 2:
            continue
        compressed_sizes = [item["compressed_bytes"] for item in items]
        duplicate_groups.append(
            {
                "sha256": digest,
                "uncompressed_bytes_each": size,
                "paths": [item["path"] for item in items],
                "compressed_bytes_total": sum(compressed_sizes),
                "estimated_one_source_saving_bytes": sum(compressed_sizes) - max(compressed_sizes),
            }
        )

    total_uncompressed = sum(item["uncompressed_bytes"] for item in members)
    total_compressed = sum(item["compressed_bytes"] for item in members)
    return {
        "archive": str(resolved),
        "archive_bytes": resolved.stat().st_size,
        "member_count": len(members),
        "total_uncompressed_bytes": total_uncompressed,
        "total_member_compressed_bytes": total_compressed,
        "categories": categories,
        "large_threshold_bytes": large_threshold,
        "large_members": sorted(large_members, key=lambda item: (-item["uncompressed_bytes"], item["path"])),
        "duplicate_large_groups": duplicate_groups,
        "unsafe_or_duplicate_entries": failures,
        "audit_ok": not failures,
    }


def comparison(primary: dict, reference: dict) -> dict:
    return {
        "archive_bytes_delta": primary["archive_bytes"] - reference["archive_bytes"],
        "uncompressed_bytes_delta": (
            primary["total_uncompressed_bytes"] - reference["total_uncompressed_bytes"]
        ),
        "member_count_delta": primary["member_count"] - reference["member_count"],
        "category_deltas": {
            category: {
                key: primary["categories"][category][key]
                - reference["categories"][category][key]
                for key in ("members", "uncompressed_bytes", "compressed_bytes")
            }
            for category in CATEGORIES
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", required=True, type=Path)
    parser.add_argument("--reference", type=Path, help="optional reference ZIP for category deltas")
    parser.add_argument("--large-threshold", type=int, default=1024 * 1024)
    parser.add_argument("--allow-empty", action="store_true")
    parser.add_argument("--json", type=Path)
    args = parser.parse_args()
    if args.large_threshold < 1:
        parser.error("--large-threshold must be positive")
    try:
        primary = audit_archive(args.archive, args.large_threshold, args.allow_empty)
        report = {"schema": "localize-game-text/archive-size-audit/v1", "primary": primary}
        ok = primary["audit_ok"]
        if args.reference:
            reference = audit_archive(args.reference, args.large_threshold, args.allow_empty)
            report["reference"] = reference
            report["comparison"] = comparison(primary, reference)
            ok = ok and reference["audit_ok"]
        report["audit_ok"] = ok
        rendered = json.dumps(report, ensure_ascii=False, indent=2)
        if args.json:
            args.json.parent.mkdir(parents=True, exist_ok=True)
            args.json.write_text(rendered + "\n", encoding="utf-8")
        print(rendered)
        return 0 if ok else 1
    except (OSError, ValueError, zipfile.BadZipFile) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
