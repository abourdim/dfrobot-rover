# 🤖 dfrobot-rover — micro:bit rover on the DFRobot micro:Driver

A micro:bit V2 rover that drives on two continuous-rotation servos, sees with
an HC-SR04, shows its mood on a 128×32 OLED and lights an 8-pixel NeoPixel
strip. Controlled over Bluetooth from [rxy_web](https://github.com/abourdim/rxy_web) —
no install, no account, no WiFi.

**The robot owns the layout.** The app is a generic renderer: it connects, asks
the robot for its panel, and draws whatever comes back. There is no per-robot
build of the app, and nothing to configure on the browser side.

## Hardware

| part | connection | notes |
|---|---|---|
| micro:bit **V2** | edge slot | V2 required — V1 has too little RAM for BLE + strip + OLED |
| micro:Driver **DFR0548** | — | PCA9685 at `0x40`, motors and servos over I²C |
| left drive servo | **S1** | 360° continuous rotation, `90` = stop |
| right drive servo | **S2** | mounted mirrored — see the trim note below |
| OLED 128×32 | **I²C port** | SSD1306 at `0x3C`, shares the bus with the driver |
| HC-SR04**P** | **P13** trig · **P14** echo | 3.3 V part; power it at 3.3 V and no divider is needed |
| NeoPixel ×8 | **P15** | |
| battery 4×AA | **DC jack** | 3.5–5.5 V; servos draw from here, never from USB |

Free for later: **P0 P1 P2 P8 P12 P16**.

### MakeCode extension

Paste the URL rather than searching — several look-alike "motor" extensions
compile cleanly and move nothing:

```
https://github.com/DFRobot/pxt-motor
```

### Two things that bite

**The right servo is mirrored.** Forward is *down* from 90 on that side and
*up* on the left. Trim is therefore added on the left and **subtracted** on the
right, so a positive trim means "more forward" on both wheels. Adding it to
both is what made the ESP32 rover curve right, and two 360° servos never run at
matched speeds out of the box — expect to trim every robot individually.

**A 128×32 OLED needs its init corrected.** The common MakeCode libraries take
a height parameter but hardcode the two registers that actually tell the
SSD1306 how many rows it has. After `init`, send `0xA8, 0x1F` and `0xDA, 0x02`
or the text draws doubled and interlaced — it initialises without error, so
there is nothing to chase.

## Where the code is

Everything board-specific lives in one seam at the top of
[`firmware/rover-remote.ts`](firmware/rover-remote.ts):

```
wheels(l, r)     drive mix -> two servo pulses, with the mirror and the trim
wheelsStop()     both wheels to neutral
pingCm()         HC-SR04P on P13/P14, 0 means no echo
```

Everything below that seam — BLE, the chunked CFG transfer, the `GETCFGVER`
cache, telemetry, the drive watchdog, the D-pad mask handling — is unchanged
from [`maqueen-rxy`](https://github.com/abourdim/maqueen-rxy) and should stay
diffable against it. Changing driver board again means rewriting those three
functions and nothing else.

## Relationship to maqueen-rxy

Forked with full history, so fixes cherry-pick both ways rather than being
hand-copied. What this chassis does **not** have, and what was removed with it:

| removed | why |
|---|---|
| DC motors (`motorRun`) | servos drive this rover |
| two auxiliary servo sliders | S1/S2 *are* the wheels here — a slider jerking them to an absolute angle would fight the D-pad for the same hardware |
| two board LEDs | the NeoPixel strip replaces them |
| both line sensors | not on this chassis |
| **Line** mode | a follower reading floating pins drives straight off the table |

**Avoid** mode survives — it needs only the sonar.

## Flashing

There is no local build. Open [makecode.microbit.org](https://makecode.microbit.org),
add the `pxt-motor` extension, switch to the JavaScript view, paste
`firmware/rover-remote.ts`, and download to the micro:bit.

Unlike the ESP32 robots in this family, **this firmware cannot be compiled
locally** — errors only surface on paste. Treat a fresh paste as the build
step, not a formality.

## Status

| | |
|---|---|
| hardware layer | ported and committed — drive, sonar, removals |
| layouts | **not yet regenerated** — the CFG blob still names Maqueen widgets |
| fun features | designed, not built |
| compiled | **never** — needs a MakeCode paste |

The panels are the next piece. Until they are regenerated, the robot serves a
layout containing controls it no longer handles.

## Planned features

Three of these need no extra hardware at all — micro:bit V2 already has a
speaker, a microphone and an accelerometer.

- **A face on the screen.** Two big eyes on the 128×32. Blinks, looks worried
  as an obstacle nears, dizzy when spinning, asleep when idle.
- **Type a message.** An edit field in the app; the text scrolls on the OLED,
  and the panel mirrors what is *actually* on screen.
- **The strip as a rangefinder.** Pixels light green → amber → red as something
  approaches, and how many light up shows how close. It makes an invisible
  sensor visible, which is the best teaching trick here.
- **Ouch.** The accelerometer catches a bump; the rover flinches, flashes red
  and backs off.
- **Reversing beeper**, only when driving backwards.
- **Clap to go** — one clap starts, two stops.
- **Follow my hand** — holds a fixed distance from whatever is in front.
- **Record & replay** — drive a path, play it back. This is the one that
  quietly teaches programming.
- **Light shows** — rainbow, chase, sparkle, Knight Rider.

Powered by [Workshop-DIY.org](https://workshop-diy.org)
