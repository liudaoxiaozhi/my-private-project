---
name: localize-game-text
description: Extract, translate, polish, rebuild, package, diagnose, repair, and validate game localization text and reversible Chinese patches. Use when Codex must inventory text assets, preserve script controls, trial-gate Terra rough translation with an independent Sol review before bulk work, delegate rough translation to DeepSeek or another callable model, align and rewrite returned text, configure Chinese fonts, fix Backlog or other UI rendering, prove the actual runtime asset path, repair an installer, build a graphical Chinese patch manager plus one-click installer, simplify the public patch directory, audit archive size or duplicate bundled assets, or distinguish package correctness from what the running game loaded.
---

# Localize Game Text

Treat a localization patch as a chain of evidence: identify the exact game, find the assets the running process actually reads, preserve executable text structure, rebuild from canonical sources, install transactionally, and verify the affected UI in game. A clean package is not proof that the game loaded it.

## Choose the operation

Route the task before acting:

- **Diagnose or repair an existing patch:** start with target identity and runtime-loader proof. Read [references/diagnose-and-runtime.md](references/diagnose-and-runtime.md).
- **Extract or inventory text:** preserve immutable source bytes and emit stable records before translating.
- **Use a rough-translation backend:** keep DeepSeek or a callable Codex model limited to rough prose. For an internal Codex run, require the Terra-to-Sol trial gate below before bulk translation. Read [references/deepseek-handoff.md](references/deepseek-handoff.md) and use `$deepseek-rough-translate` when available.
- **Align, polish, or rebuild:** join by stable ID, preserve controls and metadata, then rewrite against source meaning.
- **Fix fonts, Backlog, or UI text:** map every affected surface to its real font and layout binding. Read [references/font-and-ui-qa.md](references/font-and-ui-qa.md).
- **Build an installer or release:** separate game root, runtime data root, and virtual asset root; use a reversible transaction. Read [references/installer-and-release.md](references/installer-and-release.md).

Combine routes when necessary, but do not skip their evidence gates.

## Fence the exact target

Record the exact executable path, process identity, game/version fingerprint, distribution or app ID when available, selected game root, actual runtime data root, and virtual asset root. Do not infer identity from a franchise name, window title fragment, or sibling installation.

When inspecting or restarting a game, act only on the verified executable/process. Never close a similarly named sibling title. If the user says a specific title such as TDA01, treat other titles as out of scope unless comparison is explicitly requested.

## Diagnose before rebuilding

For a patch that “does not work,” prove where the running process reads assets before modifying content. Inspect launch arguments, logs, handles, configuration, overlay conventions, and a harmless runtime probe. Separate these states:

1. **Source:** canonical localization inputs are valid.
2. **Package:** rebuilt files and archive are internally correct.
3. **Installed:** the expected bytes exist under the intended runtime root.
4. **Runtime:** the exact process loaded those bytes and rendered the target surface.

Report each state separately. Static hashes may prove the first three, never the fourth. Fix the canonical source or builder, rebuild, update the installed transaction, fully restart the exact process when assets are cached, and recheck the same UI surface.

## Extract immutable records

Inventory every text-bearing format before translation: scripts, tables, JSON, XML, subtitle tracks, UI resources, engine bundles, and archives. Keep original bytes immutable and store encoding, container path, entry path, source hash, and extraction command.

Use stable IDs derived from structural location rather than display order. A practical record contains:

```json
{"stable_id":"scene/entry/field","source":"...","target":"","speaker":"...","controls":["..."],"source_sha256":"..."}
```

Preserve line breaks, placeholders, tags, control codes, escape sequences, speaker metadata, and ordering. Use [scripts/compare_control_tokens.py](scripts/compare_control_tokens.py) before rebuild; treat malformed records, source-control metadata drift, missing target text, and record-order changes as failures.

## Translate and polish

### Gate an internal rough translation before bulk work

Do not dispatch the full corpus to an internal Codex model immediately. When both model overrides are callable, use this sequence:

1. Freeze the glossary and context, then select a representative trial of three chunks or 150–300 records, whichever is smaller. Include narration, character-heavy dialogue, military/action text, recurring terms, and control-rich records; use the whole input when it is smaller.
2. Have `gpt-5.6-terra` produce rough candidates for the trial only. Validate paragraph counts and controls before judging prose.
3. Have `gpt-5.6-sol` independently compare the Terra candidates with the original source, glossary, context, speaker voice, and neighboring records. Sol reviews rather than silently rewriting the candidates.
4. Pass only when transport validation is perfect, Sol finds no critical meaning error, major semantic corrections affect at most 2% of sampled records, and there is no systematic terminology, register, omission, or control problem.
5. On pass, accept the trial and use Terra for the remaining rough translation. On fail, retain the Terra trial only as evidence, have Sol retranslate the trial, and use Sol for all remaining chunks.

Save `analysis/rough-translation-trial.json` with the input fingerprint, sampled chunks and stable IDs, actual model names and effort, transport results, Sol findings with affected IDs, error rates, PASS/FAIL decision, selected bulk model, and fallback reason. Do not describe rough text as final localization.

If Terra is unavailable but Sol is callable, use Sol directly and record why the trial was skipped. If Terra is callable but Sol is unavailable, stop before bulk work and request approval for a different independent reviewer. Never use the parent agent's model as proof that the actual delegated rough model was Terra.

Build a terminology sheet from repeated names, organizations, ranks, weapons, locations, and UI labels. Freeze high-impact terms before bulk work and record unresolved alternatives explicitly.

Treat rough translation only as evidence. Align returned prose to source records by stable ID, restore omitted controls from the source, check subject and temporal logic, and rewrite for natural Chinese voice. Do not claim completion from fluent target text alone.

Rebuild with the original serializer or a deterministic equivalent. Preserve untouched data byte-for-byte where the format permits. Compare record counts, IDs, control sequences, ordering, and container structure against the extracted inventory.

## Validate fonts and UI contexts

Do not assume dialogue, Backlog, speaker names, choices, HUD, and generic UI use the same font. Discover the real binding for each affected surface and create a context matrix. Check that every configured font covers the characters used in that context with [scripts/check_font_coverage.py](scripts/check_font_coverage.py), which must use an actual Unicode cmap rather than a Macintosh or symbol encoding.

Then verify wrapping, clipping, baseline, line height, fallback behavior, and cached-font restart behavior in game. Passing glyph coverage is necessary but does not prove layout or runtime loading.

## Build a reversible release

Keep one canonical source tree and one deterministic build path. Never repair only an already-built release folder. The installer must validate an allowlisted target, distinguish the validated game root from the runtime data root, reject unsafe or legacy destinations, preserve unrelated user data, and use a lock plus staged transaction, backup, manifest, and recovery path.

For a user-facing Windows patch, expose both `启动中文补丁管理器.cmd` and `一键安装汉化.cmd` unless the user requests a different interface. Make the first launch a localized graphical manager for install/update, verification, and uninstall; keep the second as the fast path. Both entry points must call the same underlying transactional scripts. Keep the archive root limited to public entry points and documentation, move implementation details under `patch/`, and default to a flat ZIP without an extra same-name wrapper directory. Read [references/installer-and-release.md](references/installer-and-release.md) for the manager contract and canonical directory tree.

Generate the install manifest from the committed payload, including source-relative path, allowlisted installed target path, size, and SHA-256. Verify installed bytes with [scripts/verify_overlay_manifest.py](scripts/verify_overlay_manifest.py); it resolves `targetRelative` or `installedRelative` before legacy relative-path fields. Rebuild the archive after the release directory and compare them with [scripts/verify_release_archive.py](scripts/verify_release_archive.py); both verifiers reject empty artifacts unless `--allow-empty` is explicitly used for a test fixture. Never ship a stale ZIP beside a newer folder.

Before delivery, run [scripts/audit_release_size.py](scripts/audit_release_size.py) to audit compressed size by deterministic asset category and hash large archive members. Account for intentional duplication such as one font deployed to both dialogue and `.smash/Common` targets. Report the cause and optional savings; do not change a working deployment layout unless the user asks for optimization. See [references/installer-and-release.md](references/installer-and-release.md).

## Require evidence gates

Do not mark the task complete until applicable gates pass:

- exact target identity is recorded;
- runtime asset root is proved rather than guessed;
- extracted/rebuilt record IDs and control sequences match;
- an internal rough-translation run has a recorded Terra/Sol trial decision before bulk dispatch;
- terminology and unresolved exceptions are documented;
- font-context matrix covers every affected surface, including Backlog/history;
- payload, manifest, installed bytes, release folder, and archive agree;
- install, update, rollback, and recovery paths are tested when supplied;
- graphical-manager install/update/check/uninstall and the one-click path invoke the same implementation and complete without orphaned processes;
- the public root matches the documented simple layout and the ZIP opens directly to that root;
- archive-size and large-duplicate reports account for significant size differences from any reference package;
- the exact game is fully restarted and the same target UI surface is visually checked.

Save workspace evidence under `analysis/` where practical, including `runtime-loader.json`, `font-context-matrix.json`, control-token reports, installed-manifest reports, and archive reports. If evidence must ship inside the public release, copy only the intended reports to `patch/analysis/`; do not confuse that packaged copy with the canonical workspace evidence. Keep screenshots or logs for runtime claims.

## Deliver

Return the canonical source or source patch, deterministic build command, release directory and archive, installer/uninstaller when requested, manifest and hashes, validation reports, terminology notes, and a concise limitation list. State package, installed, and runtime results independently so a user can see exactly what is proven.
