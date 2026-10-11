# Installer and Release Engineering

Use this reference when producing or repairing an installable localization patch.

## Contents

- [Define the build contract](#define-the-build-contract)
- [Validate destinations safely](#validate-destinations-safely)
- [Use an installation transaction](#use-an-installation-transaction)
- [Manifest requirements](#manifest-requirements)
- [Ship a graphical manager and a fast path](#ship-a-graphical-manager-and-a-fast-path)
- [Keep the public directory simple](#keep-the-public-directory-simple)
- [Keep release folder and archive identical](#keep-release-folder-and-archive-identical)
- [Audit archive size and duplicate assets](#audit-archive-size-and-duplicate-assets)
- [Validation matrix](#validation-matrix)

## Define the build contract

Keep these identities explicit:

- canonical editable source and source revision;
- deterministic build command and tool versions;
- payload root and package manifest;
- validated game root and supported game fingerprints;
- actual runtime data root and virtual asset root;
- patch version and transaction ID;
- release directory and archive path.

Never make a release folder the only source of truth. A fix made directly in a release must be ported back to canonical source and regenerated before delivery.

## Validate destinations safely

Allowlist supported target layouts. Canonicalize paths before writes and reject:

- absolute or parent-traversal payload entries;
- roots that resolve outside the intended installation or runtime-data boundary;
- unsupported game fingerprints;
- symlink, junction, or reparse-point escapes;
- legacy overlay locations known not to be read;
- destinations containing saves or user data when the installer would overwrite or remove them.

Do not discover paths in one shell and execute destructive operations through another. Preserve unrelated files and never recursively delete a computed root.

## Use an installation transaction

1. Acquire a per-game installer lock.
2. Validate target identity and all roots.
3. Inventory files to replace and their current hashes.
4. Stage the new payload in a transaction directory.
5. Verify staged size and SHA-256 against the manifest.
6. Back up replaced files with their relative paths and metadata.
7. Atomically activate files where the platform permits.
8. Write the committed manifest and transaction state last.
9. On failure, restore the prior state and retain a recovery log.

Define update, uninstall, interrupted-install recovery, and migration from older layouts. An uninstaller must remove only files owned by its committed manifest and restore backups only when safe.

## Manifest requirements

Use normalized relative paths and include at least byte size and SHA-256. Use `relative` for the immutable package source and `targetRelative` or `installedRelative` when the installed destination differs; allowlist every such destination in the installer. Include patch version, build/source revision, target game fingerprint, runtime root semantics, and transaction ID at the document level. If the format tracks installed hashes separately, distinguish payload hash from installed hash.

Run [../scripts/verify_overlay_manifest.py](../scripts/verify_overlay_manifest.py) against the actual runtime data root after installation. It checks an explicit installed target before falling back to legacy relative-path fields and rejects an empty manifest unless `--allow-empty` is deliberately used for a test fixture. Its static result does not establish runtime loading.

## Ship a graphical manager and a fast path

For a Windows Chinese patch, provide these peer entry points by default:

- `启动中文补丁管理器.cmd`: start a localized graphical manager.
- `一键安装汉化.cmd`: retain unattended or minimally prompted quick installation.

The manager must show the exact title, detected or selected game directory, current installation state, and actions for install/update, verification, uninstall, opening the runtime patch directory, and closing the window. Auto-detect registered Steam libraries, but always provide a folder browser and validate the executable plus an additional title-specific fingerprint before writing.

Keep the manager as an orchestration layer. It must call the same public `Install.ps1`, `Test-Patch.ps1`, and `Uninstall.ps1` used by command-line entry points; never duplicate file-copy or rollback logic in GUI event handlers. If scripts run in-process, make callable scripts throw errors instead of using `exit`, because `exit` can close the manager host. If they run in a child process, consume stdout and stderr asynchronously and prove the manager cannot deadlock or leave an orphaned PowerShell process.

Use a small data configuration such as `patch/manager-config.json` for title-specific values: window title, display title, Steam folder name, executable name, runtime data relative path, installed-manifest relative path, and whether update requires an explicit uninstall. Keep the manager script generic across sibling titles when practical.

## Keep the public directory simple

Use this flat public-root template unless the user supplies another reference layout:

```text
patch/
FONT-LICENSE.txt
Install.ps1
PatchManager.ps1
README.md
Start-Installer.cmd
Test-Patch.ps1
Uninstall.ps1
一键安装汉化.cmd
检查汉化安装.cmd
一键卸载汉化.cmd
启动中文补丁管理器.cmd
```

Treat the root as the user interface, not the implementation directory:

- Put manager configuration in `patch/manager-config.json`.
- Put a complex transactional installer in `patch/installer/`, including its manifest, helpers, and `payload/`.
- A simple title may keep direct virtual roots such as `patch/root/` and `patch/.smash/`, but still hide them below `patch/`.
- Put machine-readable QA evidence in `patch/analysis/` or an internal installer audit directory, never at the public root.
- Keep only wrappers at the root. In particular, root-level `Install.ps1`, `PatchManager.ps1`, `Test-Patch.ps1`, and `Uninstall.ps1` must remain thin public wrappers around implementation below `patch/`; do not scatter internal helpers, payload files, transaction journals, or audit reports beside them.
- Include `FONT-LICENSE.txt` whenever a font is redistributed. If a listed entry is genuinely inapplicable, document the omission rather than replacing it with internal clutter.

Create the ZIP from the contents of the release directory so extraction opens directly to these entries. Do not add an outer folder bearing the archive name unless the user or reference package explicitly requires it.

## Keep release folder and archive identical

Generate the release directory, finish all edits, then create the archive. Run [../scripts/verify_release_archive.py](../scripts/verify_release_archive.py) to compare normalized member paths, bytes, and hashes. Inspect for duplicate or unsafe entries and account for a single archive top-level folder when used.

Rebuild the archive after every payload, documentation, installer, or manifest change. Do not update a versioned folder while leaving an older ZIP under the same version label.

In addition to byte equality, inspect the archive top level. Confirm the graphical-manager and quick-install launchers are present, internal installer files exist only under `patch/`, unsafe paths are absent, and no unintended wrapper directory was introduced.

## Audit archive size and duplicate assets

Before delivery, measure each release ZIP instead of judging size from file count. Run:

```powershell
python scripts/audit_release_size.py `
  --archive release.zip `
  --reference optional-reference.zip `
  --json analysis/archive-size.json
```

Omit `--reference` when there is no comparison archive. The script rejects empty or unsafe archives by default, uses a 1 MiB large-member threshold unless overridden, and classifies paths deterministically as `fonts`, `story_text`, `ui_bundles`, `installer_config_docs`, or `other`. Review its classification when a title uses unusual path conventions, but do not silently recategorize one package during a comparison.

Record:

- archive bytes, total uncompressed bytes, and member count;
- compressed and uncompressed contribution by category, at least fonts, story/text, UI/bundles, installer/configuration/documentation, and other assets;
- every large member's path, uncompressed size, compressed size, and SHA-256;
- groups of byte-identical large members stored at multiple archive paths;
- the reason a package differs materially from a reference patch.

ZIP archives normally compress each member independently and do not deduplicate identical files across paths. Treat two copies of the same bundled font as two compressed payloads even when their SHA-256 values match. Distinguish these cases:

- **Deployment duplication:** the installed runtime genuinely needs the font at multiple targets such as `root/assets/data/gui/font` and `.smash/gui/font`.
- **Package-source duplication:** the archive stores identical font bytes twice only because the manifest couples one source path to one target path.

Do not delete one installed target merely to reduce the ZIP; that can restore missing dialogue or Backlog glyphs. If the user requests optimization, prefer one immutable package source mapped by the manifest to multiple allowlisted runtime targets, then rerun clean install, update, verification, uninstall, recovery, and archive checks. Do not fall back to a system-font dependency unless the user explicitly accepts loss of portability.

When optimization was not requested, leave the working package unchanged. Report the duplicate, its compressed contribution, why it is required by the current layout, and the estimated saving of a one-source/multiple-target design. When comparing against a reference archive, state whether each package bundles its fonts or relies on game/system fonts before attributing the difference to story volume.

## Validation matrix

Record independent results for:

- clean install;
- update from the previous supported patch;
- rollback or uninstall;
- interrupted transaction recovery;
- rejection of the wrong title/version/root;
- rejection or migration of legacy destinations;
- manifest-to-payload equality;
- installed byte equality;
- release-folder-to-archive equality;
- rejection of empty manifests and empty releases outside explicit test fixtures;
- quick-install entry-point completion;
- graphical-manager install, update, verification, and uninstall completion;
- GUI launch smoke test, readable Chinese labels, error presentation, and absence of orphaned child processes;
- public-root entry list and flat-archive structure;
- archive size broken down by category, with byte-identical large members grouped and explained;
- significant size differences from a reference package attributed to concrete stored assets rather than raw file count;
- runtime loader proof after full restart.

Use `null` for untested states. A release can be statically valid while runtime status remains unknown; say so explicitly.
