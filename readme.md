# Web app v2.13 — Build / Play fully reviewed

Build and Play were reviewed as one system rather than patched independently. v2.13 makes geometry/state transitions deterministic, makes Play Fit/fullscreen robust on oversized canvases, cleans runtime listeners and Arrange interactions, and ensures connected Play uses only a verified device CFG.

Highlights:

- Build → Play → Build preserves widget geometry and canvas dimensions.
- Fit / 1:1 / zoom / fullscreen are view-only.
- Play Arrange is zoom-correct and cannot accidentally activate robot controls.
- Build and Play keep separate zoom preferences.
- Connected Play hides stale/unverified controls during connect or forced CFG reload.
- Play Fit ignores empty authoring space; 1:1 still exposes the complete canvas.
- Fullscreen Fit was validated from 640×900 through 1920×1080.
- Runtime document listeners/timers are cleaned across rerenders and mode changes.
- Group ownership is deterministic; separator sizing remains thin-friendly.

See **`BUILD_PLAY_REVIEW.md`** for the detailed invariants, fixes, and regression matrix.

Firmware remains **v52**; this release is web-only.

## v2.11 — Trim Canvas

Build includes an explicit **Trim Canvas** command for users who intentionally want to change the logical/exported canvas around occupied widgets. It is separate from Fit: Trim changes design geometry/canvas bounds and is Undo/Redo-aware; Fit only changes the view.
