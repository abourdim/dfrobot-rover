// Maqueen Remote firmware — PASTE-READY (compact comments + latency notes)
// Generated from maqueen-remote.ts, which is the source of record.
// Extensions needed in MakeCode: pxt-maqueen

//
// LOW-LATENCY D-PAD NOTES (v43, proven on real hardware)
// ------------------------------------------------------
// Keep these rules if this firmware is modified later:
// 1. D-pad is STATE, not an event FIFO. Up=1, Down=2, Left=4, Right=8;
//    newest complete mask wins so stale steering commands never queue.
// 2. Browser sends only 2 bytes per D-pad update: one ASCII 'a'..'p'
//    encoding mask 0..15, plus newline. Longer SET strings previously
//    crossed the BLE payload boundary and needed extra writes/events.
// 3. Motor packets bypass the normal app BLE queue and enter
//    handleDpadMask() directly from onUartDataReceived. Do not route the
//    hot path through handleWidget(), logging, display, telemetry or a
//    fixed 125 ms / 8 Hz drive limiter.
// 4. Do not call basic.show* in the BLE receive path: default display
//    calls can pause hundreds of ms. Do not serial.writeLine() there
//    either; without a USB reader it can block. BLE logs are deferred.
// 5. Never poll maqueen.Ultrasonic() in Manual/Line. No-echo retries can
//    busy-wait for about 250 ms and freeze BLE handling. Use it in Avoid.
// 6. Telemetry defaults to All to match the UI; Manual still avoids sensor
//    polling while driving. BLE transmit power is set to 7 (maximum MakeCode).
// 7. D-pad uses immediate Pointer Events in the browser: no old 60 ms BLE
//    pacing and no 100 ms release debounce. Held state is re-sent only as
//    a safety keepalive; the 2500 ms watchdog/link loss stops the motors.
// 8. Reconnect lesson (v46): do NOT burst the layout from the UART RX
//    callback. Queue GETCFG and send one notification per main-loop pass.
//    Intentional disconnect sends BYE; firmware shows X, then software-resets
//    Bluetooth. Browser PING is 3 s, so firmware link timeout is 9 s.
//
// Core lesson: for a real-time robot, reliable delivery of OLD steering
// events becomes latency. Preserve the newest desired motor STATE instead.

const FIRMWARE_VERSION = "v53"

let debugEnabled = false
let logQueue: string[] = []
const LOG_QUEUE_MAX = 20
function dbg(msg: string) {
    if (!debugEnabled) return
    logQueue.push(msg)
    if (logQueue.length > LOG_QUEUE_MAX) logQueue.shift()
}

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
let cfgVerPending = false
let cfgVerReplyAt = 0

// A real disconnect can also leave the Nordic/MakeCode BLE peripheral in a
// connectable-but-unusable GATT state until reset. v46 schedules a SOFTWARE
// reset after showing X, so the user no longer needs the physical reset button.
let bleStackResetAt = 0
const BLE_STACK_RESET_DELAY_MS = 600

let lastRxAt = 0
let linkLostHandled = false
const LINK_TIMEOUT_MS = 9000

let btConnected = false

const UPD_OFF = 0
const UPD_BASIC = 1
const UPD_ALL = 2
let updLevel = UPD_ALL

// v52: derive the config revision from the actual embedded Base64 CFG.
// Any CFG byte change automatically changes CFGVER; no manual hash can go stale.
function cfgRevisionFromCfg(text: string): string {
    let hash = 5381 >>> 0
    for (let i = 0; i < text.length; i++) {
        hash = ((((hash << 5) + hash) ^ text.charCodeAt(i)) >>> 0)
    }
    return "d" + (hash >>> 0)
}

const CFG = "eyJ0aXRsZSI6Ik1hcXVlZW4gUmVtb3RlIiwid2lkZ2V0cyI6W3siaWQiOiJzbGlkZXJfc3J2MSIsInQiOiJzbGlkZXIiLCJ4Ijo1NywieSI6MjgsInciOjk5LCJoIjoyMDMsImxhYmVsIjoiU2Vydm8gMSIsIm1pbiI6MCwibWF4IjoxODAsInN0ZXAiOjEsInZhbHVlIjo5MH0seyJpZCI6InNsaWRlcl9zcnYyIiwidCI6InNsaWRlciIsIngiOjIzMywieSI6MzAsInciOjk5LCJoIjoyMDEsImxhYmVsIjoiU2Vydm8gMiIsIm1pbiI6MCwibWF4IjoxODAsInN0ZXAiOjEsInZhbHVlIjo5MH0seyJpZCI6ImRwYWRfbW92ZSIsInQiOiJkcGFkIiwieCI6NDA0LCJ5IjoyNywidyI6NDQ5LCJoIjo0NTYsImxhYmVsIjoiRHJpdmUiLCJtb2RlbCI6ImNsYXNzaWMifSx7ImlkIjoic3BkIiwidCI6InNsaWRlciIsIngiOjQxMCwieSI6NDkzLCJ3IjoxNDgsImgiOjI2MiwibGFiZWwiOiJTcGVlZCIsIm1pbiI6NjAsIm1heCI6MjU1LCJzdGVwIjo1LCJ2YWx1ZSI6MjAwfSx7ImlkIjoiZ2F1Z2Vfc3J2MSIsInQiOiJnYXVnZSIsIngiOjE2LCJ5IjoyMzEsInciOjE2NCwiaCI6MTg1LCJsYWJlbCI6IlNlcnZvIDEiLCJtaW4iOjAsIm1heCI6MTgwLCJ1bml0cyI6IsKwIiwiZGVjaW1hbHMiOjAsIm1vZGVsIjoibWluIiwic291cmNlIjoic2xpZGVyX3NydjEiLCJ2YWx1ZSI6OTB9LHsiaWQiOiJnYXVnZV9zcnYyIiwidCI6ImdhdWdlIiwieCI6MTk0LCJ5IjoyMzUsInciOjE3MywiaCI6MTgxLCJsYWJlbCI6IlNlcnZvIDIiLCJtaW4iOjAsIm1heCI6MTgwLCJ1bml0cyI6IsKwIiwiZGVjaW1hbHMiOjAsIm1vZGVsIjoibWluIiwic291cmNlIjoic2xpZGVyX3NydjIiLCJ2YWx1ZSI6OTB9LHsiaWQiOiJnYXVnZV9zcGQiLCJ0IjoiZ2F1Z2UiLCJ4Ijo2MjAsInkiOjUwMSwidyI6MjI5LCJoIjoyNTIsImxhYmVsIjoiU3BlZWQiLCJtaW4iOjYwLCJtYXgiOjI1NSwidW5pdHMiOiIiLCJkZWNpbWFscyI6MCwibW9kZWwiOiJtaW4iLCJzb3VyY2UiOiJzcGQiLCJ2YWx1ZSI6MjAwfSx7ImlkIjoibW9kZSIsInQiOiJzZWxlY3QiLCJ4IjoxMDgwLCJ5IjoxMTksInciOjE3OSwiaCI6OTIsImxhYmVsIjoiTW9kZSIsIm9wdGlvbnMiOiJNYW51YWwsTGluZSxBdm9pZCJ9LHsiaWQiOiJidG5fc3RvcCIsInQiOiJidXR0b24iLCJ4IjoyNjEsInkiOjU4NiwidyI6MTA3LCJoIjoxMTUsImxhYmVsIjoiU1RPUCJ9LHsiaWQiOiJidG5fYnV6eiIsInQiOiJidXR0b24iLCJ4IjoyNjAsInkiOjQ0OSwidyI6MTA4LCJoIjoxMjEsImxhYmVsIjoiQnV6eiJ9LHsiaWQiOiJ1cGQiLCJ0Ijoic2VsZWN0IiwieCI6ODg2LCJ5IjoxMTYsInciOjE4MiwiaCI6OTQsImxhYmVsIjoiVGVsZW1ldHJ5Iiwib3B0aW9ucyI6IkFsbCxCYXNpYyxPZmYifSx7ImlkIjoibGJsX2hlYXJ0YmVhdCIsInQiOiJsYWJlbCIsIngiOjEwMjEsInkiOjI5LCJ3IjoyMzcsImgiOjc2LCJsYWJlbCI6IlVwdGltZSJ9LHsiaWQiOiJsYmxfdmVyIiwidCI6ImxhYmVsIiwieCI6ODg3LCJ5IjoyNywidyI6MTA5LCJoIjo3OSwibGFiZWwiOiJGaXJtd2FyZSJ9LHsiaWQiOiJ0b2dnbGVfbGVkX2wiLCJ0IjoidG9nZ2xlIiwieCI6MjIsInkiOjQ0OSwidyI6OTcsImgiOjEyMSwibGFiZWwiOiJMRUQgTCJ9LHsiaWQiOiJ0b2dnbGVfbGVkX3IiLCJ0IjoidG9nZ2xlIiwieCI6MTQzLCJ5Ijo0NDksInciOjk3LCJoIjoxMjEsImxhYmVsIjoiTEVEIFIifSx7ImlkIjoibG5fbCIsInQiOiJsZWQiLCJ4IjoyNSwieSI6NTg2LCJ3Ijo3NiwiaCI6MTA1LCJsYWJlbCI6IkxpbmUgTCIsIm1vZGVsIjoiZG90IiwiY29sb3JPbiI6IiM0YWRlODAifSx7ImlkIjoibG5fciIsInQiOiJsZWQiLCJ4IjoxNTMsInkiOjU4NiwidyI6NzgsImgiOjEwNSwibGFiZWwiOiJMaW5lIFIiLCJtb2RlbCI6ImRvdCIsImNvbG9yT24iOiIjNGFkZTgwIn0seyJpZCI6ImFsZXJ0IiwidCI6Im5vdGlmaWNhdGlvbiIsIngiOjEyNjMsInkiOjI3LCJ3Ijo5MCwiaCI6MTg2LCJsYWJlbCI6IkFsZXJ0In0seyJpZCI6ImRpc3RfcmVhZCIsInQiOiJzZWxlY3QiLCJ4Ijo4NzcsInkiOjMzNiwidyI6MTk0LCJoIjo2MiwibGFiZWwiOiJEaXN0YW5jZSByZWFkIiwib3B0aW9ucyI6IkF1dG8sUmVhZCBub3cifSx7ImlkIjoiZ2F1Z2VfZGlzdCIsInQiOiJnYXVnZSIsIngiOjEwODcsInkiOjI2MywidyI6MjY0LCJoIjoxODcsImxhYmVsIjoiRGlzdGFuY2UiLCJtaW4iOjAsIm1heCI6MjAwLCJ1bml0cyI6ImNtIiwiZGVjaW1hbHMiOjAsIm1vZGVsIjoiY2xhc3NpYyJ9LHsiaWQiOiJncmFwaF9kaXN0IiwidCI6ImdyYXBoIiwieCI6ODY2LCJ5Ijo0NTksInciOjQ4MSwiaCI6Mjk4LCJsYWJlbCI6IkRpc3RhbmNlIGNtIiwibW9kZWwiOiJncmlkIiwid2luZG93U2VjIjozMCwic2VyaWVzIjoxfV0sImNhbnZhcyI6eyJ3IjoxMzcyLCJoIjo3NzZ9fQ=="
// v52: computed from CFG itself at boot.
let CFG_REV = cfgRevisionFromCfg(CFG)

bluetooth.onUartDataReceived(serial.delimiters(Delimiters.NewLine), function () {
    let cmd = bluetooth.uartReadUntil(serial.delimiters(Delimiters.NewLine))

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
        cfgVerPending = true
        cfgVerReplyAt = input.runningTime() + 20
    }
    else if (cmd.indexOf("CFGOK ") == 0) {
        if (cmd.substr(6) == CFG_REV) {
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

let driveSpeed = 200

// v48 UI MIRROR STATE
// -------------------
// The Servo 1, Servo 2 and Speed gauges are real widgets in CFG.
// Do NOT transmit their UPD messages from the BLE RX callback: v46 showed
// that callback-side TX can destabilize reconnects. Handlers only mark the
// latest value dirty; the forever loop coalesces and publishes it later.
let uiServo1 = 90
let uiServo2 = 90
let uiGaugeSrv1Dirty = false
let uiGaugeSrv2Dirty = false
let uiGaugeSpdDirty = false
let uiGaugeLastInputAt = 0
let uiGaugeTxNextAt = 0
let uiInitialSyncStage = 0
const UI_GAUGE_SETTLE_MS = 90
const UI_GAUGE_TX_GAP_MS = 45

function scheduleInitialUiSync() {
    uiInitialSyncStage = 1
    uiGaugeTxNextAt = input.runningTime() + 80
}

function sendUiValue(id: string, val: string) {
    // These are control-state mirrors, not optional sensor telemetry.
    if (!btConnected || !cfgSent) return
    bluetooth.uartWriteLine("UPD " + id + " " + val)
}

const DRIVE_SPEED_MIN = 60
const DRIVE_SPEED_MAX = 255
const DEAD_ZONE = 0.12

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
        basic.showArrow(ArrowNames.North, 0)
    } else if (l < 0 && r < 0) {
        basic.showArrow(ArrowNames.South, 0)
    } else if (l < 0 && r > 0) {
        basic.showArrow(ArrowNames.West, 0)
    } else if (l > 0 && r < 0) {
        basic.showArrow(ArrowNames.East, 0)
    } else {
        basic.showIcon(IconNames.SmallDiamond, 0)
    }
}

let pendingDebugL = 0, pendingDebugR = 0
let debugDirty = false
const GLYPH_DRIVE = 0
const GLYPH_STOP = 1
const GLYPH_DISCONNECTED = 2
const GLYPH_CONNECTED = 3
const GLYPH_LED_L = 4
const GLYPH_LED_R = 5
const GLYPH_BUZZ = 6
const GLYPH_SERVO = 7
let pendingGlyph = GLYPH_DRIVE
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

let lastDriveL = 0, lastDriveR = 0
let lastDriveAt = 0
const MIN_DRIVE_INTERVAL_MS = 125
const DRIVE_CHANGE_THRESHOLD = 15

let lastDriveCmdAt = 0
const DRIVE_WATCHDOG_MS = 2500

const MODE_MANUAL = 0
const MODE_LINE = 1
const MODE_AVOID = 2
let driveMode = MODE_MANUAL

let lastLineL = -1
let lastLineR = -1
const LINE_INTERVAL_MS = 100

const AVOID_STOP_CM = 20
const ALERT_CM = 25
const ALERT_CLEAR_CM = 40
let alertActive = false
let versionSent = false
let avoidUntil = 0
let avoidPhase = 0

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
        return
    }

    maqueen.motorRun(maqueen.Motors.M1, l >= 0 ? maqueen.Dir.CW : maqueen.Dir.CCW, Math.abs(l))
    maqueen.motorRun(maqueen.Motors.M2, r >= 0 ? maqueen.Dir.CW : maqueen.Dir.CCW, Math.abs(r))
    dbg("drive: nx=" + nx + " ny=" + ny + " -> L=" + l + " R=" + r)
    requestDriveDebug(l, r)
    lastDriveL = l
    lastDriveR = r
    lastDriveAt = now
}

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
    dbg("recv: " + id + " = " + val)

    if (id == "btn_stop" && val == "1") {
        maqueen.motorStop(maqueen.Motors.All)
        lastDriveL = 0
        lastDriveR = 0
        requestStopIcon()
        dbg("stop button pressed")
    }

    if (id == "spd") {
        driveSpeed = Math.constrain(parseInt(val), DRIVE_SPEED_MIN, DRIVE_SPEED_MAX)
        uiGaugeSpdDirty = true
        uiGaugeLastInputAt = input.runningTime()
        requestGlyphValue(GLYPH_SERVO, Math.idiv(driveSpeed * 180, DRIVE_SPEED_MAX))
        dbg("speed -> " + driveSpeed)
    }

    if (id == "upd") {
        if (val == "Off") updLevel = UPD_OFF
        else if (val == "Basic") updLevel = UPD_BASIC
        else updLevel = UPD_ALL
        if (updLevel != UPD_OFF) versionSent = false
        dbg("telemetry -> " + val)
    }

    // One-shot ultrasonic read in any drive mode. The expensive sensor call
    // is deferred to forever(), never executed inside this BLE callback.
    if (id == "dist_read" && val == "Read now") {
        forceDistanceOnce = true
        dbg("distance: forced one-shot requested")
    }

    if (id == "mode") {
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

    if (id == "btn_buzz" && val == "1") {
        requestGlyph(GLYPH_BUZZ)
        music.playTone(440, music.beat(BeatFraction.Quarter))
    }

    if (id == "slider_srv1") {
        let angle1 = Math.constrain(parseInt(val), 0, 180)
        uiServo1 = angle1
        uiGaugeSrv1Dirty = true
        uiGaugeLastInputAt = input.runningTime()
        requestGlyphValue(GLYPH_SERVO, angle1)
        if (servoWriteAllowed(1, angle1)) {
            maqueen.servoRun(maqueen.Servos.S1, angle1)
            dbg("servo S1 -> " + angle1)
        }
    }
    if (id == "slider_srv2") {
        let angle2 = Math.constrain(parseInt(val), 0, 180)
        uiServo2 = angle2
        uiGaugeSrv2Dirty = true
        uiGaugeLastInputAt = input.runningTime()
        requestGlyphValue(GLYPH_SERVO, angle2)
        if (servoWriteAllowed(2, angle2)) {
            maqueen.servoRun(maqueen.Servos.S2, angle2)
            dbg("servo S2 -> " + angle2)
        }
    }

    if (id == "toggle_led_l") {
        requestGlyphValue(GLYPH_LED_L, val == "1" ? 1 : 0)
        maqueen.writeLED(maqueen.LED.LEDLeft, val == "1" ? maqueen.LEDswitch.turnOn : maqueen.LEDswitch.turnOff)
    }
    if (id == "toggle_led_r") {
        requestGlyphValue(GLYPH_LED_R, val == "1" ? 1 : 0)
        maqueen.writeLED(maqueen.LED.LEDRight, val == "1" ? maqueen.LEDswitch.turnOn : maqueen.LEDswitch.turnOff)
    }

    if (id == "dpad_move") {
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

function sendValue(id: string, val: string) {
    if (!btConnected || !cfgSent) return
    if (updLevel == UPD_OFF) return
    if (updLevel == UPD_BASIC && id != "lbl_heartbeat" && id != "lbl_ver") return
    bluetooth.uartWriteLine("UPD " + id + " " + val)
}

maqueen.motorStop(maqueen.Motors.All)
maqueen.servoRun(maqueen.Servos.S1, 90)
maqueen.servoRun(maqueen.Servos.S2, 90)
basic.showString(FIRMWARE_VERSION)
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

function handleLinkLost() {
    if (linkLostHandled) return
    linkLostHandled = true
    btConnected = false
    cfgSent = false
    cfgTxActive = false
    cfgTxStage = 0
    cfgTxPos = 0
    cfgTxChunkIdx = 0
    cfgVerPending = false
    cfgVerReplyAt = 0
    uiInitialSyncStage = 0
    uiGaugeSrv1Dirty = false
    uiGaugeSrv2Dirty = false
    uiGaugeSpdDirty = false
    uiGaugeTxNextAt = 0
    logQueue = []
    // v46: reboot the BLE peripheral after the X is painted. This is the
    // automatic replacement for the physical RESET that was previously
    // required before GETCFG would work after a disconnect.
    bleStackResetAt = input.runningTime() + BLE_STACK_RESET_DELAY_MS
    maqueen.motorStop(maqueen.Motors.All)
    lastDriveL = 0
    lastDriveR = 0
    lastDriveCmdAt = input.runningTime()
    btnFwd = false
    btnBack = false
    btnLeft = false
    btnRight = false
    pendingDebugL = 0
    pendingDebugR = 0
    requestGlyph(GLYPH_DISCONNECTED)
    heartbeat = 0
    lastLineL = -1
    lastLineR = -1
    alertActive = false
    versionSent = false
    driveMode = MODE_MANUAL
    avoidPhase = 0
    avoidUntil = 0
    dbg("link lost, motors stopped")
}

bluetooth.onBluetoothDisconnected(function () {
    dbg("BLE disconnect event")
    handleLinkLost()
    // If the main loop is ever stuck in a UART write, reset from this event
    // fiber anyway. X remains visible briefly, then Bluetooth starts clean.
    basic.pause(BLE_STACK_RESET_DELAY_MS)
    control.reset()
})

const HEARTBEAT_INTERVAL_MS = 1000
let nextHeartbeatAt = 0

function pad2(n: number): string {
    return n < 10 ? "0" + n : "" + n
}
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
const DIST_INTERVAL_MS = 400
const DIST_INTERVAL_MAX_MS = 5000
let distInterval = DIST_INTERVAL_MS
const DIST_MAX_CM = 200
let nextDistAt = 0
let forceDistanceOnce = false   // v49: selector-triggered one-shot in ANY mode
let nextLineAt = 0
basic.forever(function () {
    let now = input.runningTime()

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

    if (debugDirty) {
        debugDirty = false
        if (pendingGlyph == GLYPH_STOP) {
            basic.showIcon(IconNames.Square, 0)
        } else if (pendingGlyph == GLYPH_DISCONNECTED) {
            basic.showIcon(IconNames.No, 0)
        } else if (pendingGlyph == GLYPH_CONNECTED) {
            basic.showIcon(IconNames.Yes, 0)
        } else if (pendingGlyph == GLYPH_LED_L) {
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
            led.plotBarGraph(pendingValue, 180)
        } else {
            showDriveDebug(pendingDebugL, pendingDebugR)
        }
    }

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
    if (btConnected && cfgVerPending && now >= cfgVerReplyAt) {
        bluetooth.uartWriteLine("CFGVER " + CFG_REV)
        cfgVerPending = false
        basic.pause(20)
        return
    }

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
            if (uiInitialSyncStage == 1) sendUiValue("slider_srv1", "" + uiServo1)
            else if (uiInitialSyncStage == 2) sendUiValue("gauge_srv1", "" + uiServo1)
            else if (uiInitialSyncStage == 3) sendUiValue("slider_srv2", "" + uiServo2)
            else if (uiInitialSyncStage == 4) sendUiValue("gauge_srv2", "" + uiServo2)
            else if (uiInitialSyncStage == 5) sendUiValue("spd", "" + driveSpeed)
            else if (uiInitialSyncStage == 6) sendUiValue("gauge_spd", "" + driveSpeed)
            uiInitialSyncStage += 1
            if (uiInitialSyncStage > 6) uiInitialSyncStage = 0
            uiGaugeTxNextAt = now + UI_GAUGE_TX_GAP_MS
            uiSent = true
        } else if (now - uiGaugeLastInputAt >= UI_GAUGE_SETTLE_MS) {
            if (uiGaugeSrv1Dirty) {
                sendUiValue("gauge_srv1", "" + uiServo1)
                uiGaugeSrv1Dirty = false
                uiSent = true
            } else if (uiGaugeSrv2Dirty) {
                sendUiValue("gauge_srv2", "" + uiServo2)
                uiGaugeSrv2Dirty = false
                uiSent = true
            } else if (uiGaugeSpdDirty) {
                sendUiValue("gauge_spd", "" + driveSpeed)
                uiGaugeSpdDirty = false
                uiSent = true
            }
            if (uiSent) uiGaugeTxNextAt = now + UI_GAUGE_TX_GAP_MS
        }
        if (uiSent) {
            basic.pause(20)
            return
        }
    }

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

    if (cfgSent && !versionSent) {
        versionSent = true
        if ((lastDriveL == 0 && lastDriveR == 0) || now - lastDriveCmdAt > 500) sendValue("lbl_ver", FIRMWARE_VERSION)
    }

    if (driveMode != MODE_MANUAL && now >= nextLineAt) {
        nextLineAt = now + LINE_INTERVAL_MS
        let rawL = maqueen.readPatrol(maqueen.Patrol.PatrolLeft)
        let rawR = maqueen.readPatrol(maqueen.Patrol.PatrolRight)
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

        if (driveMode == MODE_LINE) {
            if (onL == 1 && onR == 1) {
                driveAuto(0, 1)
            } else if (onL == 1 && onR == 0) {
                driveAuto(-0.6, 0.4)
            } else if (onL == 0 && onR == 1) {
                driveAuto(0.6, 0.4)
            } else {
                driveAuto(0.8, 0)
            }
            lastDriveCmdAt = now
        }
    }

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
    // Poll in every mode, not only Avoid: with Telemetry on All the graph is
    // expected to keep drawing, and in Manual it drew nothing. Avoid still
    // polls at any telemetry level because distance is its input, not a
    // readout. busyDriving below remains the real safety guard.
    let autoDistDue = (driveMode == MODE_AVOID || updLevel == UPD_ALL) && now >= nextDistAt
    let busyDriving = (lastDriveL != 0 || lastDriveR != 0) && driveMode != MODE_AVOID
    if (cfgSent && (forceDist || (autoDistDue && !busyDriving))) {
        if (forceDist) forceDistanceOnce = false
        nextDistAt = now + distInterval   // every mode now, or it re-measures each pass
        {
            let cm = maqueen.Ultrasonic()
            if (cm >= 500 || cm <= 0) {
                distInterval = Math.min(distInterval * 2, DIST_INTERVAL_MAX_MS)
            } else {
                distInterval = DIST_INTERVAL_MS
            }
            let reported = -1
            if (cm >= 500) {
                reported = DIST_MAX_CM
            } else if (cm > 0) {
                reported = Math.min(cm, DIST_MAX_CM)
            } else {
                dbg("dist: bad read (" + cm + ")")
            }
            dbg("dist raw=" + cm + " next=" + distInterval + "ms")

            if (cm > 0) {
                if (forceDist) sendUiValue("graph_dist", "" + cm)
                else sendValue("graph_dist", "" + cm)
            }
            if (reported >= 0) {
                if (forceDist) sendUiValue("gauge_dist", "" + reported)
                else sendValue("gauge_dist", "" + reported)
            }

            // Reset the momentary CFG selector after the requested sample.
            // sendUiValue bypasses the Telemetry selector on purpose: this is
            // direct feedback to an explicit user action, not background data.
            if (forceDist) sendUiValue("dist_read", "Auto")

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

            if (driveMode == MODE_AVOID) {
                if (avoidPhase == 0) {
                    if (reported >= 0 && reported < AVOID_STOP_CM) {
                        avoidPhase = 1
                        avoidUntil = now + 600
                        driveAuto(0, -1)
                    } else {
                        driveAuto(0, 1)
                    }
                } else if (avoidPhase == 1 && now >= avoidUntil) {
                    avoidPhase = 2
                    avoidUntil = now + 500
                    driveAuto(1, 0)
                } else if (avoidPhase == 2 && now >= avoidUntil) {
                    avoidPhase = 0
                }
                lastDriveCmdAt = now
            }
        }
    }

    if (cfgSent && logQueue.length > 0 && (lastDriveL == 0 && lastDriveR == 0) && now - lastDriveCmdAt > 500) {
        bluetooth.uartWriteLine("LOG " + logQueue.shift())
    }

    basic.pause(100)
})
