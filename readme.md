# v50 — Heartbeat follows Telemetry

- Heartbeat is now governed only by the **Telemetry** selector, not by Manual/Line/Avoid mode.
- **All**: heartbeat + full telemetry.
- **Basic**: heartbeat + firmware version only.
- **Off**: no heartbeat or optional telemetry.
- Heartbeat is no longer suppressed just because autonomous motors are moving in Line/Avoid.
- The distance selector and all v49 behavior remain unchanged.
- The widget configuration did not change, so the v49/v48 config cache remains valid. Flash the firmware to get v50 behavior.

---

# v49 — MakeCode Distance Read selector

Adds a real CFG-level `select` widget named **Distance read** with `Auto,Read now`.

- **Auto** preserves the low-latency policy: ultrasonic is polled automatically only in Avoid mode.
- **Read now** performs exactly one ultrasonic measurement in Manual, Line, or Avoid.
- That one forced sample updates both `gauge_dist` and `graph_dist`, even when Telemetry is Basic/Off.
- After the sample, firmware sends `UPD dist_read Auto`, making the selector momentary/repeatable.
- The expensive HC-SR04 call remains in the main loop, never the BLE receive callback.
- A forced no-echo read can still briefly block (~250 ms); this is one-shot by design so normal Manual/Line control stays responsive.
- Firmware/config revision changed, so flash v49 once. The browser will detect the new CFG revision and reload the layout.

# v48.3 — Always-visible Force Config

The `↻ Reload Config` action now lives in the top header next to Connect, so it
is available in both Build and Play modes.

- Connected: clears this micro:bit's remote-layout cache and immediately forces a full `GETCFG`.
- Disconnected: clears remote-layout caches and immediately opens the BLE device picker; after selection the connection must download a fresh full config.
- It does **not** clear the editor project, language, theme, templates, or other app settings.
- Asset cache-busting updated to `v48.3-forcecfg`.
- Firmware is unchanged from v48.

Adds an explicit browser-side config recovery control without changing the v48 MakeCode firmware.

- New **↻ Reload Config** button in Play mode.
- While connected: clears only this micro:bit's cached remote CFG and immediately forces a full `GETCFG` transfer.
- While disconnected: clears all `maqueen_remote_cfg_v47:*` layout cache records; the next connection must fetch fresh CFG.
- Does **not** clear language, theme, saved Build projects, widget templates, or other local settings.
- A forced transfer is cached again after `CFGEND`, so following reconnects are fast again.
- Existing `GETCFGVER → CFGOK` fast reconnect behavior remains unchanged unless the user explicitly presses Reload Config.
- No firmware reflash is needed when the micro:bit already runs v48.
- Asset cache-busting updated to `v48.2-forcecfg`.

# v48.1 — MakeCode gauges only

Fixes the duplicate gauges visible in v48.

- The web app no longer synthesizes a gauge inside each slider.
- Servo 1, Servo 2 and Speed gauges come only from the MakeCode-delivered CFG.
- `source` links are honored locally for instant visual response without extra BLE traffic.
- v48 firmware/config is unchanged, so a micro:bit already flashed with v48 does not need reflashing.
- Asset URLs are cache-busted as `v48.1-native` for GitHub Pages/browser deployments.

# v47 + Slider gauges — Fast config reconnect

Normal reconnects no longer download the same remote layout again. Every slider now also includes a live radial gauge that mirrors its own min/max/value without adding BLE traffic.

- Firmware layout revision: `56caff8f`
- Browser first sends `GETCFGVER`
- If the cached revision matches, it restores the layout locally and sends `CFGOK`
- Full `GETCFG` runs only on first connect, after a layout change, or after browser cache is cleared
- Cache is keyed by the Web Bluetooth device id so identically named robots do not share layouts
- Line/Avoid modes and telemetry remain enabled after a cache hit because `CFGOK` marks the configuration ready
- v46 BLE soft-reset/reconnect recovery is retained

# Maqueen RXY

A drag-and-drop Bluetooth remote for the **DFRobot Maqueen Lite** robot, driven from a micro:bit.

Powered by [Workshop-DIY.org](https://workshop-diy.org)

The web app builds its interface from a layout the **robot itself sends** on connect — so the
firmware owns the layout, and the app is a generic renderer. Nothing to configure on the
browser side.

## What you need

- BBC micro:bit (V1 or V2)
- DFRobot **Maqueen Lite** chassis
- A browser with Web Bluetooth: Chrome, Edge or Opera on desktop/Android
  (Safari and iOS are not supported — Apple does not implement Web Bluetooth)

## Flashing the firmware

1. Open [makecode.microbit.org](https://makecode.microbit.org) → **New Project**
2. Switch to **JavaScript**
3. **Extensions** → search `maqueen` → add **pxt-maqueen**
4. Paste the contents of [`firmware/maqueen-remote.ts`](firmware/maqueen-remote.ts)
5. **Download** to the micro:bit

The version number scrolls across the LED matrix at boot — check it after every flash.

## Running the app

Serve the folder over `http://` or `https://` and open `index.html`:

```bash
python -m http.server 8952
```

Then browse to `http://localhost:8952` and press **Connect**.

> Opening the file directly via `file://` mostly works but is unreliable — `file://` is treated
> as a unique security origin, which breaks parts of Web Bluetooth.

## Controls

| Control | Does |
| --- | --- |
| D-pad | Drive (differential mix, diagonals supported) |
| Speed | Top speed for manual *and* autonomous driving |
| Mode | `Manual` / `Line` (line-following) / `Avoid` (obstacle avoidance) |
| STOP | Cut both motors immediately |
| Buzz | Short tone |
| LED L / LED R | Headlights |
| Servo 1 / 2 | Servo angle, 0-180° |
| Line L / R | Line sensors — **lit = that side is on the line** |
| Distance | Ultrasonic reading, as a gauge and a rolling graph |
| Uptime | Session timer — proves the link is alive |

## Reading the robot without a screen

Every command leaves a mark on the micro:bit's LED matrix, so you can tell what reached the
robot with no cable and no console attached:

| Glyph | Meaning |
| --- | --- |
| `vNN` scrolling | Firmware version at boot |
| ♥ | Powered up, waiting for Bluetooth |
| grid filling pixel by pixel | Sending the layout |
| ✓ | Connected, layout delivered |
| ✗ | Bluetooth lost (motors auto-stopped) |
| ■ | STOP pressed |
| ↑ ↓ ← → | Driving that way |
| centre dot | Motors idle |
| left / right band | Headlight toggled |
| ♪ | Buzz |
| bar graph | Servo angle |

## Protocol

Plain text lines over the Nordic UART service.

```
App → robot    SET <widgetId> <value...>
App → robot    GETCFG                      request the layout (sent once, on connect)
robot → App    CFGBEGIN / CFG <b64> / CFGEND
robot → App    UPD <widgetId> <value>      sensor and status updates
```

**Keep messages at or under 20 bytes.** The micro:bit negotiates the default 23-byte ATT MTU,
leaving exactly 20 bytes of payload. A longer write is *silently truncated* rather than
rejected — the trailing newline never arrives and the command vanishes with no error on either
side. The app splits outgoing writes into 20-byte packets; the UART service reassembles them.

## Licence

MIT


## v44: Line/Avoid motor fix
- Mode changes use the reliable BLE FIFO instead of the latest-value-wins slot.
- Dedicated D-pad GATT writes and ordinary GATT writes are serialized to prevent operation collisions.
- The D-pad safety watchdog applies only in Manual mode.
- Line and Avoid use a direct autonomous motor path and refresh their own activity time.


## v46: autonomous modes + distance telemetry fix

- Treat every received BLE UART line as proof that the connection is alive (`btConnected = true`).
- This fixes the case where Manual D-pad works in the receive callback but the forever loop remains gated off, which disables Line, Avoid, heartbeat, line LEDs, and distance telemetry together.
- Telemetry now defaults to **All**, matching the UI selector's default value.
- Link-loss safety is unchanged: RX silence still clears the connection and stops the motors.


### v46 reconnect recovery
- Browser sends `BYE` before an intentional GATT disconnect.
- Firmware stops safely, shows X, then software-resets the BLE stack.
- `GETCFG` is now a paced main-loop state machine instead of a write burst inside the UART receive callback.
- Link timeout is 9 s for the 3 s PING cadence.


## Slider gauges fix
Every runtime slider now displays a true semicircular gauge with a progress arc, tick marks, moving needle, min/max scale, and live value. The gauge mirrors the slider locally and adds no BLE traffic.

### Easy slider control

The runtime vertical sliders use a 52 px pointer hit zone around the slim visible rail. Pointer coordinates are mapped directly to the slider min/max range, so mouse, touch and pen input no longer require grabbing the small thumb precisely. The visible thumb is smaller to preserve useful travel. This is UI-only and does not add BLE traffic or require a firmware reflash.

### v50.1 — Discreet Bismillah
A small, low-contrast Bismillah is shown at the absolute top of the web interface. This is a web-only visual change; firmware and BLE behavior are unchanged.


### Web app 2.0
The web application version is now **2.0**. A single very discreet Bismillah is shown at the absolute top of the interface. This is a web-only release label/visual change; the MakeCode firmware remains v50 and its BLE behavior is unchanged.
