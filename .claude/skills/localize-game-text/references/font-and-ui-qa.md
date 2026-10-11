# Font and UI Context QA

Use this reference for missing glyphs, mojibake, tofu boxes, clipping, incorrect fallback, or a surface such as Backlog rendering differently from normal dialogue.

## Build a context matrix

Inventory every relevant text surface independently. Start with:

- message/dialogue body;
- speaker/name plate;
- generic/common UI;
- choices and prompts;
- Backlog/history/log;
- HUD and notifications;
- subtitles and captions;
- gallery, encyclopedia, tips, save/load, settings, and launcher UI.

For each context, record the UI document or resource, style key, configured font family, resolved font file, fallback chain, target character corpus, glyph-coverage result, layout check, runtime observation, and screenshot/log evidence. Do not copy the dialogue-font conclusion into another row without inspecting its binding.

Suggested `analysis/font-context-matrix.json` shape:

```json
{
  "contexts": [
    {
      "name": "Backlog",
      "binding": "Common",
      "resource": "root/assets/...",
      "font_file": "root/assets/.../font.otf",
      "coverage_ok": true,
      "layout_ok": true,
      "runtime_loaded": true,
      "evidence": ["screenshots/backlog.png"]
    }
  ]
}
```

## Discover the real binding

Trace from the surface to its UI document, style/theme, named font slot, and resolved file. Search all configuration variants, localized overrides, platform bundles, and fallback definitions. If a UI surface is created dynamically, inspect logs or runtime resources rather than assuming it inherits the nearest visible style.

Backlog/history commonly uses a generic `Common` or menu font while dialogue uses a `Message` font. Treat this as a normal hypothesis to verify, not a game-specific guarantee.

## Check glyph coverage

Build a corpus per context from the exact translated strings that surface can display, plus required punctuation, numerals, names, and dynamic labels. Run:

```text
python scripts/check_font_coverage.py --font path/to/font.otf --text-file context.txt --json analysis/font-coverage.json
```

Coverage checks character-map presence only. They do not prove shaping quality, correct fallback selection, or that the runtime opened the tested font.

If the font is a collection or unsupported flavor, use a font inspection tool that can select the exact face and record that command. Never silently treat a parser limitation as successful coverage.

## Check layout and rendering

For every affected surface, test:

- single-line and multi-line wrapping;
- maximum expected line length and record length;
- punctuation at line boundaries;
- speaker-name width;
- ruby/furigana or inline tags where present;
- clipping at top, bottom, and scroll edges;
- baseline, ascent/descent, and line-height changes;
- scale factors and multiple resolutions;
- fallback glyphs with mismatched weight or baseline;
- scrolling and page transitions in Backlog/history.

Use representative stress strings, then verify actual translated scenes. A screenshot should identify the game/version, surface, and patch build.

## Handle caches deliberately

Determine whether the engine caches font objects, UI documents, atlases, or bundles. After changing fonts or bindings, fully close the exact target process and any launcher that owns the cache. Relaunch and use an A/B comparison when stale state is plausible. Record whether restart was required.

## Completion gate

A font/UI fix is complete only when the matrix has no unexplained context, required glyphs are covered, layout tests pass, the exact process loaded the configured resource, and the originally failing surface is visually verified. Report untested contexts as untested rather than inheriting a pass from another row.
