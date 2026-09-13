# Auspicious 8 · Core20 Rebirth Certificate

Certificate date: 2026-09-12

## Status

This certificate establishes a new documented operating reference for
Core20 after retirement of the failed LM555 physical pace source.

The previous Core20 birth/orientation record is NOT erased or rewritten.
It remains historical evidence of the earlier operating system and its
subsequently discovered drift.

This certificate supersedes that record for current operation.

---

## Physical Pace Source

Physical source:

Arduino A
Timer2 hardware output
D11 / PB3 / OC2A

→ physical wire / 1 kΩ series resistor →

Arduino B
Timer1 external counter
D5 / T1

→ Raspberry Pi reporter →

Core20 external physical pace input

Physical source identity:

SOURCE_EPOCH = 5

Classification:

ENGINEERED_PHYSICAL_SOURCE

Jovian qualified:

NO · PENDING

Native authority:

NO

Full autonomy:

NO

The former LM555 SOURCE_EPOCH 4 source is retired and is not part of
the active Core20 pace path.

---

## Physical Epoch-5 Bootstrap

Physical anchor:

RAW_COUNT = 848067759
REPORT_SEQUENCE = 5738

Civil phase bootstrap provenance instant:

2026-09-12T21:34:22.160601Z

DAY_PHASE17 at bootstrap:

117816 decimal
346070 octal

Civil absolute phase provenance:

LEGACY_UTC_ONE_SHOT_BOOTSTRAP

UTC is not used as continuing Core20 pace or cadence authority.

---

## Rate Bootstrap

Current physical-to-Core20 rate calibration provenance:

LEGACY_PI_MONOTONIC_LONG_BASELINE_BOOTSTRAP

Measured Epoch-5 physical rate during the long diagnostic baseline:

30.39702390992062 edges per legacy diagnostic second

Exact installed Core20/raw mapping:

63062626077173241557184
-----------------------------------------
202993540713956769625

Core raw per physical edge.

This rate calibration is explicitly conventional / legacy.

It is not Jovian qualification and is not represented as natural
A8 authority.

The continuing pace after bootstrap is physical raw-count progression,
not continuing host elapsed-time progression.

---

## Core20 Operating Mode

Role:

TEMPORARY_EXTERNAL_PHYSICAL_HOLDOVER

Clock authority label:

TEMPORARY_EXTERNAL_PHYSICAL_HOLDOVER · NATIVE_AUTHORITY_FALSE

Pace:

EXTERNAL_PHYSICAL_RAW_DELTA_ONLY

Pulse owner:

EXTERNAL_PHYSICAL_SOURCE

Core internal source epoch at rebirth:

3

Physical source epoch:

5

These are distinct epoch namespaces and must not be conflated.

---

## Year-Angle Rebirth / Orientation Event

A one-shot astronomical orientation was explicitly requested and
performed after Core20 was running from physical SOURCE_EPOCH 5.

One-shot bridge:

JPL Horizons

Target:

SUN

Observer:

EARTH_GEOCENTER_500@399

Quantity:

31_OBSECLON_OBSECLAT

UTC bridge instant used for the one-shot query:

2026-09-12T21:51:47.121Z

JPL time argument:

2026-Sep-12 21:51:47.121

Observed apparent ecliptic longitude:

170.1513179 degrees

Observed apparent ecliptic latitude:

-0.0000763 degrees

Core raw at Year-Angle alignment:

1283303774

Exact A8 Year Phase at alignment:

phase27 decimal = 63437009
phase27 octal   = 361774321

Coarse A8 Year Angle at alignment:

phase9 decimal = 241
phase9 octal   = 361

Astronomical Year zero remains:

VERNAL_EQUINOX
SOL_APPARENT_ECLIPTIC_LONGITUDE_0

---

## Certificate Relative Zero

For this rebirth certificate only, the exact orientation event above
is defined as:

REFERENCE DISPLACEMENT = 000₈

This does NOT redefine astronomical Year Angle zero.

At certificate displacement 000₈, the absolute astronomical A8
Year Angle was:

361₈

Therefore:

CERTIFICATE RELATIVE ANGLE = 000₈
ABSOLUTE A8 YEAR ANGLE      = 361₈

Subsequent displacement from this certificate reference may be audited
against the Core raw count.

---

## Continuing Year Motion

After the one-shot JPL orientation:

ONGOING AUTHORITY =
SELECTED_RAW_PLUS_RECOVERED_SOL_ANGLE_PER_RAW

usesJplAfterAlignment = false
usesUtcAfterAlignment = false
usesNetworkCadence    = false

The external astronomical bridge supplied orientation only.

It does not define recurrence or continuing rate.

---

## Calendar

Calendar checkpoint at rebirth:

YEAR DAY = 266
YEAR DAY OCTAL = 412₈
YEAR CYCLE = B

Calendar advancement remains:

CORE20_INTEGER_CIVIL_DAY_COUNT_ONLY

UTC, JPL, browser timing and Year Angle do not independently advance
the calendar day.

---

## Shadow

Shadow Core and Shadow Recorder remained running and were not modified
during the Epoch-5 Core20 integration.

Shadow is not Core20 authority.

Its source-epoch machinery observes and re-arms on physical source
changes independently.

---

## Provenance Summary

PHYSICAL PACE
    Arduino A → Arduino B → Pi reporter
    SOURCE_EPOCH 5

RATE
    LEGACY_PI_MONOTONIC_LONG_BASELINE_BOOTSTRAP

ABSOLUTE CIVIL PHASE
    LEGACY_UTC_ONE_SHOT_BOOTSTRAP

YEAR ORIENTATION
    JPL_HORIZONS_ONE_SHOT_ONLY

ONGOING UTC
    NONE

ONGOING JPL
    NONE

ONGOING HOST-TIME PACE
    NONE

JOVIAN QUALIFICATION
    PENDING

NATIVE AUTHORITY
    NO

FULL AUTONOMY
    NO

---

## Historical Rule

Do not delete, rewrite, or silently replace earlier birth certificates,
failed LM555 evidence, Epoch-4 evidence, or contamination evidence.

They form the audit trail explaining why this rebirth reference exists.

Future promotion to Jovian-qualified / native authority must receive a
new qualification record rather than retroactively altering this
certificate.
