#!/usr/bin/env python3

import json
import urllib.request
from fractions import Fraction
from http.server import BaseHTTPRequestHandler, HTTPServer

HOST = "127.0.0.1"
PORT = 18029

JOVIAN_URL = "http://127.0.0.1:18028/state"
GHOST_URL = "http://127.0.0.1:18027/api/shadow/ghost"

HANDOFF_PATH = (
    "/srv/sites/moons.cosigo.io/public/assets/"
    "a8-moons-epoch7-handoff-v1.json"
)

GHOST_ANCHOR_PATH = (
    "/opt/a8-jovian-governor/ghost-anchor.json"
)

EXPECTED_EPOCH = 7
EXPECTED_RULER = 18719532


def url_json(url):
    with urllib.request.urlopen(url, timeout=2) as r:
        return json.load(r)


def file_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def fobj(x):
    x = Fraction(x)

    return {
        "numerator": str(x.numerator),
        "denominator": str(x.denominator),
        "text": (
            str(x.numerator)
            if x.denominator == 1
            else f"{x.numerator}/{x.denominator}"
        ),
    }


def nearest_integer(x):
    x = Fraction(x)
    n = x.numerator
    d = x.denominator

    if n >= 0:
        return (2*n + d) // (2*d)

    return -((2*(-n) + d) // (2*d))


def wheel(mapped, ruler):
    mapped = Fraction(mapped)

    whole = mapped // ruler
    pos = mapped - whole * ruler
    phase512 = pos * Fraction(512, ruler)
    phase9 = phase512.numerator // phase512.denominator

    return {
        "mappedRawExact": fobj(mapped),
        "completedWholeWheels": str(whole),
        "positionRawExact": fobj(pos),
        "position512Exact": fobj(phase512),
        "phase9": int(phase9),
        "phase9Octal": format(int(phase9), "03o") + "₈"
    }


def shortest_delta(a, b, ruler):
    d = Fraction(a) - Fraction(b)
    half = Fraction(ruler, 2)

    while d >= half:
        d -= ruler

    while d < -half:
        d += ruler

    return d


def primary_lane(j, h):
    if j["status"] != "JOVIAN_PERIOD_LIVE":
        raise RuntimeError("JOVIAN_DRIVER_NOT_LIVE")

    if (
        j["driverConnection"]
        != "OPERATIONAL_JOVIAN_RULER_NO_CORE_WRITE"
    ):
        raise RuntimeError("OPERATIONAL_LOCK_MISSING")

    physical = j["physical"]
    resonance = j["resonance"]
    safety = j["safety"]

    epoch = int(physical["sourceEpoch"])
    raw = int(physical["currentRaw"])
    ruler = int(resonance["normalizedRulerRaw"])

    if epoch != EXPECTED_EPOCH:
        raise RuntimeError("SOURCE_EPOCH_CHANGED")

    if ruler != EXPECTED_RULER:
        raise RuntimeError("JOVIAN_RULER_CHANGED")

    if resonance["exactRatio"] != "1:2:4":
        raise RuntimeError("RESONANCE_CHANGED")

    if safety["writesCore20"] is not False:
        raise RuntimeError("JOVIAN_CORE_WRITE_PRESENT")

    if safety["writesArduino"] is not False:
        raise RuntimeError("JOVIAN_ARDUINO_WRITE_PRESENT")

    if h["status"] != "QUALIFIED":
        raise RuntimeError("ENTRY011_HANDOFF_NOT_QUALIFIED")

    if int(h["livePhysical"]["sourceEpoch"]) != epoch:
        raise RuntimeError("HANDOFF_EPOCH_MISMATCH")

    rn = int(h["physicalToModelRatio"]["numerator"])
    rd = int(h["physicalToModelRatio"]["denominator"])

    if (rn, rd) != (1, 1):
        raise RuntimeError("PHYSICAL_MODEL_RATIO_CHANGED")

    p_anchor = int(h["livePhysical"]["anchorRaw"])
    m_anchor = int(
        h["modelAnchor"]["rawEquivalentAtPhysicalAnchor"]
    )

    mapped = Fraction(
        m_anchor * rd + (raw - p_anchor) * rn,
        rd
    )

    return {
        "epoch": epoch,
        "raw": raw,
        "ruler": ruler,
        "physicalAnchor": p_anchor,
        "modelAnchor": m_anchor,
        "mapped": mapped,
        "wheel": wheel(mapped, ruler)
    }


def ghost_lane(primary, anchor):
    g = url_json(GHOST_URL)

    if g.get("ok") is not True:
        raise RuntimeError("GHOST_ENDPOINT_NOT_OK")

    ghost = g["ghost"]

    expected_run = anchor["ghost"]["runId"]
    actual_run = str(ghost["runId"])

    if actual_run != expected_run:
        return {
            "status": "GHOST_RUN_CHANGED_REANCHOR_REQUIRED",
            "expectedRunId": expected_run,
            "actualRunId": actual_run,
            "automaticReanchor": False,
            "writesCore20": False,
            "writesCarrier": False
        }

    current = int(ghost["rawCount"])
    g_anchor = int(anchor["ghost"]["anchorRaw"])

    if current < g_anchor:
        return {
            "status": "GHOST_RAW_REGRESSION",
            "runId": actual_run,
            "anchorRaw": str(g_anchor),
            "currentRaw": str(current),
            "writesCore20": False,
            "writesCarrier": False
        }

    bracket = anchor["primaryBracketAtGhostAnchor"]

    low = int(bracket["lowRaw"])
    high = int(bracket["highRaw"])
    mid = int(bracket["midpointRaw"])
    half = int(bracket["halfWidthRaw"])

    pg = anchor["sealedPrimaryPerGhost"]

    primary_per_ghost = Fraction(
        int(pg["numerator"]),
        int(pg["denominator"])
    )

    ghost_delta = current - g_anchor

    primary_equiv = (
        Fraction(mid, 1)
        + primary_per_ghost * ghost_delta
    )

    mapped = (
        Fraction(primary["modelAnchor"], 1)
        + primary_equiv
        - primary["physicalAnchor"]
    )

    gwheel = wheel(mapped, primary["ruler"])
    pwheel = primary["wheel"]

    gp = Fraction(
        int(gwheel["positionRawExact"]["numerator"]),
        int(gwheel["positionRawExact"]["denominator"])
    )

    pp = Fraction(
        int(pwheel["positionRawExact"]["numerator"]),
        int(pwheel["positionRawExact"]["denominator"])
    )

    wheel_delta = shortest_delta(
        gp,
        pp,
        primary["ruler"]
    )

    absolute_delta = (
        mapped - primary["mapped"]
    )

    ratchet_turns = nearest_integer(
        (
            primary["mapped"] - mapped
        )
        / primary["ruler"]
    )

    if ratchet_turns == 0:
        recommendation = "HOLD"
    elif ratchet_turns > 0:
        recommendation = (
            f"FORWARD_{ratchet_turns}_WHOLE_WHEEL"
        )
    else:
        recommendation = (
            f"BACKWARD_{abs(ratchet_turns)}_WHOLE_WHEEL"
        )

    ratcheted = (
        mapped
        + ratchet_turns * primary["ruler"]
    )

    phase_invariant = (
        ratcheted % primary["ruler"]
        ==
        mapped % primary["ruler"]
    )

    return {
        "status": "GHOST_PLOTTED_ON_JOVIAN_WHEEL",

        "role": "SECOND_REPLACEABLE_PHYSICAL_CARRIER",

        "authority": ghost.get("authority", "NONE"),

        "runId": actual_run,
        "linkStatus": ghost.get("linkStatus"),
        "currentRaw": str(current),
        "rawSinceAnchor": str(ghost_delta),

        "alignment": {
            "role": "ODOMETER_ALIGNMENT_NOT_RULER",
            "ghostAnchorRaw": str(g_anchor),
            "primaryBracketLowRaw": str(low),
            "primaryBracketHighRaw": str(high),
            "primaryEquivalentMidpointRaw": str(mid),
            "initialBracketHalfWidthRaw": str(half)
        },

        "sealedPrimaryPerGhost": fobj(
            primary_per_ghost
        ),

        "primaryEquivalentRawExact": fobj(
            primary_equiv
        ),

        "wheel": gwheel,

        "comparisonToPrimary": {
            "absoluteMappedDifferenceRawExact":
                fobj(absolute_delta),

            "shortestWheelPositionDifferenceRawExact":
                fobj(wheel_delta),

            "liveComparison":
                "READ_ONLY_SEQUENTIAL_SAMPLES"
        },

        "ratchet": {
            "policy":
                "INTEGER_WHOLE_JOVIAN_WHEELS_ONLY",

            "quantumRaw":
                str(primary["ruler"]),

            "wholeWheelAdjustment":
                int(ratchet_turns),

            "recommendation":
                recommendation,

            "phaseInvariant":
                phase_invariant,

            "automaticActuation":
                False
        },

        "writesCore20": False,
        "writesArduino": False,
        "writesCarrier": False
    }


def build_state():
    j = url_json(JOVIAN_URL)
    h = file_json(HANDOFF_PATH)
    a = file_json(GHOST_ANCHOR_PATH)

    p = primary_lane(j, h)
    g = ghost_lane(p, a)

    ruler = p["ruler"]
    mapped = p["mapped"]

    phase_invariant = (
        (mapped - ruler) % ruler
        ==
        mapped % ruler
        ==
        (mapped + ruler) % ruler
    )

    pw = p["wheel"]

    return {
        "ok": True,

        "schema":
            "A8-JOVIAN-CARRIER-GOVERNOR-V2",

        "role":
            "JOVIAN_RULER_DISCIPLINES_REPLACEABLE_CARRIERS",

        "status":
            "GOVERNOR_MONITORING",

        "architecture": {
            "ruler":
                "JUPITER_IO_EUROPA_GANYMEDE_1_2_4",

            "governor":
                "WHOLE_WHEEL_RATCHET",

            "engines": [
                "PRIMARY_ARDUINO_A_B",
                "GHOST_ARDUINO_C_D"
            ],

            "governorDrivesEngine":
                False,

            "enginesDefineRuler":
                False,

            "fresh842Required":
                False
        },

        "jovian": {
            "sourceEpoch": p["epoch"],
            "rulerRawPerWheel": str(ruler),
            "exactRatio": "1:2:4",
            "operationalLock": True
        },

        "entry011Anchor": {
            "physicalRaw":
                str(p["physicalAnchor"]),

            "modelRaw":
                str(p["modelAnchor"]),

            "physicalToModelRatio":
                "1/1",

            "provenance":
                h.get("provenance")
        },

        # Original V1 Primary contract retained.
        "carrier": {
            "currentRaw":
                str(p["raw"]),

            "rawSinceEntry011Anchor":
                str(
                    p["raw"]
                    - p["physicalAnchor"]
                )
        },

        "wheel": {
            "mappedRaw":
                pw["mappedRawExact"]["text"],

            "completedWholeWheels":
                pw["completedWholeWheels"],

            "positionRaw":
                pw["positionRawExact"]["text"],

            "position512Exact":
                pw["position512Exact"],

            "phase9":
                pw["phase9"],

            "phase9Octal":
                pw["phase9Octal"]
        },

        "ratchet": {
            "policy":
                "INTEGER_WHOLE_JOVIAN_WHEELS_ONLY",

            "quantumRaw":
                str(ruler),

            "phaseInvariant":
                phase_invariant,

            "automaticActuation":
                False,

            "currentRecommendation":
                "HOLD"
        },

        "carriers": {
            "primaryAB": {
                "status":
                    "PRIMARY_PLOTTED_ON_JOVIAN_WHEEL",

                "sourceEpoch":
                    p["epoch"],

                "currentRaw":
                    str(p["raw"]),

                "wheel":
                    pw,

                "authority":
                    "NONE",

                "writesCore20":
                    False,

                "writesCarrier":
                    False
            },

            "ghostCD":
                g
        },

        "authorityBoundary": {
            "writesCore20": False,
            "writesClock": False,
            "writesPhase": False,
            "writesArduino": False,
            "writesCarrier": False,
            "changesCivilPhase": False,
            "changesCoreRate": False,
            "usesUTC": False,
            "usesHostTime": False,
            "usesNTP": False,
            "usesGPS": False,
            "usesLegacyTime": False
        }
    }


class Handler(BaseHTTPRequestHandler):

    def log_message(self, fmt, *args):
        return

    def do_GET(self):
        if self.path not in ("/", "/state"):
            self.send_response(404)
            self.end_headers()
            return

        try:
            body = json.dumps(
                build_state(),
                indent=2,
                sort_keys=True
            ).encode()

            self.send_response(200)

        except Exception as exc:
            body = json.dumps(
                {
                    "ok": False,
                    "status": "GOVERNOR_FAIL_CLOSED",
                    "error": str(exc)
                },
                indent=2
            ).encode()

            self.send_response(503)

        self.send_header(
            "Content-Type",
            "application/json"
        )

        self.send_header(
            "Content-Length",
            str(len(body))
        )

        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    HTTPServer(
        (HOST, PORT),
        Handler
    ).serve_forever()
