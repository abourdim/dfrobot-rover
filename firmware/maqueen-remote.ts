/**
 * ╔════════════════════════════════════════════════════════════════╗
 * ║            🎮 Micro:bit Remote Builder (bit-rxy) 🎮            ║
 * ║                                                                ║
 * ║   Powered by Workshop-DIY.org                                  ║
 *   Maqueen Lite: D-pad drive, servo sliders, LEDs, buzzer         ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * 📋 PROJECT: Maqueen Remote
 *
 * bit-rxy-generated skeleton for the "Maqueen" layout (D-pad drive,
 * STOP, Buzz, LED L/R toggles, Servo 1/2 sliders), with handleWidget()
 * filled in to drive a real DFRobot Maqueen Lite via the pxt-maqueen
 * extension.
 *
 * The D-pad → motor mix below is ported directly from Maqueen Lab's
 * own proven drive-pad code (js/maqueen-tab.js): it boils down to a
 * normalized (nx, ny) vector — nx = turn (right positive), ny =
 * forward (up positive) — fed through the same differential-drive
 * formula:
 *     L = clamp(ref * (ny + nx), -ref, ref)
 *     R = clamp(ref * (ny - nx), -ref, ref)
 * with the same 12%-of-full-scale dead zone before treating input as
 * "stopped", so behavior should match what Maqueen Lab's own UI does.
 *
 * ════════════════════════════════════════════════════════════════
 * ⚡ LOW-LATENCY D-PAD — REAL-HARDWARE LESSONS (v43)
 * ════════════════════════════════════════════════════════════════
 *
 * This section records the latency investigation so the same problems
 * do not get reintroduced later. The final v43 path was reached by
 * testing each layer separately: browser pointer event → Web Bluetooth
 * write → micro:bit UART receive callback → Maqueen I2C motor write.
 * v43 was the first build that felt immediate in real driving tests.
 *
 * 1) REMOVE ARTIFICIAL UI/QUEUE DELAYS
 *    - The browser originally waited ~60 ms between BLE writes.
 *    - D-pad release had a 100 ms debounce.
 *    Those two delays were directly visible as press/stop latency and
 *    were removed. D-pad uses Pointer Events so touch devices do not
 *    generate a second synthetic mouse sequence after the touch.
 *
 * 2) DO NOT REPLAY OLD MOTOR EVENTS
 *    A reliable FIFO sounds safe, but it is wrong for steering: a stale
 *    press/release queued ahead of the newest direction makes the robot
 *    faithfully execute OLD intentions. Manual drive therefore uses
 *    "latest complete state wins", not "deliver every historical click".
 *    The state is a 4-bit mask: Up=1, Down=2, Left=4, Right=8. This also
 *    preserves diagonals naturally.
 *
 * 3) KEEP THE RADIO PACKET TINY
 *    The old text protocol could exceed the BLE UART payload used by the
 *    app. For example "SET dpad_move up 1" fit while down/left/right were
 *    longer and could require another BLE write/connection event. We
 *    first shortened the command, then removed text parsing entirely.
 *    FINAL FORMAT: one ASCII byte 'a'..'p' encodes mask 0..15, followed
 *    by newline. The browser therefore writes exactly TWO bytes for a
 *    D-pad state change.
 *
 * 4) BYPASS THE GENERAL BLE QUEUE FOR MOTORS
 *    Sliders, PINGs and other controls may be serialized/coalesced by the
 *    normal app queue. The D-pad has its own writer and replaces any
 *    pending motor state with the newest one. At most the GATT write
 *    already in progress can finish first; stale motor states do not
 *    build a backlog.
 *
 * 5) EXECUTE MOTORS DIRECTLY IN THE RECEIVE CALLBACK
 *    The one-byte packet is detected before GETCFG/SET parsing and goes
 *    straight to handleDpadMask(). That hot path does only: decode mask,
 *    calculate left/right speed, and call motorStop()/motorRun(). It does
 *    NOT call handleWidget(), dbg(), LED rendering, telemetry, or the
 *    generic drive refresh/rate-limit path.
 *
 * 6) NEVER BLOCK THE BLE RECEIVE CALLBACK WITH DISPLAY OR LOGGING
 *    basic.showArrow/showIcon/showLeds normally include hundreds of ms
 *    of display time unless interval 0 is supplied. Earlier firmware
 *    rendered arrows inside the receive path, producing ~400-600 ms of
 *    apparent control lag. Display work is now deferred to the forever
 *    loop and uses interval 0.
 *
 *    serial.writeLine() was another trap: with no USB serial reader it
 *    can block the calling fiber. bluetooth.uartWriteLine() from inside
 *    onUartDataReceived was also found to interfere with BLE turnaround.
 *    dbg() therefore only queues text; optional BLE logs drain later from
 *    the main loop, and debugging defaults OFF.
 *
 * 7) ULTRASONIC POLLING CAN FREEZE THE WHOLE RUNTIME
 *    pxt-maqueen Ultrasonic() retries pulseIn() when there is no echo.
 *    On open space this can busy-wait for roughly 250 ms. That freeze
 *    also freezes BLE command handling, so a perfectly fast D-pad packet
 *    still appears late. The latency build NEVER polls Ultrasonic() in
 *    Manual or Line mode; distance sensing is reserved for Avoid mode.
 *
 * 8) BACKGROUND BLE TRAFFIC MATTERS
 *    Telemetry/logs/heartbeat traffic shares the same BLE link with motor
 *    commands. Manual driving defaults telemetry to Off, app PING traffic
 *    is sparse/suppressed around driving, and the D-pad writer has
 *    priority. bluetooth.setTransmitPower(7) is used for the strongest
 *    link available from MakeCode.
 *
 * 9) MOTOR I2C WRITES: CHANGE IMMEDIATELY, DO NOT SPAM
 *    Maqueen motors are controlled over I2C. Generic joystick/servo code
 *    still avoids redundant writes, but the D-pad hot path writes a real
 *    state change immediately. Do not restore a fixed 125 ms/8 Hz delay
 *    to handleDpadMask(); that turns directly into steering latency.
 *
 * 10) KEEP SAFETY WITHOUT MAKING CONTROL SLUGGISH
 *    A held direction is periodically re-sent as the SAME complete mask.
 *    The firmware watchdog stops the motors if those refreshes disappear,
 *    protecting against a lost release/link while still letting a held
 *    button stay active. Link-loss handling also stops both motors.
 *
 * IMPORTANT DESIGN RULE: for real-time drive controls, optimize for the
 * newest desired STATE, not guaranteed delivery of every EVENT. Reliability
 * for an old steering command is often indistinguishable from latency.
 *
 * Extension required (MakeCode → Extensions):
 *   • pxt-maqueen   (https://github.com/DFRobot/pxt-maqueen)
 *
 * 🚀 HOW TO USE:
 *    1. Copy this entire file's contents
 *    2. Go to https://makecode.microbit.org
 *    3. Create new project → Switch to JavaScript mode
 *    4. Add the pxt-maqueen extension (Extensions → search "maqueen")
 *    5. Paste this code → Download to micro:bit
 *    6. Open bit-rxy (or maqueen-rxy) and connect — the app requests
 *       the layout automatically (GETCFG) and builds the D-pad,
 *       STOP/Buzz buttons, LED toggles and servo sliders.
 *
 * ⚠️ Note on debugging: use dbg() (not serial.writeLine directly) for
 * anything you want to see while testing. It logs over BLE as
 * "LOG <msg>" lines — the app already console.logs every raw BLE line
 * it receives, so dbg() output shows up in the browser DevTools
 * console (F12) with nothing but the BLE connection already open, no
 * USB cable needed. General controls can request LED-matrix diagnostics,
 * but the v43 D-pad hot path intentionally does no display work at all;
 * nothing visual is allowed between the BLE packet and motorRun().
 *
 * 🖥️ LED MATRIX LEGEND — every glyph is distinct on purpose, so the
 * robot can be read untethered without a cable or console:
 *    "v43"        scrolling at boot   — firmware version (check after every flash)
 *    ○            hollow ring         — powered up, idle, waiting for BLE
 *    filling grid pixel by pixel      — sending the layout (GETCFG)
 *    ✓            tick                — connected, layout delivered
 *    ✗            cross               — BLE link lost (motors auto-stopped)
 *    ■            square              — STOP button pressed
 *    ↑ ↓ ← →      arrow               — driving in that direction
 *    ·            centre dot          — motors idle (direction released)
 *    ◇            small diamond       — only one wheel driving
 *    ▌ left band  solid / corners     — LED L toggled on / off
 *    ▐ right band solid / corners     — LED R toggled on / off
 *    ♪            quarter note        — Buzz pressed
 *    bar graph    rising bar          — servo angle (0-180)
 *
 * Most non-drive controls leave a visual mark. The D-pad is the one
 * deliberate exception: visual feedback was removed from its hot path
 * because responsiveness is more important than per-packet animation.
 *
 * 🔌 Wire protocol (bit-rxy's own, NOT Maqueen Lab's #N/ECHO: dialect):
 *    App → micro:bit   <a..p> + newline        (FAST D-pad: 1-byte mask)
 *    App → micro:bit   SET <widgetId> <value...>
 *    App → micro:bit   GETCFG                 (asks for the layout once, on connect)
 *    micro:bit → App   CFGBEGIN / CFG <b64 chunk> / CFGEND
 *    micro:bit → App   UPD <widgetId> <value>  (optional — push sensor/status updates)
 */

// Bump this on every real change and check it (serial log + LED scroll
// at boot) to confirm what's actually flashed before debugging further —
// no more guessing whether a fix was really re-flashed.
const FIRMWARE_VERSION = "v46"

// Debug helper — logs ONLY if debugEnabled is true (default false).
// THIS IS THE ROOT CAUSE of "connected, but nothing happens": pxt-
// microbit's serial.writeLine() BLOCKS THE CALLING FIBER when nothing
// is actively reading the USB serial output — which is the normal
// case once you unplug USB and just drive over BLE. v6/v7 called
// dbg()/serial.writeLine() unconditionally on every single command,
// from INSIDE the BLE receive handler, BEFORE the actual motorRun/
// servoRun/writeLED call — so in real untethered use, every command
// handler hung forever right at the logging line and the hardware
// action never ran. It only looked like it worked during debugging
// sessions because USB + the serial monitor happened to be open and
// actively draining the buffer at that moment. Maqueen Lab's own
// firmware has the exact same landmine and defends against it by
// defaulting logging OFF — same fix here. Flip debugEnabled to true
// to see dbg() output over BLE as "LOG <msg>" lines, which the app
// already console.logs for every raw line it receives — so it shows
// up in the browser DevTools console (F12) with the app just
// connected, no USB cable needed at all.
//
// dbg() deliberately does NOT call serial.writeLine() anymore — an
// earlier version of this file did, and it reintroduced the exact
// blocking landmine described above: with only BLE connected (no USB
// serial monitor actively reading), serial.writeLine() blocks the
// calling fiber forever, so the very first dbg() call inside
// handleWidget() hung before the real hardware action ever ran —
// nothing worked at all, not even the log. The queue avoids blocking
// entirely: dbg() only ever PUSHES a string (fast, non-blocking). The
// actual bluetooth.uartWriteLine() call happens later, from the main
// loop below — NEVER synchronously from inside onUartDataReceived.
// Calling uartWriteLine() directly inside the receive handler on every
// command was also tried once before (the "v5" attempt) and broke
// everything (GETCFG hung again), because it raced the BLE stack's own
// turnaround right as a packet was still being processed. Draining one
// line per 100ms loop tick, exactly like the heartbeat, avoids both
// problems.
let debugEnabled = false
let logQueue: string[] = []
const LOG_QUEUE_MAX = 20
function dbg(msg: string) {
    if (!debugEnabled) return
    logQueue.push(msg)
    if (logQueue.length > LOG_QUEUE_MAX) logQueue.shift()
}

// ═══════════════════════════════════════════════════════════════
// 🔌 BLUETOOTH SETUP
// ═══════════════════════════════════════════════════════════════

bluetooth.startUartService()
bluetooth.setTransmitPower(7)
let cfgSent = false

// v46 RECONNECT HARDENING
// -----------------------
// GETCFG used to send ~2 seconds of CFGBEGIN/CFG/CFGEND notifications from
// INSIDE onUartDataReceived(). That works on a cold boot, but after a real
// disconnect/reconnect the BLE UART stack can be in a fragile turnaround
// state; a large callback-side write burst can leave the device visible in
// the chooser while config notifications no longer flow. Queue the transfer
// here and let the main loop send ONE notification at a time instead.
let cfgTxActive = false
let cfgTxStage = 0       // 0=CFGBEGIN, 1=CFG chunks, 2=CFGEND
let cfgTxPos = 0
let cfgTxChunkIdx = 0
let cfgTxLit = 0
let cfgTxNextAt = 0
const CFG_TX_GAP_MS = 35

// A real disconnect can also leave the Nordic/MakeCode BLE peripheral in a
// connectable-but-unusable GATT state until reset. v46 schedules a SOFTWARE
// reset after showing X, so the user no longer needs the physical reset button.
let bleStackResetAt = 0
const BLE_STACK_RESET_DELAY_MS = 600

// ── LINK LOSS DETECTION BY SILENCE ───────────────────────────────
// bluetooth.onBluetoothDisconnected does NOT fire on this board. Tested
// directly: an explicit gatt.disconnect() from the app never produced
// the ✗, so every safety behaviour hanging off that event — stopping the
// motors when the link drops — has never actually run. A robot driving
// when the connection died would have kept going.
//
// onBluetoothConnected DOES fire (the heartbeat is gated on btConnected
// and it counts), so it is specifically the disconnect event that is
// unreliable. Rather than depend on it, the link is now judged by
// traffic: the app pings every three seconds, lastRxAt is stamped on ANY line
// received, and silence past LINK_TIMEOUT_MS means the peer is gone.
//
// 9s allows roughly two missed 3s pings before declaring the link dead, which is
// tolerant of a momentarily busy radio without leaving a runaway robot
// driving for long.
let lastRxAt = 0
let linkLostHandled = false
const LINK_TIMEOUT_MS = 9000

// True while the link is known alive. Set by onBluetoothConnected() AND,
// from v45 onward, by every successfully received UART line. The receive
// fallback matters because Manual commands can work in the UART callback even
// when a missed connection event would otherwise leave Line/Avoid and UPD
// telemetry disabled in the forever loop.
// Every bluetooth.uartWriteLine() in this file is gated on it, because
// writing to a UART with no peer BLOCKS THE CALLING FIBER once the
// buffer stops draining — the identical failure mode as serial.
// writeLine(). Maqueen Lab's firmware keeps the same flag for the same
// reason. cfgSent is NOT a substitute: it only tracks whether the
// layout was delivered, and it stays true across a link drop until the
// disconnect handler runs.
let btConnected = false

// ── TELEMETRY LEVEL ──────────────────────────────────────────────
// How much the robot pushes back to the app. Everything the firmware
// reports — uptime, distance, line sensors, obstacle alert — is a UPD
// write, and each one competes with the drive commands coming the other
// way. Turning it down is the cheapest way to free the radio.
//
//   All   — everything (default)
//   Basic — uptime and version only, so the link still visibly lives
//   Off   — silence
//
// Firmware starts at All to match the first/default option shown by the app.
// Manual driving still suppresses expensive sensor work, so this does not
// reintroduce the old D-pad latency problem.
//
// Note this does NOT affect link-loss detection: that measures traffic
// arriving FROM the app (its PING), so the robot still notices a dead
// link at Off. Nor does it disable the app's controls, which are the
// other direction entirely.
const UPD_OFF = 0
const UPD_BASIC = 1
const UPD_ALL = 2
let updLevel = UPD_ALL

// 📦 Remote layout config (Base64 encoded, 1988 bytes, 15 widgets).
// Layout arranged by hand in the app's Build tab and captured here:
// top row servos / D-pad / speed / alert, middle mode + STOP/Buzz with
// the distance gauge right, bottom row headlights / line sensors and
// the distance graph. Canvas 980x620.
// Generated for the widget ids used below — decoded here for
// reference (not read by the code):
// {
//   "title": "Maqueen Remote",
//   "widgets": [
//     { "id": "slider_srv1", "t": "slider", "x": 30, "y": 55, "w": 70, "h": 200, "label": "Servo 1", "min": 0, "max": 180, "step": 1 },
//     { "id": "slider_srv2", "t": "slider", "x": 140, "y": 55, "w": 70, "h": 200, "label": "Servo 2", "min": 0, "max": 180, "step": 1 },
//     { "id": "dpad_move", "t": "dpad", "x": 260, "y": 55, "w": 175, "h": 175, "label": "Drive", "model": "classic" },
//     { "id": "spd", "t": "slider", "x": 495, "y": 55, "w": 70, "h": 200, "label": "Speed", "min": 60, "max": 255, "step": 5 },
//     { "id": "mode", "t": "select", "x": 35, "y": 290, "w": 160, "h": 85, "label": "Mode", "options": "Manual,Line,Avoid" },
//     { "id": "btn_stop", "t": "button", "x": 255, "y": 285, "w": 100, "h": 105, "label": "STOP" },
//     { "id": "btn_buzz", "t": "button", "x": 375, "y": 285, "w": 100, "h": 105, "label": "Buzz" },
//     { "id": "lbl_heartbeat", "t": "label", "x": 55, "y": 400, "w": 220, "h": 80, "label": "Uptime" },
//     { "id": "toggle_led_l", "t": "toggle", "x": 25, "y": 490, "w": 90, "h": 110, "label": "LED L" },
//     { "id": "toggle_led_r", "t": "toggle", "x": 158, "y": 490, "w": 90, "h": 110, "label": "LED R" },
//     { "id": "ln_l", "t": "led", "x": 285, "y": 500, "w": 70, "h": 90, "label": "Line L", "model": "dot", "colorOn": "#4ade80" },
//     { "id": "ln_r", "t": "led", "x": 388, "y": 500, "w": 70, "h": 90, "label": "Line R", "model": "dot", "colorOn": "#4ade80" },
//     { "id": "alert", "t": "notification", "x": 690, "y": 40, "w": 180, "h": 90, "label": "Alert" },
//     { "id": "graph_dist", "t": "graph", "x": 580, "y": 425, "w": 380, "h": 175, "label": "Distance cm", "model": "grid", "windowSec": 30, "series": 1 },
//     { "id": "lbl_ver", "t": "label", "x": 300, "y": 400, "w": 160, "h": 80, "label": "Firmware" },
//     { "id": "gauge_dist", "t": "gauge", "x": 690, "y": 190, "w": 180, "h": 195, "label": "Distance", "min": 0, "max": 200, "units": "cm", "decimals": 0 },
//     { "id": "upd", "t": "select", "x": 490, "y": 290, "w": 170, "h": 85, "label": "Telemetry", "options": "All,Basic,Off" }
//   ]
// }
const CFG = "eyJ0aXRsZSI6Ik1hcXVlZW4gUmVtb3RlIiwid2lkZ2V0cyI6W3siaWQiOiJzbGlkZXJfc3J2MSIsInQiOiJzbGlkZXIiLCJ4IjozMCwieSI6NTUsInciOjcwLCJoIjoyMDAsImxhYmVsIjoiU2Vydm8gMSIsIm1pbiI6MCwibWF4IjoxODAsInN0ZXAiOjF9LHsiaWQiOiJzbGlkZXJfc3J2MiIsInQiOiJzbGlkZXIiLCJ4IjoxNDAsInkiOjU1LCJ3Ijo3MCwiaCI6MjAwLCJsYWJlbCI6IlNlcnZvIDIiLCJtaW4iOjAsIm1heCI6MTgwLCJzdGVwIjoxfSx7ImlkIjoiZHBhZF9tb3ZlIiwidCI6ImRwYWQiLCJ4IjoyNjAsInkiOjU1LCJ3IjoxNzUsImgiOjE3NSwibGFiZWwiOiJEcml2ZSIsIm1vZGVsIjoiY2xhc3NpYyJ9LHsiaWQiOiJzcGQiLCJ0Ijoic2xpZGVyIiwieCI6NDk1LCJ5Ijo1NSwidyI6NzAsImgiOjIwMCwibGFiZWwiOiJTcGVlZCIsIm1pbiI6NjAsIm1heCI6MjU1LCJzdGVwIjo1fSx7ImlkIjoibW9kZSIsInQiOiJzZWxlY3QiLCJ4IjozNSwieSI6MjkwLCJ3IjoxNjAsImgiOjg1LCJsYWJlbCI6Ik1vZGUiLCJvcHRpb25zIjoiTWFudWFsLExpbmUsQXZvaWQifSx7ImlkIjoiYnRuX3N0b3AiLCJ0IjoiYnV0dG9uIiwieCI6MjU1LCJ5IjoyODUsInciOjEwMCwiaCI6MTA1LCJsYWJlbCI6IlNUT1AifSx7ImlkIjoiYnRuX2J1enoiLCJ0IjoiYnV0dG9uIiwieCI6Mzc1LCJ5IjoyODUsInciOjEwMCwiaCI6MTA1LCJsYWJlbCI6IkJ1enoifSx7ImlkIjoibGJsX2hlYXJ0YmVhdCIsInQiOiJsYWJlbCIsIngiOjU1LCJ5Ijo0MDAsInciOjIyMCwiaCI6ODAsImxhYmVsIjoiVXB0aW1lIn0seyJpZCI6InRvZ2dsZV9sZWRfbCIsInQiOiJ0b2dnbGUiLCJ4IjoyNSwieSI6NDkwLCJ3Ijo5MCwiaCI6MTEwLCJsYWJlbCI6IkxFRCBMIn0seyJpZCI6InRvZ2dsZV9sZWRfciIsInQiOiJ0b2dnbGUiLCJ4IjoxNTgsInkiOjQ5MCwidyI6OTAsImgiOjExMCwibGFiZWwiOiJMRUQgUiJ9LHsiaWQiOiJsbl9sIiwidCI6ImxlZCIsIngiOjI4NSwieSI6NTAwLCJ3Ijo3MCwiaCI6OTAsImxhYmVsIjoiTGluZSBMIiwibW9kZWwiOiJkb3QiLCJjb2xvck9uIjoiIzRhZGU4MCJ9LHsiaWQiOiJsbl9yIiwidCI6ImxlZCIsIngiOjM4OCwieSI6NTAwLCJ3Ijo3MCwiaCI6OTAsImxhYmVsIjoiTGluZSBSIiwibW9kZWwiOiJkb3QiLCJjb2xvck9uIjoiIzRhZGU4MCJ9LHsiaWQiOiJhbGVydCIsInQiOiJub3RpZmljYXRpb24iLCJ4Ijo2OTAsInkiOjQwLCJ3IjoxODAsImgiOjkwLCJsYWJlbCI6IkFsZXJ0In0seyJpZCI6ImdyYXBoX2Rpc3QiLCJ0IjoiZ3JhcGgiLCJ4Ijo1ODAsInkiOjQyNSwidyI6MzgwLCJoIjoxNzUsImxhYmVsIjoiRGlzdGFuY2UgY20iLCJtb2RlbCI6ImdyaWQiLCJ3aW5kb3dTZWMiOjMwLCJzZXJpZXMiOjF9LHsiaWQiOiJsYmxfdmVyIiwidCI6ImxhYmVsIiwieCI6MzAwLCJ5Ijo0MDAsInciOjE2MCwiaCI6ODAsImxhYmVsIjoiRmlybXdhcmUifSx7ImlkIjoiZ2F1Z2VfZGlzdCIsInQiOiJnYXVnZSIsIngiOjY5MCwieSI6MTkwLCJ3IjoxODAsImgiOjE5NSwibGFiZWwiOiJEaXN0YW5jZSIsIm1pbiI6MCwibWF4IjoyMDAsInVuaXRzIjoiY20iLCJkZWNpbWFscyI6MH0seyJpZCI6InVwZCIsInQiOiJzZWxlY3QiLCJ4Ijo0OTAsInkiOjI5MCwidyI6MTcwLCJoIjo4NSwibGFiZWwiOiJUZWxlbWV0cnkiLCJvcHRpb25zIjoiQWxsLEJhc2ljLE9mZiJ9XX0="

// ═══════════════════════════════════════════════════════════════
// 📡 BLUETOOTH COMMUNICATION
// ═══════════════════════════════════════════════════════════════

bluetooth.onUartDataReceived(serial.delimiters(Delimiters.NewLine), function () {
    let cmd = bluetooth.uartReadUntil(serial.delimiters(Delimiters.NewLine))

    // Stamp on EVERY line, whatever it is — including the app's PING,
    // which exists purely to keep this fresh while nobody is driving.
    // This is what the link-loss timeout below measures against.
    lastRxAt = input.runningTime()
    linkLostHandled = false

    // v45: receiving a UART packet is stronger evidence of a live BLE link
    // than the platform connection callback. Manual D-pad commands execute
    // inside this receive handler, but Line/Avoid + telemetry run in the
    // forever loop and are gated on btConnected. If onBluetoothConnected()
    // is missed on a device/browser combination, Manual still appears to
    // work while BOTH autonomous modes and all UPD telemetry stay dead.
    // Any successfully received packet proves the peer is connected, so
    // recover the flag here. Link loss is still detected by RX silence.
    btConnected = true

    // Fastest D-pad wire format: one byte 'a'..'p' encodes mask 0..15.
    // The browser sends exactly two bytes total: command + newline.
    if (cmd.length == 1 && cmd.charCodeAt(0) >= 97 && cmd.charCodeAt(0) <= 112) {
        handleDpadMask(cmd.charCodeAt(0) - 97)
    }
    else if (cmd == "BYE") {
        // Intentional app disconnect: stop safely and schedule a clean BLE
        // peripheral reboot before the next session.
        handleLinkLost()
    }
    else if (cmd == "GETCFG") {
        // v46: arm the transfer and RETURN from the RX callback immediately.
        // The forever loop below emits CFGBEGIN/chunks/CFGEND one at a time.
        dbg("GETCFG received (firmware " + FIRMWARE_VERSION + "), queueing layout...")
        cfgSent = false
        cfgTxActive = true
        cfgTxStage = 0
        cfgTxPos = 0
        cfgTxChunkIdx = 0
        cfgTxLit = 0
        cfgTxNextAt = input.runningTime() + 20
        debugDirty = false
        basic.clearScreen()
    }
    else if (cmd.indexOf("M ") == 0) {
        // Ultra-low-latency D-pad packet. The number is the COMPLETE
        // current button state (U=1,D=2,L=4,R=8), so stale queued events
        // never need to be replayed.
        handleDpadMask(parseInt(cmd.substr(2)))
    }
    else if (cmd.indexOf("D ") == 0) {
        // Compact D-pad packet: D <u|d|l|r> <0|1>. Keeping this under
        // one 20-byte BLE payload avoids an extra connection event.
        let parts = cmd.split(" ")
        let d = parts[1]
        let dir = d == "u" ? "up" : d == "d" ? "down" : d == "l" ? "left" : "right"
        handleWidget("dpad_move", dir + " " + parts[2])
    }
    else if (cmd.indexOf("SET ") == 0) {
        let parts = cmd.substr(4).split(" ")
        let id = parts[0]
        let val = parts.slice(1).join(" ")
        handleWidget(id, val)
    }
})

// ═══════════════════════════════════════════════════════════════
// 🕹️ DRIVE MIX — ported from Maqueen Lab's js/maqueen-tab.js
// joystick handler. nx = turn (right positive), ny = forward
// (up positive), both in -1..1. DRIVE_REF matches the 200 (not 255)
// ceiling Maqueen Lab itself uses — deliberately leaves headroom
// rather than maxing out the motor driver.
// ═══════════════════════════════════════════════════════════════

// Top speed, now live-adjustable from the Speed slider instead of a
// constant. 200 (not 255) remains the default, matching the ceiling
// Maqueen Lab uses — it deliberately leaves headroom rather than
// maxing out the motor driver. Autonomous modes below use it too, so
// one slider governs manual and self-driving alike.
let driveSpeed = 200
const DRIVE_SPEED_MIN = 60      // below this the motors stall rather than crawl
const DRIVE_SPEED_MAX = 255
const DEAD_ZONE = 0.12  // below this magnitude on both axes, treat as stopped

// Visual-only diagnostic — no USB required. Shows what the firmware
// computed for the last drive command directly on the 5x5 LED matrix:
// an arrow for the dominant direction, or a small square when stopped.
//
// ⚠️ NEVER CALL THIS FROM THE BLE RECEIVE HANDLER. Every basic.show*
// function RENDERS AND THEN PAUSES for its interval argument — the
// defaults are ~600ms for showArrow and ~400ms for showLeds/showIcon.
// Earlier versions called this straight from driveMix(), i.e. from
// inside onUartDataReceived, so every press blocked the receive
// callback ~600ms and every release ~400ms. A release routinely
// arrived while the handler was still blocked on the press's arrow,
// which is what made directions go missing and stalled the heartbeat
// (the watchdog called it from the forever loop too, blocking that).
//
// Maqueen Lab's own firmware is the reference here: its drive path
// (handleMotor) issues the two motorRun() calls and NOTHING else —
// every basic.showArrow/showIcon call in that file belongs to a
// dedicated display verb (JOY:UP, SHOW:, icon names), never to the
// motor path. That is the entire difference between the firmware
// that works and the one that didn't.
//
// So: driveMix() only records what it wants drawn (pendingDebugL/R +
// debugDirty), and the forever loop renders it here with an explicit
// interval of 0 so nothing ever pauses.
function showDriveDebug(l: number, r: number) {
    if (l == 0 && r == 0) {
        basic.showLeds(`
            . . . . .
            . . . . .
            . . # . .
            . . . . .
            . . . . .
            `, 0)
    } else if (l > 0 && r > 0) {
        basic.showArrow(ArrowNames.North, 0)       // both forward
    } else if (l < 0 && r < 0) {
        basic.showArrow(ArrowNames.South, 0)       // both backward
    } else if (l < 0 && r > 0) {
        basic.showArrow(ArrowNames.West, 0)        // spin left
    } else if (l > 0 && r < 0) {
        basic.showArrow(ArrowNames.East, 0)        // spin right
    } else {
        basic.showIcon(IconNames.SmallDiamond, 0)  // one wheel only
    }
}

// What driveMix() wants drawn, rendered later by the forever loop.
// Kept separate from lastDriveL/lastDriveR because those are also the
// I2C rate-limit's "what's currently spinning" state — conflating the
// two would re-render on every rate-limited refresh.
let pendingDebugL = 0, pendingDebugR = 0
let debugDirty = false
// Which glyph the loop should paint. ONE renderer, in the forever loop,
// is the whole point: event handlers (BLE connect/disconnect, STOP) used
// to call basic.show* directly while the loop was also drawing. Those
// run on different fibers, so a handler's icon could be overwritten by a
// showDriveDebug() call the loop had already committed to — which is why
// the ✗ on disconnect never stuck and the micro:bit kept showing ✓.
// Clearing debugDirty could not prevent it: the loop had already passed
// that check. Handlers now only ever REQUEST a glyph.
const GLYPH_DRIVE = 0
const GLYPH_STOP = 1
const GLYPH_DISCONNECTED = 2
const GLYPH_CONNECTED = 3
const GLYPH_LED_L = 4
const GLYPH_LED_R = 5
const GLYPH_BUZZ = 6
const GLYPH_SERVO = 7
let pendingGlyph = GLYPH_DRIVE
// Extra payload for glyphs that show a value: 0/1 for the LED toggles,
// 0-180 for the servo bar graph.
let pendingValue = 0

function requestGlyph(g: number) {
    pendingGlyph = g
    debugDirty = true
}
function requestGlyphValue(g: number, v: number) {
    pendingValue = v
    requestGlyph(g)
}
function requestDriveDebug(l: number, r: number) {
    // The pendingGlyph term matters: after STOP or a disconnect has
    // painted its own icon, the next release (0,0) must still repaint the
    // dot even though pendingDebugL/R already read 0,0.
    if (l == pendingDebugL && r == pendingDebugR && pendingGlyph == GLYPH_DRIVE) return
    pendingDebugL = l
    pendingDebugR = r
    pendingGlyph = GLYPH_DRIVE
    debugDirty = true
}
function requestStopIcon() {
    pendingDebugL = 0
    pendingDebugR = 0
    requestGlyph(GLYPH_STOP)
}

// The Maqueen Lite motor driver is I2C-based (not direct PWM). Generic
// continuous controls still use change detection so they do not hammer
// I2C with essentially identical values. HOWEVER, real-hardware latency
// testing showed that a fixed 125 ms / 8 Hz gate is unacceptable for
// manual steering. MIN_DRIVE_INTERVAL_MS is therefore ZERO in this
// latency build, and the dedicated D-pad path below bypasses driveMix()
// altogether so every actual state change reaches motorRun immediately.
// Keep the change threshold for noisy continuous controls; do not add a
// fixed time gate back into handleDpadMask().
let lastDriveL = 0, lastDriveR = 0
let lastDriveAt = 0
const MIN_DRIVE_INTERVAL_MS = 0    // latency build: state changes write immediately
const DRIVE_CHANGE_THRESHOLD = 15  // ignore jitter smaller than this

// Safety watchdog for the final state-mask protocol. A held D-pad
// periodically re-sends the SAME complete mask (currently ~1000 ms in
// script.js). That refresh is not for steering fidelity; it is a safety
// heartbeat. If the physical release or BLE link disappears, the robot
// must not keep driving forever. 2500 ms leaves room for missed refreshes
// without making a normal held button cut out. Every fresh mask stamps
// lastDriveCmdAt, and link-loss handling independently stops the motors.
let lastDriveCmdAt = 0
const DRIVE_WATCHDOG_MS = 2500

// ═══════════════════════════════════════════════════════════════
// 🤖 DRIVING MODES
// Manual = the D-pad drives. Line / Avoid run autonomously from the
// forever loop. Every autonomous step is a plain state update — no
// blocking waits — so the radio, watchdog and display keep running.
// ═══════════════════════════════════════════════════════════════
const MODE_MANUAL = 0
const MODE_LINE = 1
const MODE_AVOID = 2
let driveMode = MODE_MANUAL

// Line sensors. IMPORTANT: readPatrol returns 0 when the sensor is OVER
// THE BLACK LINE and 1 when it is over pale floor — inverted from what
// "1 = detected" would suggest. Maqueen Lab documents this explicitly
// ("0 (on black line) or 1 (on white floor)"). The LED widgets are fed
// the inverted value so that a LIT led means "this side is on the line",
// which is what anyone watching would expect.
let lastLineL = -1
let lastLineR = -1
const LINE_INTERVAL_MS = 100

// Obstacle-avoid + alert thresholds.
const AVOID_STOP_CM = 20        // back away closer than this
const ALERT_CM = 25             // notify the app below this
const ALERT_CLEAR_CM = 40       // ...and only re-arm once well clear again
let alertActive = false
// The version label is pushed once per session, from the main loop.
// Deliberately NOT sent from the GETCFG handler: writing to the UART
// synchronously inside onUartDataReceived is what broke the handshake in
// the v5 attempt. The loop sends it on the first tick after cfgSent.
let versionSent = false
// Avoid runs as a timed reverse-then-turn so nothing blocks the loop.
let avoidUntil = 0
let avoidPhase = 0              // 0 = cruising, 1 = reversing, 2 = turning

// Declared up here (not next to the forever loop that uses them)
// because onBluetoothDisconnected resets them, and that handler appears
// earlier in the file — static TypeScript rejects use-before-declaration.
let heartbeat = 0

function driveMix(nx: number, ny: number) {
    if (Math.abs(nx) < DEAD_ZONE && Math.abs(ny) < DEAD_ZONE) {
        maqueen.motorStop(maqueen.Motors.All)
        dbg("drive: STOP (nx=" + nx + " ny=" + ny + ")")
        requestDriveDebug(0, 0)
        lastDriveL = 0
        lastDriveR = 0
        lastDriveAt = input.runningTime()
        return
    }
    let l = Math.constrain(Math.round((ny + nx) * driveSpeed), -driveSpeed, driveSpeed)
    let r = Math.constrain(Math.round((ny - nx) * driveSpeed), -driveSpeed, driveSpeed)

    let now = input.runningTime()
    let changedEnough = Math.abs(l - lastDriveL) >= DRIVE_CHANGE_THRESHOLD || Math.abs(r - lastDriveR) >= DRIVE_CHANGE_THRESHOLD
    let dueForRefresh = (now - lastDriveAt) >= MIN_DRIVE_INTERVAL_MS
    if (!changedEnough && !dueForRefresh) {
        return  // skip redundant/too-frequent I2C write
    }

    // Drive path, deliberately identical in shape to Maqueen Lab's
    // handleMotor(): two motorRun() calls and nothing that can block.
    // dbg() only pushes to a queue; requestDriveDebug() only sets a
    // flag. No basic.show* here — see showDriveDebug()'s comment.
    maqueen.motorRun(maqueen.Motors.M1, l >= 0 ? maqueen.Dir.CW : maqueen.Dir.CCW, Math.abs(l))
    maqueen.motorRun(maqueen.Motors.M2, r >= 0 ? maqueen.Dir.CW : maqueen.Dir.CCW, Math.abs(r))
    dbg("drive: nx=" + nx + " ny=" + ny + " -> L=" + l + " R=" + r)
    requestDriveDebug(l, r)
    lastDriveL = l
    lastDriveR = r
    lastDriveAt = now
}

// Same rate-limit/change-detection guard as driveMix(), applied to the
// servo sliders — see the comment at the slider_srv1/2 handlers above.
let lastServo1 = -1, lastServo2 = -1
let lastServo1At = 0, lastServo2At = 0
function servoWriteAllowed(port: number, angle: number): boolean {
    let now = input.runningTime()
    let last = port == 1 ? lastServo1 : lastServo2
    let lastAt = port == 1 ? lastServo1At : lastServo2At
    let changedEnough = Math.abs(angle - last) >= DRIVE_CHANGE_THRESHOLD
    let dueForRefresh = (now - lastAt) >= MIN_DRIVE_INTERVAL_MS
    if (!changedEnough && !dueForRefresh) {
        return false
    }
    if (port == 1) { lastServo1 = angle; lastServo1At = now }
    else { lastServo2 = angle; lastServo2At = now }
    return true
}

// D-pad direction state, driven by the dpad_move handler in
// handleWidget() below. More than one can be true at once (e.g. up+
// right held together) for a diagonal.
let btnFwd = false, btnBack = false, btnLeft = false, btnRight = false
function updateButtonDrive() {
    let ny = 0, nx = 0
    if (btnFwd) ny += 1
    if (btnBack) ny -= 1
    if (btnLeft) nx -= 1
    if (btnRight) nx += 1
    driveMix(nx, ny)
}

function handleDpadMask(mask: number) {
    if (driveMode != MODE_MANUAL) return
    // HOT PATH: a D-pad packet goes straight to the Maqueen motor driver.
    // Do not route through handleWidget()/dbg()/LED rendering/rate limiting.
    // Those are useful for general controls but add scheduler and BLE work
    // exactly when manual driving needs the lowest possible latency.
    lastDriveCmdAt = input.runningTime()
    btnFwd = (mask & 1) != 0
    btnBack = (mask & 2) != 0
    btnLeft = (mask & 4) != 0
    btnRight = (mask & 8) != 0

    let ny = 0, nx = 0
    if (btnFwd) ny += 1
    if (btnBack) ny -= 1
    if (btnLeft) nx -= 1
    if (btnRight) nx += 1

    if (nx == 0 && ny == 0) {
        maqueen.motorStop(maqueen.Motors.All)
        lastDriveL = 0
        lastDriveR = 0
        lastDriveAt = lastDriveCmdAt
        return
    }

    let l = Math.constrain((ny + nx) * driveSpeed, -driveSpeed, driveSpeed)
    let r = Math.constrain((ny - nx) * driveSpeed, -driveSpeed, driveSpeed)
    maqueen.motorRun(maqueen.Motors.M1, l >= 0 ? maqueen.Dir.CW : maqueen.Dir.CCW, Math.abs(l))
    maqueen.motorRun(maqueen.Motors.M2, r >= 0 ? maqueen.Dir.CW : maqueen.Dir.CCW, Math.abs(r))
    lastDriveL = l
    lastDriveR = r
    lastDriveAt = lastDriveCmdAt
}

// ═══════════════════════════════════════════════════════════════
// 🎮 WIDGET HANDLERS — driving real Maqueen hardware via pxt-maqueen
// ═══════════════════════════════════════════════════════════════

// v44 autonomous motor path. Manual D-pad packets have their own direct
// path above; Line/Avoid need the same ownership model. Autonomous motion
// is generated on the micro:bit, so it must not depend on browser D-pad
// keepalives or the Manual drive watchdog.
function driveAuto(nx: number, ny: number) {
    if (driveMode == MODE_MANUAL) return
    let now = input.runningTime()
    if (Math.abs(nx) < DEAD_ZONE && Math.abs(ny) < DEAD_ZONE) {
        maqueen.motorStop(maqueen.Motors.All)
        lastDriveL = 0
        lastDriveR = 0
        lastDriveAt = now
        lastDriveCmdAt = now
        requestDriveDebug(0, 0)
        return
    }
    let l = Math.constrain(Math.round((ny + nx) * driveSpeed), -driveSpeed, driveSpeed)
    let r = Math.constrain(Math.round((ny - nx) * driveSpeed), -driveSpeed, driveSpeed)
    maqueen.motorRun(maqueen.Motors.M1, l >= 0 ? maqueen.Dir.CW : maqueen.Dir.CCW, Math.abs(l))
    maqueen.motorRun(maqueen.Motors.M2, r >= 0 ? maqueen.Dir.CW : maqueen.Dir.CCW, Math.abs(r))
    lastDriveL = l
    lastDriveR = r
    lastDriveAt = now
    lastDriveCmdAt = now
    requestDriveDebug(l, r)
}

function handleWidget(id: string, val: string) {
    // Every SET command lands here first — logged unconditionally so
    // you can see exactly what the app sent, even for widgets/ids the
    // handlers below don't recognize.
    dbg("recv: " + id + " = " + val)

    // Button: STOP — kill both motors immediately.
    if (id == "btn_stop" && val == "1") {
        maqueen.motorStop(maqueen.Motors.All)
        // Was basic.showIcon(IconNames.No) — blocking, and this runs
        // inside the BLE receive handler. Still shows the ✗, but via
        // the deferred renderer so nothing blocks here.
        lastDriveL = 0
        lastDriveR = 0
        requestStopIcon()
        dbg("stop button pressed")
    }

    // Slider: Speed — top speed for BOTH manual and autonomous driving.
    if (id == "spd") {
        driveSpeed = Math.constrain(parseInt(val), DRIVE_SPEED_MIN, DRIVE_SPEED_MAX)
        requestGlyphValue(GLYPH_SERVO, Math.idiv(driveSpeed * 180, DRIVE_SPEED_MAX))
        dbg("speed -> " + driveSpeed)
    }

    // Select: Telemetry — how much the robot reports back.
    if (id == "upd") {
        if (val == "Off") updLevel = UPD_OFF
        else if (val == "Basic") updLevel = UPD_BASIC
        else updLevel = UPD_ALL
        // Re-announce the version on the way back up, since the label
        // would otherwise stay blank from whatever was missed while
        // silenced. Cheap, and it confirms the setting took effect.
        if (updLevel != UPD_OFF) versionSent = false
        dbg("telemetry -> " + val)
    }

    // Select: Mode — Manual / Line / Avoid.
    if (id == "mode") {
        // Always stop first. Switching mode while the wheels are turning
        // would otherwise carry the old command into the new mode.
        maqueen.motorStop(maqueen.Motors.All)
        lastDriveL = 0
        lastDriveR = 0
        btnFwd = false
        btnBack = false
        btnLeft = false
        btnRight = false
        avoidPhase = 0
        avoidUntil = 0
        if (val == "Line") driveMode = MODE_LINE
        else if (val == "Avoid") driveMode = MODE_AVOID
        else driveMode = MODE_MANUAL
        // Reset ownership timing at the mode boundary. The age of the last
        // Manual D-pad packet must never decide whether autonomous motors run.
        lastDriveCmdAt = input.runningTime()
        requestDriveDebug(0, 0)
        dbg("mode -> " + val)
    }

    // Button: Buzz — short confirmation beep.
    if (id == "btn_buzz" && val == "1") {
        requestGlyph(GLYPH_BUZZ)
        music.playTone(440, music.beat(BeatFraction.Quarter))
    }

    // Slider: Servo 1 / Servo 2 — widget's min/max (0-180) already match
    // maqueen.servoRun's angle range, so val is a direct degree value.
    // Same rate-limit/change-detection guard as driveMix(): dragging a
    // slider fires many rapid SET messages, and unthrottled servoRun()
    // calls at that frequency can lock up the I2C bus hard enough to
    // freeze the WHOLE firmware (confirmed: the heartbeat, which never
    // touches I2C, stopped incrementing the moment Servo 1 was dragged).
    if (id == "slider_srv1") {
        let angle1 = parseInt(val)
        // Glyph updates on EVERY message, outside the rate-limit gate:
        // the guard exists to protect the I2C bus, not the display, and
        // suppressing feedback while dragging would look like a dropped
        // command. Drawing is deferred to the loop, so it is cheap.
        requestGlyphValue(GLYPH_SERVO, angle1)
        if (servoWriteAllowed(1, angle1)) {
            maqueen.servoRun(maqueen.Servos.S1, angle1)
            dbg("servo S1 -> " + angle1)
        }
    }
    if (id == "slider_srv2") {
        let angle2 = parseInt(val)
        requestGlyphValue(GLYPH_SERVO, angle2)
        if (servoWriteAllowed(2, angle2)) {
            maqueen.servoRun(maqueen.Servos.S2, angle2)
            dbg("servo S2 -> " + angle2)
        }
    }

    // Toggle: LED L / LED R
    if (id == "toggle_led_l") {
        requestGlyphValue(GLYPH_LED_L, val == "1" ? 1 : 0)
        maqueen.writeLED(maqueen.LED.LEDLeft, val == "1" ? maqueen.LEDswitch.turnOn : maqueen.LEDswitch.turnOff)
    }
    if (id == "toggle_led_r") {
        requestGlyphValue(GLYPH_LED_R, val == "1" ? 1 : 0)
        maqueen.writeLED(maqueen.LED.LEDRight, val == "1" ? maqueen.LEDswitch.turnOn : maqueen.LEDswitch.turnOff)
    }

    // D-pad: Drive (val = "<dir> <1|0>", dir = up/down/left/right).
    // All 4 directions share this ONE widget id — see the header
    // comment on the app-side reliable-send fix (sendReliable() /
    // bleSend.queue) that makes this safe. Each direction just sets
    // its own boolean; multiple can be held at once for a diagonal,
    // same as the earlier 4-separate-buttons approach.
    if (id == "dpad_move") {
        // Ignored while an autonomous mode owns the motors — otherwise a
        // stray press would fight the behaviour for control of the same
        // two wheels. Switch the Mode selector back to Manual to drive.
        if (driveMode != MODE_MANUAL) {
            dbg("dpad ignored (mode " + driveMode + ")")
            return
        }
        lastDriveCmdAt = input.runningTime()
        let parts = val.split(" ")
        let dir = parts[0]
        let pressed = parts[1] == "1"
        if (dir == "up") btnFwd = pressed
        else if (dir == "down") btnBack = pressed
        else if (dir == "left") btnLeft = pressed
        else if (dir == "right") btnRight = pressed
        dbg("dpad: " + dir + " = " + pressed)
        updateButtonDrive()
    }
}

// ═══════════════════════════════════════════════════════════════
// 📤 SEND VALUES TO APP (optional — none of this layout's widgets
// are output widgets, but sendValue() is here if you add a gauge,
// label or LED-output widget later, e.g. to show DIST:cm)
// ═══════════════════════════════════════════════════════════════

function sendValue(id: string, val: string) {
    // btConnected as well as cfgSent — see the flag's declaration for
    // why writing to a dead UART is not merely wasteful but blocking.
    if (!btConnected || !cfgSent) return
    if (updLevel == UPD_OFF) return
    // Basic keeps the uptime clock and the version label — the two that
    // answer "is it alive?" and "what is flashed?" — and drops the rest.
    if (updLevel == UPD_BASIC && id != "lbl_heartbeat" && id != "lbl_ver") return
    bluetooth.uartWriteLine("UPD " + id + " " + val)
}

// ═══════════════════════════════════════════════════════════════
// 🚀 STARTUP
// ═══════════════════════════════════════════════════════════════

// Safety: stop any leftover motion and center servos on boot.
maqueen.motorStop(maqueen.Motors.All)
maqueen.servoRun(maqueen.Servos.S1, 90)
maqueen.servoRun(maqueen.Servos.S2, 90)
basic.showString(FIRMWARE_VERSION)
// Idle indicator: a hollow ring, held until BLE connects. Deliberately
// not a filled shape — ■ already means "STOP pressed" and the centre dot
// means "motors idle", so a solid glyph here would be confusable. The
// ring reads as "powered, waiting", and it must be visibly different
// from a blank screen, otherwise a booted-but-unconnected robot looks
// indistinguishable from a flat battery.
basic.showLeds(`
    . # # # .
    # . . . #
    # . . . #
    # . . . #
    . # # # .
    `, 0)
dbg("Maqueen Remote firmware " + FIRMWARE_VERSION + " ready, waiting for BLE connection...")

bluetooth.onBluetoothConnected(function () {
    btConnected = true
    dbg("BLE connected")
})

// Safety: kill motors when the link goes away, so the robot does not
// keep driving on the last command it received.
//
// Called from TWO places: the BLE disconnect event (which does not fire
// on this board, but costs nothing to keep wired up in case another one
// behaves) and the silence timeout in the forever loop, which is what
// actually catches it here. Idempotent — whichever arrives first wins.
function handleLinkLost() {
    if (linkLostHandled) return
    linkLostHandled = true
    // FIRST: stop anything else from touching the radio. Every write
    // after this point would block on a dead link and wedge the BLE
    // stack, which is what made the next connect hang in service
    // discovery. Also drop any queued log lines — they are addressed to
    // a peer that is gone.
    btConnected = false
    cfgSent = false
    cfgTxActive = false
    cfgTxStage = 0
    cfgTxPos = 0
    cfgTxChunkIdx = 0
    logQueue = []
    // v46: reboot the BLE peripheral after the X is painted. This is the
    // automatic replacement for the physical RESET that was previously
    // required before GETCFG would work after a disconnect.
    bleStackResetAt = input.runningTime() + BLE_STACK_RESET_DELAY_MS
    maqueen.motorStop(maqueen.Motors.All)
    // Clear the drive state too, not just the motors. Otherwise, if the
    // link dropped mid-drive, lastDriveL/R stay non-zero and the loop's
    // watchdog fires ~700ms later, calling requestDriveDebug(0,0) and
    // repainting the centre dot straight over the ✗ — so a disconnect
    // that happened while moving looked like an ordinary stop.
    lastDriveL = 0
    lastDriveR = 0
    lastDriveCmdAt = input.runningTime()
    btnFwd = false
    btnBack = false
    btnLeft = false
    btnRight = false
    // Reset the drive glyph state, then request ✗ through the single
    // renderer below so nothing can overwrite it.
    pendingDebugL = 0
    pendingDebugR = 0
    requestGlyph(GLYPH_DISCONNECTED)
    // Heartbeat restarts per session, so the clock reads session uptime
    // rather than time since power-on.
    heartbeat = 0
    // Force the next line readings to be transmitted even if they match
    // the last ones from the previous session — otherwise the line LEDs
    // sit blank until something happens to change. (The graph is not
    // deduped at all, so it needs no reset.)
    lastLineL = -1
    lastLineR = -1
    alertActive = false
    // Re-announce the version on the next connect; the app rebuilds its
    // widgets from scratch each session, so the label would be blank.
    versionSent = false
    // Drop out of any autonomous mode. The loop already stops running
    // behaviours once btConnected goes false, but resetting here means a
    // reconnect starts in a known, stationary state rather than silently
    // resuming Line or Avoid the moment the link returns.
    driveMode = MODE_MANUAL
    avoidPhase = 0
    avoidUntil = 0
    dbg("link lost, motors stopped")
}

// Kept wired up even though it does not fire on this board — it costs
// nothing, and handleLinkLost() is idempotent so it cannot double-run
// with the silence timeout.
bluetooth.onBluetoothDisconnected(function () {
    dbg("BLE disconnect event")
    handleLinkLost()
    // If the main loop is ever stuck in a UART write, reset from this event
    // fiber anyway. X remains visible briefly, then Bluetooth starts clean.
    basic.pause(BLE_STACK_RESET_DELAY_MS)
    control.reset()
})

// ═══════════════════════════════════════════════════════════════
// 💓 HEARTBEAT — proves the firmware loop AND the BLE link are both
// genuinely alive, independent of pressing any button. Uses the same
// sendValue()/"UPD id val" mechanism the app already understands (see
// script.js's processLine handling of "UPD " lines) — NOT a bare
// bluetooth.uartWriteLine() call from inside a receive handler, which
// is exactly what broke everything in the v5 attempt. This only ever
// fires from the main forever loop, never from inside
// onUartDataReceived, so there's no receive/send conflict.
// ═══════════════════════════════════════════════════════════════

// 1s tick, reported as an uptime clock ("0d 00:01:05") rather than a
// raw count — it reads as session duration at a glance instead of a
// number you have to divide.
const HEARTBEAT_INTERVAL_MS = 1000
let nextHeartbeatAt = 0

// Zero-pad to two digits so the clock columns stay aligned.
function pad2(n: number): string {
    return n < 10 ? "0" + n : "" + n
}
// heartbeat counts seconds since the session started, so it doubles as
// the uptime source. Math.idiv is integer division — plain / would give
// a float and print "0.0166d".
//
// Leading all-zero units are omitted, so the display stays as short as
// the elapsed time actually requires and each unit only appears once it
// means something:
//        7s -> "07"
//       65s -> "01:05"
//     3661s -> "01:01:01"
//    90061s -> "1d 01:01:01"
// Padding is kept on the units that DO show, so the digits stay aligned
// and the value does not jitter in width every second.
function uptimeString(totalSec: number): string {
    let d = Math.idiv(totalSec, 86400)
    let h = Math.idiv(totalSec % 86400, 3600)
    let m = Math.idiv(totalSec % 3600, 60)
    let s = totalSec % 60
    if (d > 0) return d + "d " + pad2(h) + ":" + pad2(m) + ":" + pad2(s)
    if (h > 0) return pad2(h) + ":" + pad2(m) + ":" + pad2(s)
    if (m > 0) return pad2(m) + ":" + pad2(s)
    return pad2(s)
}
// Ultrasonic polling cadence.
//
// maqueen.Ultrasonic() is the most expensive call in this firmware, and
// its cost depends entirely on whether an echo comes back. From the
// library source, one readUlt() is basic.pause(1) + basic.pause(20) +
// pins.pulseIn(..., 500*58) — a 29ms timeout. An echo returns almost at
// once; no echo waits the timeout out, and Ultrasonic() then retries up
// to four more times. So a working sensor at ~30cm costs ~25ms, while a
// disconnected or out-of-range one costs ~250ms — and pulseIn BUSY-WAITS
// without yielding, freezing the whole runtime rather than just this
// loop. Polling this carelessly is what made the robot feel frozen.
//
// Two mitigations, both still earning their place:
//   1. Skipped while the wheels are turning (except in Avoid, where the
//      distance IS the input). A stall nobody notices while parked is
//      ruinous mid-drive.
//   2. Adaptive backoff — brisk while real distances come back, doubling
//      to DIST_INTERVAL_MAX_MS while the sensor reports nothing. The
//      expensive case is exactly the uninformative one.
const DIST_INTERVAL_MS = 400          // when the sensor is returning real distances
const DIST_INTERVAL_MAX_MS = 5000     // when it keeps reporting "no echo"
let distInterval = DIST_INTERVAL_MS
const DIST_MAX_CM = 200          // matches the gauge's max in CFG
let nextDistAt = 0
let nextLineAt = 0
basic.forever(function () {
    let now = input.runningTime()

    // Drive watchdog runs every 100ms (finer than the 1s heartbeat
    // cadence below) so a stalled/dropped "stop" packet gets caught
    // within DRIVE_WATCHDOG_MS instead of up to a full second late.
    // Manual safety watchdog only. v43 accidentally supervised Line/Avoid
    // with the D-pad keepalive timeout too. Avoid can legitimately spend
    // longer than that between ultrasonic polls after no-echo backoff.
    if (driveMode == MODE_MANUAL && (lastDriveL != 0 || lastDriveR != 0) && now - lastDriveCmdAt > DRIVE_WATCHDOG_MS) {
        maqueen.motorStop(maqueen.Motors.All)
        dbg("watchdog: no drive update for " + DRIVE_WATCHDOG_MS + "ms, auto-stop")
        requestDriveDebug(0, 0)
        lastDriveL = 0
        lastDriveR = 0
    }

    // ── DISPLAY FIRST, RADIO LAST ────────────────────────────────
    // Order is load-bearing, not cosmetic. bluetooth.uartWriteLine()
    // BLOCKS the calling fiber when the link is down or its buffer
    // cannot drain — the same landmine as serial.writeLine(). The two
    // writes below used to run BEFORE this render block, so at the
    // moment of a disconnect the loop would block inside a write that
    // never completes, and since this loop is the only thing that draws
    // the LED matrix, the ✗ was never painted. Drawing first means a
    // wedged radio can no longer starve the display.
    if (debugDirty) {
        debugDirty = false
        if (pendingGlyph == GLYPH_STOP) {
            // Square = "stop" (like a stop button). Deliberately NOT
            // IconNames.No — that ✗ means "BLE disconnected", and the
            // two must stay visually distinct. Also distinct from
            // showDriveDebug's centre dot (motors idle) and
            // SmallDiamond (one wheel only).
            basic.showIcon(IconNames.Square, 0)
        } else if (pendingGlyph == GLYPH_DISCONNECTED) {
            basic.showIcon(IconNames.No, 0)
        } else if (pendingGlyph == GLYPH_CONNECTED) {
            basic.showIcon(IconNames.Yes, 0)
        } else if (pendingGlyph == GLYPH_LED_L) {
            // Left band solid when that LED is on, just its corners when
            // off — so the side tells you WHICH led and the fill tells
            // you its state, readable at a glance from across the table.
            if (pendingValue == 1) {
                basic.showLeds(`
                    # # . . .
                    # # . . .
                    # # . . .
                    # # . . .
                    # # . . .
                    `, 0)
            } else {
                basic.showLeds(`
                    # . . . .
                    . . . . .
                    . . . . .
                    . . . . .
                    # . . . .
                    `, 0)
            }
        } else if (pendingGlyph == GLYPH_LED_R) {
            if (pendingValue == 1) {
                basic.showLeds(`
                    . . . # #
                    . . . # #
                    . . . # #
                    . . . # #
                    . . . # #
                    `, 0)
            } else {
                basic.showLeds(`
                    . . . . #
                    . . . . .
                    . . . . .
                    . . . . .
                    . . . . #
                    `, 0)
            }
        } else if (pendingGlyph == GLYPH_BUZZ) {
            basic.showIcon(IconNames.QuarterNote, 0)
        } else if (pendingGlyph == GLYPH_SERVO) {
            // Bar graph scaled 0-180 — shows the angle as a magnitude
            // rather than a number, and unlike showNumber() it never
            // scrolls (scrolling would block this loop for seconds).
            led.plotBarGraph(pendingValue, 180)
        } else {
            showDriveDebug(pendingDebugL, pendingDebugR)
        }
    }

    // ── LINK LOSS BY SILENCE ─────────────────────────────────────
    // The real disconnect detector on this board, since the BLE event
    // never fires. The app pings once a second, so silence past
    // LINK_TIMEOUT_MS means the peer is gone — a closed tab, a reload,
    // a crashed browser, or simply walking out of range. Checked BEFORE
    // the radio gate below, because btConnected is set by an event that
    // is exactly the thing we cannot trust here.
    // ── BLE STACK RECOVERY (v46) ────────────────────────────────
    // The disconnect event resets from its own fiber too, but the silence
    // detector uses this path when the platform callback is missed.
    if (bleStackResetAt > 0 && now >= bleStackResetAt) {
        control.reset()
        return
    }

    // ── CONFIG TX STATE MACHINE (v46) ───────────────────────────
    // Never stream the whole layout from onUartDataReceived(). Sending one
    // notification per pass keeps RX and TX decoupled and lets disconnect
    // handling run between chunks.
    if (btConnected && cfgTxActive) {
        if (now >= cfgTxNextAt) {
            if (cfgTxStage == 0) {
                bluetooth.uartWriteLine("CFGBEGIN")
                cfgTxStage = 1
                cfgTxNextAt = now + CFG_TX_GAP_MS
            } else if (cfgTxStage == 1) {
                if (cfgTxPos < CFG.length) {
                    bluetooth.uartWriteLine("CFG " + CFG.substr(cfgTxPos, 18))
                    cfgTxPos += 18
                    cfgTxChunkIdx += 1
                    let totalChunks = Math.idiv(CFG.length + 17, 18)
                    let target = Math.idiv(cfgTxChunkIdx * 25, totalChunks)
                    while (cfgTxLit < target) {
                        led.plot(cfgTxLit % 5, Math.idiv(cfgTxLit, 5))
                        cfgTxLit += 1
                    }
                    cfgTxNextAt = now + CFG_TX_GAP_MS
                } else {
                    cfgTxStage = 2
                }
            } else {
                bluetooth.uartWriteLine("CFGEND")
                cfgTxActive = false
                cfgSent = true
                requestGlyph(GLYPH_CONNECTED)
                dbg("layout sent, cfgSent = true")
            }
        }
        // Keep the transfer loop tighter than the normal 100 ms control loop,
        // and do not mix heartbeat/sensor/log notifications into CFG traffic.
        basic.pause(20)
        return
    }

    if (cfgSent && !linkLostHandled && now - lastRxAt > LINK_TIMEOUT_MS) {
        handleLinkLost()
    }

    // Everything below talks to the radio, so it is all gated on
    // btConnected — set by the connect/disconnect events rather than
    // inferred from cfgSent. Writing to a dead UART is what wedges the
    // BLE stack, and a wedged stack is why getPrimaryService() hung
    // forever on the next connect attempt.
    if (!btConnected) {
        basic.pause(100)
        return
    }

    // Scheduled off runningTime(), NOT by accumulating an assumed
    // 100ms per iteration. Each pass is pause(100) PLUS however long
    // the work took, so the old counter drifted slow exactly when the
    // firmware was busy — the heartbeat under-reported trouble at the
    // precise moment it was supposed to reveal it.
    if (now >= nextHeartbeatAt) {
        nextHeartbeatAt = now + HEARTBEAT_INTERVAL_MS
        if (cfgSent) {
            heartbeat += 1
            if ((lastDriveL == 0 && lastDriveR == 0) || now - lastDriveCmdAt > 500) sendValue("lbl_heartbeat", uptimeString(heartbeat))
        }
    }

    // Firmware version, pushed once per session on the first tick after
    // the layout is delivered. Same value the LED matrix scrolls at
    // boot, but readable in the app — so "which build is actually on
    // this robot?" can be answered without watching the matrix or
    // plugging in USB. That question cost real time more than once.
    if (cfgSent && !versionSent) {
        versionSent = true
        if ((lastDriveL == 0 && lastDriveR == 0) || now - lastDriveCmdAt > 500) sendValue("lbl_ver", FIRMWARE_VERSION)
    }

    // ── Line sensors ─────────────────────────────────────────────
    // Polled every 100ms and pushed to the two LED widgets on CHANGE
    // only. readPatrol is a plain digital pin read — no echo wait, so
    // unlike the ultrasonic it costs nothing to poll often.
    if (driveMode != MODE_MANUAL && now >= nextLineAt) {
        nextLineAt = now + LINE_INTERVAL_MS
        let rawL = maqueen.readPatrol(maqueen.Patrol.PatrolLeft)
        let rawR = maqueen.readPatrol(maqueen.Patrol.PatrolRight)
        // Invert: 0 from the sensor means ON the black line, and a lit
        // LED should mean "on the line". See the comment at lastLineL.
        let onL = rawL == 0 ? 1 : 0
        let onR = rawR == 0 ? 1 : 0
        if (cfgSent && onL != lastLineL) {
            lastLineL = onL
            if ((lastDriveL == 0 && lastDriveR == 0) || driveMode != MODE_MANUAL) sendValue("ln_l", "" + onL)
        }
        if (cfgSent && onR != lastLineR) {
            lastLineR = onR
            if ((lastDriveL == 0 && lastDriveR == 0) || driveMode != MODE_MANUAL) sendValue("ln_r", "" + onR)
        }

        // Line-following: steer toward whichever side has left the line.
        if (driveMode == MODE_LINE) {
            if (onL == 1 && onR == 1) {
                driveAuto(0, 1)          // both on the line -> straight
            } else if (onL == 1 && onR == 0) {
                driveAuto(-0.6, 0.4)     // drifted right -> bear left
            } else if (onL == 0 && onR == 1) {
                driveAuto(0.6, 0.4)      // drifted left -> bear right
            } else {
                // Both off the line. Pivot in place to hunt for it again
                // rather than driving on blind.
                driveAuto(0.8, 0)
            }
            lastDriveCmdAt = now        // keep the watchdog satisfied
        }
    }

    // ── Ultrasonic (HC-SR04) — AVOID MODE ONLY ───────────────────
    //
    // This sensor is expensive enough to define the feel of the whole
    // robot. Measured from the pxt-maqueen source, one readUlt() is
    // basic.pause(1) + basic.pause(20) + pins.pulseIn(..., 500*58) — a
    // 29ms timeout, so ~50ms per attempt. With no echo Ultrasonic()
    // retries up to four more times: ~250ms per call. pulseIn BUSY-WAITS
    // without yielding, so that is a hard freeze of the entire runtime,
    // not merely of this loop.
    //
    // "No echo" is the normal state for a robot pointing at open space,
    // so it hit that worst case almost every poll. Polling it
    // continuously to feed a gauge and a graph cost roughly 83% of the
    // robot's life at the original 300ms interval, and the symptom was
    // exactly what you would expect: motors and servos unresponsive,
    // then outright freezing.
    //
    // Earlier experiments tried mitigations such as skipping reads while
    // driving and adaptive backoff. The final latency fix is stronger:
    //
    //   - Manual/Line: NEVER call Ultrasonic(). Responsiveness wins.
    //   - Avoid: distance is required, so poll there and use adaptive
    //     backoff when the expensive no-echo result persists.
    // This is why Telemetry alone is not enough: even an unsent sensor
    // reading can freeze the runtime before BLE gets a chance to run.
    // Low-latency control build: never call Ultrasonic() in Manual/Line.
    // A no-echo read can busy-wait for ~250ms and freeze BLE command
    // handling. Avoid mode is the only mode where distance is required.
    let distWanted = driveMode == MODE_AVOID
    let busyDriving = (lastDriveL != 0 || lastDriveR != 0) && driveMode != MODE_AVOID
    if (distWanted && now >= nextDistAt && !busyDriving) {
        nextDistAt = now + distInterval
        if (cfgSent) {
            let cm = maqueen.Ultrasonic()
            // Adapt the next interval to what we just got back. 500 is
            // the "no echo" sentinel and is the reading that costs the
            // full ~250ms retry stall, so keep backing off while it
            // persists; any real distance restores the fast rate.
            if (cm >= 500 || cm <= 0) {
                distInterval = Math.min(distInterval * 2, DIST_INTERVAL_MAX_MS)
            } else {
                distInterval = DIST_INTERVAL_MS
            }
            // Decide what we'd report; -1 means "nothing to report".
            let reported = -1
            if (cm >= 500) {
                // pxt-maqueen's "no echo" sentinel. No echo means
                // nothing bounced back, i.e. the path is CLEAR — so
                // report the top of the gauge, not 0. Reporting 0 would
                // read as "obstacle touching the bumper", the exact
                // opposite of the truth.
                reported = DIST_MAX_CM
            } else if (cm > 0) {
                reported = Math.min(cm, DIST_MAX_CM)
            } else {
                // cm <= 0 is a bad read, not a measurement. Skip the
                // update and leave the last good value on screen rather
                // than inventing a number in either direction.
                dbg("dist: bad read (" + cm + ")")
            }
            // Raw value logged on every poll, so flipping debugEnabled
            // on answers "is this sensor alive at all?" directly rather
            // than by inference from the graph.
            dbg("dist raw=" + cm + " next=" + distInterval + "ms")

            // Sent on EVERY poll, deliberately not deduped. A change-only
            // rule is right for a gauge — a repeated identical number
            // tells the viewer nothing — but wrong for a graph, which is
            // a time series: with no new samples a steady reading draws
            // no points at all and looks like a dead feed. That is
            // exactly how it appeared when parked facing open space,
            // where every reading is the same 200 "no echo" sentinel.
            //
            // The cost is one short message per poll, and polls are
            // already rate-limited by distInterval and skipped entirely
            // while driving, so this adds very little traffic.
            //
            // The graph widget takes comma-separated numbers, one per
            // series; a single series means a bare number is the payload.
            //
            // The RAW cm goes to the graph, not the mapped `reported`.
            // `reported` folds pxt-maqueen's 500 "no echo" sentinel down
            // to DIST_MAX_CM (200), which made "nothing bounced back"
            // indistinguishable from "an object exactly 200cm away" — so
            // a sensor that never echoes looked identical to a clear
            // path, and the graph could not tell us which. Raw values
            // are unambiguous: a flat line at 500 means no echo, ever;
            // anything under 400 is a real measurement. The graph
            // auto-scales, so the wider range costs nothing.
            //
            // `reported` is still what drives the alert and Avoid mode,
            // where "no echo == far away" is the correct reading.
            if (cm > 0) {
                sendValue("graph_dist", "" + cm)
            }
            // The gauge gets the MAPPED value: on a dial, "no echo"
            // should read as a clear path (full scale), not as an
            // obstacle against the bumper. The graph gets the raw value
            // instead, so the two together still distinguish a dead
            // sensor from an empty room.
            if (reported >= 0) {
                sendValue("gauge_dist", "" + reported)
            }

            // Obstacle alert, with hysteresis so it fires once on
            // approach instead of chattering around the threshold: it
            // arms below ALERT_CM and only re-arms once the path is
            // clear past ALERT_CLEAR_CM.
            if (reported >= 0) {
                if (!alertActive && reported < ALERT_CM) {
                    alertActive = true
                    sendValue("alert", "Obstacle " + reported + "cm")
                    dbg("alert: obstacle at " + reported + "cm")
                } else if (alertActive && reported > ALERT_CLEAR_CM) {
                    alertActive = false
                    dbg("alert: cleared")
                }
            }

            // Obstacle avoidance: reverse briefly, then pivot, then
            // resume. Phases are driven by timestamps, never by pauses,
            // so the loop keeps servicing the radio and the watchdog.
            if (driveMode == MODE_AVOID) {
                if (avoidPhase == 0) {
                    if (reported >= 0 && reported < AVOID_STOP_CM) {
                        avoidPhase = 1
                        avoidUntil = now + 600
                        driveAuto(0, -1)         // back up
                    } else {
                        driveAuto(0, 1)          // path clear -> cruise
                    }
                } else if (avoidPhase == 1 && now >= avoidUntil) {
                    avoidPhase = 2
                    avoidUntil = now + 500
                    driveAuto(1, 0)              // pivot away
                } else if (avoidPhase == 2 && now >= avoidUntil) {
                    avoidPhase = 0
                }
                lastDriveCmdAt = now            // keep the watchdog satisfied
            }
        }
    }

    // Drain ONE queued debug line per tick (see dbg() above for why
    // this can't happen synchronously from onUartDataReceived). At
    // most 10/sec — plenty for discrete dpad/button/servo events,
    // and naturally paced by the same 100ms this loop already pauses.
    if (cfgSent && logQueue.length > 0 && (lastDriveL == 0 && lastDriveR == 0) && now - lastDriveCmdAt > 500) {
        bluetooth.uartWriteLine("LOG " + logQueue.shift())
    }

    basic.pause(100)
})
