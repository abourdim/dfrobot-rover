"""Build the rover's control panel and splice it into rover-remote.ts.

The panel inherited from the donor chassis advertised hardware this rover does
not have -- two auxiliary servo sliders, two board LEDs, two line sensors and a
Line mode -- so those controls rendered and did nothing. A control that looks
live and is dead is worse than a missing one.

Every widget here is checked against the firmware's actual contract: an id
must either be handled by handleWidget() or fed by sendValue()/sendUiValue().
The check reads rover-remote.ts, so it cannot drift out of date.
"""
import base64, itertools, json, os, re, textwrap

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = f"{HERE}/rover-remote.ts"
PAD, TITLE = 24, 34

# Smallest box each widget type draws its own chrome in without clipping.
# Measured against the real app, not guessed.
MIN_SIZE = {"button": (100, 100), "label": (80, 60), "select": (120, 60),
            "gauge": (120, 120), "slider": (80, 150), "led": (60, 60)}


def W(wid, t, x, y, w, h, **kw):
    d = dict(id=wid, t=t, x=x, y=y, w=w, h=h)
    d.update(kw)
    return d


def group(gid, label, color, members):
    x1 = min(m["x"] for m in members); y1 = min(m["y"] for m in members)
    x2 = max(m["x"] + m["w"] for m in members); y2 = max(m["y"] + m["h"] for m in members)
    return dict(id=gid, t="group", label=label, color=color,
                x=x1 - PAD, y=y1 - PAD - TITLE,
                w=(x2 + PAD) - (x1 - PAD), h=(y2 + PAD) - (y1 - PAD - TITLE),
                children=",".join(m["id"] for m in members))


# ── DRIVE ───────────────────────────────────────────────────────────────────
# The pad leads. The two jog buttons sit under it -- each runs ONE wheel, held
# not clicked, so holding both drives straight. Trim sits beside them because
# that is when you use it: jog a wheel, watch it, nudge its trim.
drive = [
    W("dpad_move", "dpad", 80, 100, 420, 420, label="Drive", model="classic"),
    W("spd", "slider", 540, 100, 120, 260, label="Speed",
      min=60, max=255, step=5, value=200),
    W("btn_stop", "button", 700, 100, 120, 120, label="STOP"),
    W("gauge_spd", "gauge", 700, 260, 200, 190, label="Speed",
      min=60, max=255, decimals=0, model="min", source="spd", value=200),
    W("btn_ml", "button", 80, 560, 190, 120, label="Left wheel",
      icon="⚙️", spin=-1, color="#0e7490"),
    W("btn_mr", "button", 290, 560, 190, 120, label="Right wheel",
      icon="⚙️", spin=1, color="#0e7490"),
    W("trim_l", "slider", 530, 560, 100, 180, label="Trim L",
      min=-20, max=20, step=1, value=0),
    W("trim_r", "slider", 650, 560, 100, 180, label="Trim R",
      min=-20, max=20, step=1, value=0),
]

# ── DISTANCE ────────────────────────────────────────────────────────────────
dist = [
    W("gauge_dist", "gauge", 1000, 100, 220, 200, label="Distance",
      min=0, max=200, units="cm", decimals=0, model="classic"),
    W("alert", "notification", 1250, 110, 100, 180, label="Alert"),
    W("dist_read", "select", 1000, 330, 180, 70, label="Distance read",
      options="Auto,Read now"),
    W("graph_dist", "graph", 1000, 430, 420, 250, label="Distance cm",
      model="grid", windowSec=30, series=1),
]

# ── SYSTEM ──────────────────────────────────────────────────────────────────
# Mode offers Manual and Avoid only. There is no Line: this chassis has no
# line sensors, and a follower reading floating pins drives off the table.
system = [
    W("mode", "select", 80, 850, 160, 70, label="Mode", options="Manual,Avoid"),
    W("upd", "select", 270, 850, 160, 70, label="Telemetry", options="All,Basic,Off"),
    W("lbl_ver", "label", 460, 850, 160, 70, label="Firmware", model="card"),
    W("lbl_heartbeat", "label", 650, 850, 220, 70, label="Uptime", model="card"),
    W("btn_buzz", "button", 80, 960, 120, 120, label="Beep"),
]

ZONES = [("grp_drive", "DRIVE", "#00d4ff", drive),
         ("grp_dist", "DISTANCE", "#ffb020", dist),
         ("grp_sys", "SYSTEM", "#8892b0", system)]

groups, controls = [], []
for gid, label, color, members in ZONES:
    groups.append(group(gid, label, color, members))
    controls += members

widgets = groups + controls
cfg = {"title": "Rover Remote", "widgets": widgets,
       "canvas": {"w": max(w["x"] + w["w"] for w in widgets) + 56,
                  "h": max(w["y"] + w["h"] for w in widgets) + 56}}

# ── checks ──────────────────────────────────────────────────────────────────
src = open(SRC, encoding="utf-8").read()
handled = set(re.findall(r'id == "([a-z_0-9]+)"', src))
handled |= set(re.findall(r'handleWidget\("([a-z_0-9]+)"', src))
sent = set(re.findall(r'send(?:Ui)?Value\("([a-z_0-9]+)"', src))
live = handled | sent

box = lambda w: (w["x"], w["y"], w["x"] + w["w"], w["y"] + w["h"])
def ov(a, b):
    a1, b1, a2, b2 = box(a); c1, d1, c2, d2 = box(b)
    return not (a2 <= c1 or c2 <= a1 or b2 <= d1 or d2 <= b1)

errs = []
for w in controls:
    if w["id"] not in live:
        errs.append(f"{w['id']} has no handler and no telemetry in rover-remote.ts")
    mw, mh = MIN_SIZE.get(w["t"], (0, 0))
    if w["w"] < mw or w["h"] < mh:
        errs.append(f"{w['id']} is {w['w']}x{w['h']}, under the {mw}x{mh} floor for {w['t']}")
by = {w["id"]: w for w in widgets}
for g in groups:
    gx1, gy1, gx2, gy2 = box(g)
    for cid in g["children"].split(","):
        x1, y1, x2, y2 = box(by[cid])
        if min(x1 - gx1, gx2 - x2, gy2 - y2) < PAD:
            errs.append(f"{cid} padding in {g['label']}")
        if y1 - gy1 < PAD + TITLE:
            errs.append(f"{cid} under the {g['label']} header")
for a, b in itertools.combinations(groups, 2):
    if ov(a, b): errs.append(f"group overlap {a['label']} ~ {b['label']}")
for a, b in itertools.combinations(controls, 2):
    if ov(a, b): errs.append(f"control overlap {a['id']} ~ {b['id']}")

print(f"  zones={len(groups)} controls={len(controls)}  canvas {cfg['canvas']['w']}x{cfg['canvas']['h']}")
for g in groups:
    print(f"    {g['label']:9} {g['w']:4}x{g['h']:<4} {len(g['children'].split(','))} items")
unused = sorted(live - {w["id"] for w in controls} - {"dpad_move"})
if unused:
    print(f"  note: handled by firmware but not on the panel: {unused}")
if errs:
    print("\n  FAILED"); [print("   -", e) for e in errs]; raise SystemExit(1)
print("  PASS - every widget is driven or fed, nothing overlaps, nothing under its floor")

mini = json.dumps(cfg, separators=(",", ":"), ensure_ascii=False)
b64 = base64.b64encode(mini.encode()).decode()
old = re.search(r'const CFG = "([^"]*)"', src).group(1)
src = re.sub(r'(const CFG = ")[^"]*(")', lambda m: m.group(1) + b64 + m.group(2), src, count=1)
open(SRC, "w", encoding="utf-8", newline="\n").write(src)
n, on = -(-len(b64) // 18), -(-len(old) // 18)
print(f"  CFG {len(old)} -> {len(b64)} B   chunks {on} -> {n}   load ~{on*0.035:.1f}s -> ~{n*0.035:.1f}s")
json.dump(cfg, open(f"{HERE}/layout_rover.json", "w"), indent=1, ensure_ascii=False)
