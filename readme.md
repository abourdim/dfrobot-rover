# Web app v2.10 — Play Fit Content

Play-mode **Fit** now fits the occupied functional widget bounds instead of the full logical CFG canvas.

- Empty authoring space no longer makes the controller tiny.
- Fit can upscale above 100% when useful; **1:1** still restores literal scale.
- Fit recenters/scrolls to the used widget region.
- `group` and `separator` helper geometry is ignored when calculating occupied bounds.
- CFG canvas size and widget `x/y/w/h` remain unchanged.
- Build/export and BLE behavior are unchanged.
- Firmware remains v52.
