#!/usr/bin/env python3
"""Verify installed overlay files against a JSON manifest without claiming runtime use."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
from pathlib import Path, PurePosixPath


HASH_FIELDS = ("installedSha256", "sha256", "payloadSha256", "hash")
SIZE_FIELDS = ("installedBytes", "bytes", "size")
PATH_FIELDS = ("targetRelative", "installedRelative", "relativePath", "relative", "path")


def first_value(record: dict, fields: tuple[str, ...]):
    for field in fields:
        if field in record:
            return record[field]
    return None


def first_path(record: dict) -> tuple[str | None, object]:
    for field in PATH_FIELDS:
        value = record.get(field)
        if value not in (None, ""):
            return field, value
    return None, None


def safe_relative(value: object) -> PurePosixPath:
    if not isinstance(value, str) or not value.strip():
        raise ValueError("missing relative path")
    normalized = value.replace("\\", "/")
    if normalized.startswith("/") or re.match(r"^[A-Za-z]:", normalized):
        raise ValueError(f"absolute path is not allowed: {value}")
    lexical_parts = normalized.split("/")
    if any(part in ("", ".", "..") for part in lexical_parts):
        raise ValueError(f"path is not normalized or is unsafe: {value}")
    relative = PurePosixPath(normalized)
    return relative


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def within(path: Path, root: Path) -> bool:
    try:
        return os.path.commonpath((str(path), str(root))) == str(root)
    except ValueError:
        return False


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--root", required=True, type=Path, help="actual runtime data root")
    parser.add_argument("--allow-empty", action="store_true", help="allow an empty files array")
    parser.add_argument("--json", type=Path)
    args = parser.parse_args()
    try:
        manifest = json.loads(args.manifest.read_text(encoding="utf-8-sig"))
        files = manifest.get("files") if isinstance(manifest, dict) else None
        if not isinstance(files, list):
            raise ValueError("manifest must contain a files array")
        root = args.root.resolve(strict=True)
        failures: list[dict] = []
        if not files and not args.allow_empty:
            failures.append({"error": "manifest files array is empty"})
        verified = 0
        seen: set[str] = set()
        path_fields_used: dict[str, int] = {}
        for index, record in enumerate(files):
            if not isinstance(record, dict):
                failures.append({"index": index, "error": "file entry is not an object"})
                continue
            path_field, raw_path = first_path(record)
            try:
                relative = safe_relative(raw_path)
            except ValueError as exc:
                failures.append({"index": index, "path": raw_path, "error": str(exc)})
                continue
            path_fields_used[path_field] = path_fields_used.get(path_field, 0) + 1
            key = relative.as_posix().casefold()
            if key in seen:
                failures.append({"index": index, "path": relative.as_posix(), "error": "duplicate path"})
                continue
            seen.add(key)
            candidate = root.joinpath(*relative.parts)
            try:
                resolved = candidate.resolve(strict=True)
            except FileNotFoundError:
                failures.append({"path": relative.as_posix(), "error": "missing installed file"})
                continue
            if not within(resolved, root):
                failures.append({"path": relative.as_posix(), "error": "resolved path escapes root"})
                continue
            if not resolved.is_file():
                failures.append({"path": relative.as_posix(), "error": "not a regular file"})
                continue
            expected_size = first_value(record, SIZE_FIELDS)
            expected_hash = first_value(record, HASH_FIELDS)
            actual_size = resolved.stat().st_size
            actual_hash = sha256(resolved)
            errors: list[str] = []
            if not isinstance(expected_size, int) or isinstance(expected_size, bool):
                errors.append("manifest size missing or not an integer")
            elif actual_size != expected_size:
                errors.append(f"size {actual_size} != {expected_size}")
            if not isinstance(expected_hash, str) or not re.fullmatch(r"[0-9A-Fa-f]{64}", expected_hash):
                errors.append("manifest SHA-256 missing or invalid")
            elif actual_hash != expected_hash.upper():
                errors.append(f"sha256 {actual_hash} != {expected_hash.upper()}")
            if errors:
                failures.append({"path": relative.as_posix(), "error": "; ".join(errors)})
            else:
                verified += 1
        report = {
            "manifest": str(args.manifest.resolve()),
            "runtime_data_root": str(root),
            "manifest_files": len(files),
            "verified_files": verified,
            "path_fields_used": path_fields_used,
            "failures": failures,
            "static_ok": not failures and verified == len(files),
            "runtime_loaded": None,
            "runtime_note": "Not tested; installed byte equality does not prove runtime loading.",
        }
        rendered = json.dumps(report, ensure_ascii=False, indent=2)
        if args.json:
            args.json.parent.mkdir(parents=True, exist_ok=True)
            args.json.write_text(rendered + "\n", encoding="utf-8")
        print(rendered)
        return 0 if report["static_ok"] else 1
    except (OSError, UnicodeError, json.JSONDecodeError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
