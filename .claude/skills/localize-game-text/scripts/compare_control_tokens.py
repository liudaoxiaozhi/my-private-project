#!/usr/bin/env python3
"""Compare stable IDs and ordered control tokens across localization JSONL files."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path


DEFAULT_TOKEN_PATTERN = re.compile(
    r"(?:"
    r"\{\{[^{}\r\n]+\}\}|"
    r"\{(?:\d+|[A-Za-z_][A-Za-z0-9_]*)(?:[^{}\r\n]*)\}|"
    r"%(?:\d+\$)?[-+#0 ]*\d*(?:\.\d+)?[diouxXeEfFgGcrsa%]|"
    r"\\[nrt]|"
    r"\\[A-Za-z_]+(?:\[[^\]\r\n]*\])?|"
    r"</?[A-Za-z][^>\r\n]*>|"
    r"\[[A-Za-z_][^\]\r\n]*\]"
    r")"
)


def load_jsonl(path: Path, id_field: str) -> tuple[dict[str, dict], list[str], list[dict]]:
    records: dict[str, dict] = {}
    order: list[str] = []
    errors: list[dict] = []
    with path.open("r", encoding="utf-8-sig") as handle:
        for line_number, line in enumerate(handle, 1):
            if not line.strip():
                continue
            try:
                record = json.loads(line)
            except json.JSONDecodeError as exc:
                errors.append({"line": line_number, "error": f"invalid JSON: {exc.msg}"})
                continue
            if not isinstance(record, dict):
                errors.append({"line": line_number, "error": "record is not a JSON object"})
                continue
            stable_id = record.get(id_field)
            if not isinstance(stable_id, str) or not stable_id:
                errors.append({"line": line_number, "error": f"missing string {id_field}"})
            elif stable_id in records:
                errors.append({"line": line_number, "stable_id": stable_id, "error": "duplicate ID"})
            else:
                records[stable_id] = record
                order.append(stable_id)
    return records, order, errors


def expected_tokens(
    record: dict, controls_field: str, text_field: str
) -> tuple[list[str], str | None]:
    text = record.get(text_field)
    if not isinstance(text, str):
        return [], f"{text_field} is missing or not a string"
    controls = record.get(controls_field)
    if isinstance(controls, list) and all(isinstance(item, str) for item in controls):
        source_tokens = observed_tokens(text, controls)
        if controls != source_tokens:
            return controls, (
                f"declared {controls_field} does not match source token order: "
                f"declared={controls!r}, observed={source_tokens!r}"
            )
        return controls, None
    if controls is not None:
        return [], f"{controls_field} is not an array of strings"
    return DEFAULT_TOKEN_PATTERN.findall(text), None


def observed_tokens(text: str, expected: list[str]) -> list[str]:
    alternatives = [re.escape(token) for token in sorted(set(expected), key=len, reverse=True) if token]
    if alternatives:
        pattern = re.compile("(?:" + "|".join(alternatives) + ")|(?:" + DEFAULT_TOKEN_PATTERN.pattern + ")")
        return [match.group(0) for match in pattern.finditer(text)]
    return DEFAULT_TOKEN_PATTERN.findall(text)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--target", type=Path, help="defaults to --source for records containing both fields")
    parser.add_argument("--id-field", default="stable_id")
    parser.add_argument("--controls-field", default="controls")
    parser.add_argument("--source-text-field", default="source")
    parser.add_argument("--target-text-field", default="target")
    parser.add_argument("--json", type=Path)
    args = parser.parse_args()
    target_path = args.target or args.source
    try:
        source, source_order, source_errors = load_jsonl(args.source, args.id_field)
        target, target_order, target_errors = load_jsonl(target_path, args.id_field)
        source_ids = set(source)
        target_ids = set(target)
        mismatches: list[dict] = []
        metadata_errors: list[dict] = []
        for stable_id in source_order:
            if stable_id not in target:
                continue
            expected, metadata_error = expected_tokens(
                source[stable_id], args.controls_field, args.source_text_field
            )
            if metadata_error:
                metadata_errors.append({"stable_id": stable_id, "error": metadata_error})
            target_text = target[stable_id].get(args.target_text_field)
            if not isinstance(target_text, str):
                mismatches.append(
                    {"stable_id": stable_id, "error": f"{args.target_text_field} is not a string"}
                )
                continue
            observed = observed_tokens(target_text, expected)
            if expected != observed:
                mismatches.append(
                    {"stable_id": stable_id, "expected": expected, "observed": observed}
                )
        order_mismatches = [
            {"position": index, "source": source_id, "target": target_id}
            for index, (source_id, target_id) in enumerate(
                zip(source_order, target_order, strict=False), 1
            )
            if source_id != target_id
        ]
        report = {
            "source": str(args.source.resolve()),
            "target": str(target_path.resolve()),
            "source_records": len(source),
            "target_records": len(target),
            "missing_ids": sorted(source_ids - target_ids),
            "extra_ids": sorted(target_ids - source_ids),
            "order_mismatches": order_mismatches,
            "token_mismatches": mismatches,
            "metadata_errors": metadata_errors,
            "parse_errors": {"source": source_errors, "target": target_errors},
        }
        report["controls_ok"] = not any(
            [
                report["missing_ids"],
                report["extra_ids"],
                order_mismatches,
                mismatches,
                metadata_errors,
                source_errors,
                target_errors,
            ]
        )
        rendered = json.dumps(report, ensure_ascii=False, indent=2)
        if args.json:
            args.json.parent.mkdir(parents=True, exist_ok=True)
            args.json.write_text(rendered + "\n", encoding="utf-8")
        print(rendered)
        return 0 if report["controls_ok"] else 1
    except (OSError, UnicodeError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
