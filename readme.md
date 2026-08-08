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


## v45: autonomous modes + distance telemetry fix

- Treat every received BLE UART line as proof that the connection is alive (`btConnected = true`).
- This fixes the case where Manual D-pad works in the receive callback but the forever loop remains gated off, which disables Line, Avoid, heartbeat, line LEDs, and distance telemetry together.
- Telemetry now defaults to **All**, matching the UI selector's default value.
- Link-loss safety is unchanged: RX silence still clears the connection and stops the motors.
