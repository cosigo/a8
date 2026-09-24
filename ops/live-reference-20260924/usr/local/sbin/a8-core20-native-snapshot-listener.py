#!/usr/bin/env python3

import hashlib
import json
import os
import shutil
import time
import urllib.request
from fractions import Fraction
from pathlib import Path

BASE = "http://127.0.0.1:18020"

ROOT = Path(
    "/var/lib/a8-core20/recovery-snapshots"
)

STATE = Path(
    "/var/lib/a8-core20"
)

TARGETS = {
    0,
    32768,
    65536,
    98304,
}

AUTHORITY = (
    "RECOVERED_JOVIAN_MINTAKA_SOL_SUN_RETURN"
)

BAD_SUN_RETURN = (
    "416611827712/511"
)

INCEPTION_SHA = (
    "6ca1d525bdffcccbab235024ceacd056b"
    "3d1b2af35ced4ffc9e6920b24519434"
)

PERSISTENT = {
    "sol-rate-holdover.json":
        STATE / "sol-rate-holdover.json",

    "calendar-checkpoint.json":
        STATE / "calendar-checkpoint.json",

    "source-run-generation.json":
        STATE / "source-run-generation.json",

    "terra-ship-slip-inception.json":
        STATE / "terra-ship-slip" /
        "run-1-epoch-3-inception.json",

    "terra-ship-slip-lifetime-ledger.json":
        STATE / "terra-ship-slip" /
        "lifetime-ledger.json",

    "sol-contamination-correction-v1.json":
        STATE / "terra-ship-slip" /
        "sol-contamination-correction-v1.json",
}

ENDPOINTS = {
    "core20-clock.json":
        "/api/core20/clock",

    "core20-calendar.json":
        "/api/core20/calendar",

    "core20-year-angle.json":
        "/api/core20/year-angle",

    "jovian-timekeeper.json":
        "/api/hardware/jovian-timekeeper",

    "earth-rotation-scale.json":
        "/api/hardware/earth-rotation-scale",

    "sol-orbital-scale.json":
        "/api/hardware/sol-orbital-scale",

    "sun-return-recurrence.json":
        "/api/hardware/sun-return-recurrence",

    "earth-observers.json":
        "/api/hardware/earth-observers",

    "terra-ship-slip.json":
        "/api/terra-ship-slip",

    "terra-ship-slip-lifetime.json":
        "/api/terra-ship-slip/lifetime",
}


def fetch_json(path):
    req = urllib.request.Request(
        BASE + path,
        headers={
            "Accept": "application/json",
            "Cache-Control": "no-store",
        },
    )

    with urllib.request.urlopen(
        req,
        timeout=5,
    ) as r:
        return json.loads(
            r.read().decode("utf-8")
        )


def sha256(path):
    h = hashlib.sha256()

    with open(path, "rb") as f:
        while True:
            b = f.read(1024 * 1024)

            if not b:
                break

            h.update(b)

    return h.hexdigest()


def fraction(value):
    return Fraction(
        int(value["numerator"]),
        int(value["denominator"]),
    )


def read_json(path):
    with open(path) as f:
        return json.load(f)


def source_run():
    p = STATE / "source-run-generation.json"

    try:
        x = read_json(p)

        return str(
            x["sourceRunGeneration"]
        )

    except Exception:
        return "unknown"


def latest_link(name, destination):
    link = ROOT / name
    temp = ROOT / ("." + name + ".tmp")

    try:
        temp.unlink()
    except FileNotFoundError:
        pass

    os.symlink(
        destination.name,
        temp,
    )

    os.replace(
        temp,
        link,
    )


def qualify(edge, live, directory):
    reasons = []

    epoch = str(
        edge.get("sourceEpoch", "")
    )

    # -------------------------
    # Trigger edge
    # -------------------------

    if (
        edge.get("schema") !=
        "A8-CORE20-CLOCK-EDGE-V1"
    ):
        reasons.append(
            "EDGE_SCHEMA_INVALID"
        )

    if (
        edge.get("clockAuthority") !=
        AUTHORITY
    ):
        reasons.append(
            "EDGE_AUTHORITY_INVALID"
        )

    if (
        edge.get("definingPathTouched")
        is not False
    ):
        reasons.append(
            "EDGE_DEFINING_PATH_TOUCHED"
        )

    if (
        edge.get("browserTimingAuthority")
        is not False
    ):
        reasons.append(
            "BROWSER_TIMING_AUTHORITY_PRESENT"
        )

    try:
        phase = int(
            edge["dayPhase17"]
        )

        if phase not in TARGETS:
            reasons.append(
                "NOT_NATIVE_QUARTER_DAY"
            )

    except Exception:
        reasons.append(
            "EDGE_PHASE_INVALID"
        )

    # -------------------------
    # Core20 clock
    # -------------------------

    clock = (
        live
        .get("core20-clock.json", {})
        .get("clock", {})
    )

    if (
        clock.get("status") !=
        "CORE20_CLOCK_RUNNING"
    ):
        reasons.append(
            "CORE20_CLOCK_NOT_RUNNING"
        )

    if (
        clock.get("clockAuthority") !=
        AUTHORITY
    ):
        reasons.append(
            "CLOCK_AUTHORITY_INVALID"
        )

    if (
        str(
            clock.get("sourceEpoch", "")
        ) != epoch
    ):
        reasons.append(
            "CLOCK_EPOCH_MISMATCH"
        )

    alignment = (
        clock.get("alignment") or {}
    )

    if (
        "SERVER UTC BRIDGE" in
        str(alignment.get("source", ""))
    ):
        reasons.append(
            "EXTERNAL_UTC_PHASE_ALIGNMENT"
        )

    if (
        alignment.get(
            "utcMillisecondsSinceMidnight"
        ) is not None
    ):
        reasons.append(
            "UTC_PHASE_PROVENANCE_PRESENT"
        )

    # -------------------------
    # Year angle
    # -------------------------

    year = (
        live
        .get("core20-year-angle.json", {})
        .get("yearAngle", {})
    )

    if (
        year.get("status") !=
        "YEAR_ANGLE_RUNNING_FROM_RECOVERED_SOL"
    ):
        reasons.append(
            "YEAR_ANGLE_NOT_RUNNING"
        )

    if (
        year.get("aligned")
        is not True
    ):
        reasons.append(
            "YEAR_ANGLE_NOT_ALIGNED"
        )

    if (
        str(
            year.get("sourceEpoch", "")
        ) != epoch
    ):
        reasons.append(
            "YEAR_ANGLE_EPOCH_MISMATCH"
        )

    # -------------------------
    # Earth rotation / Mintaka
    # -------------------------

    earth = (
        live
        .get("earth-rotation-scale.json", {})
        .get("scale", {})
    )

    if (
        earth.get("status") !=
        "EARTH_AXIAL_ROTATION_SCALE_RECOVERED"
    ):
        reasons.append(
            "MINTAKA_ROTATION_NOT_RECOVERED"
        )

    # -------------------------
    # Sol
    # -------------------------

    sol = (
        live
        .get("sol-orbital-scale.json", {})
        .get("scale", {})
    )

    if (
        sol.get("status") !=
        "SOL_ORBITAL_ADVANCE_SCALE_RECOVERED"
    ):
        reasons.append(
            "SOL_SCALE_NOT_RECOVERED"
        )

    mode = sol.get(
        "solRateMode"
    )

    if mode not in {
        "HOLDOVER",
        "OBSERVED",
    }:
        reasons.append(
            "SOL_RATE_NOT_QUALIFIED"
        )

    try:
        slip = fraction(
            sol[
                "solAdvancePerEarthAxialRotation512"
            ]
        )

        if slip <= 0:
            reasons.append(
                "SOL_RATE_NONPOSITIVE"
            )

        if slip == 1:
            reasons.append(
                "SYNTHETIC_SOL_RATE_ONE"
            )

    except Exception:
        reasons.append(
            "SOL_RATE_INVALID"
        )

    # -------------------------
    # Sun return
    # -------------------------

    sun = (
        live
        .get("sun-return-recurrence.json", {})
        .get("recurrence", {})
    )

    if (
        sun.get("status") !=
        "SUN_RETURN_RECURRENCE_RECOVERED"
    ):
        reasons.append(
            "SUN_RETURN_NOT_RECOVERED"
        )

    try:
        raw_return = (
            sun[
                "rawPerSunReturnRecurrence"
            ]["text"]
        )

        if (
            raw_return ==
            BAD_SUN_RETURN
        ):
            reasons.append(
                "CONTAMINATED_511_RECURRENCE"
            )

    except Exception:
        reasons.append(
            "SUN_RETURN_INVALID"
        )

    # -------------------------
    # Sealed inception
    # -------------------------

    inception = (
        directory /
        "terra-ship-slip-inception.json"
    )

    if not inception.exists():
        reasons.append(
            "INCEPTION_MISSING"
        )

    elif (
        sha256(inception) !=
        INCEPTION_SHA
    ):
        reasons.append(
            "INCEPTION_HASH_MISMATCH"
        )

    # -------------------------
    # Sol holdover
    # -------------------------

    try:
        hold = read_json(
            directory /
            "sol-rate-holdover.json"
        )

        if not str(
            hold.get("status", "")
        ).startswith("QUALIFIED_"):
            reasons.append(
                "SOL_HOLDOVER_NOT_QUALIFIED"
            )

    except Exception:
        reasons.append(
            "SOL_HOLDOVER_INVALID"
        )

    # -------------------------
    # Contamination correction
    # -------------------------

    try:
        correction = read_json(
            directory /
            "sol-contamination-correction-v1.json"
        )

        if (
            correction.get("status") !=
            "SEALED_CORRECTION"
        ):
            reasons.append(
                "CORRECTION_MANIFEST_INVALID"
            )

    except Exception:
        reasons.append(
            "CORRECTION_MANIFEST_MISSING"
        )

    qualified = (
        len(reasons) == 0
    )

    return {
        "schema":
            "A8-CORE20-RECOVERY-SNAPSHOT-QUALIFICATION-V1",

        "status":
            (
                "QUALIFIED_RECOVERY_SNAPSHOT"
                if qualified
                else
                "REJECTED_RECOVERY_SNAPSHOT"
            ),

        "qualified":
            qualified,

        "trigger": {
            "sourceEpoch":
                epoch,

            "dayCount":
                str(
                    edge.get(
                        "dayCount",
                        ""
                    )
                ),

            "dayPhase17":
                str(
                    edge.get(
                        "dayPhase17",
                        ""
                    )
                ),

            "sequence":
                edge.get(
                    "sequence"
                ),

            "rawPulse":
                str(
                    edge.get(
                        "rawPulse",
                        ""
                    )
                ),
        },

        "solRateMode":
            mode,

        "reasons":
            reasons,

        "authorityBoundary": {
            "definesA8Time":
                False,

            "definesRawContinuity":
                False,

            "replaysRawPulse":
                False,

            "infersOutageElapsedTime":
                False,

            "fallbackEvidenceOnly":
                True,
        },
    }


def capture(edge):
    epoch = str(
        edge["sourceEpoch"]
    )

    day = str(
        edge["dayCount"]
    )

    phase = int(
        edge["dayPhase17"]
    )

    phase_oct = (
        format(phase, "06o") +
        "o"
    )

    seq = str(
        edge.get(
            "sequence",
            "unknown"
        )
    )

    name = (
        f"run-{source_run()}"
        f"-epoch-{epoch}"
        f"-day-{day}"
        f"-phase-{phase_oct}"
        f"-seq-{seq}"
    )

    final = ROOT / name
    partial = ROOT / (
        "." + name + ".partial"
    )

    if final.exists():
        return

    if partial.exists():
        shutil.rmtree(
            partial
        )

    partial.mkdir(
        parents=True
    )

    with open(
        partial / "trigger-edge.json",
        "w",
    ) as f:
        json.dump(
            edge,
            f,
            indent=2,
        )

        f.write("\n")

    # Persistent state
    for output, source in (
        PERSISTENT.items()
    ):
        if source.exists():
            shutil.copy2(
                source,
                partial / output,
            )

    # Live coherent state
    live = {}

    for output, endpoint in (
        ENDPOINTS.items()
    ):
        try:
            payload = fetch_json(
                endpoint
            )

            live[output] = payload

            with open(
                partial / output,
                "w",
            ) as f:
                json.dump(
                    payload,
                    f,
                    indent=2,
                )

                f.write("\n")

        except Exception as exc:
            live[output] = {
                "captureError":
                    str(exc)
            }

    result = qualify(
        edge,
        live,
        partial,
    )

    with open(
        partial / "qualification.json",
        "w",
    ) as f:
        json.dump(
            result,
            f,
            indent=2,
        )

        f.write("\n")

    manifest = []

    for path in sorted(
        partial.iterdir()
    ):
        if (
            path.is_file() and
            path.name != "SHA256SUMS"
        ):
            manifest.append(
                f"{sha256(path)}  ./{path.name}"
            )

    with open(
        partial / "SHA256SUMS",
        "w",
    ) as f:
        f.write(
            "\n".join(manifest) +
            "\n"
        )

    os.replace(
        partial,
        final,
    )

    latest_link(
        "latest-any",
        final,
    )

    if result["qualified"]:
        latest_link(
            "latest-qualified",
            final,
        )

    print(
        result["status"],
        "·",
        final.name,
        flush=True,
    )

    if result["reasons"]:
        print(
            "REJECT REASONS ·",
            ", ".join(
                result["reasons"]
            ),
            flush=True,
        )


def handle_edge(edge):
    if (
        edge.get("schema") !=
        "A8-CORE20-CLOCK-EDGE-V1"
    ):
        return

    try:
        phase = int(
            edge["dayPhase17"]
        )

    except Exception:
        return

    if phase in TARGETS:
        capture(edge)


def listen():
    request = urllib.request.Request(
        BASE + "/api/core20/edges",
        headers={
            "Accept":
                "text/event-stream",

            "Cache-Control":
                "no-store",
        },
    )

    with urllib.request.urlopen(
        request,
        timeout=30,
    ) as response:

        event_type = None
        data = []

        while True:
            raw = response.readline()

            if not raw:
                raise RuntimeError(
                    "Core20 edge stream closed"
                )

            line = raw.decode(
                "utf-8",
                "replace",
            ).rstrip(
                "\r\n"
            )

            if line == "":
                if (
                    event_type ==
                    "a8-edge" and
                    data
                ):
                    edge = json.loads(
                        "\n".join(data)
                    )

                    handle_edge(
                        edge
                    )

                event_type = None
                data = []
                continue

            if line.startswith(
                "event:"
            ):
                event_type = (
                    line[6:].strip()
                )

            elif line.startswith(
                "data:"
            ):
                data.append(
                    line[5:].lstrip()
                )


def main():
    ROOT.mkdir(
        parents=True,
        exist_ok=True,
    )

    previous = None

    while True:
        try:
            listen()
            previous = None

        except Exception as exc:
            message = str(exc)

            if message != previous:
                print(
                    "WAITING FOR CORE20 EDGE STREAM ·",
                    message,
                    flush=True,
                )

                previous = message

            time.sleep(2)


if __name__ == "__main__":
    main()
