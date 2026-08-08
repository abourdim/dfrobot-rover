// Maqueen Remote firmware — PASTE-READY (comments stripped)
// Generated from maqueen-remote.ts, which is the source of record.
// Extensions needed in MakeCode: pxt-maqueen

const FIRMWARE_VERSION = "v39"

let debugEnabled = false
let logQueue: string[] = []
const LOG_QUEUE_MAX = 20
function dbg(msg: string) {
    if (!debugEnabled) return
    logQueue.push(msg)
    if (logQueue.length > LOG_QUEUE_MAX) logQueue.shift()
}

bluetooth.startUartService()
let cfgSent = false

let btConnected = false

const CFG = "eyJ0aXRsZSI6Ik1hcXVlZW4gUmVtb3RlIiwid2lkZ2V0cyI6W3siaWQiOiJzbGlkZXJfc3J2MSIsInQiOiJzbGlkZXIiLCJ4IjozMCwieSI6NTUsInciOjcwLCJoIjoyMDAsImxhYmVsIjoiU2Vydm8gMSIsIm1pbiI6MCwibWF4IjoxODAsInN0ZXAiOjF9LHsiaWQiOiJzbGlkZXJfc3J2MiIsInQiOiJzbGlkZXIiLCJ4IjoxNDAsInkiOjU1LCJ3Ijo3MCwiaCI6MjAwLCJsYWJlbCI6IlNlcnZvIDIiLCJtaW4iOjAsIm1heCI6MTgwLCJzdGVwIjoxfSx7ImlkIjoiZHBhZF9tb3ZlIiwidCI6ImRwYWQiLCJ4IjoyNjAsInkiOjU1LCJ3IjoxNzUsImgiOjE3NSwibGFiZWwiOiJEcml2ZSIsIm1vZGVsIjoiY2xhc3NpYyJ9LHsiaWQiOiJzcGQiLCJ0Ijoic2xpZGVyIiwieCI6NDk1LCJ5Ijo1NSwidyI6NzAsImgiOjIwMCwibGFiZWwiOiJTcGVlZCIsIm1pbiI6NjAsIm1heCI6MjU1LCJzdGVwIjo1fSx7ImlkIjoibW9kZSIsInQiOiJzZWxlY3QiLCJ4IjozNSwieSI6MjkwLCJ3IjoxNjAsImgiOjg1LCJsYWJlbCI6Ik1vZGUiLCJvcHRpb25zIjoiTWFudWFsLExpbmUsQXZvaWQifSx7ImlkIjoiYnRuX3N0b3AiLCJ0IjoiYnV0dG9uIiwieCI6MjU1LCJ5IjoyODUsInciOjEwMCwiaCI6MTA1LCJsYWJlbCI6IlNUT1AifSx7ImlkIjoiYnRuX2J1enoiLCJ0IjoiYnV0dG9uIiwieCI6Mzc1LCJ5IjoyODUsInciOjEwMCwiaCI6MTA1LCJsYWJlbCI6IkJ1enoifSx7ImlkIjoibGJsX2hlYXJ0YmVhdCIsInQiOiJsYWJlbCIsIngiOjU1LCJ5Ijo0MDAsInciOjIyMCwiaCI6ODAsImxhYmVsIjoiVXB0aW1lIn0seyJpZCI6InRvZ2dsZV9sZWRfbCIsInQiOiJ0b2dnbGUiLCJ4IjoyNSwieSI6NDkwLCJ3Ijo5MCwiaCI6MTEwLCJsYWJlbCI6IkxFRCBMIn0seyJpZCI6InRvZ2dsZV9sZWRfciIsInQiOiJ0b2dnbGUiLCJ4IjoxNTgsInkiOjQ5MCwidyI6OTAsImgiOjExMCwibGFiZWwiOiJMRUQgUiJ9LHsiaWQiOiJsbl9sIiwidCI6ImxlZCIsIngiOjI4NSwieSI6NTAwLCJ3Ijo3MCwiaCI6OTAsImxhYmVsIjoiTGluZSBMIiwibW9kZWwiOiJkb3QiLCJjb2xvck9uIjoiIzRhZGU4MCJ9LHsiaWQiOiJsbl9yIiwidCI6ImxlZCIsIngiOjM4OCwieSI6NTAwLCJ3Ijo3MCwiaCI6OTAsImxhYmVsIjoiTGluZSBSIiwibW9kZWwiOiJkb3QiLCJjb2xvck9uIjoiIzRhZGU4MCJ9LHsiaWQiOiJhbGVydCIsInQiOiJub3RpZmljYXRpb24iLCJ4Ijo2OTAsInkiOjQwLCJ3IjoxODAsImgiOjkwLCJsYWJlbCI6IkFsZXJ0In0seyJpZCI6ImdyYXBoX2Rpc3QiLCJ0IjoiZ3JhcGgiLCJ4Ijo1ODAsInkiOjQyNSwidyI6MzgwLCJoIjoxNzUsImxhYmVsIjoiRGlzdGFuY2UgY20iLCJtb2RlbCI6ImdyaWQiLCJ3aW5kb3dTZWMiOjMwLCJzZXJpZXMiOjF9LHsiaWQiOiJsYmxfdmVyIiwidCI6ImxhYmVsIiwieCI6MzAwLCJ5Ijo0MDAsInciOjE2MCwiaCI6ODAsImxhYmVsIjoiRmlybXdhcmUifSx7ImlkIjoiZ2F1Z2VfZGlzdCIsInQiOiJnYXVnZSIsIngiOjY5MCwieSI6MTkwLCJ3IjoxODAsImgiOjE5NSwibGFiZWwiOiJEaXN0YW5jZSIsIm1pbiI6MCwibWF4IjoyMDAsInVuaXRzIjoiY20iLCJkZWNpbWFscyI6MH1dfQ=="

bluetooth.onUartDataReceived(serial.delimiters(Delimiters.NewLine), function () {
    let cmd = bluetooth.uartReadUntil(serial.delimiters(Delimiters.NewLine))

    if (cmd == "GETCFG") {
        dbg("GETCFG received (firmware " + FIRMWARE_VERSION + "), sending layout...")
        basic.pause(35)
        bluetooth.uartWriteLine("CFGBEGIN")
        basic.pause(35)

        debugDirty = false
        basic.clearScreen()
        let totalChunks = Math.idiv(CFG.length + 17, 18)
        let chunkIdx = 0
        let lit = 0
        for (let i = 0; i < CFG.length; i += 18) {
            bluetooth.uartWriteLine("CFG " + CFG.substr(i, 18))
            chunkIdx += 1
            let target = Math.idiv(chunkIdx * 25, totalChunks)
            while (lit < target) {
                led.plot(lit % 5, Math.idiv(lit, 5))
                lit += 1
            }
            basic.pause(35)
        }
        bluetooth.uartWriteLine("CFGEND")
        cfgSent = true
        requestGlyph(GLYPH_CONNECTED)
        dbg("layout sent, cfgSent = true")
    }
    else if (cmd.indexOf("SET ") == 0) {
        let parts = cmd.substr(4).split(" ")
        let id = parts[0]
        let val = parts.slice(1).join(" ")
        handleWidget(id, val)
    }
})

let driveSpeed = 200
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
const DRIVE_WATCHDOG_MS = 700

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
        requestGlyphValue(GLYPH_SERVO, Math.idiv(driveSpeed * 180, DRIVE_SPEED_MAX))
        dbg("speed -> " + driveSpeed)
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
        requestDriveDebug(0, 0)
        dbg("mode -> " + val)
    }

    if (id == "btn_buzz" && val == "1") {
        requestGlyph(GLYPH_BUZZ)
        music.playTone(440, music.beat(BeatFraction.Quarter))
    }

    if (id == "slider_srv1") {
        let angle1 = parseInt(val)
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
    if (btConnected && cfgSent) bluetooth.uartWriteLine("UPD " + id + " " + val)
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

bluetooth.onBluetoothDisconnected(function () {
    btConnected = false
    cfgSent = false
    logQueue = []
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
    dbg("BLE disconnected, motors stopped")
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
let nextLineAt = 0
basic.forever(function () {
    let now = input.runningTime()

    if ((lastDriveL != 0 || lastDriveR != 0) && now - lastDriveCmdAt > DRIVE_WATCHDOG_MS) {
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

    if (!btConnected) {
        basic.pause(100)
        return
    }

    if (now >= nextHeartbeatAt) {
        nextHeartbeatAt = now + HEARTBEAT_INTERVAL_MS
        if (cfgSent) {
            heartbeat += 1
            sendValue("lbl_heartbeat", uptimeString(heartbeat))
        }
    }

    if (cfgSent && !versionSent) {
        versionSent = true
        sendValue("lbl_ver", FIRMWARE_VERSION)
    }

    if (now >= nextLineAt) {
        nextLineAt = now + LINE_INTERVAL_MS
        let rawL = maqueen.readPatrol(maqueen.Patrol.PatrolLeft)
        let rawR = maqueen.readPatrol(maqueen.Patrol.PatrolRight)
        let onL = rawL == 0 ? 1 : 0
        let onR = rawR == 0 ? 1 : 0
        if (cfgSent && onL != lastLineL) {
            lastLineL = onL
            sendValue("ln_l", "" + onL)
        }
        if (cfgSent && onR != lastLineR) {
            lastLineR = onR
            sendValue("ln_r", "" + onR)
        }

        if (driveMode == MODE_LINE) {
            if (onL == 1 && onR == 1) {
                driveMix(0, 1)
            } else if (onL == 1 && onR == 0) {
                driveMix(-0.6, 0.4)
            } else if (onL == 0 && onR == 1) {
                driveMix(0.6, 0.4)
            } else {
                driveMix(0.8, 0)
            }
            lastDriveCmdAt = now
        }
    }

    let busyDriving = (lastDriveL != 0 || lastDriveR != 0) && driveMode != MODE_AVOID
    if (now >= nextDistAt && !busyDriving) {
        nextDistAt = now + distInterval
        if (cfgSent) {
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
                sendValue("graph_dist", "" + cm)
            }
            if (reported >= 0) {
                sendValue("gauge_dist", "" + reported)
            }

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
                        driveMix(0, -1)
                    } else {
                        driveMix(0, 1)
                    }
                } else if (avoidPhase == 1 && now >= avoidUntil) {
                    avoidPhase = 2
                    avoidUntil = now + 500
                    driveMix(1, 0)
                } else if (avoidPhase == 2 && now >= avoidUntil) {
                    avoidPhase = 0
                }
                lastDriveCmdAt = now
            }
        }
    }

    if (cfgSent && logQueue.length > 0) {
        bluetooth.uartWriteLine("LOG " + logQueue.shift())
    }

    basic.pause(100)
})
