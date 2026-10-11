# Diagnose and Runtime Verification

Use this reference when a patch appears correct on disk but is absent, partial, stale, or broken in game.

## Establish a target identity fence

Record the following before touching a process or installation:

- exact executable path and file hash;
- process ID after launch and, when useful, parent process;
- product name, file version, distribution/app ID, and launch arguments;
- selected game root;
- runtime data root used by the engine or launcher;
- virtual asset root expected inside that data root;
- patch version, source revision, and payload-manifest hash.

Match processes by canonical executable path, not a partial name. If multiple editions or sibling games are running, inspect and restart only the fenced target.

## Keep the three roots distinct

- `validated_game_root`: the user-selected installation used to identify the exact product and version.
- `runtime_data_root`: the directory from which the running engine resolves writable or overlaid assets. It may live outside the game installation.
- `virtual_asset_root`: the path namespace reproduced beneath the runtime data root, such as `root/assets/...`.

Never concatenate these concepts silently. Store all three in the installer manifest and diagnostic evidence. Reject a legacy destination when it is known to be ignored by current builds.

## Triage in evidence order

1. Confirm the exact game/version and reproduce the symptom on a named surface.
2. Hash the canonical source, built payload, release copy, archive member, and installed copy.
3. Determine whether the launcher or engine redirects reads to a per-user data root.
4. Prove the actual loader path with logs, file handles, timestamps, configuration, or a harmless probe.
5. Check whether the process caches bundles, fonts, scripts, or UI documents.
6. Inspect the failing surface's own binding; normal dialogue and Backlog often differ.
7. Fix the earliest broken layer, rebuild from canonical source, update transactionally, restart, and repeat the same observation.

Do not keep changing translations or fonts while the loader path remains unproved.

## Prove runtime loading

Prefer the least invasive proof available:

- engine or launcher log naming the resolved file;
- process file-handle trace showing the exact path;
- controlled replacement of a harmless, reversible string or visual marker;
- changed access time or trace event correlated with opening the target surface;
- A/B launch with and without the overlay while all other state remains fixed.

Record the command, timestamp, executable path, probed relative asset, expected marker, observed result, and cleanup. A file existing at the presumed location is installed evidence, not loader evidence.

## Separate verification layers

Use explicit statuses rather than one `ok` flag:

```json
{
  "source_ok": true,
  "package_ok": true,
  "installed_ok": true,
  "runtime_loaded": true,
  "runtime_surface": "Backlog",
  "evidence": ["logs/loader.txt", "screenshots/backlog.png"]
}
```

Use `null` when a layer was not tested. Never turn an untested runtime state into `true` because hashes passed.

## Repair loop

Make the fix at the canonical source, builder, or installer layer. Rebuild the payload and archive, acquire the installer lock, stage and verify the new transaction, atomically activate it, and preserve rollback data. Fully exit the exact target process and launcher if they cache assets. Relaunch, navigate to the same surface using the same save/state, and repeat runtime proof.

Suggested `analysis/runtime-loader.json` fields:

```json
{
  "executable": {"path": "...", "sha256": "...", "pid": 0},
  "product": {"name": "...", "version": "...", "app_id": "..."},
  "roots": {"validated_game_root": "...", "runtime_data_root": "...", "virtual_asset_root": "..."},
  "probe": {"asset": "...", "method": "...", "expected": "...", "observed": "..."},
  "runtime_loaded": true,
  "captured_at": "RFC3339 timestamp"
}
```
