#!/usr/bin/env python3
"""Check Unicode cmap coverage in a TTF/OTF font using only the standard library."""

from __future__ import annotations

import argparse
import json
import struct
import sys
import unicodedata
from pathlib import Path


def u16(data: bytes, offset: int) -> int:
    return struct.unpack_from(">H", data, offset)[0]


def u32(data: bytes, offset: int) -> int:
    return struct.unpack_from(">I", data, offset)[0]


def require(data: bytes, offset: int, size: int, label: str) -> None:
    if offset < 0 or size < 0 or offset + size > len(data):
        raise ValueError(f"truncated {label} at offset {offset}")


def sfnt_offset(data: bytes, face_index: int) -> int:
    if data[:4] != b"ttcf":
        if face_index != 0:
            raise ValueError("--face-index is only valid for a font collection")
        return 0
    require(data, 0, 12, "TTC header")
    count = u32(data, 8)
    if face_index < 0 or face_index >= count:
        raise ValueError(f"face index {face_index} outside TTC face count {count}")
    require(data, 12, count * 4, "TTC offsets")
    return u32(data, 12 + face_index * 4)


def table_offset(data: bytes, sfnt: int, tag: bytes) -> int:
    require(data, sfnt, 12, "SFNT header")
    num_tables = u16(data, sfnt + 4)
    require(data, sfnt + 12, num_tables * 16, "SFNT table directory")
    for index in range(num_tables):
        entry = sfnt + 12 + index * 16
        if data[entry : entry + 4] == tag:
            offset = u32(data, entry + 8)
            length = u32(data, entry + 12)
            require(data, offset, length, tag.decode("ascii", "replace"))
            return offset
    raise ValueError(f"font has no {tag.decode('ascii')} table")


def coverage_format_0(data: bytes, offset: int) -> set[int]:
    require(data, offset, 262, "cmap format 0")
    return {cp for cp in range(256) if data[offset + 6 + cp] != 0}


def coverage_format_4(data: bytes, offset: int) -> set[int]:
    require(data, offset, 16, "cmap format 4")
    length = u16(data, offset + 2)
    require(data, offset, length, "cmap format 4")
    seg_count = u16(data, offset + 6) // 2
    end_base = offset + 14
    start_base = end_base + seg_count * 2 + 2
    delta_base = start_base + seg_count * 2
    range_base = delta_base + seg_count * 2
    require(data, range_base, seg_count * 2, "cmap format 4 arrays")
    covered: set[int] = set()
    table_end = offset + length
    for index in range(seg_count):
        end = u16(data, end_base + index * 2)
        start = u16(data, start_base + index * 2)
        delta = u16(data, delta_base + index * 2)
        range_offset_pos = range_base + index * 2
        range_offset = u16(data, range_offset_pos)
        if start > end:
            continue
        for cp in range(start, end + 1):
            if cp == 0xFFFF:
                continue
            if range_offset == 0:
                glyph = (cp + delta) & 0xFFFF
            else:
                glyph_pos = range_offset_pos + range_offset + (cp - start) * 2
                if glyph_pos + 2 > table_end:
                    raise ValueError("invalid cmap format 4 glyph offset")
                glyph = u16(data, glyph_pos)
                if glyph:
                    glyph = (glyph + delta) & 0xFFFF
            if glyph:
                covered.add(cp)
    return covered


def coverage_format_6(data: bytes, offset: int) -> set[int]:
    require(data, offset, 10, "cmap format 6")
    first = u16(data, offset + 6)
    count = u16(data, offset + 8)
    require(data, offset + 10, count * 2, "cmap format 6 glyphs")
    return {first + i for i in range(count) if u16(data, offset + 10 + i * 2)}


def coverage_format_10(data: bytes, offset: int) -> set[int]:
    require(data, offset, 20, "cmap format 10")
    start = u32(data, offset + 12)
    count = u32(data, offset + 16)
    require(data, offset + 20, count * 2, "cmap format 10 glyphs")
    return {start + i for i in range(count) if u16(data, offset + 20 + i * 2)}


def coverage_format_12_or_13(data: bytes, offset: int, constant: bool) -> set[int]:
    require(data, offset, 16, "cmap format 12/13")
    groups = u32(data, offset + 12)
    require(data, offset + 16, groups * 12, "cmap format 12/13 groups")
    covered: set[int] = set()
    for index in range(groups):
        group = offset + 16 + index * 12
        start = u32(data, group)
        end = u32(data, group + 4)
        glyph = u32(data, group + 8)
        if start > end or end > 0x10FFFF:
            raise ValueError("invalid cmap format 12/13 group")
        if constant:
            if glyph:
                covered.update(range(start, end + 1))
        else:
            first = start if glyph else start + 1
            covered.update(range(first, end + 1))
    return covered


def is_unicode_cmap(platform_id: int, encoding_id: int) -> bool:
    return platform_id == 0 or (platform_id == 3 and encoding_id in (1, 10))


def font_coverage(
    path: Path, face_index: int
) -> tuple[set[int], list[int], list[dict[str, int]]]:
    data = path.read_bytes()
    cmap = table_offset(data, sfnt_offset(data, face_index), b"cmap")
    require(data, cmap, 4, "cmap header")
    count = u16(data, cmap + 2)
    require(data, cmap + 4, count * 8, "cmap encodings")
    offsets: dict[int, int] = {}
    subtables: list[dict[str, int]] = []
    for index in range(count):
        record = cmap + 4 + index * 8
        platform_id = u16(data, record)
        encoding_id = u16(data, record + 2)
        if not is_unicode_cmap(platform_id, encoding_id):
            continue
        sub_offset = cmap + u32(data, record + 4)
        require(data, sub_offset, 2, "cmap subtable")
        fmt = u16(data, sub_offset)
        if fmt not in (0, 4, 6, 10, 12, 13):
            continue
        offsets[sub_offset] = fmt
        subtables.append(
            {"platform_id": platform_id, "encoding_id": encoding_id, "format": fmt}
        )
    covered: set[int] = set()
    formats: list[int] = []
    for offset, fmt in sorted(offsets.items()):
        try:
            if fmt == 0:
                subset = coverage_format_0(data, offset)
            elif fmt == 4:
                subset = coverage_format_4(data, offset)
            elif fmt == 6:
                subset = coverage_format_6(data, offset)
            elif fmt == 10:
                subset = coverage_format_10(data, offset)
            elif fmt in (12, 13):
                subset = coverage_format_12_or_13(data, offset, fmt == 13)
            else:
                continue
        except (IndexError, struct.error) as exc:
            raise ValueError(f"invalid cmap format {fmt}: {exc}") from exc
        formats.append(fmt)
        covered.update(subset)
    if not formats:
        raise ValueError(
            "no supported Unicode cmap subtable "
            "(platform 0 or Windows Unicode encoding 1/10; formats 0, 4, 6, 10, 12, 13)"
        )
    return covered, sorted(set(formats)), subtables


def describe(cp: int) -> dict[str, object]:
    char = chr(cp)
    return {
        "codepoint": f"U+{cp:04X}",
        "character": char,
        "name": unicodedata.name(char, "UNNAMED"),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--font", required=True, type=Path)
    parser.add_argument("--face-index", type=int, default=0)
    parser.add_argument("--text", action="append", default=[])
    parser.add_argument("--text-file", action="append", type=Path, default=[])
    parser.add_argument("--encoding", default="utf-8")
    parser.add_argument("--json", type=Path, help="write the JSON report to this path")
    args = parser.parse_args()
    if not args.text and not args.text_file:
        parser.error("provide at least one --text or --text-file")
    try:
        corpus = "".join(args.text)
        for text_path in args.text_file:
            corpus += text_path.read_text(encoding=args.encoding)
        required = {
            ord(char)
            for char in corpus
            if not char.isspace() and not unicodedata.category(char).startswith("C")
        }
        covered, formats, subtables = font_coverage(args.font, args.face_index)
        missing = sorted(required - covered)
        report = {
            "font": str(args.font.resolve()),
            "face_index": args.face_index,
            "cmap_formats": formats,
            "unicode_cmap_subtables": subtables,
            "required_unique": len(required),
            "covered_unique": len(required) - len(missing),
            "missing_count": len(missing),
            "missing": [describe(cp) for cp in missing],
            "coverage_ok": not missing,
        }
        rendered = json.dumps(report, ensure_ascii=False, indent=2)
        if args.json:
            args.json.parent.mkdir(parents=True, exist_ok=True)
            args.json.write_text(rendered + "\n", encoding="utf-8")
        print(rendered)
        return 0 if not missing else 1
    except (OSError, UnicodeError, ValueError, struct.error) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
