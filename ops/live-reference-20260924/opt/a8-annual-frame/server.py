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
ACTIVE_CARRIER_PATH = Path(
    "/etc/a8-annual-frame/active-carrier.json"
)

CALENDAR_URL = "http://127.0.0.1:18020/api/core20/calendar"
LEGACY_YEAR_URL = "http://127.0.0.1:18020/api/core20/year-angle"
PHYSICAL_URL = "http://127.0.0.1:28788/snapshot"

# Last successfully calculated physical annual position.
# Transport loss freezes the presentation here.
# No host-time extrapolation is permitted.
LAST_LIVE_ANNUAL = None


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
    global LAST_LIVE_ANNUAL

    contract = read_json(CONTRACT_PATH)
    active_carrier = read_json(
        ACTIVE_CARRIER_PATH
    )

    calendar_input = fetch_json(CALENDAR_URL)
    legacy_input = fetch_json(LEGACY_YEAR_URL)
    physical_input = fetch_json(PHYSICAL_URL)

    physical_anchor = contract.get("physicalAnchor") or {}

    physical_anchor_sealed = (
        physical_anchor.get("status") == "SEALED"
    )

    nature_angle_512 = physical_anchor.get("annualAngle512")
    nature_angle_octal = physical_anchor.get("annualAngleOctal")

    nature_angle_continuous = (
        float(nature_angle_512)
        if nature_angle_512 is not None
        else None
    )

    nature_angle_exact_numerator = (
        int(nature_angle_512)
        if nature_angle_512 is not None
        else None
    )

    nature_angle_exact_denominator = (
        1
        if nature_angle_512 is not None
        else None
    )

    current_physical_raw = None
    delta_physical_raw = None
    annual_advance_512 = None

    annual_half = (
        "BACKSIDE_RETURN"
        if (
            nature_angle_continuous is not None
            and nature_angle_continuous >= 256
        )
        else "FRONT"
    )

    display_direction = (
        "RIGHT_TO_LEFT"
        if annual_half == "BACKSIDE_RETURN"
        else "LEFT_TO_RIGHT"
    )

    progression_status = "ANCHOR_ONLY"
    progression_error = None

    progression = (
        contract.get("annualProgression")
        or {}
    )

    try:
        if not physical_anchor_sealed:
            raise RuntimeError(
                "PHYSICAL_ANCHOR_NOT_SEALED"
            )

        if (
            progression.get("status")
            != "PHYSICAL_RAW_PREDICTION_ACTIVE"
        ):
            raise RuntimeError(
                "ANNUAL_PROGRESSION_NOT_ACTIVE"
            )

        if physical_input.get("available") is not True:
            raise RuntimeError(
                "PHYSICAL_TRANSPORT_UNAVAILABLE"
            )

        physical_payload = (
            physical_input.get("payload")
            or {}
        )

        if (
            active_carrier.get("schema")
            != "A8-ANNUAL-ACTIVE-CARRIER-V1"
            or active_carrier.get("status")
            != "ACTIVE"
        ):
            raise RuntimeError(
                "ACTIVE_CARRIER_CONTRACT_INVALID"
            )

        expected_epoch = int(
            active_carrier["sourceEpoch"]
        )

        source_epoch = int(
            physical_payload["SOURCE_EPOCH"]
        )

        if source_epoch != expected_epoch:
            raise RuntimeError(
                "HARD_EPOCH_BREAK:"
                f"EXPECTED_{expected_epoch}"
                f"_GOT_{source_epoch}"
            )

        if (
            physical_payload.get("STATUS")
            != "ACTIVE"
        ):
            raise RuntimeError(
                "PHYSICAL_SOURCE_NOT_ACTIVE"
            )

        current_physical_raw = int(
            physical_payload["RAW_COUNT"]
        )

        anchor_raw = int(
            active_carrier[
                "physicalRawAnchor"
            ]
        )

        if current_physical_raw < anchor_raw:
            raise RuntimeError(
                "PHYSICAL_RAW_BEHIND_ANNUAL_ANCHOR"
            )

        delta_physical_raw = (
            current_physical_raw
            - anchor_raw
        )

        rate = progression[
            "angleAdvancePerPhysicalRaw512"
        ]

        rate_n = int(rate["numerator"])
        rate_d = int(rate["denominator"])

        annual_advance_numerator = (
            delta_physical_raw
            * rate_n
        )

        active_angle = (
            active_carrier[
                "annualAngle512Exact"
            ]
        )

        anchor_angle_n = int(
            active_angle["numerator"]
        )

        anchor_angle_d = int(
            active_angle["denominator"]
        )

        if anchor_angle_d <= 0:
            raise RuntimeError(
                "ACTIVE_CARRIER_ANGLE_DENOMINATOR_INVALID"
            )

        total_denominator = (
            anchor_angle_d
            * rate_d
        )

        total_numerator = (
            anchor_angle_n
            * rate_d
            + annual_advance_numerator
            * anchor_angle_d
        )

        full_turn_numerator = (
            512
            * total_denominator
        )

        wrapped_numerator = (
            total_numerator
            % full_turn_numerator
        )

        register_angle = (
            wrapped_numerator
            // total_denominator
        )

        nature_angle_512 = int(
            register_angle
        )

        nature_angle_octal = (
            f"{nature_angle_512:03o}₈"
        )

        nature_angle_continuous = (
            wrapped_numerator
            / total_denominator
        )

        nature_angle_exact_numerator = (
            wrapped_numerator
        )

        nature_angle_exact_denominator = (
            total_denominator
        )

        annual_advance_512 = (
            annual_advance_numerator
            / rate_d
        )

        annual_half = (
            "FRONT"
            if nature_angle_continuous < 256
            else "BACKSIDE_RETURN"
        )

        display_direction = (
            "LEFT_TO_RIGHT"
            if annual_half == "FRONT"
            else "RIGHT_TO_LEFT"
        )

        progression_status = (
            "PHYSICAL_RAW_PREDICTION_ACTIVE"
        )

        LAST_LIVE_ANNUAL = {
            "natureAngle512":
                nature_angle_512,

            "natureAngleOctal":
                nature_angle_octal,

            "continuous":
                nature_angle_continuous,

            "exactNumerator":
                nature_angle_exact_numerator,

            "exactDenominator":
                nature_angle_exact_denominator,

            "physicalRaw":
                current_physical_raw,

            "deltaRaw":
                delta_physical_raw,

            "advance512":
                annual_advance_512,

            "annualHalf":
                annual_half,

            "displayDirection":
                display_direction,
        }

    except Exception as exc:
        progression_error = str(exc)

        if LAST_LIVE_ANNUAL is not None:
            nature_angle_512 = (
                LAST_LIVE_ANNUAL[
                    "natureAngle512"
                ]
            )

            nature_angle_octal = (
                LAST_LIVE_ANNUAL[
                    "natureAngleOctal"
                ]
            )

            nature_angle_continuous = (
                LAST_LIVE_ANNUAL[
                    "continuous"
                ]
            )

            nature_angle_exact_numerator = (
                LAST_LIVE_ANNUAL[
                    "exactNumerator"
                ]
            )

            nature_angle_exact_denominator = (
                LAST_LIVE_ANNUAL[
                    "exactDenominator"
                ]
            )

            current_physical_raw = (
                LAST_LIVE_ANNUAL[
                    "physicalRaw"
                ]
            )

            delta_physical_raw = (
                LAST_LIVE_ANNUAL[
                    "deltaRaw"
                ]
            )

            annual_advance_512 = (
                LAST_LIVE_ANNUAL[
                    "advance512"
                ]
            )

            annual_half = (
                LAST_LIVE_ANNUAL[
                    "annualHalf"
                ]
            )

            display_direction = (
                LAST_LIVE_ANNUAL[
                    "displayDirection"
                ]
            )

            progression_status = (
                "PHYSICAL_TRANSPORT_HOLD"
            )

        else:
            progression_status = (
                "ANCHOR_HOLD_NO_LIVE_RAW"
            )

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

            "physicalEpoch7": {
                "role":
                    "PRIMARY_ANNUAL_FRAME_RAW_CARRIER",
                **physical_input
            },

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

            "activePhysicalCarrier": {
                "sourceEpoch":
                    int(
                        active_carrier[
                            "sourceEpoch"
                        ]
                    ),

                "physicalRawAnchor":
                    int(
                        active_carrier[
                            "physicalRawAnchor"
                        ]
                    ),

                "origin":
                    active_carrier.get(
                        "origin"
                    ),

                "crossEpochRawContinuity":
                    bool(
                        active_carrier.get(
                            "crossEpochRawContinuity"
                        )
                    ),

                "outageElapsedInferred":
                    bool(
                        active_carrier.get(
                            "outageElapsedInferred"
                        )
                    ),
            },

            "natureAnnualAngle512":
                nature_angle_512,

            "natureAnnualAngleOctal":
                nature_angle_octal,

            "natureAnnualAngle512Continuous":
                nature_angle_continuous,

            "natureAnnualAngle512Exact": {
                "numerator":
                    nature_angle_exact_numerator,
                "denominator":
                    nature_angle_exact_denominator
            },

            "currentPhysicalRaw":
                current_physical_raw,

            "deltaPhysicalRawFromAnchor":
                delta_physical_raw,

            "annualAdvance512FromAnchor":
                annual_advance_512,

            "progressionStatus":
                progression_status,

            "progressionError":
                progression_error,

            "annualHalf":
                annual_half,

            "displayDirection":
                display_direction,

            "predictionBasis":
                "SEP19_PHYSICAL_PACE_X_365_25_DAY_RECURRENCE",

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
