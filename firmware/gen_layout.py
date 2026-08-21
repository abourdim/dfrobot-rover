"""Build the rover's four control panels and splice them into rover-remote.ts.

Beginner / Expert / Drive / Distance, chosen from the Level selector on the
panel itself, so a child moves between exercises with a dropdown instead of an
adult reflashing.

Every widget is checked against the firmware's real contract: an id must be
handled by handleWidget() or fed by sendValue()/sendUiValue(). The check reads
rover-remote.ts, so it cannot drift out of date -- which is exactly how the
donor's panel ended up advertising hardware this rover does not have.
"""
import base64, itertools, json, os, re, textwrap

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = f"{HERE}/rover-remote.ts"
PAD, TITLE = 24, 34

# Smallest box each widget type draws its own chrome in without clipping.
# Measured against the real app, not guessed.
MIN_SIZE = {"button": (100, 100), "label": (80, 60), "select": (120, 60),
            "gauge": (120, 120), "slider": (80, 150), "led": (60, 60)}

LEVELS = "Beginner,Expert,Drive,Distance"


def W(wid, t, x, y, w, h, **kw):
    d = dict(id=wid, t=t, x=x, y=y, w=w, h=h)
    d.update(kw)
    return d


# `level` belongs on EVERY panel. If it lived only on Expert, choosing
# Beginner would strand the robot there until someone reflashed it.
LEVEL = lambda x, y: W("level", "select", x, y, 170, 70, label="Level", options=LEVELS)


def group(gid, label, color, members):
    x1 = min(m["x"] for m in members); y1 = min(m["y"] for m in members)
    x2 = max(m["x"] + m["w"] for m in members); y2 = max(m["y"] + m["h"] for m in members)
    return dict(id=gid, t="group", label=label, color=color,
                x=x1 - PAD, y=y1 - PAD - TITLE,
                w=(x2 + PAD) - (x1 - PAD), h=(y2 + PAD) - (y1 - PAD - TITLE),
                children=",".join(m["id"] for m in members))


def build(title, zones):
    groups, controls = [], []
    for gid, label, color, members in zones:
        groups.append(group(gid, label, color, members))
        controls += members
    widgets = groups + controls
    return {"title": title, "widgets": widgets,
            "canvas": {"w": max(w["x"] + w["w"] for w in widgets) + 56,
                       "h": max(w["y"] + w["h"] for w in widgets) + 56}}


# ── BEGINNER ────────────────────────────────────────────────────────────────
# Drive it, and see what it sees. No speed slider: at this level the pad IS the
# control, and a second one only invites "why won't it move".
beginner = build("Rover — Beginner", [
    ("grp_drive", "DRIVE", "#00d4ff", [
        W("dpad_move", "dpad", 80, 100, 380, 380, label="Drive", model="classic"),
        W("btn_stop", "button", 500, 100, 140, 140, label="STOP"),
    ]),
    ("grp_see", "WHAT IT SEES", "#ffb020", [
        W("gauge_dist", "gauge", 760, 100, 220, 200, label="Distance",
          min=0, max=200, units="cm", decimals=0, model="classic"),
        W("alert", "notification", 1010, 110, 110, 180, label="Alert"),
    ]),
    ("grp_sys", "ROBOT", "#8892b0", [
        LEVEL(80, 580),
        W("lbl_ver", "label", 280, 580, 160, 70, label="Firmware", model="card"),
    ]),
])

# ── EXPERT ──────────────────────────────────────────────────────────────────
# Everything the rover can do.
expert = build("Rover — Expert", [
    ("grp_drive", "DRIVE", "#00d4ff", [
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
    ]),
    # The sweep head sits with DISTANCE, not DRIVE: it aims the sensor, so it
    # belongs beside the reading it changes.
    ("grp_dist", "DISTANCE", "#ffb020", [
        W("gauge_dist", "gauge", 1000, 100, 220, 200, label="Distance",
          min=0, max=200, units="cm", decimals=0, model="classic"),
        W("alert", "notification", 1250, 110, 100, 180, label="Alert"),
        W("dist_read", "select", 1000, 330, 180, 70, label="Distance read",
          options="Auto,Read now"),
        W("graph_dist", "graph", 1000, 430, 420, 250, label="Distance cm",
          model="grid", windowSec=30, series=1),
        W("srv_head", "slider", 1000, 730, 100, 190, label="Look",
          min=0, max=180, step=1, value=90),
        W("gauge_head", "gauge", 1120, 730, 180, 190, label="Angle",
          min=0, max=180, units="°", decimals=0, model="min",
          source="srv_head", value=90),
        W("btn_head_center", "button", 1320, 760, 100, 100, label="Ahead"),
    ]),
    # Two rows, kept left of x=976: one row reached into the DISTANCE column
    # and the validator refused it.
    ("grp_sys", "SYSTEM", "#8892b0", [
        W("mode", "select", 80, 850, 160, 70, label="Mode", options="Manual,Avoid"),
        W("upd", "select", 270, 850, 160, 70, label="Telemetry", options="All,Basic,Off"),
        LEVEL(460, 850),
        W("lbl_ver", "label", 80, 960, 160, 70, label="Firmware", model="card"),
        W("lbl_heartbeat", "label", 270, 960, 220, 70, label="Uptime", model="card"),
        W("btn_buzz", "button", 520, 950, 120, 120, label="Beep"),
    ]),
])

# ── DRIVE TEST ──────────────────────────────────────────────────────────────
# One subsystem. Jog each wheel, watch which way it turns, trim it straight.
drive_test = build("Rover — Drive test", [
    ("grp_test", "WHEELS", "#00d4ff", [
        W("dpad_move", "dpad", 80, 100, 340, 340, label="Drive", model="classic"),
        W("spd", "slider", 460, 100, 110, 240, label="Speed",
          min=60, max=255, step=5, value=200),
        W("btn_stop", "button", 610, 100, 120, 120, label="STOP"),
        W("gauge_spd", "gauge", 610, 250, 190, 190, label="Speed",
          min=60, max=255, decimals=0, model="min", source="spd", value=200),
        W("btn_ml", "button", 80, 480, 190, 120, label="Left wheel",
          icon="⚙️", spin=-1, color="#0e7490"),
        W("btn_mr", "button", 290, 480, 190, 120, label="Right wheel",
          icon="⚙️", spin=1, color="#0e7490"),
        W("trim_l", "slider", 520, 480, 100, 180, label="Trim L",
          min=-20, max=20, step=1, value=0),
        W("trim_r", "slider", 640, 480, 100, 180, label="Trim R",
          min=-20, max=20, step=1, value=0),
        LEVEL(80, 700),
    ]),
])

# ── DISTANCE TEST ───────────────────────────────────────────────────────────
dist_test = build("Rover — Distance test", [
    ("grp_test", "DISTANCE", "#ffb020", [
        W("gauge_dist", "gauge", 80, 100, 220, 200, label="Distance",
          min=0, max=200, units="cm", decimals=0, model="classic"),
        W("alert", "notification", 330, 110, 110, 180, label="Alert"),
        W("dist_read", "select", 80, 330, 180, 70, label="Distance read",
          options="Auto,Read now"),
        W("graph_dist", "graph", 80, 430, 420, 240, label="Distance cm",
          model="grid", windowSec=30, series=1),
        W("srv_head", "slider", 540, 100, 100, 190, label="Look",
          min=0, max=180, step=1, value=90),
        W("gauge_head", "gauge", 540, 320, 180, 190, label="Angle",
          min=0, max=180, units="°", decimals=0, model="min",
          source="srv_head", value=90),
        W("btn_head_center", "button", 540, 540, 120, 120, label="Ahead"),
        LEVEL(80, 700),
    ]),
])

PANELS = [("BEGINNER", beginner), ("EXPERT", expert),
          ("DRIVE", drive_test), ("DIST", dist_test)]

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
for name, cfg in PANELS:
    groups = [w for w in cfg["widgets"] if w["t"] == "group"]
    controls = [w for w in cfg["widgets"] if w["t"] != "group"]
    ids = [w["id"] for w in controls]
    if "level" not in ids:
        errs.append(f"{name}: no Level selector -- switching here would strand the robot")
    if len(ids) != len(set(ids)):
        errs.append(f"{name}: duplicate widget ids")
    for w in controls:
        if w["id"] not in live:
            errs.append(f"{name}: {w['id']} has no handler and no telemetry")
        mw, mh = MIN_SIZE.get(w["t"], (0, 0))
        if w["w"] < mw or w["h"] < mh:
            errs.append(f"{name}: {w['id']} is {w['w']}x{w['h']}, under the {mw}x{mh} floor")
    by = {w["id"]: w for w in cfg["widgets"]}
    for g in groups:
        gx1, gy1, gx2, gy2 = box(g)
        for cid in g["children"].split(","):
            x1, y1, x2, y2 = box(by[cid])
            if min(x1 - gx1, gx2 - x2, gy2 - y2) < PAD:
                errs.append(f"{name}: {cid} padding in {g['label']}")
            if y1 - gy1 < PAD + TITLE:
                errs.append(f"{name}: {cid} under the {g['label']} header")
    for a, b in itertools.combinations(groups, 2):
        if ov(a, b): errs.append(f"{name}: group overlap {a['label']} ~ {b['label']}")
    for a, b in itertools.combinations(controls, 2):
        if ov(a, b): errs.append(f"{name}: control overlap {a['id']} ~ {b['id']}")

print(f"  {'panel':10} {'widgets':>7} {'bytes':>6} {'chunks':>7} {'load':>7}")
block, report = [], []
for name, cfg in PANELS:
    mini = json.dumps(cfg, separators=(",", ":"), ensure_ascii=False)
    b64 = base64.b64encode(mini.encode()).decode()
    ids = [w["id"] for w in cfg["widgets"] if w["t"] != "group"]
    n = -(-len(b64) // 18)
    print(f"  {name:10} {len(ids):7} {len(b64):6} {n:7} {n*0.035:6.1f}s")
    block.append((name, b64, "," + ",".join(ids) + ","))
    json.dump(cfg, open(f"{HERE}/layout_{name.lower()}.json", "w"), indent=1, ensure_ascii=False)
print()
if errs:
    print("  FAILED"); [print("   -", e) for e in errs]; raise SystemExit(1)
print("  PASS - every widget on every panel is driven or fed, Level is on all four,")
print("         nothing overlaps and nothing is under its size floor")

lines = ["// >>> LAYOUTS — generated by gen_layout.py, do not edit by hand"]
for name, b64, ids in block:
    # Joined with an explicit "+". Adjacent string literals concatenate in C,
    # NOT in TypeScript: without the operator ASI ends the statement at the
    # first line and every later literal becomes a discarded expression
    # statement, so the constant holds only its first 88 characters. It
    # compiles cleanly and the layout arrives as garbage.
    wrapped = (" +\n" + " " * 4).join(f'"{c}"' for c in textwrap.wrap(b64, 88))
    lines.append(f"const CFG_{name} =\n    {wrapped}")
for name, b64, ids in block:
    lines.append(f'const IDS_{name} = "{ids}"')
lines.append("// <<< LAYOUTS")

new, nsub = re.subn(r'// >>> LAYOUTS.*?// <<< LAYOUTS',
                    lambda _m: "\n".join(lines), src, count=1, flags=re.S)
# Count the substitution rather than comparing text: this generator is
# idempotent, so a correct re-run legitimately produces an identical file
# and an equality check would fail on the very case that proves it works.
assert nsub == 1, "layout block markers not found"
# Re-read each constant the way the LANGUAGE would, not the way we meant it.
# The first version emitted C-style adjacent literals with no "+", so every
# blob silently held just its first line -- and a checker that gathered all the
# quoted strings in the region confirmed the intent rather than the result.
# This one stops at the first literal not followed by "+".
for _name, _b64, _ids in block:
    _m = re.search('const CFG_' + _name + r' =\s*((?:"[^"]*"\s*\+?\s*)+)', new)
    assert _m, _name + ": constant not found after splice"
    _got, _rest = "", _m.group(1).strip()
    while _rest.startswith('"'):
        _e = _rest.index('"', 1)
        _got += _rest[1:_e]
        _rest = _rest[_e + 1:].lstrip()
        if _rest.startswith("+"):
            _rest = _rest[1:].lstrip()
        else:
            break
    assert _got == _b64, (_name + ": TypeScript would see " + str(len(_got)) + " of "
                          + str(len(_b64)) + " chars -- literals not joined with '+'")
    json.loads(base64.b64decode(_got).decode())

open(SRC, "w", encoding="utf-8", newline="\n").write(new)
print("  verified: each constant parses as ONE full string and decodes to valid JSON")
print(f"\n  spliced 4 panels into {os.path.basename(SRC)}")
