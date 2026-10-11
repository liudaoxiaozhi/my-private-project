#!/usr/bin/env python3
"""Compare a release directory with a ZIP archive by safe path, size, and SHA-256."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import zipfile
from pathlib import Path, PurePosixPath


def digest_file(path: Path) -> tuple[int, str]:
    digest = hashlib.sha256()
    size = 0
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            size += len(chunk)
            digest.update(chunk)
    return size, digest.hexdigest().upper()


def digest_member(archive: zipfile.ZipFile, info: zipfile.ZipInfo) -> tuple[int, str]:
    digest = hashlib.sha256()
    size = 0
    with archive.open(info, "r") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            size += len(chunk)
            digest.update(chunk)
    return size, digest.hexdigest().upper()


def normalize_member(name: str) -> str:
    normalized = name.replace("\\", "/")
    if normalized.startswith("/") or re.match(r"^[A-Za-z]:", normalized):
        raise ValueError(f"absolute archive member: {name}")
    lexical_parts = normalized.split("/")
    if any(part in ("", ".", "..") for part in lexical_parts):
        raise ValueError(f"archive member is not normalized or is unsafe: {name}")
    path = PurePosixPath(normalized)
    return path.as_posix()


def directory_map(root: Path) -> dict[str, tuple[int, str]]:
    result: dict[str, tuple[int, str]] = {}
    for path in sorted(item for item in root.rglob("*") if item.is_file()):
        result[path.relative_to(root).as_posix()] = digest_file(path)
    return result


def archive_infos(archive: zipfile.ZipFile) -> tuple[dict[str, zipfile.ZipInfo], list[dict]]:
    result: dict[str, zipfile.ZipInfo] = {}
    failures: list[dict] = []
    folded: set[str] = set()
    for info in archive.infolist():
        if info.is_dir():
            continue
        try:
            name = normalize_member(info.filename)
        except ValueError as exc:
            failures.append({"path": info.filename, "error": str(exc)})
            continue
        key = name.casefold()
        if key in folded:
            failures.append({"path": name, "error": "duplicate or case-colliding archive path"})
            continue
        folded.add(key)
        result[name] = info
    return result, failures


def strip_prefix(entries: dict[str, zipfile.ZipInfo], prefix: str) -> dict[str, zipfile.ZipInfo] | None:
    clean = prefix.replace("\\", "/").strip("/")
    if not clean:
        return dict(entries)
    marker = clean + "/"
    if not entries or not all(name.startswith(marker) for name in entries):
        return None
    stripped: dict[str, zipfile.ZipInfo] = {}
    for name, info in entries.items():
        new_name = name[len(marker) :]
        if not new_name or new_name.casefold() in {item.casefold() for item in stripped}:
            return None
        stripped[new_name] = info
    return stripped


def choose_mapping(
    entries: dict[str, zipfile.ZipInfo], directory_names: set[str], release_name: str, requested: str | None
) -> tuple[str, dict[str, zipfile.ZipInfo]]:
    if requested is not None:
        mapped = strip_prefix(entries, requested)
        if mapped is None:
            raise ValueError(f"archive entries do not all use prefix {requested!r}")
        return requested.strip("/\\"), mapped
    candidates: list[tuple[str, dict[str, zipfile.ZipInfo]]] = [("", entries)]
    first_parts = {name.split("/", 1)[0] for name in entries if "/" in name}
    for prefix in sorted(first_parts | {release_name}):
        mapped = strip_prefix(entries, prefix)
        if mapped is not None:
            candidates.append((prefix, mapped))
    return min(
        candidates,
        key=lambda item: (
            len(directory_names ^ set(item[1])),
            0 if item[0] == release_name else 1,
            len(item[0]),
        ),
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", required=True, type=Path)
    parser.add_argument("--archive", required=True, type=Path)
    parser.add_argument("--prefix", help="archive top-level path to strip; default is automatic")
    parser.add_argument("--allow-empty", action="store_true", help="allow an empty release and ZIP")
    parser.add_argument("--json", type=Path)
    args = parser.parse_args()
    try:
        root = args.directory.resolve(strict=True)
        if not root.is_dir():
            raise ValueError("--directory is not a directory")
        directory = directory_map(root)
        with zipfile.ZipFile(args.archive, "r") as archive:
            infos, failures = archive_infos(archive)
            if not directory and not infos and not args.allow_empty:
                failures.append({"error": "release directory and archive are empty"})
            prefix, mapped = choose_mapping(infos, set(directory), root.name, args.prefix)
            missing = sorted(set(directory) - set(mapped))
            extra = sorted(set(mapped) - set(directory))
            mismatches: list[dict] = []
            for name in sorted(set(directory) & set(mapped)):
                archive_value = digest_member(archive, mapped[name])
                if archive_value != directory[name]:
                    mismatches.append(
                        {
                            "path": name,
                            "directory": {"bytes": directory[name][0], "sha256": directory[name][1]},
                            "archive": {"bytes": archive_value[0], "sha256": archive_value[1]},
                        }
                    )
        report = {
            "directory": str(root),
            "archive": str(args.archive.resolve()),
            "stripped_prefix": prefix,
            "directory_files": len(directory),
            "archive_files": len(mapped),
            "missing_from_archive": missing,
            "extra_in_archive": extra,
            "content_mismatches": mismatches,
            "unsafe_or_duplicate_entries": failures,
        }
        report["archive_matches_directory"] = not any([missing, extra, mismatches, failures])
        rendered = json.dumps(report, ensure_ascii=False, indent=2)
        if args.json:
            args.json.parent.mkdir(parents=True, exist_ok=True)
            args.json.write_text(rendered + "\n", encoding="utf-8")
        print(rendered)
        return 0 if report["archive_matches_directory"] else 1
    except (OSError, ValueError, zipfile.BadZipFile) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
