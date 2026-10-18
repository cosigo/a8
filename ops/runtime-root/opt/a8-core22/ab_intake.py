#!/usr/bin/env python3
"""A8 Core22 independent A/B physical odometer. No clock authority."""
import hashlib
import json
import os
import signal
import tempfile
import time
from pathlib import Path
from urllib.request import urlopen

ROOT = Path("/var/lib/a8-core22")
BIRTH = ROOT / "physical-birth-v1.json"
CHECKPOINT = ROOT / "intake-checkpoint-v1.json"
SOURCE = "http://127.0.0.1:28788/snapshot"
SEGMENT5_SEAL = Path("/var/lib/a8-core22/segment5-seal.json")

# Direct physical reporter remains independently observed by Core22.
def segment5_convert(sample):
    s = read_json(SEGMENT5_SEAL)
    if (s.get("schema") != "A8-AB-PHYSICAL-SEGMENT5-SEAL-V1"
        or s.get("segment") != 5 or s.get("sourceEpoch") != 9
        or s.get("oldPhysicalRaw") != 18399059):
        raise RuntimeError("SEGMENT5_SEAL_MISMATCH")
    actual = sample["RAW_COUNT"]
    if actual < s["physicalAnchorRaw"] or sample["REPORT_SEQUENCE"] < s["anchorSequence"]:
        raise RuntimeError("PHYSICAL_BEFORE_SEGMENT5_SEAM")
    v = dict(sample)
    v["ACTUAL_PHYSICAL_RAW"] = actual
    v["RAW_COUNT"] = 18399059 + actual - s["physicalAnchorRaw"]
    return v

EXPECTED_BIRTH_SHA = "2a1fc90d21c7d377e1fb015f3b57628a250a8d6db024ea513ed9f4ba39d5cd34"
RUNNING = True

def stop(*_):
    global RUNNING
    RUNNING = False

signal.signal(signal.SIGTERM, stop)
signal.signal(signal.SIGINT, stop)

def write_atomic(path, obj):
    data = (json.dumps(obj, indent=2, sort_keys=True) + "\n").encode()
    fd, temp = tempfile.mkstemp(prefix=".core22-", dir=str(path.parent))
    try:
        with os.fdopen(fd, "wb") as f:
            os.fchmod(f.fileno(), 0o600)
            f.write(data)
            f.flush()
            os.fsync(f.fileno())
        os.replace(temp, path)
        directory = os.open(str(path.parent), os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)

def read_json(path):
    return json.loads(path.read_text())

def source_snapshot():
    with urlopen(SOURCE, timeout=2) as response:
        if response.status != 200:
            raise RuntimeError("SOURCE_HTTP_NOT_200")
        payload = response.read(65537)
        if len(payload) > 65536:
            raise RuntimeError("SOURCE_RESPONSE_TOO_LARGE")
        sample = json.loads(payload)
    if not isinstance(sample, dict):
        raise RuntimeError("INVALID_SOURCE_SHAPE")
    for key in ("SOURCE_EPOCH", "RAW_COUNT", "REPORT_SEQUENCE"):
        if type(sample.get(key)) is not int or sample[key] < 0:
            raise RuntimeError("INVALID_" + key)
    if sample.get("STATUS") != "ACTIVE":
        raise RuntimeError("SOURCE_NOT_ACTIVE")
    return segment5_convert(sample)

def main():
    if hashlib.sha256(BIRTH.read_bytes()).hexdigest() != EXPECTED_BIRTH_SHA:
        raise RuntimeError("SEALED_BIRTH_HASH_CHANGED")

    birth = read_json(BIRTH)
    origin = birth["physicalSource"]
    epoch = origin["sourceEpoch"]
    birth_raw = int(origin["birthPhysicalRaw"])
    birth_seq = int(origin["birthReportSequence"])

    if birth["core22RawAtBirth"] != "0" or epoch != 9:
        raise RuntimeError("INVALID_BIRTH_CONTRACT")

    if CHECKPOINT.exists():
        state = read_json(CHECKPOINT)
        if (
            state.get("schema") != "A8-CORE22-INTAKE-CHECKPOINT-V1"
            or state.get("birthSha256") != EXPECTED_BIRTH_SHA
            or state.get("sourceEpoch") != epoch
        ):
            raise RuntimeError("CHECKPOINT_CONTRACT_MISMATCH")
        for field in ("lastPhysicalRaw", "lastSequence", "core22Raw"):
            if type(state.get(field)) is not int:
                raise RuntimeError("INVALID_CHECKPOINT_" + field)
        if (state["core22Raw"] != state["lastPhysicalRaw"] - birth_raw
            or state["lastPhysicalRaw"] < birth_raw
            or state["lastSequence"] < birth_seq):
            raise RuntimeError("CHECKPOINT_CONTINUITY_ERROR")
        if str(state.get("status", "")).startswith("HOLD_"):
            raise RuntimeError(
                "SEALED_CONTINUITY_HOLD_REQUIRES_MANUAL_RECOVERY"
            )
    else:
        state = {
            "schema": "A8-CORE22-INTAKE-CHECKPOINT-V1",
            "birthSha256": EXPECTED_BIRTH_SHA,
            "sourceEpoch": epoch,
            "birthPhysicalRaw": birth_raw,
            "birthSequence": birth_seq,
            "lastPhysicalRaw": birth_raw,
            "lastSequence": birth_seq,
            "core22Raw": 0,
            "status": "WAITING_FOR_SOURCE",
            "naturalPhaseStatus": "NOT_INITIALIZED",
            "clockAuthority": "NONE",
        }
        write_atomic(CHECKPOINT, state)

    print("CORE22_INTAKE_START · EPOCH", epoch, flush=True)

    while RUNNING:
        try:
            sample = source_snapshot()
            raw = sample["RAW_COUNT"]
            seq = sample["REPORT_SEQUENCE"]
            actual_raw = sample["ACTUAL_PHYSICAL_RAW"]
            if ("lastActualPhysicalRaw" in state and
                    actual_raw < state["lastActualPhysicalRaw"]):
                raise RuntimeError("ACTUAL_PHYSICAL_RAW_REVERSAL")

            if sample["SOURCE_EPOCH"] != epoch:
                raise RuntimeError("EPOCH_CHANGE_REQUIRES_VERIFIED_HANDOFF")
            if raw < state["lastPhysicalRaw"]:
                raise RuntimeError("PHYSICAL_RAW_REVERSAL")
            if seq < state["lastSequence"]:
                raise RuntimeError("REPORT_SEQUENCE_REVERSAL")
            if raw < birth_raw or seq < birth_seq:
                raise RuntimeError("PRE_BIRTH_SOURCE_OBSERVATION")

            # All progression derives exclusively from the sealed
            # physical birth and the independent A/B observation.
            next_state = dict(state)
            next_state.update({
                "lastPhysicalRaw": raw,
                "lastSequence": seq,
                "lastActualPhysicalRaw": actual_raw,
                "carrierSegment": 5,
                "core22Raw": raw - birth_raw,
                "status": "OBSERVING",
            })

            if next_state != state:
                write_atomic(CHECKPOINT, next_state)
                state = next_state

        except Exception as exc:
            reason = str(exc)
            print("CORE22_INTAKE_HOLD ·", reason, flush=True)
            # An epoch or counter discontinuity is latched.
            # Never resume automatically after an ambiguous break.
            if reason in (
                "EPOCH_CHANGE_REQUIRES_VERIFIED_HANDOFF",
                "PHYSICAL_RAW_REVERSAL",
                "ACTUAL_PHYSICAL_RAW_REVERSAL",
                "REPORT_SEQUENCE_REVERSAL",
                "PRE_BIRTH_SOURCE_OBSERVATION",
            ):
                state = dict(state)
                state["status"] = "HOLD_" + reason
                write_atomic(CHECKPOINT, state)
                return 2

            # Transient loss does not advance any counter.
            if state.get("status") != "SOURCE_UNAVAILABLE":
                state = dict(state)
                state["status"] = "SOURCE_UNAVAILABLE"
                write_atomic(CHECKPOINT, state)

        time.sleep(0.25)

    print("CORE22_INTAKE_CLEAN_STOP", flush=True)
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
