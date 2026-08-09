# Web app v2.9 — Play Fit geometry fix

- Play zoom now uses layout-aware CSS zoom instead of transform scaling.
- Fit uses the logical CFG canvas size and the actual Play viewport.
- Fit never enlarges above 100%; it only shrinks enough to show the complete design.
- Normal Play and fullscreen share the same Fit path.
- Zoom remains view-only and does not change widget geometry.

- Fullscreen is a normal Play-toolbar button; it no longer overlaps Fit, 1:1, or Arrange.
- The same button stays visible in fullscreen and changes to Exit Fullscreen.
- Play zoom controls and Arrange remain available in fullscreen.
- The old floating fullscreen exit control is disabled.
- View-only change: widget geometry, CFG, cache protocol, and BLE behavior are unchanged.