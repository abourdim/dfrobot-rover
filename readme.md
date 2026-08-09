# Web app v2.12 — Stable Play Fit viewport

Play Fit now uses a dedicated viewport frame around the occupied widget bounds. It no longer scrolls or flex-centers the oversized logical canvas, preventing top/left clipping in normal and fullscreen Play.

# Web app v2.10 — Play Fit Content

Play-mode **Fit** now fits the occupied functional widget bounds instead of the full logical CFG canvas.

- Empty authoring space no longer makes the controller tiny.
- Fit can upscale above 100% when useful; **1:1** still restores literal scale.
- Fit recenters/scrolls to the used widget region.
- `group` and `separator` helper geometry is ignored when calculating occupied bounds.
- CFG canvas size and widget `x/y/w/h` remain unchanged.
- Build/export and BLE behavior are unchanged.
- Firmware remains v52.


## v2.11 — Trim Canvas

Build mode now includes **Trim Canvas**. It crops the logical canvas to the occupied widgets with a small margin, shifts all widgets together so their relative arrangement is unchanged, and is fully Undo/Redo-aware. This removes dead authoring space from exported JSON/CFG and from Play/Fullscreen while keeping Fit and zoom as view-only controls.
