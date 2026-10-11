# DeepSeek rough-translation handoff

Use the separate `$deepseek-rough-translate` Skill for package construction, external API processing, and package validation. This localization Skill owns the stages before export and after import.

## Prepare the upstream files

Create these files in the localization workspace:

```text
handoff-source/records.jsonl
handoff-source/glossary.json
handoff-source/context.md
```

Write `records.jsonl` in exact game order with one JSON object per translatable record:

```json
{"stable_id":"chapter01:file03:key0012","chapter":"chapter01","scene":"scene04","speaker":"Character A","source_file":"file03.xml","key":"key0012","text":"Current source text","controls":[]}
```

Requirements:

- derive `stable_id` from durable source identity, not a temporary array index;
- keep chapters and scenes contiguous so packaging can preserve narrative context;
- include the exact control-token sequence in source order;
- exclude commands, resource paths, voice IDs, keys that are never referenced, and non-translatable metadata;
- protect secrets and unrelated assets;
- keep `glossary.json` compact and stable during one rough-translation run;
- put genre, world state, recurring translation constraints, and speaker guidance in `context.md`.

## Export the input ZIP

Use the packaging script owned by `$deepseek-rough-translate`:

```powershell
python "<deepseek-rough-translate-skill>\scripts\handoff_package.py" build-input `
  --records handoff-source\records.jsonl `
  --glossary handoff-source\glossary.json `
  --context handoff-source\context.md `
  --project-id '<game-and-version-id>' `
  --output deepseek-rough-input.zip
```

Resolve the installed Skill path from the active skills catalog; do not hardcode another user's home directory. Adjust the Python path for the active environment. Use `--max-records` and `--max-chars` only when the default scene chunks are inappropriate.

Immediately inspect the package and record:

- absolute path and SHA-256;
- input fingerprint;
- project ID and game version;
- chunk and record counts;
- source and target languages;
- glossary/context versions or hashes;
- excluded content and known limitations.

Stop here when the user intends to process the package elsewhere. The next action belongs to `$deepseek-rough-translate`, not this Skill.

## Receive one self-contained return ZIP

Require `deepseek-rough-output.zip`. It embeds the exact original input ZIP plus all accepted response chunks, so the user does not need to return two files.

Inspect before extraction:

```powershell
python "<deepseek-rough-translate-skill>\scripts\handoff_package.py" inspect deepseek-rough-output.zip
```

Reject the package when:

- any checksum, schema, package fingerprint, or embedded input fingerprint fails;
- the fingerprint differs from the workspace export manifest;
- any expected chunk is missing, duplicated, incomplete, or invalid UTF-8;
- paragraph or control-token counts fail;
- the return package is only a work directory or loose response collection without a finalized manifest.

After validation, copy the ZIP unchanged into a durable project input directory and extract it to a new import directory. Record the import path and hashes; do not modify the archive in place.

## Align after import

For each embedded input chunk:

1. read its ordered paragraph metadata and stable IDs;
2. split the matching raw response on record-level blank lines;
3. map paragraph positions provisionally;
4. compare source meaning, speaker, controls, quotes, and neighboring context;
5. reject or manually resolve ambiguous mappings even when paragraph counts match;
6. restore protected `⟦HANDOFF_LF⟧` sentinels to real line breaks only after alignment;
7. write accepted rough text to a separate layer keyed by stable ID and input fingerprint.

Then have Codex compare every rough line with the original source. Check subjects, objects, negation, numbers, time, direction, referents, omissions, additions, terminology, register, and character voice. Retranslate incorrect lines directly rather than polishing them in isolation.

## Preserve reproducibility

Keep these artifacts separate:

```text
handoff-source/
handoff-export/deepseek-rough-input.zip
handoff-import/deepseek-rough-output.zip
handoff-import/extracted/
translations/aligned-rough/
translations/reviewed/
translations/overrides/
analysis/deepseek-handoff.json
analysis/rough-translation-trial.json
```

Never regenerate the exported input package silently after external work begins. If source, glossary, context, chunking, or controls change, create a new input ZIP with a new fingerprint and require a matching return package.
