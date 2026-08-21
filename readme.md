# 🤖 dfrobot-rover

A micro:bit rover that drives on two servo wheels, sees with an ultrasonic
sensor, shows its mood on a little screen and lights an 8-pixel strip.

You drive it from a web page over Bluetooth — nothing to install, no account,
no WiFi. Open [rxy_web](https://github.com/abourdim/rxy_web) in Chrome or Edge,
press **Connect**, and the rover's own control panel appears.

**The robot owns the layout.** The app is a plain renderer: it connects, asks
the rover what controls it has, and draws whatever comes back. There is nothing
to configure in the browser, and no special build of the app for this robot.

## Where everything plugs in

![Pinout — battery to DC, wheels to S1 and S2, screen to I2C, distance sensor to P13 and P14, light strip to P15](assets/pinout.svg)

| part | plugs into | notes |
|---|---|---|
| micro:bit **V2** | the edge slot | V2 only — V1 hasn't enough memory for Bluetooth plus the strip and screen |
| left wheel servo | **S1** | 360° continuous rotation; `90` means stop |
| right wheel servo | **S2** | mounted mirrored — see *Straight-line trim* below |
| little screen | **I²C port** | SSD1306 128×32 at address `0x3C` |
| distance sensor | **P13** trig · **P14** echo | HC-SR04**P**, the 3.3 V version |
| light strip | **P15** | 8 NeoPixels |
| battery pack | **DC socket** | 4×AA, 3.5–5.5 V |

Still free for whatever you add next: **P0 P1 P2 P8 P12 P16**.

### Two things share one cable

The screen and the motor driver both live on the I²C port and don't argue —
the driver answers to `0x40`, the screen to `0x3C`. The wheels therefore cost
**no pins at all**; they're driven over that same cable.

### Check this before the first power-on

Measure the **`V` pin** on the P13 or P14 socket with the battery connected.
It should read about **3.3 V**. The distance sensor's echo output copies
whatever voltage you feed it, so if that socket supplies 5 V instead, echo puts
5 V onto a 3.3 V pin. If it does read 5 V: take the sensor's red wire from a
3.3 V point, or fit a divider (4.7 kΩ from echo, 10 kΩ to ground).

## Programming it

Open **[makecode.microbit.org](https://makecode.microbit.org)** → *Extensions*,
and paste this URL into the search box:

```
https://github.com/DFRobot/pxt-motor
```

| | |
|---|---|
| extension | **[DFRobot/pxt-motor](https://github.com/DFRobot/pxt-motor)** |
| appears in MakeCode as | `motor` |
| blocks namespace | `motor.servo()`, `motor.MotorRun()`, `motor.motorStop()` |

**Paste the URL — do not search by name.** DFRobot published this as plain
`motor`, the most generic name on the platform, so a search returns a pile of
look-alikes with this one somewhere among them. Pick the wrong one and it
**compiles cleanly and moves nothing**, which is a miserable thing to debug.

Then switch to the JavaScript view, paste
[`firmware/rover-remote.ts`](firmware/rover-remote.ts), and download to the
micro:bit.

There is no local build step. MakeCode compiles in the browser, so **a fresh
paste is the build** — treat a successful paste as the thing that proves the
code, not a formality.

## Two traps worth knowing

**Straight-line trim.** The right servo is mounted facing the other way, so
"forward" is *down* from 90 on that side and *up* on the left. Trim is added on
the left and **subtracted** on the right, so a positive number means "more
forward" on both wheels. Add it to both and the rover curves. Two 360° servos
never run at matched speeds out of the box, so expect to trim every robot
individually — drive it forward on a flat floor and nudge whichever wheel is
lagging.

**The 128×32 screen needs its start-up corrected.** The common MakeCode screen
libraries accept a height but hardcode the two registers that tell the display
how many rows it actually has. After `init`, send `0xA8, 0x1F` and
`0xDA, 0x02`, or text draws doubled and interlaced. It starts up without any
error, so there's nothing to chase — you just get a strange-looking screen.

## How the code is arranged

Everything specific to this board sits in one short seam at the top of
[`firmware/rover-remote.ts`](firmware/rover-remote.ts):

```
wheels(l, r)     drive mix → two servo pulses, with the mirror and the trim
wheelsStop()     both wheels to neutral
pingCm()         distance sensor on P13/P14; 0 means nothing came back
```

Everything below that seam is the shared rxy stack — Bluetooth, the chunked
layout transfer, the layout cache, telemetry, the drive watchdog, the D-pad
handling. Changing to a different driver board means rewriting those three
functions and nothing else.

### How the app and the robot talk

```
app   → robot   GETCFGVER          what layout do you have?
robot → app     CFGVER <id>        this one
        (match) → CFGOK            already cached, nothing to send
        (differ)→ GETCFG           send it all
app   → robot   SET <widget> <v>   a control moved
robot → app     UPD <widget> <v>   a reading changed
```

Because the layout is cached against that id, only the **first** connection
pays for the transfer.

## Modes

| mode | what it does |
|---|---|
| **Manual** | you drive, with the pad or the joystick |
| **Avoid** | the rover drives itself and backs away from obstacles |

## Status

| | |
|---|---|
| drive, distance sensor | written |
| screen, light strip | planned |
| control panels | **not yet built** |
| compiled on real hardware | **not yet** — needs a MakeCode paste |

## Planned

Three of these need no extra parts — a micro:bit V2 already has a speaker, a
microphone and a motion sensor.

- **A face on the screen** — two big eyes that blink, look worried as something
  gets close, go dizzy when spinning, and fall asleep when idle.
- **Type a message** and watch it scroll across the rover's screen.
- **The strip as a distance meter** — pixels light green → amber → red as
  something approaches, and the number lit shows how close. It makes an
  invisible sensor visible.
- **Ouch** — the motion sensor feels a bump, the rover flinches and backs off.
- **Reversing beeper**, like a truck, only when going backwards.
- **Clap to go** — one clap starts, two stops.
- **Follow my hand** — holds a fixed distance from whatever is in front of it.
- **Record & replay** — drive a path, play it back.
- **Light shows** — rainbow, chase, sparkle, Knight Rider.

Powered by [Workshop-DIY.org](https://workshop-diy.org)
