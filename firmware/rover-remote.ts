/**
 * ╔════════════════════════════════════════════════════════════════╗
 * ║                    🤖 dfrobot-rover  🤖                        ║
 * ║             micro:bit V2 · micro:Driver DFR0548                ║
 * ║                  Powered by Workshop-DIY.org                   ║
 * ╚════════════════════════════════════════════════════════════════╝
 *
 * A rover that drives on two continuous-rotation servos and sees with an
 * HC-SR04P. Controlled over Bluetooth from the rxy web app, which asks the
 * robot for its own control panel on connect (GETCFG) and renders whatever
 * arrives.
 *
 * NO LIGHT STRIP: the 8-pixel NeoPixel header on P15 is wired, but nothing
 * here drives it. pxt-neopixel and Bluetooth will not share this board, and
 * between a light strip and a robot you can steer, the robot wins. Removed
 * in R1-v11; the code is still in git (819020c) if that ever changes.
 *
 * ── HARDWARE ────────────────────────────────────────────────────────
 *   left wheel servo   S1        360 degree, 90 = stop
 *   right wheel servo  S2        mounted mirrored -- see wheels()
 *   OLED 128x32        I2C       0x3C, shares the bus with the driver at 0x40
 *   HC-SR04P           P0 trig / P1 echo, powered at 3.3V
 *   NeoPixel x8        P15       wired but UNUSED -- see the note above
 *   battery 4xAA       DC socket, 3.5-5.5V
 *   free               P2 P12 P13 P14 P16   (P8 carries the tone pin, below)
 *
 * ── EXTENSIONS REQUIRED (two) ───────────────────────────────────────
 *   https://github.com/tinkertanker/pxt-oled-ssd1306   <- the screen (OLED)
 *   https://github.com/DFRobot/pxt-motor       <- paste this URL
 *   appears in MakeCode as:  motor
 *   provides:  motor.servo(), motor.MotorRun(), motor.motorStop()
 *
 *
 * ── ONE MORE, AND IT IS NOT IN THE GALLERY ──────────────────────────
 *   `settings` -- flash storage, this is where the wheel trim lives.
 *
 *   Searching Extensions for it finds NOTHING: it ships with the editor
 *   but is marked hidden, so it has to be added as a project dependency
 *   by hand. Explorer (bottom left) -> pxt.json -> add to dependencies:
 *
 *       "settings": "*"
 *
 *   "*" means the bundled copy, not a download. Without it every
 *   settings.* line fails with "Cannot find name 'settings'".
 *
 *   Data Logger does NOT bring it in -- that depends on flashlog.
 *   Paste the URL. Do NOT search by name: DFRobot published this as plain
 *   "motor", the most generic name on the platform, so a search returns a
 *   pile of look-alikes with this one somewhere among them. The wrong one
 *   compiles cleanly and moves nothing, which is a miserable thing to debug.
 *
 * ── HOW TO FLASH ────────────────────────────────────────────────────
 *   1. https://makecode.microbit.org -> new project
 *   2. Extensions -> paste the URL above
 *   3. Switch to the JavaScript view
 *   4. Paste this whole file, replacing what is there
 *   5. Gear icon -> Project Settings:
 *        No Pairing Required .......... ON   (else nothing can connect)
 *        Bluetooth UART service ....... ON   (the only service used here)
 *        every other Bluetooth service  OFF  (memory and advertising space)
 *   6. Download to the micro:bit
 *
 *   Radio and Bluetooth are mutually exclusive on this hardware: adding the
 *   Bluetooth extension REMOVES the radio package, and MakeCode asks you to
 *   accept that. No radio blocks are used in this file.
 *
 *   There is no local build. MakeCode compiles in the browser, so a clean
 *   paste IS the build step -- it is what proves this file, not a formality.
 *
 * ── STRUCTURE ───────────────────────────────────────────────────────
 *   Everything board-specific is in the HARDWARE SEAM below: wheels(),
 *   wheelsStop() and pingCm(). Everything after it is the shared rxy stack
 *   -- BLE, the chunked CFG transfer, the layout cache, telemetry, the drive
 *   watchdog, the D-pad mask. Changing driver board means rewriting those
 *   three functions and nothing else.
 *
 * ── DEBUGGING ───────────────────────────────────────────────────────
 *   Use dbg(), never serial.writeLine() directly: the queue exists because
 *   writing to a stalled link blocks the calling fiber and wedges the whole
 *   firmware, display included.
 */

// Bump this on every real change and check it (serial log + LED scroll
// at boot) to confirm what's actually flashed before debugging further —
// no more guessing whether a fix was really re-flashed.
const FIRMWARE_VERSION = "R1-v23"

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
// actively draining the buffer at that moment. The reference
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

// v48 CONFIG-NATIVE GAUGES + v47 FAST RECONNECT + v46 HARDENING
// ----------------------------------------------
// v46 fixed stale BLE sessions, but still retransmitted an unchanged layout
// on every reconnect. v47 adds a revision handshake:
//   GETCFGVER -> CFGVER <hash>
//   cache hit -> CFGOK <hash>        (no layout transfer)
//   cache miss -> GETCFG             (existing paced transfer)
// The browser caches by BluetoothDevice.id and the robot remains source of
// truth because any layout change produces a different CFG_REV.
//
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

// v47: config revision probe. Never write the reply from inside the UART RX
// callback; even this tiny response is queued to the main loop to preserve the
// reconnect hardening learned in v46.
let cfgVerPending = false
let cfgVerReplyAt = 0

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
// writeLine(). The reference firmware keeps the same flag for the same
// reason. cfgSent is NOT a substitute: it only tracks whether the
// layout was delivered, and it stays true across a link drop until the
// disconnect handler runs.
let btConnected = false

// ── TELEMETRY LEVEL ──────────────────────────────────────────────
// How much the robot pushes back to the app. Everything the firmware
// reports — uptime, distance, obstacle alert — is a UPD
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

// 🧭 v51 — CONFIG-DEFINED 1372 × 776 REFERENCE LAYOUT
// ---------------------------------------------------
// The widget geometry below now matches the agreed Arrange-mode reference.
// Unlike earlier releases, the canvas size is also stored in CFG:
//     "canvas":{"w":1372,"h":776}
// so compatible clients can reproduce the same composition instead of
// recalculating a different board size from widget extents.
//
// This is deliberately a configuration/layout change only. The v50 control,
// heartbeat, distance selector, BLE reconnect and low-latency motor behavior
// remain unchanged.
//
// 📦 Remote layout config (Base64 encoded JSON, 2389 bytes, 21 widgets).
// v48 CONFIG-NATIVE GAUGES
// ------------------------
// Servo 1, Servo 2 and Speed now each have a REAL `t:"gauge"` widget
// stored here in the MakeCode-delivered configuration. The gauges are no
// longer synthesized by one particular web app, so every compatible app
// receives the same IDs, positions, ranges, labels and model.
//
// Control/gauge pairs:
//   spd         -> gauge_spd    60..255
//
// Each gauge also carries `source:"<slider id>"`. Newer clients can mirror
// it locally with zero BLE traffic; older clients still receive paced
// `UPD gauge_* <value>` packets from this firmware.
//
// The config also includes initial `value` fields (90°, 90°, 200), matching
// the actual boot state, so even before telemetry arrives the controls do
// not falsely show minimum.
//
// DESIGN RULE LEARNED:
// If a visual relationship must look the same in several apps, define it
// as widgets + metadata in CFG. Do not hide it in app-specific CSS/JS.
//
// v52: derive the config revision from the actual embedded Base64 CFG.
// Any CFG byte change automatically changes CFGVER; no manual hash can go stale.
function cfgRevisionFromCfg(text: string): string {
    let hash = 5381 >>> 0
    for (let i = 0; i < text.length; i++) {
        hash = ((((hash << 5) + hash) ^ text.charCodeAt(i)) >>> 0)
    }
    return "d" + (hash >>> 0)
}

// >>> LAYOUTS — generated by gen_layout.py, do not edit by hand
const CFG_BEGINNER =
    "eyJ0aXRsZSI6IlJvdmVyIOKAlCBCZWdpbm5lciIsIndpZGdldHMiOlt7ImlkIjoiZ3JwX2RyaXZlIiwidCI6Imdy" +
    "b3VwIiwibGFiZWwiOiJEUklWRSIsImNvbG9yIjoiIzAwZDRmZiIsIngiOjU2LCJ5Ijo0MiwidyI6NjA4LCJoIjo0" +
    "NjIsImNoaWxkcmVuIjoiZHBhZF9tb3ZlLGJ0bl9zdG9wIn0seyJpZCI6ImdycF9zZWUiLCJ0IjoiZ3JvdXAiLCJs" +
    "YWJlbCI6IldIQVQgSVQgU0VFUyIsImNvbG9yIjoiI2ZmYjAyMCIsIngiOjczNiwieSI6NDIsInciOjQwOCwiaCI6" +
    "MjgyLCJjaGlsZHJlbiI6ImdhdWdlX2Rpc3QsYWxlcnQifSx7ImlkIjoiZ3JwX3N5cyIsInQiOiJncm91cCIsImxh" +
    "YmVsIjoiUk9CT1QiLCJjb2xvciI6IiM4ODkyYjAiLCJ4Ijo1NiwieSI6NTIyLCJ3Ijo0MDgsImgiOjE1MiwiY2hp" +
    "bGRyZW4iOiJsZXZlbCxsYmxfdmVyIn0seyJpZCI6ImRwYWRfbW92ZSIsInQiOiJkcGFkIiwieCI6ODAsInkiOjEw" +
    "MCwidyI6MzgwLCJoIjozODAsImxhYmVsIjoiRHJpdmUiLCJtb2RlbCI6ImNsYXNzaWMifSx7ImlkIjoiYnRuX3N0" +
    "b3AiLCJ0IjoiYnV0dG9uIiwieCI6NTAwLCJ5IjoxMDAsInciOjE0MCwiaCI6MTQwLCJsYWJlbCI6IlNUT1AifSx7" +
    "ImlkIjoiZ2F1Z2VfZGlzdCIsInQiOiJnYXVnZSIsIngiOjc2MCwieSI6MTAwLCJ3IjoyMjAsImgiOjIwMCwibGFi" +
    "ZWwiOiJEaXN0YW5jZSIsIm1pbiI6MCwibWF4IjoyMDAsInVuaXRzIjoiY20iLCJkZWNpbWFscyI6MCwibW9kZWwi" +
    "OiJjbGFzc2ljIn0seyJpZCI6ImFsZXJ0IiwidCI6Im5vdGlmaWNhdGlvbiIsIngiOjEwMTAsInkiOjExMCwidyI6" +
    "MTEwLCJoIjoxODAsImxhYmVsIjoiQWxlcnQifSx7ImlkIjoibGV2ZWwiLCJ0Ijoic2VsZWN0IiwieCI6ODAsInki" +
    "OjU4MCwidyI6MTcwLCJoIjo3MCwibGFiZWwiOiJMZXZlbCIsIm9wdGlvbnMiOiJCZWdpbm5lcixFeHBlcnQsRHJp" +
    "dmUsRGlzdGFuY2UsU2NyZWVuIn0seyJpZCI6ImxibF92ZXIiLCJ0IjoibGFiZWwiLCJ4IjoyODAsInkiOjU4MCwi" +
    "dyI6MTYwLCJoIjo3MCwibGFiZWwiOiJGaXJtd2FyZSIsIm1vZGVsIjoiY2FyZCJ9XSwiY2FudmFzIjp7InciOjEy" +
    "MDAsImgiOjczMH19"
const CFG_EXPERT =
    "eyJ0aXRsZSI6IlJvdmVyIOKAlCBFeHBlcnQiLCJ3aWRnZXRzIjpbeyJpZCI6ImdycF9kcml2ZSIsInQiOiJncm91" +
    "cCIsImxhYmVsIjoiRFJJVkUiLCJjb2xvciI6IiMwMGQ0ZmYiLCJ4Ijo1NiwieSI6NDIsInciOjg2OCwiaCI6OTUy" +
    "LCJjaGlsZHJlbiI6ImRwYWRfbW92ZSxzcGQsYnRuX3N0b3AsZ2F1Z2Vfc3BkLGJ0bl9tbCxidG5fbXIsdHJpbV9s" +
    "LHRyaW1fcix0cmltX2xfZG4sdHJpbV9sX251bSx0cmltX2xfdXAsdHJpbV9yX2RuLHRyaW1fcl9udW0sdHJpbV9y" +
    "X3VwIn0seyJpZCI6ImdycF9kaXN0IiwidCI6Imdyb3VwIiwibGFiZWwiOiJESVNUQU5DRSIsImNvbG9yIjoiI2Zm" +
    "YjAyMCIsIngiOjk3NiwieSI6NDUsInciOjUzOCwiaCI6OTQyLCJjaGlsZHJlbiI6ImdhdWdlX2Rpc3QsYWxlcnQs" +
    "ZGlzdF9yZWFkLGdyYXBoX2Rpc3Qsc3J2X2hlYWQsZ2F1Z2VfaGVhZCxidG5faGVhZF9jZW50ZXIsaGVhZF9tb2Rl" +
    "In0seyJpZCI6ImdycF9zeXMiLCJ0IjoiZ3JvdXAiLCJsYWJlbCI6IlNZU1RFTSIsImNvbG9yIjoiIzg4OTJiMCIs" +
    "IngiOjU2LCJ5IjoxMDAyLCJ3Ijo4NjQsImgiOjI4NywiY2hpbGRyZW4iOiJtb2RlLHVwZCxsZXZlbCxsYmxfdmVy" +
    "LGxibF9oZWFydGJlYXQsYnRuX2J1enoifSx7ImlkIjoiZ3JwX3NjcmVlbiIsInQiOiJncm91cCIsImxhYmVsIjoi" +
    "U0NSRUVOIiwiY29sb3IiOiIjYzA4NGZjIiwieCI6OTc5LCJ5IjoxMDA2LCJ3Ijo1NTAsImgiOjI3NywiY2hpbGRy" +
    "ZW4iOiJvbGVkX3RleHQsbGJsX29sZWQsc2NyZWVuX21vZGUifSx7ImlkIjoiZHBhZF9tb3ZlIiwidCI6ImRwYWQi" +
    "LCJ4Ijo4MCwieSI6NjMsInciOjQyMCwiaCI6NDIwLCJsYWJlbCI6IkRyaXZlIiwibW9kZWwiOiJjbGFzc2ljIn0s" +
    "eyJpZCI6InNwZCIsInQiOiJzbGlkZXIiLCJ4Ijo1MzIsInkiOjE0MiwidyI6MTIwLCJoIjoyNjAsImxhYmVsIjoi" +
    "U3BlZWQiLCJtaW4iOjYwLCJtYXgiOjI1NSwic3RlcCI6NSwidmFsdWUiOjIwMCwicmVzdG9yZSI6MX0seyJpZCI6" +
    "ImJ0bl9zdG9wIiwidCI6ImJ1dHRvbiIsIngiOjIyOCwieSI6MjA4LCJ3IjoxMjAsImgiOjEyMCwibGFiZWwiOiJT" +
    "VE9QIn0seyJpZCI6ImdhdWdlX3NwZCIsInQiOiJnYXVnZSIsIngiOjY2MiwieSI6MTYwLCJ3IjoyMzksImgiOjIz" +
    "MywibGFiZWwiOiJTcGVlZCIsIm1pbiI6NjAsIm1heCI6MjU1LCJkZWNpbWFscyI6MCwibW9kZWwiOiJtaW4iLCJz" +
    "b3VyY2UiOiJzcGQiLCJ2YWx1ZSI6MjAwfSx7ImlkIjoiYnRuX21sIiwidCI6ImJ1dHRvbiIsIngiOjE5NywieSI6" +
    "NTEwLCJ3IjoxOTAsImgiOjEyMCwibGFiZWwiOiJMZWZ0IHdoZWVsIiwiaWNvbiI6IuKame+4jyIsInNwaW4iOi0x" +
    "LCJjb2xvciI6IiMwZTc0OTAifSx7ImlkIjoiYnRuX21yIiwidCI6ImJ1dHRvbiIsIngiOjYwMSwieSI6NTA5LCJ3" +
    "IjoxOTAsImgiOjEyMCwibGFiZWwiOiJSaWdodCB3aGVlbCIsImljb24iOiLimpnvuI8iLCJzcGluIjoxLCJjb2xv" +
    "ciI6IiMwZTc0OTAifSx7ImlkIjoidHJpbV9sIiwidCI6InNsaWRlciIsIngiOjIxOCwieSI6NjQwLCJ3IjoxMjcs" +
    "ImgiOjI0NCwibGFiZWwiOiJUcmltIEwiLCJtaW4iOi0yMCwibWF4IjoyMCwidmFsdWUiOjB9LHsiaWQiOiJ0cmlt" +
    "X3IiLCJ0Ijoic2xpZGVyIiwieCI6NjQ4LCJ5Ijo2MzksInciOjEwMiwiaCI6MjM3LCJsYWJlbCI6IlRyaW0gUiIs" +
    "Im1pbiI6LTIwLCJtYXgiOjIwLCJ2YWx1ZSI6MH0seyJpZCI6InRyaW1fbF9kbiIsInQiOiJidXR0b24iLCJ4Ijox" +
    "MDgsInkiOjcxOSwidyI6MTAwLCJoIjoxMDAsImxhYmVsIjoiTCDiiJIgMSJ9LHsiaWQiOiJ0cmltX2xfbnVtIiwi" +
    "dCI6ImVkaXRmaWVsZCIsIngiOjIwOSwieSI6ODg4LCJ3IjoxNDEsImgiOjkyLCJsYWJlbCI6IkwgPSJ9LHsiaWQi" +
    "OiJ0cmltX2xfdXAiLCJ0IjoiYnV0dG9uIiwieCI6MzUzLCJ5Ijo3MTcsInciOjEwNywiaCI6MTA0LCJsYWJlbCI6" +
    "IkwgKyAxIn0seyJpZCI6InRyaW1fcl9kbiIsInQiOiJidXR0b24iLCJ4Ijo1MzgsInkiOjcxMywidyI6MTAwLCJo" +
    "IjoxMDAsImxhYmVsIjoiUiDiiJIgMSJ9LHsiaWQiOiJ0cmltX3JfbnVtIiwidCI6ImVkaXRmaWVsZCIsIngiOjYy" +
    "NSwieSI6ODg3LCJ3IjoxNDAsImgiOjk1LCJsYWJlbCI6IlIgPSJ9LHsiaWQiOiJ0cmltX3JfdXAiLCJ0IjoiYnV0" +
    "dG9uIiwieCI6NzU4LCJ5Ijo3MTIsInciOjEwMCwiaCI6MTAwLCJsYWJlbCI6IlIgKyAxIn0seyJpZCI6ImdhdWdl" +
    "X2Rpc3QiLCJ0IjoiZ2F1Z2UiLCJ4IjoxMDAwLCJ5IjoxMDMsInciOjIyMCwiaCI6MjAwLCJsYWJlbCI6IkRpc3Rh" +
    "bmNlIiwibWF4IjoyMDAsInVuaXRzIjoiY20iLCJkZWNpbWFscyI6MH0seyJpZCI6ImFsZXJ0IiwidCI6Im5vdGlm" +
    "aWNhdGlvbiIsIngiOjEyODcsInkiOjIyNiwidyI6MTA4LCJoIjo4MCwibGFiZWwiOiJBbGVydCJ9LHsiaWQiOiJk" +
    "aXN0X3JlYWQiLCJ0Ijoic2VsZWN0IiwieCI6MTIzNSwieSI6MTEzLCJ3IjoyMDMsImgiOjEwNSwibGFiZWwiOiJE" +
    "aXN0YW5jZSByZWFkIiwib3B0aW9ucyI6IkF1dG8sUmVhZCBub3cifSx7ImlkIjoiZ3JhcGhfZGlzdCIsInQiOiJn" +
    "cmFwaCIsIngiOjEwMDMsInkiOjMzMSwidyI6NDc0LCJoIjozNzEsImxhYmVsIjoiRGlzdGFuY2UgY20ifSx7Imlk" +
    "Ijoic3J2X2hlYWQiLCJ0Ijoic2xpZGVyIiwieCI6MTAwMCwieSI6NzMzLCJ3Ijo5OCwiaCI6MjI5LCJsYWJlbCI6" +
    "Ikxvb2siLCJtYXgiOjE4MCwidmFsdWUiOjkwfSx7ImlkIjoiZ2F1Z2VfaGVhZCIsInQiOiJnYXVnZSIsIngiOjEx" +
    "MjAsInkiOjczMywidyI6MTgxLCJoIjoyMjUsImxhYmVsIjoiQW5nbGUiLCJtYXgiOjE4MCwidW5pdHMiOiLCsCIs" +
    "ImRlY2ltYWxzIjowLCJtb2RlbCI6Im1pbiIsInNvdXJjZSI6InNydl9oZWFkIiwidmFsdWUiOjkwfSx7ImlkIjoi" +
    "YnRuX2hlYWRfY2VudGVyIiwidCI6ImJ1dHRvbiIsIngiOjEzNDMsInkiOjg0MiwidyI6MTE1LCJoIjoxMTcsImxh" +
    "YmVsIjoiQWhlYWQifSx7ImlkIjoiaGVhZF9tb2RlIiwidCI6InNlbGVjdCIsIngiOjEzMTUsInkiOjcyOSwidyI6" +
    "MTcyLCJoIjo4OSwibGFiZWwiOiJIZWFkIiwib3B0aW9ucyI6Ik1hbnVhbCxTd2VlcCJ9LHsiaWQiOiJtb2RlIiwi" +
    "dCI6InNlbGVjdCIsIngiOjgwLCJ5IjoxMDYwLCJ3IjoyMDAsImgiOjgxLCJsYWJlbCI6Ik1vZGUiLCJvcHRpb25z" +
    "IjoiTWFudWFsLEF2b2lkIn0seyJpZCI6InVwZCIsInQiOiJzZWxlY3QiLCJ4IjozNjEsInkiOjEwNjEsInciOjIz" +
    "OCwiaCI6ODcsImxhYmVsIjoiVGVsZW1ldHJ5Iiwib3B0aW9ucyI6IkFsbCxCYXNpYyxPZmYifSx7ImlkIjoibGV2" +
    "ZWwiLCJ0Ijoic2VsZWN0IiwieCI6NjgyLCJ5IjoxMDUzLCJ3IjoyMTAsImgiOjkwLCJsYWJlbCI6IkxldmVsIiwi" +
    "b3B0aW9ucyI6IkJlZ2lubmVyLEV4cGVydCxEcml2ZSxEaXN0YW5jZSxTY3JlZW4ifSx7ImlkIjoibGJsX3ZlciIs" +
    "InQiOiJsYWJlbCIsIngiOjgwLCJ5IjoxMTcwLCJ3IjoyMDAsImgiOjg3LCJsYWJlbCI6IkZpcm13YXJlIiwibW9k" +
    "ZWwiOiJjYXJkIn0seyJpZCI6ImxibF9oZWFydGJlYXQiLCJ0IjoibGFiZWwiLCJ4IjozNjUsInkiOjExNzUsInci" +
    "OjIzOSwiaCI6NzksImxhYmVsIjoiVXB0aW1lIiwibW9kZWwiOiJjYXJkIn0seyJpZCI6ImJ0bl9idXp6IiwidCI6" +
    "ImJ1dHRvbiIsIngiOjcwOSwieSI6MTE2MCwidyI6MTQ0LCJoIjo5OCwibGFiZWwiOiJCZWVwIn0seyJpZCI6Im9s" +
    "ZWRfdGV4dCIsInQiOiJlZGl0ZmllbGQiLCJ4Ijo5OTksInkiOjEwNDksInciOjMwOCwiaCI6MTE1LCJsYWJlbCI6" +
    "IlNheSBzb21ldGhpbmcifSx7ImlkIjoibGJsX29sZWQiLCJ0IjoibGFiZWwiLCJ4IjoxMDAxLCJ5IjoxMTcxLCJ3" +
    "Ijo1MTgsImgiOjEwMSwibGFiZWwiOiJPbiB0aGUgc2NyZWVuIiwibW9kZWwiOiJjYXJkIn0seyJpZCI6InNjcmVl" +
    "bl9tb2RlIiwidCI6InNlbGVjdCIsIngiOjEzMTUsInkiOjEwNTIsInciOjIwNCwiaCI6MTEyLCJsYWJlbCI6IlNj" +
    "cmVlbiIsIm9wdGlvbnMiOiJGYWNlLFN0YXR1cyxBdXRvLFJhZGFyIn1dLCJjYW52YXMiOnsidyI6MTU3MCwiaCI6" +
    "MTQxNn19"
const CFG_DRIVE =
    "eyJ0aXRsZSI6IlJvdmVyIOKAlCBEcml2ZSB0ZXN0Iiwid2lkZ2V0cyI6W3siaWQiOiJncnBfdGVzdCIsInQiOiJn" +
    "cm91cCIsImxhYmVsIjoiV0hFRUxTIiwiY29sb3IiOiIjMDBkNGZmIiwieCI6NTYsInkiOjQyLCJ3Ijo3NjgsImgi" +
    "Ojk2MiwiY2hpbGRyZW4iOiJkcGFkX21vdmUsc3BkLGJ0bl9zdG9wLGdhdWdlX3NwZCxidG5fbWwsYnRuX21yLHRy" +
    "aW1fbCx0cmltX3IsdHJpbV9sX2RuLHRyaW1fbF9udW0sdHJpbV9sX3VwLHRyaW1fcl9kbix0cmltX3JfbnVtLHRy" +
    "aW1fcl91cCxsZXZlbCJ9LHsiaWQiOiJkcGFkX21vdmUiLCJ0IjoiZHBhZCIsIngiOjgwLCJ5IjoxMDAsInciOjM0" +
    "MCwiaCI6MzQwLCJsYWJlbCI6IkRyaXZlIiwibW9kZWwiOiJjbGFzc2ljIn0seyJpZCI6InNwZCIsInQiOiJzbGlk" +
    "ZXIiLCJ4Ijo0NjAsInkiOjEwMCwidyI6MTEwLCJoIjoyNDAsImxhYmVsIjoiU3BlZWQiLCJtaW4iOjYwLCJtYXgi" +
    "OjI1NSwic3RlcCI6NSwidmFsdWUiOjIwMH0seyJpZCI6ImJ0bl9zdG9wIiwidCI6ImJ1dHRvbiIsIngiOjYxMCwi" +
    "eSI6MTAwLCJ3IjoxMjAsImgiOjEyMCwibGFiZWwiOiJTVE9QIn0seyJpZCI6ImdhdWdlX3NwZCIsInQiOiJnYXVn" +
    "ZSIsIngiOjYxMCwieSI6MjUwLCJ3IjoxOTAsImgiOjE5MCwibGFiZWwiOiJTcGVlZCIsIm1pbiI6NjAsIm1heCI6" +
    "MjU1LCJkZWNpbWFscyI6MCwibW9kZWwiOiJtaW4iLCJzb3VyY2UiOiJzcGQiLCJ2YWx1ZSI6MjAwfSx7ImlkIjoi" +
    "YnRuX21sIiwidCI6ImJ1dHRvbiIsIngiOjgwLCJ5Ijo0ODAsInciOjE5MCwiaCI6MTIwLCJsYWJlbCI6IkxlZnQg" +
    "d2hlZWwiLCJpY29uIjoi4pqZ77iPIiwic3BpbiI6LTEsImNvbG9yIjoiIzBlNzQ5MCJ9LHsiaWQiOiJidG5fbXIi" +
    "LCJ0IjoiYnV0dG9uIiwieCI6MjkwLCJ5Ijo0ODAsInciOjE5MCwiaCI6MTIwLCJsYWJlbCI6IlJpZ2h0IHdoZWVs" +
    "IiwiaWNvbiI6IuKame+4jyIsInNwaW4iOjEsImNvbG9yIjoiIzBlNzQ5MCJ9LHsiaWQiOiJ0cmltX2wiLCJ0Ijoi" +
    "c2xpZGVyIiwieCI6ODAsInkiOjY2MCwidyI6MTAwLCJoIjoyMTAsImxhYmVsIjoiVHJpbSBMIiwibWluIjotMjAs" +
    "Im1heCI6MjAsInN0ZXAiOjEsInZhbHVlIjowfSx7ImlkIjoidHJpbV9yIiwidCI6InNsaWRlciIsIngiOjIwMCwi" +
    "eSI6NjYwLCJ3IjoxMDAsImgiOjIxMCwibGFiZWwiOiJUcmltIFIiLCJtaW4iOi0yMCwibWF4IjoyMCwic3RlcCI6" +
    "MSwidmFsdWUiOjB9LHsiaWQiOiJ0cmltX2xfZG4iLCJ0IjoiYnV0dG9uIiwieCI6MzIwLCJ5Ijo2NjAsInciOjEw" +
    "MCwiaCI6MTAwLCJsYWJlbCI6Ikwg4oiSIDEifSx7ImlkIjoidHJpbV9sX251bSIsInQiOiJlZGl0ZmllbGQiLCJ4" +
    "Ijo0MzAsInkiOjY3NSwidyI6MTAwLCJoIjo3MCwibGFiZWwiOiJMID0ifSx7ImlkIjoidHJpbV9sX3VwIiwidCI6" +
    "ImJ1dHRvbiIsIngiOjU0MCwieSI6NjYwLCJ3IjoxMDAsImgiOjEwMCwibGFiZWwiOiJMICsgMSJ9LHsiaWQiOiJ0" +
    "cmltX3JfZG4iLCJ0IjoiYnV0dG9uIiwieCI6MzIwLCJ5Ijo3NzAsInciOjEwMCwiaCI6MTAwLCJsYWJlbCI6IlIg" +
    "4oiSIDEifSx7ImlkIjoidHJpbV9yX251bSIsInQiOiJlZGl0ZmllbGQiLCJ4Ijo0MzAsInkiOjc4NSwidyI6MTAw" +
    "LCJoIjo3MCwibGFiZWwiOiJSID0ifSx7ImlkIjoidHJpbV9yX3VwIiwidCI6ImJ1dHRvbiIsIngiOjU0MCwieSI6" +
    "NzcwLCJ3IjoxMDAsImgiOjEwMCwibGFiZWwiOiJSICsgMSJ9LHsiaWQiOiJsZXZlbCIsInQiOiJzZWxlY3QiLCJ4" +
    "Ijo4MCwieSI6OTEwLCJ3IjoxNzAsImgiOjcwLCJsYWJlbCI6IkxldmVsIiwib3B0aW9ucyI6IkJlZ2lubmVyLEV4" +
    "cGVydCxEcml2ZSxEaXN0YW5jZSxTY3JlZW4ifV0sImNhbnZhcyI6eyJ3Ijo4ODAsImgiOjEwNjB9fQ=="
const CFG_DIST =
    "eyJ0aXRsZSI6IlJvdmVyIOKAlCBEaXN0YW5jZSB0ZXN0Iiwid2lkZ2V0cyI6W3siaWQiOiJncnBfdGVzdCIsInQi" +
    "OiJncm91cCIsImxhYmVsIjoiRElTVEFOQ0UiLCJjb2xvciI6IiNmZmIwMjAiLCJ4Ijo1NiwieSI6NDIsInciOjY4" +
    "OCwiaCI6NzUyLCJjaGlsZHJlbiI6ImdhdWdlX2Rpc3QsYWxlcnQsZGlzdF9yZWFkLGdyYXBoX2Rpc3Qsc3J2X2hl" +
    "YWQsZ2F1Z2VfaGVhZCxidG5faGVhZF9jZW50ZXIsaGVhZF9tb2RlLGxldmVsIn0seyJpZCI6ImdhdWdlX2Rpc3Qi" +
    "LCJ0IjoiZ2F1Z2UiLCJ4Ijo4MCwieSI6MTAwLCJ3IjoyMjAsImgiOjIwMCwibGFiZWwiOiJEaXN0YW5jZSIsIm1p" +
    "biI6MCwibWF4IjoyMDAsInVuaXRzIjoiY20iLCJkZWNpbWFscyI6MCwibW9kZWwiOiJjbGFzc2ljIn0seyJpZCI6" +
    "ImFsZXJ0IiwidCI6Im5vdGlmaWNhdGlvbiIsIngiOjMzMCwieSI6MTEwLCJ3IjoxMTAsImgiOjE4MCwibGFiZWwi" +
    "OiJBbGVydCJ9LHsiaWQiOiJkaXN0X3JlYWQiLCJ0Ijoic2VsZWN0IiwieCI6ODAsInkiOjMzMCwidyI6MTgwLCJo" +
    "Ijo3MCwibGFiZWwiOiJEaXN0YW5jZSByZWFkIiwib3B0aW9ucyI6IkF1dG8sUmVhZCBub3cifSx7ImlkIjoiZ3Jh" +
    "cGhfZGlzdCIsInQiOiJncmFwaCIsIngiOjgwLCJ5Ijo0MzAsInciOjQyMCwiaCI6MjQwLCJsYWJlbCI6IkRpc3Rh" +
    "bmNlIGNtIiwibW9kZWwiOiJncmlkIiwid2luZG93U2VjIjozMCwic2VyaWVzIjoxfSx7ImlkIjoic3J2X2hlYWQi" +
    "LCJ0Ijoic2xpZGVyIiwieCI6NTQwLCJ5IjoxMDAsInciOjEwMCwiaCI6MTkwLCJsYWJlbCI6Ikxvb2siLCJtaW4i" +
    "OjAsIm1heCI6MTgwLCJzdGVwIjoxLCJ2YWx1ZSI6OTB9LHsiaWQiOiJnYXVnZV9oZWFkIiwidCI6ImdhdWdlIiwi" +
    "eCI6NTQwLCJ5IjozMjAsInciOjE4MCwiaCI6MTkwLCJsYWJlbCI6IkFuZ2xlIiwibWluIjowLCJtYXgiOjE4MCwi" +
    "dW5pdHMiOiLCsCIsImRlY2ltYWxzIjowLCJtb2RlbCI6Im1pbiIsInNvdXJjZSI6InNydl9oZWFkIiwidmFsdWUi" +
    "OjkwfSx7ImlkIjoiYnRuX2hlYWRfY2VudGVyIiwidCI6ImJ1dHRvbiIsIngiOjU0MCwieSI6NTQwLCJ3IjoxMjAs" +
    "ImgiOjEyMCwibGFiZWwiOiJBaGVhZCJ9LHsiaWQiOiJoZWFkX21vZGUiLCJ0Ijoic2VsZWN0IiwieCI6NTQwLCJ5" +
    "Ijo2OTAsInciOjE3MCwiaCI6NzAsImxhYmVsIjoiSGVhZCIsIm9wdGlvbnMiOiJNYW51YWwsU3dlZXAifSx7Imlk" +
    "IjoibGV2ZWwiLCJ0Ijoic2VsZWN0IiwieCI6ODAsInkiOjcwMCwidyI6MTcwLCJoIjo3MCwibGFiZWwiOiJMZXZl" +
    "bCIsIm9wdGlvbnMiOiJCZWdpbm5lcixFeHBlcnQsRHJpdmUsRGlzdGFuY2UsU2NyZWVuIn1dLCJjYW52YXMiOnsi" +
    "dyI6ODAwLCJoIjo4NTB9fQ=="
const CFG_SCREEN =
    "eyJ0aXRsZSI6IlJvdmVyIOKAlCBTY3JlZW4gdGVzdCIsIndpZGdldHMiOlt7ImlkIjoiZ3JwX3Rlc3QiLCJ0Ijoi" +
    "Z3JvdXAiLCJsYWJlbCI6IlNDUkVFTiIsImNvbG9yIjoiI2MwODRmYyIsIngiOjU2LCJ5Ijo0MiwidyI6NjY4LCJo" +
    "IjozOTIsImNoaWxkcmVuIjoib2xlZF90ZXh0LGxibF9vbGVkLGJ0bl9idXp6LHNjcmVlbl9tb2RlLGxldmVsIn0s" +
    "eyJpZCI6Im9sZWRfdGV4dCIsInQiOiJlZGl0ZmllbGQiLCJ4Ijo4MCwieSI6MTAwLCJ3IjozODAsImgiOjkwLCJs" +
    "YWJlbCI6IlNheSBzb21ldGhpbmcifSx7ImlkIjoibGJsX29sZWQiLCJ0IjoibGFiZWwiLCJ4Ijo4MCwieSI6MjIw" +
    "LCJ3IjozODAsImgiOjgwLCJsYWJlbCI6Ik9uIHRoZSBzY3JlZW4iLCJtb2RlbCI6ImNhcmQifSx7ImlkIjoiYnRu" +
    "X2J1enoiLCJ0IjoiYnV0dG9uIiwieCI6NTAwLCJ5IjoxMDAsInciOjEyMCwiaCI6MTIwLCJsYWJlbCI6IkJlZXAi" +
    "fSx7ImlkIjoic2NyZWVuX21vZGUiLCJ0Ijoic2VsZWN0IiwieCI6NTAwLCJ5IjoyNTAsInciOjIwMCwiaCI6NzAs" +
    "ImxhYmVsIjoiU2NyZWVuIiwib3B0aW9ucyI6IkZhY2UsU3RhdHVzLEF1dG8sUmFkYXIifSx7ImlkIjoibGV2ZWwi" +
    "LCJ0Ijoic2VsZWN0IiwieCI6ODAsInkiOjM0MCwidyI6MTcwLCJoIjo3MCwibGFiZWwiOiJMZXZlbCIsIm9wdGlv" +
    "bnMiOiJCZWdpbm5lcixFeHBlcnQsRHJpdmUsRGlzdGFuY2UsU2NyZWVuIn1dLCJjYW52YXMiOnsidyI6NzgwLCJo" +
    "Ijo0OTB9fQ=="
const IDS_BEGINNER = ",dpad_move,btn_stop,gauge_dist,alert,level,lbl_ver,"
const IDS_EXPERT = ",dpad_move,spd,btn_stop,gauge_spd,btn_ml,btn_mr,trim_l,trim_r,trim_l_dn,trim_l_num,trim_l_up,trim_r_dn,trim_r_num,trim_r_up,gauge_dist,alert,dist_read,graph_dist,srv_head,gauge_head,btn_head_center,head_mode,mode,upd,level,lbl_ver,lbl_heartbeat,btn_buzz,oled_text,lbl_oled,screen_mode,"
const IDS_DRIVE = ",dpad_move,spd,btn_stop,gauge_spd,btn_ml,btn_mr,trim_l,trim_r,trim_l_dn,trim_l_num,trim_l_up,trim_r_dn,trim_r_num,trim_r_up,level,"
const IDS_DIST = ",gauge_dist,alert,dist_read,graph_dist,srv_head,gauge_head,btn_head_center,head_mode,level,"
const IDS_SCREEN = ",oled_text,lbl_oled,btn_buzz,screen_mode,level,"
// <<< LAYOUTS

// Which panel the rover serves. All four are compiled in; the Level selector
// switches between them and the robot pushes the new one immediately.
//
// `level` MUST appear in every layout. If it existed only in Expert, choosing
// Beginner would strand the robot there until it was reflashed.
const LAYOUT_BEGINNER = 0
const LAYOUT_EXPERT = 1
const LAYOUT_DRIVE = 2
const LAYOUT_DIST = 3
const LAYOUT_SCREEN = 4
let layoutLevel = LAYOUT_EXPERT

// Deliberately `let`, and deliberately still called CFG: every line that
// chunks the transfer already reads CFG.length and CFG.substr(), so pointing
// this at a different blob switches panels without touching the transfer code
// at all.
let CFG = CFG_EXPERT

// Comma-wrapped id list of the panel currently being served, so telemetry can
// skip anything the panel cannot display. On a link that sends 18 characters
// every 35ms, publishing a value nobody can see is not free.
let activeIds = IDS_EXPERT

// Computed from whichever blob is active, so switching panel changes the
// revision too and the app cannot serve a cached copy of the wrong one.
let CFG_REV = cfgRevisionFromCfg(CFG)

function onPanel(id: string): boolean {
    // Wrapped in commas on both sides so "spd" cannot match "gauge_spd".
    return activeIds.indexOf("," + id + ",") >= 0
}

function applyLayout(level: number) {
    layoutLevel = level
    if (level == LAYOUT_EXPERT) { CFG = CFG_EXPERT; activeIds = IDS_EXPERT }
    else if (level == LAYOUT_DRIVE) { CFG = CFG_DRIVE; activeIds = IDS_DRIVE }
    else if (level == LAYOUT_DIST) { CFG = CFG_DIST; activeIds = IDS_DIST }
    else if (level == LAYOUT_SCREEN) { CFG = CFG_SCREEN; activeIds = IDS_SCREEN }
    else { CFG = CFG_BEGINNER; activeIds = IDS_BEGINNER }
    CFG_REV = cfgRevisionFromCfg(CFG)
}


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
    else if (cmd == "GETCFGVER") {
        // v47 fast reconnect: answer with only the layout revision first.
        // The browser can reuse its cached config and avoid the ~2 second
        // CFGBEGIN/CFG/CFGEND stream when nothing changed.
        cfgVerPending = true
        cfgVerReplyAt = input.runningTime() + 20
    }
    else if (cmd.indexOf("CFGOK ") == 0) {
        // Cache-hit acknowledgement from the browser. cfgSent means
        // "the peer has a usable layout", not strictly "we transmitted CFG
        // this session". This keeps Line/Avoid + telemetry enabled on the
        // fast reconnect path.
        let rev = cmd.substr(6)
        if (rev == CFG_REV) {
            cfgSent = true
            cfgTxActive = false
            versionSent = false
            scheduleInitialUiSync()
            requestGlyph(GLYPH_CONNECTED)
        }
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
// 🕹️ DRIVE MIX — ported from the reference drive-pad implementation
// joystick handler. nx = turn (right positive), ny = forward
// (up positive), both in -1..1. DRIVE_REF matches the 200 (not 255)
// ceiling the reference itself uses — deliberately leaves headroom
// rather than maxing out the motor driver.
// ═══════════════════════════════════════════════════════════════

// Top speed, now live-adjustable from the Speed slider instead of a
// constant. 200 (not 255) remains the default, matching the ceiling
// The reference uses — it deliberately leaves headroom rather than
// maxing out the motor driver. Autonomous modes below use it too, so
// one slider governs manual and self-driving alike.
let driveSpeed = 200

// v48 UI MIRROR STATE
// -------------------
// The Servo 1, Servo 2 and Speed gauges are real widgets in CFG.
// Do NOT transmit their UPD messages from the BLE RX callback: v46 showed
// that callback-side TX can destabilize reconnects. Handlers only mark the
// latest value dirty; the forever loop coalesces and publishes it later.
let uiGaugeSpdDirty = false
let uiGaugeHeadDirty = false
let trimEchoDue = false
let uiGaugeLastInputAt = 0
let uiGaugeTxNextAt = 0
let uiInitialSyncStage = 0
const UI_GAUGE_SETTLE_MS = 90
const UI_GAUGE_TX_GAP_MS = 45

function scheduleInitialUiSync() {
    // The panel renders sliders at their layout defaults, so without this the
    // freshly connected app would show 0/0 over a rover that is in fact
    // trimmed -- and the first drag would then throw the calibration away.
    trimEchoDue = true
    uiInitialSyncStage = 1
    uiGaugeTxNextAt = input.runningTime() + 80
}

function sendUiValue(id: string, val: string) {
    // These are control-state mirrors, not optional sensor telemetry.
    if (!btConnected || !cfgSent) return
    if (!onPanel(id)) return
    bluetooth.uartWriteLine("UPD " + id + " " + val)
}

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
// The reference firmware is the model here: its drive path
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
// Set by the Buzz handler, played by the loop — never from the RX callback.
let pendingBeep = false
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

// The motor driver is I2C-based (not direct PWM). Generic
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
const MODE_AVOID = 2
let driveMode = MODE_MANUAL

// Obstacle-avoid + alert thresholds.
const AVOID_STOP_CM = 35        // back away closer than this
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

// ═══════════════════════════════════════════════════════════════
// 🔌 HARDWARE SEAM — everything board-specific lives here
// Extensions needed in MakeCode: DFRobot/pxt-motor  (paste the URL; searching
// for "motor" offers several look-alikes and the wrong one compiles cleanly
// and moves nothing).
//
// The rest of this file — BLE, CFG chunking, the GETCFGVER cache, telemetry,
// the drive watchdog, the D-pad mask — is unchanged from the donor firmware and
// should stay diffable against it. Swapping to another driver board means
// rewriting these functions and nothing else.
// ═══════════════════════════════════════════════════════════════

const PIN_TRIG = DigitalPin.P0
const PIN_ECHO = DigitalPin.P1

// Continuous-rotation servos: 90 is stop, 0 and 180 are full speed each way.
const WHEEL_STOP = 90

// Straight-line trim, one per wheel, in degrees of pulse. Positive = that
// wheel drives MORE forward. Two 360-degree servos never run at matched
// speeds out of the box, so without this a rover always curves.
let trimL = 0
let trimR = 0

// ── TRIM THAT SURVIVES THE BATTERY ──────────────────────────────────
// The rover keeps its own calibration in flash, so a trimmed robot stays
// trimmed through a power cycle, a reflash of the same program, and a move
// to a different browser or tablet. Before this the APP remembered it, which
// meant the calibration followed the phone rather than the robot it belongs
// to -- and two rovers swapped between children swapped their trim with them.
//
// V2 ONLY. The settings library is excluded from the V1/DAL build
// (disablesVariants: mbdal in pxt-microbit), which is fine: this rover is
// already V2-only for Bluetooth plus the screen.
const TRIM_KEY_L = "trimL"
const TRIM_KEY_R = "trimR"
const FACE_KEY = "face"

// Declared here, beside the other stored prefs, because prefsLoad() and
// prefsSaveTick() sit above the face code and read them.
//
// AUTO is the interesting one: the status text before a connection, when the
// only thing you need from the glass is WHICH micro:bit this is, and the face
// afterwards, when the app is already showing you every number. Status stays
// the default so a rover that has never been asked behaves as it always did.
const SCREEN_STATUS = 0
const SCREEN_FACE = 1
const SCREEN_AUTO = 2
const SCREEN_RADAR = 3
let screenMode = SCREEN_STATUS

// Disconnected, the glass ALWAYS shows the status text, whatever the setting.
// The only question worth answering before a link exists is WHICH micro:bit
// this is -- the browser's chooser lists these names and they all look alike,
// so a rover showing eyes or a radar sweep is withholding the one fact you
// need. Face and Radar are therefore about what happens once connected.
function faceWanted(): boolean {
    if (!btConnected) return false
    return screenMode == SCREEN_FACE || screenMode == SCREEN_AUTO
}

// Written on settle, never per event. A slider drag is a stream of values and
// flash has a finite number of erase cycles, so a write per event would spend
// the chip's life calibrating one robot. Two seconds after you stop moving,
// one write.
const TRIM_SAVE_SETTLE_MS = 2000
let trimSaveAt = 0
let trimSaveDue = false

function prefsTouched() {
    trimSaveDue = true
    trimSaveAt = input.runningTime() + TRIM_SAVE_SETTLE_MS
}

// exists() first: readNumber() returns `undefined` for a key that was never
// written, and a number variable holding undefined is not something to find
// out about while the wheels are turning.
function prefsLoad() {
    if (settings.exists(TRIM_KEY_L)) {
        trimL = Math.constrain(settings.readNumber(TRIM_KEY_L), -20, 20)
    }
    if (settings.exists(TRIM_KEY_R)) {
        trimR = Math.constrain(settings.readNumber(TRIM_KEY_R), -20, 20)
    }
    if (settings.exists(FACE_KEY)) {
        // 0/1 from R1-v16 still land on Status/Face, so an already-flashed
        // rover keeps whatever it was set to.
        screenMode = Math.constrain(settings.readNumber(FACE_KEY), 0, 3)
    }
    dbg("prefs loaded: L=" + trimL + " R=" + trimR + " screen=" + screenMode)
}

function prefsSaveTick(now: number) {
    if (!trimSaveDue || now < trimSaveAt) return
    trimSaveDue = false
    settings.writeNumber(TRIM_KEY_L, trimL)
    settings.writeNumber(TRIM_KEY_R, trimR)
    settings.writeNumber(FACE_KEY, screenMode)
    dbg("prefs saved: L=" + trimL + " R=" + trimR + " screen=" + screenMode)
}

// The mirror matters: the right servo faces the opposite way on the chassis,
// so forward is DOWN from 90 on that side and UP on the left. Trim therefore
// has to be subtracted on the right to mean "more forward" on both wheels --
// adding it to both is what made the ESP32 rover curve right (S2-v3).
function wheels(l: number, r: number) {
    let pl = WHEEL_STOP + Math.idiv(l * 90, DRIVE_SPEED_MAX) + trimL
    let pr = WHEEL_STOP - Math.idiv(r * 90, DRIVE_SPEED_MAX) - trimR
    motor.servo(motor.Servos.S1, Math.constrain(pl, 0, 180))
    motor.servo(motor.Servos.S2, Math.constrain(pr, 0, 180))
}

function wheelsStop() {
    motor.servo(motor.Servos.S1, WHEEL_STOP + trimL)
    motor.servo(motor.Servos.S2, WHEEL_STOP - trimR)
}

// ── SCREEN (128x32 OLED on the I2C bus) ─────────────────────────────
// Extension: https://github.com/tinkertanker/pxt-oled-ssd1306  (namespace OLED)
//
// That library hardcodes the two registers that tell an SSD1306 how many rows
// it physically has -- multiplex ratio 0xA8 and COM pin config 0xDA -- at the
// 128x64 values, and its own command() is private, so the correction is sent
// here over raw I2C instead. Without it a 128x32 panel initialises with no
// error at all and draws every line doubled and interlaced.
const OLED_ADDR = 0x3C
const OLED_COLS = 21          // characters that fit across at the default font

function oledCmd(c: number) {
    const b = pins.createBuffer(2)
    b.setNumber(NumberFormat.UInt8LE, 0, 0x00)   // 0x00 = "a command follows"
    b.setNumber(NumberFormat.UInt8LE, 1, c)
    pins.i2cWriteBuffer(OLED_ADDR, b)
}

function oledInit() {
    // Argument order follows the library's own signature, init(width, height).
    // Its README example passes (64, 128) for a 128x64 panel, which reads as
    // (height, width) -- the two disagree. If the text comes out at the wrong
    // scale, swap these before suspecting anything else.
    OLED.init(128, 32)
    oledCmd(0xA8); oledCmd(0x1F)     // 32 rows, not 64
    oledCmd(0xDA); oledCmd(0x02)     // COM pins for a 32-row panel
    OLED.clear()
}

// What the app asked to display. Empty means "show the status instead".
let oledText = ""
let oledShown = ""      // impossible first value, so the mirror always sends once
let oledDirty = true

// Last good distance, kept for the screen. The reading itself is a local in
// the sensor path, and a bad read must leave the old number up rather than
// invent one.
let lastDistCm = -1

// ── WHAT A REPAINT COSTS ────────────────────────────────────────────
// The font is 5x8 on a 6px advance, so this panel is 21 columns by FOUR rows
// -- the old two-line banner was using half the glass. But drawChar() spends
// ten I2C transactions per character (four to set the address window, six for
// the columns), and the extension exports no cursor move: clear() is the only
// way back to the top left. Every repaint is therefore a full clear plus every
// character again, on the same bus as the servo driver, inside a loop that
// feeds the drive watchdog.
//
// So the screen carries things that change SLOWLY, distance is rounded to 5cm
// so sensor jitter cannot trigger a repaint on its own, and there is
// deliberately no clock -- a ticking second would force a full repaint every
// second forever. A parked rover costs no I2C at all.
const OLED_ROWS = 4
const OLED_REFRESH_MS = 120
let oledCheckAt = 0
let oledOnGlass: string[] = ["", "", "", ""]

// Right-aligned, so 99 -> 100 does not shove the rest of the line sideways.
function oledNum(n: number, w: number): string {
    let s = "" + n
    while (s.length < w) s = " " + s
    return s
}

function oledPad(s: string, w: number): string {
    while (s.length < w) s = s + " "
    return s
}

function oledSigned(n: number): string {
    return n > 0 ? "+" + n : "" + n
}

// The four lines, built fresh and compared before anything is drawn.
function oledLines(): string[] {
    const out: string[] = []
    if (oledText.length > 0) {
        // A typed message owns the top half; the status keeps the bottom.
        out.push(oledText.substr(0, OLED_COLS))
        out.push(oledText.length > OLED_COLS ? oledText.substr(OLED_COLS, OLED_COLS) : "")
    } else {
        // Disconnected, the useful thing is WHICH micro:bit this is. The
        // browser's chooser lists these names and they all look alike, so
        // picking your robot out of a classroom is otherwise a guess.
        out.push(btConnected
            ? oledPad(FIRMWARE_VERSION, 12) + (driveMode == MODE_AVOID ? "Avoid" : "Manual")
            : "micro:bit " + control.deviceName())
        out.push(lastDistCm < 0
            ? "Dist   -- cm"
            : "Dist " + oledNum(Math.idiv(lastDistCm, 5) * 5, 4) + " cm")
    }
    // Trim is on the glass because it now lives in the rover's own flash: this
    // is how you check the robot you just picked up is the one you calibrated,
    // without connecting to it first.
    out.push("Trim L " + oledPad(oledSigned(trimL), 4) + "R " + oledSigned(trimR))
    out.push("Speed " + oledNum(driveSpeed, 3) + "  Head " + oledNum(headAngle, 3))
    return out
}

// What the app's "On the screen" card mirrors. Deliberately the MESSAGE,
// truncated exactly as drawn, and NOT line 1 of the status: that card sits
// beside "Say something" and exists so a message too long for the panel is
// seen getting cut off, rather than the app and the glass quietly disagreeing.
//
// R1-v14 pointed this at oledLines()[0], which was faithful and useless -- with
// nothing typed the glass shows the version and the mode, so the card printed
// the firmware version a second time, immediately beside the card that already
// shows it.
function oledCurrent(): string {
    if (oledText.length > 0) return oledText.substr(0, OLED_COLS)
    return "(showing status)"
}


// -- THE FACE --------------------------------------------------------
// Two eyes instead of the status text -- an OPTION, chosen with the Screen
// selector and remembered in flash beside the trim, not something that
// happens to you.
//
// It cannot be drawn with the OLED extension. drawFilledCircle() calls
// drawLine() once per column, every drawLine() ends in drawShape(), and
// drawShape() spends six command writes plus a data write for EACH
// column-page it touches: one filled circle is several hundred I2C
// transactions. So the face keeps its own framebuffer and pushes whole
// frames -- eight writes of 65 bytes for the entire screen, against ten
// transactions per character on the text path.
const FB_W = 128
const FB_PAGES = 4
const FB_SIZE = FB_W * FB_PAGES
let fb: Buffer = null
let fbTx: Buffer = null          // reused, so drawing a frame allocates nothing

function fbInit() {
    fb = pins.createBuffer(FB_SIZE)
    fbTx = pins.createBuffer(65)
    fbTx[0] = 0x40               // "data follows", once, for every chunk
}

// Bytes are VERTICAL: bit b of page p is row p*8+b. Filling by column-page
// with a mask keeps this to at most 128x4 writes rather than one per pixel,
// which matters because this runs in the MakeCode interpreter, not in C.
function fbRect(x: number, y: number, w: number, h: number, on: boolean) {
    const y0 = Math.max(0, y)
    const y1 = Math.min(FB_PAGES * 8 - 1, y + h - 1)
    const x0 = Math.max(0, x)
    const x1 = Math.min(FB_W - 1, x + w - 1)
    if (y1 < y0 || x1 < x0) return
    for (let page = y0 >> 3; page <= (y1 >> 3); page++) {
        const top = Math.max(y0, page * 8)
        const bot = Math.min(y1, page * 8 + 7)
        let mask = 0
        for (let b = top; b <= bot; b++) mask = mask | (1 << (b & 7))
        for (let px = x0; px <= x1; px++) {
            const i = page * FB_W + px
            fb[i] = on ? (fb[i] | mask) : (fb[i] & (~mask & 0xFF))
        }
    }
}

function fbFlush() {
    oledCmd(0x21); oledCmd(0); oledCmd(FB_W - 1)        // column window
    oledCmd(0x22); oledCmd(0); oledCmd(FB_PAGES - 1)    // page window
    for (let off = 0; off < FB_SIZE; off += 64) {
        for (let i = 0; i < 64; i++) fbTx[i + 1] = fb[off + i]
        pins.i2cWriteBuffer(OLED_ADDR, fbTx, false)
    }
}


// A SINGLE column, which is what makes the radar affordable: the sweep moves
// one step at a time, so only one column of the picture can have changed.
// Four bytes and six commands, against 512 bytes for a whole frame.
function fbFlushCol(x: number) {
    oledCmd(0x21); oledCmd(x); oledCmd(x)
    oledCmd(0x22); oledCmd(0); oledCmd(FB_PAGES - 1)
    const b = pins.createBuffer(1 + FB_PAGES)
    b[0] = 0x40
    for (let page = 0; page < FB_PAGES; page++) b[page + 1] = fb[page * FB_W + x]
    pins.i2cWriteBuffer(OLED_ADDR, b, false)
}

// ── SONAR MAP ───────────────────────────────────────────────────────
// The sweep head already turns; this draws what it finds. Each column is one
// heading, each bar is how close the nearest thing at that heading is, so the
// glass becomes a picture of the room drawn by the robot itself.
//
// This is the whole point of the sweep. Until now it fed a graph on somebody
// else's phone, which shows distance against TIME -- the one axis that does
// not tell you where the table leg is.
let radarFresh = true            // true = redraw the whole scope next time

// Origin at bottom centre. A half-disc that fits 32 rows can only have a
// 31-pixel radius, which would leave two thirds of the width black -- so the
// scope is STRETCHED sideways by two. It reads as a wide radar rather than a
// small round one, and uses glass that would otherwise be wasted.
const SCOPE_CX = 63
const SCOPE_CY = 31
const SCOPE_R = 30
const SCOPE_XS = 2               // horizontal stretch

// Blips persist so a sweep builds a picture instead of showing one reading.
// Parallel arrays rather than objects: this runs in the MakeCode interpreter
// and a fixed ring of numbers costs nothing to keep.
const BLIP_MAX = 48
const BLIP_LIFE_MS = 5000
let blipAngle: number[] = []
let blipCm: number[] = []
let blipAt: number[] = []
let scopeBeamAt = -1             // beam angle currently on the glass
let scopeExpireAt = 0            // next sweep for blips that have aged out

function fbPixel(x: number, y: number, on: boolean) {
    if (x < 0 || x >= FB_W || y < 0 || y >= FB_PAGES * 8) return
    const i = (y >> 3) * FB_W + x
    const bit = 1 << (y & 7)
    fb[i] = on ? (fb[i] | bit) : (fb[i] & (~bit & 0xFF))
}

// Deliberately NOT linear, copied from the app's scope so both agree: the
// first 10cm gets a quarter of the radius. Close things are what matter, and
// on a linear scale they all pile up in the middle.
function scopeRadius(cm: number): number {
    let r = 0
    if (cm <= 0) r = 0
    else if (cm < 10) r = Math.idiv(cm * 40, 10)
    else if (cm < 30) r = 40 + Math.idiv((cm - 10) * 40, 20)
    else if (cm < 100) r = 80 + Math.idiv((cm - 30) * 80, 70)
    else r = 160
    // that scale is 0..160; this glass is 0..SCOPE_R
    return Math.idiv(r * SCOPE_R, 160)
}

function scopePlot(deg: number, r: number, on: boolean) {
    const rad = deg * Math.PI / 180
    fbPixel(SCOPE_CX + Math.round(r * SCOPE_XS * Math.cos(rad)),
            SCOPE_CY - Math.round(r * Math.sin(rad)), on)
}

// Two range rings: 30cm and 100cm. The app draws a 10cm one too, but here it
// lands at a 7-pixel radius and just thickens the origin.
//
// Drawn SOLID, one degree at a time. A dotted arc was the first attempt and
// at this size it read as confetti -- indistinguishable from the blips it is
// supposed to be a backdrop for. The inner ring is half the circumference so
// two degrees is plenty there.
function scopeRings() {
    const rOut = scopeRadius(100)
    for (let a = 0; a <= 180; a++) scopePlot(a, rOut, true)
    const rMid = scopeRadius(30)
    for (let a = 0; a <= 180; a += 2) scopePlot(a, rMid, true)
    // The floor the rings stand on.
    fbRect(0, SCOPE_CY, FB_W, 1, true)
}

function scopeDraw(now: number) {
    fb.fill(0)
    scopeRings()
    // Live beam: solid, so it is obviously the thing that is moving.
    for (let r = 0; r <= SCOPE_R; r++) scopePlot(headAngle, r, true)
    // Everything the sweep has found lately.
    for (let i = 0; i < blipAngle.length; i++) {
        if (now - blipAt[i] > BLIP_LIFE_MS) continue
        const r = scopeRadius(blipCm[i])
        scopePlot(blipAngle[i], r, true)
        // A single pixel is 0.15mm. Two, and it is a mark.
        scopePlot(blipAngle[i], r - 1, true)
    }
    fbFlush()
}

function radarPaint(angle: number, cm: number) {
    // Nothing bounced back is not a detection -- plotting it would draw a
    // wall at maximum range all the way round an empty room.
    if (cm > 0 && cm < DIST_MAX_CM) {
        blipAngle.push(angle)
        blipCm.push(cm)
        blipAt.push(input.runningTime())
        while (blipAngle.length > BLIP_MAX) {
            blipAngle.shift(); blipCm.shift(); blipAt.shift()
        }
    }
    radarFresh = false
    scopeDraw(input.runningTime())
}

const EYE_W = 42, EYE_H = 26, EYE_Y = 3, EYE_LX = 12, EYE_RX = 74
const PUP = 12
const BROW = 11                  // how deep the worried wedge cuts
const FACE_OPEN = 0, FACE_SHUT = 1, FACE_WORRIED = 2, FACE_DIZZY = 3
const FACE_ALARM = 4             // picked up or tipped over
const PUP_SMALL = 6
// Well past anything a rover meets on a floor, so driving over a book does
// not make it panic. Only hands do this.
// cos 45 degrees. Comparing the gravity vector against its RESTING direction
// beats comparing pitch and roll against zero, twice over: it needs no idea
// which way the board is mounted, and it does not go unstable near vertical,
// where roll stops meaning anything at all.
const TILT_COS = 0.707

// LEARNED at power-up, never assumed. This micro:bit stands UPRIGHT in the
// driver board's edge connector, so it rests at about 90 degrees of pitch --
// and R1-v19 tested tilt against FLAT. The rover therefore believed it was
// being held in the air permanently, wore the alarmed face forever, and hid
// every other expression behind it.
let restX = 0
let restY = 0
let restZ = 0

function attitudeCalibrate() {
    // Four samples: the accelerometer is noisy and this baseline is compared
    // against for the rest of the session.
    restX = 0; restY = 0; restZ = 0
    for (let i = 0; i < 4; i++) {
        restX += input.acceleration(Dimension.X)
        restY += input.acceleration(Dimension.Y)
        restZ += input.acceleration(Dimension.Z)
        basic.pause(20)
    }
    restX = Math.idiv(restX, 4)
    restY = Math.idiv(restY, 4)
    restZ = Math.idiv(restZ, 4)
    dbg("attitude: x=" + restX + " y=" + restY + " z=" + restZ)
}

// The angle between where gravity points NOW and where it pointed at boot.
function tilted(): boolean {
    const x = input.acceleration(Dimension.X)
    const y = input.acceleration(Dimension.Y)
    const z = input.acceleration(Dimension.Z)
    const magNow = Math.sqrt(x * x + y * y + z * z)
    const magRest = Math.sqrt(restX * restX + restY * restY + restZ * restZ)
    // In free fall, or before calibration, there is no direction to compare.
    if (magNow < 200 || magRest < 200) return false
    return (x * restX + y * restY + z * restZ) / (magNow * magRest) < TILT_COS
}
const FACE_SLEEP_MS = 20000
const FACE_BLINK_SHUT_MS = 140
const FACE_DIZZY_MS = 2000

let faceNextBlinkAt = 0
let faceShutUntil = 0
let faceDizzyUntil = 0
let faceSpun = false
let faceSig = ""                 // last frame drawn, so a still face costs nothing

// cutRight says which side the brow wedge bites into: the OUTER edge of each
// eye, so the two are mirror images rather than parallel.
function drawEye(x: number, mode: number, dx: number, dy: number, cutRight: boolean) {
    if (mode == FACE_SHUT) {
        // A bar, not a short rectangle: anything taller reads as a squint.
        fbRect(x, EYE_Y + (EYE_H >> 1) - 2, EYE_W, 4, true)
        return
    }
    const y = EYE_Y
    // Rounded with two crossed rectangles. Cheaper than a circle, and the
    // corners are the only part anyone notices at this size.
    fbRect(x + 2, y, EYE_W - 4, EYE_H, true)
    fbRect(x, y + 2, EYE_W, EYE_H - 4, true)
    // The pupil is a HOLE punched in the white of the eye. It shrinks when
    // the rover is lifted -- a small pupil in a wide eye is what alarm looks
    // like, and it costs nothing but a smaller rectangle.
    const pw = mode == FACE_ALARM ? PUP_SMALL : PUP
    fbRect(x + ((EYE_W - pw) >> 1) + dx, y + ((EYE_H - pw) >> 1) + dy,
           pw, pw, false)
    if (mode == FACE_WORRIED) {
        // Brows, as a wedge cleared off the top: deepest at the OUTER edge so
        // the inner ends ride UP. Cut them the other way and the same shape
        // reads as angry instead of worried. Just shortening the eye, which is
        // what this did first, only ever read as a squint.
        for (let c = 0; c < EYE_W; c++) {
            const t = cutRight ? c : (EYE_W - 1 - c)
            const d = Math.idiv(t * BROW, EYE_W - 1)
            if (d > 0) fbRect(x + c, y, 1, d, false)
        }
    }
}

function faceRender(now: number) {
    // Frozen while the wheels turn. A frame is 512 bytes on the same bus as
    // the servo driver, inside the loop that feeds the drive watchdog -- and
    // nobody is watching the robot's eyes while it drives away from them.
    if (lastDriveL != 0 || lastDriveR != 0) {
        if ((lastDriveL > 0 && lastDriveR < 0) || (lastDriveL < 0 && lastDriveR > 0)) {
            faceSpun = true      // remember it, so the dizziness can land after
        }
        return
    }
    if (faceSpun) {
        faceSpun = false
        faceDizzyUntil = now + FACE_DIZZY_MS
    }

    let mode = FACE_OPEN
    let dx = 0
    let dy = 0
    // Being picked up outranks everything: it is the only one of these the
    // rover is having done TO it.
    if (tilted()) {
        mode = FACE_ALARM
        dy = 5                   // eyes down, at the floor going away
    } else if (now < faceDizzyUntil) {
        mode = FACE_DIZZY
        const phase = Math.idiv(now, 120) % 4
        dx = phase == 0 ? -8 : (phase == 2 ? 8 : 0)
        dy = phase == 1 ? -5 : (phase == 3 ? 5 : 0)
    } else if (lastDistCm >= 0 && lastDistCm < ALERT_CM) {
        mode = FACE_WORRIED
        dy = 2                   // pupils drop a little under the brows
    } else if (now - lastDriveCmdAt > FACE_SLEEP_MS) {
        mode = FACE_SHUT
    } else if (now >= faceNextBlinkAt) {
        faceShutUntil = now + FACE_BLINK_SHUT_MS
        faceNextBlinkAt = now + 2500 + Math.randomRange(0, 3500)
    }
    if (mode == FACE_OPEN) {
        if (now < faceShutUntil) mode = FACE_SHUT
        // Awake, the eyes follow the sensor head. It is the one thing the
        // rover is actually looking at.
        else dx = Math.idiv((headAngle - 90) * 8, 90)
    }

    const sig = "" + mode + "," + dx + "," + dy
    if (sig == faceSig) return
    faceSig = sig
    fb.fill(0)
    drawEye(EYE_LX, mode, dx, dy, false)
    drawEye(EYE_RX, mode, dx, dy, true)
    const t0 = input.runningTime()
    fbFlush()
    dbg("face frame " + (input.runningTime() - t0) + "ms mode=" + mode)
}


// ── SELF-TEST ───────────────────────────────────────────────────────
// Shown for a few seconds at power-up, before anything connects. A rover in
// a workshop fails in three ways -- sonar lead off, driver board not seen,
// flat pack -- and the answer used to be a teacher crouching over it with a
// phone. This answers it from across the table with no app at all.
//
// The screen is not on the list on purpose: if you can read the list, the
// screen works. Testing it would be answering a question you already have.
// The DFR0548 carries a PCA9685 here. The motor extension knows this address
// but keeps it to itself, so the probe needs its own copy -- if the board ever
// moves address, this is the line that has to follow it.
const MOTOR_I2C_ADDR = 0x40
const SELFTEST_MS = 2500
let screenHoldUntil = 0

// A zero-length payload is the standard way to ask "is anyone at this
// address": the device either ACKs or it does not, and i2cWriteBuffer
// returns non-zero when nobody did.
function i2cPresent(addr: number): boolean {
    const b = pins.createBuffer(1)
    b[0] = 0x00
    return pins.i2cWriteBuffer(addr, b, false) == 0
}

function bootSelfTest() {
    const driver = i2cPresent(MOTOR_I2C_ADDR) ? "ok" : "MISSING"
    const cm = pingCm()
    const sonar = cm >= NO_ECHO_CM ? "clear"
        : cm > 0 ? ("" + cm + " cm")
        : "NO ECHO"
    OLED.clear()
    OLED.writeStringNewLine("Rover " + FIRMWARE_VERSION)
    OLED.writeStringNewLine("Driver 0x40  " + driver)
    OLED.writeStringNewLine("Sonar  " + sonar)
    OLED.writeStringNewLine("Trim  L " + oledSigned(trimL) + "  R " + oledSigned(trimR))
    dbg("selftest: driver=" + driver + " sonar=" + sonar)
    screenHoldUntil = input.runningTime() + SELFTEST_MS
    // Whatever the screen shows next must repaint over this.
    oledOnGlass = ["", "", "", ""]
    faceSig = ""
    radarFresh = true
}

// Drawing is I2C and takes milliseconds, so it happens in the loop and only
// when the text actually changed -- never from the receive callback.
function oledRender() {
    oledDirty = false
    // The self-test owns the glass until it has been readable for a moment.
    if (input.runningTime() < screenHoldUntil) return
    if (screenMode == SCREEN_RADAR && btConnected && oledText.length == 0) {
        oledOnGlass = ["", "", "", ""]
        faceSig = ""
        // Redraw when the beam has actually moved, or when a blip has aged
        // out. In a still room that is nothing at all; mid-sweep it is one
        // frame per step. Frozen while driving, like the face, and for the
        // same reason -- 512 bytes on the servo driver's bus.
        if (lastDriveL != 0 || lastDriveR != 0) return
        const now = input.runningTime()
        if (radarFresh || headAngle != scopeBeamAt || now >= scopeExpireAt) {
            radarFresh = false
            scopeBeamAt = headAngle
            scopeExpireAt = now + 1000
            scopeDraw(now)
        }
        return
    }
    if (faceWanted() && oledText.length == 0) {
        // Text must repaint when we come back, or half the old status would
        // survive underneath the next frame.
        oledOnGlass = ["", "", "", ""]
        faceRender(input.runningTime())
        return
    }
    faceSig = ""                 // and the face likewise, on the way back
    const want = oledLines()
    let changed = false
    for (let i = 0; i < OLED_ROWS; i++) {
        if (want[i] != oledOnGlass[i]) changed = true
    }
    if (!changed) return
    const t0 = input.runningTime()
    OLED.clear()
    for (let i = 0; i < OLED_ROWS; i++) {
        OLED.writeStringNewLine(want[i])
        oledOnGlass[i] = want[i]
    }
    // Measured, not assumed: this is the number that decides whether the
    // refresh interval above is affordable. Turn debug on to read it.
    dbg("oled repaint " + (input.runningTime() - t0) + "ms")
}

// ── SWEEP HEAD (S3) ──────────────────────────────────────────────────
// The sonar sits on a third servo so it can look around without turning the
// whole rover. Unlike S1/S2 this is a POSITIONAL servo: the angle IS the
// angle, where on the wheels an angle means a speed. Same call, opposite
// meaning -- worth remembering before "fixing" one to match the other.
const HEAD_CENTER = 90

// Writes are rate-limited because dragging the slider emits a SET per step,
// and every one is an I2C transaction on the same bus as the wheels and the
// screen. Flooding it does not merely stutter: it can lock the bus hard
// enough to freeze the whole firmware, heartbeat included.
//
// The pending value matters as much as the limit. A naive guard that simply
// drops writes loses the LAST one, so the head stops a few degrees short of
// wherever the finger lifted. Anything dropped here is remembered and written
// by the loop instead.
const HEAD_MIN_INTERVAL_MS = 40
let headAngle = HEAD_CENTER
let headWritten = -1
let headWrittenAt = 0
let headPending = false

function headWrite() {
    motor.servo(motor.Servos.S3, headAngle)
    headWritten = headAngle
    headWrittenAt = input.runningTime()
    headPending = false
}

function head(angle: number) {
    headAngle = Math.constrain(angle, 0, 180)
    if (headAngle == headWritten) { headPending = false; return }
    if (input.runningTime() - headWrittenAt >= HEAD_MIN_INTERVAL_MS) headWrite()
    else headPending = true
}

// ── SWEEP ───────────────────────────────────────────────────────────
// The head can pan back and forth on its own, so the rover scans the room
// instead of staring straight ahead. Driven from the loop by timestamps, never
// by pauses, so the radio and the drive watchdog keep running through it.
//
// The limits stop short of the ends: a head that slams into the chassis at 0
// or 180 stalls the servo, which draws current and buzzes rather than moving.
const HEAD_SWEEP_MIN = 30
const HEAD_SWEEP_MAX = 150
const HEAD_SWEEP_STEP = 5
const HEAD_SWEEP_MS = 120
let headSweep = false
let headSweepDir = 1
let nextSweepAt = 0

// The angle is mirrored to the app at most this often. Every step would be
// eight updates a second on a link that sends 18 characters per 35ms -- the
// gauge cannot show that much and the traffic would crowd out the drive
// commands.
const HEAD_TX_MS = 300
let headTxAt = 0

// "Nothing bounced back." Everything downstream is written around this
// sentinel meaning PATH CLEAR rather than "bad reading", so pingCm() must
// return it rather than 0 -- see the comment inside.
const NO_ECHO_CM = 500

// HC-SR04P on P0/P1, read directly rather than through a board library.
// 30000us caps the wait at roughly 5 m so a missing sensor cannot stall the
// loop; 58 is the standard microseconds-per-centimetre round-trip constant.
//
// Returns NO_ECHO_CM when nothing comes back, NOT 0. This matters: the caller
// reads >= 500 as "no echo, so the path is clear" and reports full scale,
// while <= 0 means "bad reading, show nothing". Returning 0 put the normal
// case -- a robot pointed at an open room -- into the bad-reading branch, so
// the gauge and the graph stayed blank exactly when there was nothing in the
// way. A single-shot pulseIn cannot distinguish the two anyway.
function pingCm(): number {
    pins.setPull(PIN_ECHO, PinPullMode.PullNone)
    pins.digitalWritePin(PIN_TRIG, 0)
    control.waitMicros(2)
    pins.digitalWritePin(PIN_TRIG, 1)
    control.waitMicros(10)
    pins.digitalWritePin(PIN_TRIG, 0)
    const echo = pins.pulseIn(PIN_ECHO, PulseValue.High, 30000)
    if (echo == 0) return NO_ECHO_CM
    return Math.idiv(echo, 58)
}

function driveMix(nx: number, ny: number) {
    if (Math.abs(nx) < DEAD_ZONE && Math.abs(ny) < DEAD_ZONE) {
        wheelsStop()
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

    // Drive path, deliberately identical in shape to the reference
    // handleMotor(): two motorRun() calls and nothing that can block.
    // dbg() only pushes to a queue; requestDriveDebug() only sets a
    // flag. No basic.show* here — see showDriveDebug()'s comment.
    wheels(l, r)
    dbg("drive: nx=" + nx + " ny=" + ny + " -> L=" + l + " R=" + r)
    requestDriveDebug(l, r)
    lastDriveL = l
    lastDriveR = r
    lastDriveAt = now
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
    // HOT PATH: a D-pad packet goes straight to the motor driver.
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
        wheelsStop()
        lastDriveL = 0
        lastDriveR = 0
        lastDriveAt = lastDriveCmdAt
        return
    }

    let l = Math.constrain((ny + nx) * driveSpeed, -driveSpeed, driveSpeed)
    let r = Math.constrain((ny - nx) * driveSpeed, -driveSpeed, driveSpeed)
    wheels(l, r)
    lastDriveL = l
    lastDriveR = r
    lastDriveAt = lastDriveCmdAt
}

// ═══════════════════════════════════════════════════════════════
// 🛞 PER-WHEEL JOG BUTTONS (v55)
// Two buttons that each run ONE wheel forward, so you can see which
// motor is which and prove both turn the same way. The app sends
// "SET btn_ml 1" on press and "SET btn_ml 0" on release, so these are
// held, not clicked — and because each button's state is tracked
// separately, holding BOTH runs both wheels and the robot goes straight.
//
// State is kept here rather than derived from lastDriveL/lastDriveR: those
// are also written by the D-pad and by Line/Avoid, so reading them back
// would let an autonomous step masquerade as a held button.
// ═══════════════════════════════════════════════════════════════
let jogL = false
let jogR = false

function applyJog() {
    if (driveMode != MODE_MANUAL) return
    let l = jogL ? driveSpeed : 0
    let r = jogR ? driveSpeed : 0
    lastDriveCmdAt = input.runningTime()
    if (l == 0 && r == 0) {
        wheelsStop()
        lastDriveL = 0
        lastDriveR = 0
        lastDriveAt = lastDriveCmdAt
        requestDriveDebug(0, 0)
        return
    }
    // Always forward — these are "does this wheel work" buttons, not steering.
    wheels(l, r)
    lastDriveL = l
    lastDriveR = r
    lastDriveAt = lastDriveCmdAt
    requestDriveDebug(l, r)
}

// Called by the disconnect/link-lost paths. Without this a button held at the
// moment the link drops would still read as pressed on reconnect, and the
// first applyJog() would start a wheel nobody asked for.
function clearJog() {
    jogL = false
    jogR = false
}

// ═══════════════════════════════════════════════════════════════
// 🎮 WIDGET HANDLERS — driving the rover hardware
// ═══════════════════════════════════════════════════════════════

// v44 autonomous motor path. Manual D-pad packets have their own direct
// path above; Line/Avoid need the same ownership model. Autonomous motion
// is generated on the micro:bit, so it must not depend on browser D-pad
// keepalives or the Manual drive watchdog.
function driveAuto(nx: number, ny: number) {
    if (driveMode == MODE_MANUAL) return
    let now = input.runningTime()
    if (Math.abs(nx) < DEAD_ZONE && Math.abs(ny) < DEAD_ZONE) {
        wheelsStop()
        lastDriveL = 0
        lastDriveR = 0
        lastDriveAt = now
        lastDriveCmdAt = now
        requestDriveDebug(0, 0)
        return
    }
    let l = Math.constrain(Math.round((ny + nx) * driveSpeed), -driveSpeed, driveSpeed)
    let r = Math.constrain(Math.round((ny - nx) * driveSpeed), -driveSpeed, driveSpeed)
    wheels(l, r)
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
        wheelsStop()
        // Was basic.showIcon(IconNames.No) — blocking, and this runs
        // inside the BLE receive handler. Still shows the ✗, but via
        // the deferred renderer so nothing blocks here.
        lastDriveL = 0
        lastDriveR = 0
        // Otherwise a jog button still physically held would immediately
        // restart its wheel on the next applyJog().
        clearJog()
        requestStopIcon()
        dbg("stop button pressed")
    }

    // Buttons: per-wheel jog. S1 is the LEFT wheel and S2 the RIGHT, the same
    // assignment wheels() relies on -- a left turn drives S1 backward and S2
    // forward.
    if (id == "btn_ml" || id == "btn_mr") {
        if (id == "btn_ml") jogL = (val == "1")
        else jogR = (val == "1")
        applyJog()
        dbg("jog: L=" + (jogL ? 1 : 0) + " R=" + (jogR ? 1 : 0))
    }

    // Select: what the little screen shows. The face is opt-in -- a robot
    // that stares at you instead of reporting its trim is a surprise, not a
    // feature, so Status stays the default.
    if (id == "screen_mode") {
        if (val == "Face") screenMode = SCREEN_FACE
        else if (val == "Auto") screenMode = SCREEN_AUTO
        else if (val == "Radar") screenMode = SCREEN_RADAR
        else screenMode = SCREEN_STATUS
        radarFresh = true
        faceSig = ""
        oledOnGlass = ["", "", "", ""]
        oledDirty = true
        prefsTouched()
        dbg("screen -> " + val)
        return
    }

    // Select: how the head behaves — aimed by hand, or panning on its own.
    if (id == "head_mode") {
        headSweep = (val == "Sweep")
        if (!headSweep) head(HEAD_CENTER)
        dbg("head mode -> " + val)
        return
    }

    // Edit field: text for the little screen. Clearing it restores the banner.
    if (id == "oled_text") {
        oledText = val
        oledDirty = true
        dbg("screen -> " + oledCurrent())
        return
    }

    // Select: Level — which panel the robot serves.
    //
    // Switching pushes the new layout straight away rather than waiting for a
    // reconnect. Only the flags are set here; the transfer itself runs from
    // the loop, for the same reason GETCFG does -- streaming a layout from
    // inside the receive callback is what broke reconnects historically.
    if (id == "level") {
        let want = LAYOUT_BEGINNER
        if (val == "Expert") want = LAYOUT_EXPERT
        else if (val == "Drive") want = LAYOUT_DRIVE
        else if (val == "Distance") want = LAYOUT_DIST
        else if (val == "Screen") want = LAYOUT_SCREEN
        if (want != layoutLevel) {
            wheelsStop()          // never change panel with the wheels turning
            lastDriveL = 0
            lastDriveR = 0
            clearJog()
            btnFwd = false; btnBack = false; btnLeft = false; btnRight = false
            applyLayout(want)
            cfgSent = false
            cfgTxActive = true
            cfgTxStage = 0
            cfgTxPos = 0
            cfgTxChunkIdx = 0
            cfgTxLit = 0
            cfgTxNextAt = input.runningTime() + 20
            basic.clearScreen()
            dbg("level -> " + val)
        }
        return
    }

    // Slider: sweep head. 0-180 is a real angle here, not a speed.
    if (id == "srv_head") {
        head(parseInt(val))
        uiGaugeHeadDirty = true
        uiGaugeLastInputAt = input.runningTime()
        requestGlyphValue(GLYPH_SERVO, headAngle)
        dbg("head -> " + headAngle)
    }

    // Button: look straight ahead again.
    if (id == "btn_head_center" && val == "1") {
        head(HEAD_CENTER)
        uiGaugeHeadDirty = true
        dbg("head centred")
    }

    // Sliders: straight-line trim, one per wheel. trimL/trimR are applied by
    // wheels(); without these handlers they could never leave 0, and two
    // 360-degree servos never run at matched speeds, so the rover always
    // curved. Kept in the rover's own flash from R1-v12, so the calibration
    // belongs to the ROBOT: it survives the battery, and it does not follow
    // whichever browser happened to set it. See prefsLoad()/prefsSaveTick().
    // Trim arrives from the slider, the edit field, or the +/- buttons below.
    // All of them write the same value and all are echoed back, so whichever
    // you did not touch follows along instead of showing a stale number.
    if (id == "trim_l" || id == "trim_r" || id == "trim_l_num" || id == "trim_r_num") {
        const t = Math.constrain(parseInt(val), -20, 20)
        const left = (id == "trim_l" || id == "trim_l_num")
        if (left) trimL = t
        else trimR = t
        trimEchoDue = true
        prefsTouched()
        dbg("trim: L=" + trimL + " R=" + trimR)
        return
    }

    // Buttons: nudge one wheel by a single degree. Between a slider you have
    // to hit and a field you have to type into, this is what "still pulls
    // slightly left" actually asks for -- and one degree of servo pulse is
    // the floor, since the API takes whole degrees.
    //
    // Acts on the PRESS edge only. The app sends "1" down and "0" up, so
    // without this guard every tap would step twice and land back where it
    // started -- a control that visibly does nothing.
    if (id == "trim_l_dn" || id == "trim_l_up" ||
        id == "trim_r_dn" || id == "trim_r_up") {
        if (val != "1") return
        const step = (id == "trim_l_up" || id == "trim_r_up") ? 1 : -1
        if (id == "trim_l_dn" || id == "trim_l_up") {
            trimL = Math.constrain(trimL + step, -20, 20)
        } else {
            trimR = Math.constrain(trimR + step, -20, 20)
        }
        // Same echo as the slider and the field: whichever control you did
        // not touch follows along instead of showing a stale number.
        trimEchoDue = true
        prefsTouched()
        dbg("trim step: L=" + trimL + " R=" + trimR)
        return
    }

    // Slider: Speed — top speed for BOTH manual and autonomous driving.
    if (id == "spd") {
        driveSpeed = Math.constrain(parseInt(val), DRIVE_SPEED_MIN, DRIVE_SPEED_MAX)
        uiGaugeSpdDirty = true
        uiGaugeLastInputAt = input.runningTime()
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

    // Select: Distance read — Auto / Read now.
    //
    // "Read now" is intentionally a ONE-SHOT override. It may be used in
    // Manual, Line or Avoid without enabling continuous ultrasonic polling.
    // That preserves the low-latency lesson from v43: a no-echo HC-SR04 read
    // can busy-wait for ~250 ms, so polling it continuously in Manual/Line
    // makes motor control feel laggy. The forever loop performs the actual
    // measurement (never this BLE callback), updates gauge + graph, then
    // publishes UPD dist_read Auto so compatible clients reset the selector.
    if (id == "dist_read" && val == "Read now") {
        forceDistanceOnce = true
        dbg("distance: forced one-shot requested")
    }

    // Select: Mode — Manual / Line / Avoid.
    if (id == "mode") {
        // Always stop first. Switching mode while the wheels are turning
        // would otherwise carry the old command into the new mode.
        wheelsStop()
        lastDriveL = 0
        lastDriveR = 0
        btnFwd = false
        btnBack = false
        btnLeft = false
        btnRight = false
        // Same reason as the D-pad flags above: a jog button held across a mode
        // switch must not be treated as still pressed when Manual comes back.
        clearJog()
        avoidPhase = 0
        avoidUntil = 0
        // No "Line" here: this chassis has no line sensors, and a follower
        // reading floating pins drives straight off the table. The Mode
        // selector in the layout offers Manual and Avoid only.
        if (val == "Avoid") driveMode = MODE_AVOID
        else driveMode = MODE_MANUAL
        // Avoid decides where to go from the distance STRAIGHT AHEAD. With the
        // head panning, a wall beside the rover would read as an obstacle in
        // front of it, so the sweep stops and the head returns to centre.
        if (driveMode == MODE_AVOID && headSweep) {
            headSweep = false
            head(HEAD_CENTER)
        }
        // Reset ownership timing at the mode boundary. The age of the last
        // Manual D-pad packet must never decide whether autonomous motors run.
        lastDriveCmdAt = input.runningTime()
        requestDriveDebug(0, 0)
        dbg("mode -> " + val)
    }

    // Button: Buzz — short confirmation beep on the V2's built-in speaker.
    //
    // Only REQUESTS the beep. music.playTone() blocks the calling fiber for
    // the whole note -- a quarter beat is ~500ms at the default tempo -- and
    // this function runs inside onUartDataReceived. Playing it here would
    // stall the receive callback for half a second, which is the same
    // landmine documented at the top of this file for serial.writeLine() and
    // basic.show*. The loop plays it on a background fiber instead.
    if (id == "btn_buzz" && val == "1") {
        requestGlyph(GLYPH_BUZZ)
        pendingBeep = true
    }

    // The donor firmware drives two auxiliary servos from slider_srv1 and
    // slider_srv2. Here S1 and S2 ARE the wheels, so those sliders are gone: a
    // slider
    // that jerked the drive servos to an absolute angle would fight the
    // D-pad for control of the same hardware.

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
    // Nothing gained by publishing a value the current panel cannot show.
    if (!onPanel(id)) return
    bluetooth.uartWriteLine("UPD " + id + " " + val)
}

// ═══════════════════════════════════════════════════════════════
// 🚀 STARTUP
// ═══════════════════════════════════════════════════════════════

// Before wheelsStop(), because that writes a servo pulse and the pulse is
// WHEEL_STOP plus the trim: loading afterwards would hold the wheels at an
// untrimmed stop until the first command arrived, which on a badly trimmed
// rover is a slow crawl across the table.
prefsLoad()

// However the board is mounted, the rover takes that as its own idea of level.
attitudeCalibrate()

// Safety: stop any leftover motion and centre the sweep head on boot.
wheelsStop()
headWrite()
oledInit()
fbInit()
bootSelfTest()
// Move the tone output off P0 BEFORE anything can beep. On micro:bit the
// music blocks drive P0 by default, and P0 is the sonar trigger on this board:
// a beep would fire spurious pings, and the 10us trigger pulses would click
// faintly through whatever is on P0. V2 still sounds through its built-in
// speaker, so nothing is lost by parking the pitch pin on an unused GPIO.
pins.analogSetPitchPin(AnalogPin.P8)

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
dbg("rover remote firmware " + FIRMWARE_VERSION + " ready, waiting for BLE connection...")

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
    // Before anything else: a jog button held when the link died must not
    // survive into the next connection, and its wheel must not keep turning.
    clearJog()
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
    cfgVerPending = false
    cfgVerReplyAt = 0
    uiInitialSyncStage = 0
    uiGaugeSpdDirty = false
    uiGaugeTxNextAt = 0
    logQueue = []
    // v46: reboot the BLE peripheral after the X is painted. This is the
    // automatic replacement for the physical RESET that was previously
    // required before GETCFG would work after a disconnect.
    bleStackResetAt = input.runningTime() + BLE_STACK_RESET_DELAY_MS
    wheelsStop()
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
    // Point the sensor forward again. Left aimed sideways it would report the
    // wall next to the rover as the distance ahead on the next connection.
    head(HEAD_CENTER)
    // Heartbeat restarts per session, so the clock reads session uptime
    // rather than time since power-on.
    heartbeat = 0
    // Force the next line readings to be transmitted even if they match
    // the last ones from the previous session — otherwise the line LEDs
    // sit blank until something happens to change. (The graph is not
    // deduped at all, so it needs no reset.)
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
// The ultrasonic read is still the most expensive call in this firmware,
// though far cheaper than the board library it replaced: pingCm() is ONE
// pulseIn with a 30ms cap and no retries, where the old library retried
// four more times and could cost ~250ms. An echo returns almost at once;
// no echo waits the 30ms out. pulseIn BUSY-WAITS without yielding, so even
// 30ms freezes the whole runtime rather than just this loop -- which is
// why the guards below still earn their place.
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
let forceDistanceOnce = false   // v49: selector-triggered one-shot in ANY mode
basic.forever(function () {
    let now = input.runningTime()

    // Drive watchdog runs every 100ms (finer than the 1s heartbeat
    // cadence below) so a stalled/dropped "stop" packet gets caught
    // within DRIVE_WATCHDOG_MS instead of up to a full second late.
    // Manual safety watchdog only. v43 accidentally supervised Line/Avoid
    // with the D-pad keepalive timeout too. Avoid can legitimately spend
    // longer than that between ultrasonic polls after no-echo backoff.
    // A held jog button sends ONE packet on press and nothing again until
    // release, unlike the D-pad which re-sends its mask about once a second.
    // Without this refresh the watchdog below would cut the wheel after
    // DRIVE_WATCHDOG_MS while the button is still physically down. The safety
    // net for a jog is therefore not this watchdog but the link timeout and
    // the disconnect handler, both of which call clearJog().
    // Gated on recent traffic, not merely on "not yet declared dead". The app
    // pings every 3s, so while the peer is alive lastRxAt keeps moving and the
    // refresh continues. If the link dies, lastRxAt goes stale, this stops
    // refreshing, and the watchdog below stops the wheel DRIVE_WATCHDOG_MS
    // later -- the same 2.5s the D-pad gets, rather than waiting out the 9s
    // LINK_TIMEOUT_MS.
    if ((jogL || jogR) && driveMode == MODE_MANUAL && !linkLostHandled
        && (now - lastRxAt) < DRIVE_WATCHDOG_MS) {
        lastDriveCmdAt = now
    }

    if (driveMode == MODE_MANUAL && (lastDriveL != 0 || lastDriveR != 0) && now - lastDriveCmdAt > DRIVE_WATCHDOG_MS) {
        wheelsStop()
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

    // Step the sweep. Manual only -- Avoid needs the head still, and the mode
    // handler already centres it on the way in.
    if (headSweep && driveMode == MODE_MANUAL && now >= nextSweepAt) {
        nextSweepAt = now + HEAD_SWEEP_MS
        let a = headAngle + headSweepDir * HEAD_SWEEP_STEP
        if (a >= HEAD_SWEEP_MAX) { a = HEAD_SWEEP_MAX; headSweepDir = -1 }
        else if (a <= HEAD_SWEEP_MIN) { a = HEAD_SWEEP_MIN; headSweepDir = 1 }
        head(a)
        // Deliberately does NOT touch uiGaugeLastInputAt: that timer exists to
        // wait for a human to stop dragging, and a sweep never stops, so the
        // coalescer would wait forever and the gauge would never move.
        if (now - headTxAt >= HEAD_TX_MS) {
            headTxAt = now
            uiGaugeHeadDirty = true
        }
    }

    // Re-examine the screen on a timer now that it carries live status, not
    // only when the app sends text. oledRender() compares before it draws, so
    // a tick where nothing changed costs four strings and no I2C at all.
    // Still never from the receive callback: same bus as the servo driver,
    // and this loop feeds the drive watchdog.
    if (now >= oledCheckAt) {
        oledCheckAt = now + OLED_REFRESH_MS
        oledDirty = true
    }
    if (oledDirty) oledRender()

    // Write the angle the rate guard above had to defer, so the head always
    // ends up where the finger left it rather than a few degrees short.
    if (headPending && now - headWrittenAt >= HEAD_MIN_INTERVAL_MS) headWrite()

    // The beep runs on its own fiber: music.playTone() blocks for the length
    // of the note, and this loop also feeds the drive watchdog and the LED
    // matrix. Blocking it for half a second would stall both.
    if (pendingBeep) {
        pendingBeep = false
        control.inBackground(function () {
            music.playTone(440, music.beat(BeatFraction.Quarter))
        })
    }

    // Commit trim and the screen choice to flash once they have settled. Deliberately here in the
    // loop rather than in the widget handler: a flash write is not free, and
    // the BLE receive callback is the one place on this board where doing
    // anything slow has repeatedly broken reconnects.
    prefsSaveTick(now)

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

    // ── CONFIG REVISION REPLY (v47) ─────────────────────────────
    // This one short notification is the normal reconnect path. If the
    // browser already cached this revision it answers CFGOK and the robot is
    // ready immediately; otherwise it asks for the full transfer below.
    if (btConnected && cfgVerPending && now >= cfgVerReplyAt) {
        bluetooth.uartWriteLine("CFGVER " + CFG_REV)
        cfgVerPending = false
        basic.pause(20)
        return
    }

    // ── CONFIG TX STATE MACHINE (v46) ───────────────────────────
    // Never stream the whole layout from onUartDataReceived(). Sending one
    // notification per pass keeps RX and TX decoupled and lets disconnect
    // handling run between chunks.
    if (btConnected && cfgTxActive) {
        if (now >= cfgTxNextAt) {
            if (cfgTxStage == 0) {
                // Announce how many chunks are coming. The app matches this
                // line with startsWith(), so a client that ignores the argument
                // is unaffected -- but one that reads it can show a truthful
                // progress bar instead of guessing. The same total is already
                // computed below for the LED sweep.
                bluetooth.uartWriteLine("CFGBEGIN " + Math.idiv(CFG.length + 17, 18))
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
                // Echo the selector, or it renders showing its FIRST option
                // regardless of which panel is actually being served.
                bluetooth.uartWriteLine("UPD level " +
                    (layoutLevel == LAYOUT_EXPERT ? "Expert"
                     : layoutLevel == LAYOUT_DRIVE ? "Drive"
                     : layoutLevel == LAYOUT_DIST ? "Distance"
                     : layoutLevel == LAYOUT_SCREEN ? "Screen" : "Beginner"))
                scheduleInitialUiSync()
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


    // ── CONFIG-NATIVE CONTROL GAUGES (v48) ───────────────────────
    // First publish the true boot/control values for both sliders and
    // gauges. After that, publish only a coalesced gauge update when a
    // slider has been quiet for a moment. A client that understands the
    // CFG `source` field mirrors instantly with zero BLE; older clients
    // still receive the firmware UPD shortly after the drag settles.
    if (cfgSent && now >= uiGaugeTxNextAt) {
        let uiSent = false
        if (uiInitialSyncStage > 0) {
            // Only the speed pair survives: slider_srv1/2 and their gauges
            // addressed the auxiliary servos, which are the wheels here.
            if (uiInitialSyncStage == 1) sendUiValue("spd", "" + driveSpeed)
            else if (uiInitialSyncStage == 2) sendUiValue("gauge_spd", "" + driveSpeed)
            uiInitialSyncStage += 1
            if (uiInitialSyncStage > 2) uiInitialSyncStage = 0
            uiGaugeTxNextAt = now + UI_GAUGE_TX_GAP_MS
            uiSent = true
        } else if (now - uiGaugeLastInputAt >= UI_GAUGE_SETTLE_MS) {
            if (uiGaugeSpdDirty) {
                sendUiValue("gauge_spd", "" + driveSpeed)
                uiGaugeSpdDirty = false
                uiSent = true
            } else if (trimEchoDue) {
                // Keep the slider and the number in step with each other.
                trimEchoDue = false
                sendUiValue("trim_l", "" + trimL)
                sendUiValue("trim_r", "" + trimR)
                sendUiValue("trim_l_num", "" + trimL)
                sendUiValue("trim_r_num", "" + trimR)
                // Same reason: the selector would otherwise render on its
                // first option over a robot already showing the face.
                sendUiValue("screen_mode", screenMode == SCREEN_FACE ? "Face"
                    : screenMode == SCREEN_AUTO ? "Auto"
                    : screenMode == SCREEN_RADAR ? "Radar" : "Status")
                uiSent = true
            } else if (oledCurrent() != oledShown) {
                // Mirror what is really on the glass, including truncation.
                oledShown = oledCurrent()
                sendUiValue("lbl_oled", oledShown)
                uiSent = true
            } else if (uiGaugeHeadDirty) {
                sendUiValue("gauge_head", "" + headAngle)
                sendUiValue("srv_head", "" + headAngle)
                uiGaugeHeadDirty = false
                uiSent = true
            }
            if (uiSent) uiGaugeTxNextAt = now + UI_GAUGE_TX_GAP_MS
        }
        if (uiSent) {
            basic.pause(20)
            return
        }
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
            // v50: heartbeat visibility follows the Telemetry selector, not
            // the drive mode. sendValue() already enforces the policy:
            //   All/Basic -> heartbeat is transmitted
            //   Off       -> heartbeat is silent
            // Do not suppress heartbeat merely because Line/Avoid motors
            // are moving; autonomous drive is local to the micro:bit and
            // should not make the connection appear frozen.
            sendValue("lbl_heartbeat", uptimeString(heartbeat))
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

    // The donor firmware polls two line sensors here and runs a line-following
    // mode from them. This chassis has neither, so the block is gone rather
    // than left reading pins that float -- a follower with no sensors would
    // just drive off. Avoid mode below still works: it needs only the sonar.

    // ── Ultrasonic (HC-SR04) — AVOID MODE ONLY ───────────────────
    //
    // This sensor is expensive enough to define the feel of the whole
    // robot. Measured from the old board library source, one readUlt() is
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
    //   - Manual/Line: never POLL Ultrasonic(); only an explicit v49 one-shot may read it.
    //   - Avoid: distance is required, so poll there and use adaptive
    //     backoff when the expensive no-echo result persists.
    // This is why Telemetry alone is not enough: even an unsent sensor
    // reading can freeze the runtime before BLE gets a chance to run.
    // Low-latency control build: never POLL Ultrasonic() in Manual/Line; v49 permits one explicit read.
    // A no-echo read can busy-wait for ~250ms and freeze BLE command
    // handling. Avoid is the only mode with automatic distance polling; v49 also supports an explicit one-shot in any mode.
    // v49: distance has TWO triggers:
    //   1) normal automatic polling in Avoid mode;
    //   2) an explicit one-shot from the CFG selector in ANY mode.
    // The one-shot deliberately ignores busyDriving because the operator asked
    // for it explicitly. It can therefore cause one brief HC-SR04 timeout stall,
    // but it never turns continuous polling back on in Manual/Line.
    let forceDist = forceDistanceOnce
    // Poll in EVERY mode, not only Avoid. The Distance-read selector offers
    // "Auto", and with Telemetry on All the graph is expected to keep drawing
    // -- in Manual it drew nothing at all, because this used to require
    // MODE_AVOID and the only other path was the one-shot "Read now".
    //
    // What actually makes polling unsafe is not the mode but driving:
    // Ultrasonic() busy-waits, and a missing echo costs ~250ms with the whole
    // runtime frozen. busyDriving below is that guard, and it still applies --
    // so the graph runs while the robot is parked, which is when anyone is
    // looking at it, and stops the moment the wheels turn.
    //
    // Avoid mode must keep measuring whatever the telemetry level says -- the
    // distance is its input, not a readout, and gating it on UPD_ALL would
    // leave the robot driving blind at Basic or Off. Outside Avoid the reading
    // exists only to be displayed, so it is not worth the stall unless the
    // graph and gauge can actually leave the robot, which is UPD_ALL only
    // (see sendValue).
    let autoDistDue = (driveMode == MODE_AVOID || updLevel == UPD_ALL) && now >= nextDistAt
    let busyDriving = (lastDriveL != 0 || lastDriveR != 0) && driveMode != MODE_AVOID
    if (cfgSent && (forceDist || (autoDistDue && !busyDriving))) {
        if (forceDist) forceDistanceOnce = false
        // Must advance in every mode now. Leaving this Avoid-only would let
        // the loop re-measure on every pass, which is precisely the freeze
        // the interval exists to prevent.
        nextDistAt = now + distInterval
        {
            let cm = pingCm()
            // Adapt the next interval to what we just got back. 500 is
            // the "no echo" sentinel and is the reading that costs the
            // full ~250ms retry stall, so keep backing off while it
            // persists; any real distance restores the fast rate.
            // Backoff applies in every mode for the same reason it exists in
            // Avoid: a sensor that never echoes costs the full retry stall on
            // each attempt, so slow down while that persists and recover the
            // fast rate as soon as a real distance comes back.
            if (cm >= NO_ECHO_CM || cm <= 0) {
                distInterval = Math.min(distInterval * 2, DIST_INTERVAL_MAX_MS)
            } else {
                distInterval = DIST_INTERVAL_MS
            }
            // Decide what we'd report; -1 means "nothing to report".
            let reported = -1
            if (cm >= NO_ECHO_CM) {
                // Nothing bounced back. No echo means
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
            // `reported` folds the board extension's 500 "no echo" sentinel down
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
                if (forceDist) sendUiValue("graph_dist", "" + cm)
                else sendValue("graph_dist", "" + cm)
            }
            // The gauge gets the MAPPED value: on a dial, "no echo"
            // should read as a clear path (full scale), not as an
            // obstacle against the bumper. The graph gets the raw value
            // instead, so the two together still distinguish a dead
            // sensor from an empty room.
            if (reported >= 0) {
                lastDistCm = reported
                // btConnected as well: without it the scope would paint its
                // columns straight over the name the disconnected screen is
                // showing, from the sensor path, behind the renderer's back.
                if (screenMode == SCREEN_RADAR && btConnected && oledText.length == 0
                    && input.runningTime() >= screenHoldUntil) {
                    radarPaint(headAngle, reported)
                }
                if (forceDist) sendUiValue("gauge_dist", "" + reported)
                else sendValue("gauge_dist", "" + reported)
            }

            // Reset the momentary CFG selector after the requested sample.
            // sendUiValue bypasses the Telemetry selector on purpose: this is
            // direct feedback to an explicit user action, not background data.
            if (forceDist) sendUiValue("dist_read", "Auto")

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
