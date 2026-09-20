#!/usr/bin/env python3

import json
from fractions import Fraction
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.request import urlopen
from urllib.error import URLError, HTTPError

HOST = "127.0.0.1"
PORT = 18030

CONTRACT_PATH = Path("/opt/a8-annual-frame/frame-v1.json")

CALENDAR_URL = "http://127.0.0.1:18020/api/core20/calendar"
LEGACY_YEAR_URL = "http://127.0.0.1:18020/api/core20/year-angle"


def read_json(path):
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def fetch_json(url):
    try:
        with urlopen(url, timeout=2.0) as response:
            return {
                "available": True,
                "payload": json.loads(response.read().decode("utf-8"))
            }
    except (URLError, HTTPError, TimeoutError, json.JSONDecodeError) as exc:
        return {
            "available": False,
            "error": f"{type(exc).__name__}: {exc}"
        }


def fraction_payload(frac):
    frac = Fraction(frac)
    return {
        "numerator": frac.numerator,
        "denominator": frac.denominator,
        "exact": f"{frac.numerator}/{frac.denominator}",
        "decimalApprox": round(float(frac), 9)
    }


def calendar_diagnostic(calendar_input):
    if not calendar_input.get("available"):
        return {
            "status": "CALENDAR_INPUT_UNAVAILABLE",
            "role": "DIAGNOSTIC_ONLY_NOT_AN_A8_TEST"
        }

    payload = calendar_input.get("payload") or {}
    c = payload.get("calendar") or {}

    try:
        year_day = int(c["yearDay"])
        year_length = int(c["yearLength"])
    except (KeyError, TypeError, ValueError):
        return {
            "status": "CALENDAR_INPUT_INCOMPLETE",
            "role": "DIAGNOSTIC_ONLY_NOT_AN_A8_TEST"
        }

    if year_day < 1 or year_length < 1 or year_day > year_length:
        return {
            "status": "CALENDAR_INPUT_INVALID",
            "role": "DIAGNOSTIC_ONLY_NOT_AN_A8_TEST"
        }

    start = Fraction((year_day - 1) * 512, year_length)
    end = Fraction(year_day * 512, year_length)

    return {
        "status": "AVAILABLE_DIAGNOSTIC_ONLY",
        "role": "DIAGNOSTIC_ONLY_NOT_AN_A8_TEST",
        "frame": "A8 CALENDAR YEAR FRACTION",
        "yearDay": year_day,
        "yearLength": year_length,
        "angle512Start": fraction_payload(start),
        "angle512End": fraction_payload(end),
        "instantaneousAngleAvailable": False,
        "usedForNatureCorrection": False,
        "usedForCarrierCorrection": False,
        "usedForCoreCorrection": False,
        "interpretation":
            "Preserved mathematical calendar diagnostic only. "
            "A8 does not continuously subtract this value from Nature."
    }


def state():
    contract = read_json(CONTRACT_PATH)

    calendar_input = fetch_json(CALENDAR_URL)
    legacy_input = fetch_json(LEGACY_YEAR_URL)

    physical_anchor = contract.get("physicalAnchor") or {}

    physical_anchor_sealed = (
        physical_anchor.get("status") == "SEALED"
    )

    nature_angle_512 = physical_anchor.get("annualAngle512")
    nature_angle_octal = physical_anchor.get("annualAngleOctal")

    calendar_diag = calendar_diagnostic(calendar_input)

    if physical_anchor_sealed:
        seam_status = "WAITING_FOR_NEXT_PHYSICAL_ANNUAL_RETURN"
        seam_note = (
            "Initial Epoch-7 physical annual-frame anchor is sealed. "
            "Do not continuously retune. Record the calendar position "
            "when Nature next returns to the A8 annual seam."
        )
    else:
        seam_status = "WAITING_FOR_INITIAL_EPOCH7_PHYSICAL_ANCHOR"
        seam_note = (
            "First tie the observed Epoch-7 Sol/RAW position to "
            "A8 Annual Frame V1. After that, leave the system running "
            "until the next physical annual return."
        )

    return {
        "schema": "A8-ANNUAL-FRAME-SIDECAR-V1",
        "status": contract["status"],

        "authorityBoundary": {
            "writesCore20": False,
            "writesCarrier": False,
            "writesCalendar": False,
            "writesEvidence": False,
            "usesHostClockForProgression": False,
            "usesUTCForProgression": False,
            "usesNetworkTimeForProgression": False
        },

        "contract": contract,

        "liveInputs": {
            "calendar": calendar_input,

            "preservedLegacyYearAngle": {
                "role": "COMPARISON_ONLY_NOT_ANNUAL_V1_AUTHORITY",
                **legacy_input
            }
        },

        "annualV1Output": {
            "frame": "A8 ANNUAL FRAME V1",

            "frameOffsetDefined": True,

            "orientationStatus":
                contract["annualFrame"]["orientationStatus"],

            "coordinateTransform":
                contract["coordinateTransform"],

            "natureQuarterPoints":
                contract["natureQuarterPoints"],

            "physicalRawAnchorSealed":
                physical_anchor_sealed,

            "natureAnnualAngle512":
                nature_angle_512,

            "natureAnnualAngleOctal":
                nature_angle_octal,

            "reason":
                (
                    "Annual Frame V1 coordinate offset is defined. "
                    "The live Epoch-7 physical Sol/RAW anchor is not yet sealed."
                    if not physical_anchor_sealed
                    else
                    "Annual Frame V1 physical Epoch-7 anchor is sealed."
                )
        },

        "calendarComparisonLive": calendar_diag,

        "natureVsCalendarResidual": {
            "status": "DISABLED_BY_DESIGN",
            "role": "REJECTED_CONTINUOUS_SUBTRACTION_EXPERIMENT",
            "preservedForProvenance": True,
            "usedForA8Correction": False,
            "reason":
                "A8 does not continuously add/subtract calendar phase "
                "against Nature and then use the result to retune the system."
        },

        "annualSeamResidual": {
            "role": "PRIMARY_LONG_TERM_TEST",
            "status": seam_status,

            "natureSeam": "000₈ / 1000₈",

            "measurement":
                "CALENDAR_POSITION_WHEN_NATURE_RETURNS_TO_ANNUAL_SEAM",

            "currentResidual": None,

            "automaticCorrection": False,
            "automaticRetune": False,
            "calendarRetune": False,
            "coreRetune": False,
            "carrierRetune": False,

            "checkpoints": [
                "3_MONTH_OBSERVATION",
                "6_MONTH_OBSERVATION",
                "12_MONTH_ANNUAL_RETURN"
            ],

            "note": seam_note
        }
    }


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path not in ("/", "/state"):
            self.send_response(404)
            self.end_headers()
            return

        body = json.dumps(
            state(),
            indent=2,
            ensure_ascii=False
        ).encode("utf-8")

        self.send_response(200)
        self.send_header(
            "Content-Type",
            "application/json; charset=utf-8"
        )
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        return


if __name__ == "__main__":
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
