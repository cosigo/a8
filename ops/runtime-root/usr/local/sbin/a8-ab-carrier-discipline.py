#!/usr/bin/env python3

import json
import sys
import urllib.request

from fractions import Fraction


STATE=(
    "/etc/a8-core20/"
    "ab-carrier-discipline.json"
)

PHYSICAL=(
    "http://127.0.0.1:28790/snapshot"
)


def load_state():
    with open(
        STATE,
        "r",
        encoding="utf-8",
    ) as f:
        s=json.load(f)

    if (
        s.get("schema")
        != "A8-AB-CARRIER-DISCIPLINE-V1"
    ):
        raise RuntimeError(
            "A_B_DISCIPLINE_SCHEMA_MISMATCH"
        )

    if (
        str(s.get("physicalSourceEpoch"))
        != "8"
    ):
        raise RuntimeError(
            "A_B_DISCIPLINE_EPOCH_CHANGED"
        )

    return s


def read_physical():
    with urllib.request.urlopen(
        PHYSICAL,
        timeout=3,
    ) as r:
        p=json.load(r)

    if str(p.get("SOURCE_EPOCH")) != "8":
        raise RuntimeError(
            "A_B_PHYSICAL_EPOCH_CHANGED"
        )

    if p.get("STATUS") != "ACTIVE":
        raise RuntimeError(
            "A_B_PHYSICAL_NOT_ACTIVE"
        )

    return p,int(p["RAW_COUNT"])


def fraction_field(obj):
    return Fraction(
        int(obj["numerator"]),
        int(obj["denominator"]),
    )


def coordinate(state,physical_raw):
    p0=int(
        state["physicalAnchorRaw"]
    )

    if physical_raw < p0:
        raise RuntimeError(
            "A_B_RAW_BEFORE_DISCIPLINE_ANCHOR"
        )

    d0=fraction_field(
        state["disciplinedAnchor"]
    )

    ratio=fraction_field(
        state["ratio"]
    )

    return (
        d0
        +
        (physical_raw-p0)*ratio
    )


def rational_json(value):
    floor=value.numerator // value.denominator

    return {
        "numerator":
            str(value.numerator),

        "denominator":
            str(value.denominator),

        "floor":
            str(floor),

        "remainder":
            str(
                value.numerator
                %
                value.denominator
            ),
    }


def status():
    state=load_state()
    physical,raw=read_physical()

    d=coordinate(
        state,
        raw,
    )

    out={
        "ok":True,

        "schema":
            "A8-AB-CARRIER-DISCIPLINE-STATUS-V1",

        "physical":{
            "sourceEpoch":
                str(
                    physical[
                        "SOURCE_EPOCH"
                    ]
                ),

            "raw":
                str(raw),

            "reportSequence":
                physical.get(
                    "REPORT_SEQUENCE"
                ),

            "status":
                physical.get(
                    "STATUS"
                ),
        },

        "discipline":{
            **state,

            "liveDisciplinedRaw":
                rational_json(d),
        },
    }

    print(
        json.dumps(
            out,
            indent=2,
            sort_keys=True,
        )
    )


def preview(
    numerator,
    denominator,
):
    state=load_state()
    physical,raw=read_physical()

    n=int(numerator)
    d=int(denominator)

    if n <= 0 or d <= 0:
        raise RuntimeError(
            "RATIO_MUST_BE_POSITIVE"
        )

    proposed=Fraction(n,d)

    current=coordinate(
        state,
        raw,
    )

    ppm=(
        float(proposed-1)
        *
        1_000_000
    )

    out={
        "ok":True,

        "schema":
            "A8-AB-CARRIER-DISCIPLINE-PREVIEW-V1",

        "operation":
            "PREVIEW_ONLY_NO_WRITE",

        "currentSegment":
            state["segmentNumber"],

        "proposedNextSegment":
            int(
                state["segmentNumber"]
            )+1,

        "physicalSourceEpoch":
            "8",

        "physicalAnchorRawAtSeal":
            str(raw),

        "disciplinedAnchorAtSeal":
            rational_json(
                current
            ),

        "proposedRatio":{
            "numerator":
                str(
                    proposed.numerator
                ),

            "denominator":
                str(
                    proposed.denominator
                ),

            "approxPpm":
                ppm,
        },

        "continuity":{
            "oldCoordinateAtSeam":
                rational_json(
                    current
                ),

            "newCoordinateAtSeam":
                rational_json(
                    current
                ),

            "phaseJump":
                False,

            "rawRewrite":
                False,
        },

        "reference":
            state["reference"],

        "safety":{
            "stateWrite":
                False,

            "feederWrite":
                False,

            "core20Write":
                False,

            "arduinoWrite":
                False,

            "jovianGovernorWrite":
                False,

            "epochChange":
                False,

            "usesUTC":
                False,

            "usesHostTimeForPace":
                False,
        },
    }

    print(
        json.dumps(
            out,
            indent=2,
            sort_keys=True,
        )
    )


def main():
    if len(sys.argv) == 2 and sys.argv[1] == "status":
        status()
        return

    if (
        len(sys.argv) == 4
        and
        sys.argv[1] == "preview"
    ):
        preview(
            sys.argv[2],
            sys.argv[3],
        )
        return

    if (
        len(sys.argv) >= 2
        and
        sys.argv[1] in (
            "seal",
            "apply",
            "activate",
        )
    ):
        raise SystemExit(
            "LOCKED · A/B ACTUATION NOT ENABLED"
        )

    raise SystemExit(
        "usage: "
        "a8-ab-carrier-discipline.py status | "
        "preview NUMERATOR DENOMINATOR"
    )


if __name__ == "__main__":
    main()
