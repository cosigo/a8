A8 SOL · SEP-19 FIXED-FRAME YEAR-ANGLE CONSTRAINT
2026-09-19 · EPOCH-7

STATUS
STRONG NATIVE ORIENTATION CONSTRAINT
NOT YET AN INVENTED ABSOLUTE YEAR-ANGLE ZERO

PURPOSE
Preserve two additional Sol crossings made after the Sep-19 Mintaka
orientation witness while keeping the detector/camera orientation fixed.

Nature is the reference.
No Core20, Jovian-ruler, carrier-rate or civil-phase retune is made.

SOURCE 1
Kooha-2026-09-19-10-53-55.mkv
duration · 188.366666 s
SHA-256 · 63e23c9a31f2e7c5963fb23a8b5c69b3901352f00f39492892472c5ed9f04dc5

SOURCE 2
Kooha-2026-09-19-11-07-24.mkv
duration · 191.133333 s
SHA-256 · d8f924ad062cde3cef6af87b7902be3095f8daf2e21d6d5a6ce83a7503b6f6f9

OPERATOR FIELD GEOMETRY
Sol · +1.4 A8 angle north of the Mintaka fix

This +1.4 A8 value is preserved as telescope/operator field geometry.
It is not silently recomputed from an external ephemeris.

FIRST SOL PASS · ABSOLUTE PHASE ANCHOR
fitted disk-center crossing · 103.8114 s
A8 visible · 22:38:04
DAY_PHASE17 display bracket · 92548 .. 92549
PRIMARY · Epoch 7
RAW witness bracket · 5,000,741 .. 5,000,774
representative RAW · 5,000,774
representative SEQ · 464,635

The bracket is retained because the screen fields update asynchronously
around the fitted geometric center-crossing instant.

SECOND SOL PASS · REPEAT
fitted disk-center crossing · 109.7211 s
A8 visible · 22:57:24
PRIMARY · Epoch 7 · RAW 5,025,540

The second pass verifies repeat geometry and physical pacing.
Because a second pass requires resetting the telescope in right ascension,
it is not promoted as the absolute Mintaka→Sol phase anchor.

SOL LIMB MOTION · JOINT TWO-CLIP FIT
X · +26.1430 px/s
Y · +0.8421 px/s
speed · 26.1566 px/s
detector track · +1.8449 degrees
shared fitted solar radius · 1666.2397 px
median limb residual · 2.3390 px
90th-percentile limb residual · 6.0032 px

Independent clip limb fits:
pass 1 · +1.5398 degrees
pass 2 · +2.2988 degrees

SEP-19 MINTAKA REFERENCE
source · Kooha-2026-09-19-04-55-19.mkv
A8 · 14:38:11
PRIMARY · Epoch 7 · RAW 4,344,303
Mintaka detector track · +3.9809 degrees

MINTAKA → FIRST SOL NATIVE PHASE
A8 clock separation · 32,761 A8 seconds
quarter-day reference · 32,768 A8 seconds
difference from exact quarter day · -7 A8 seconds

Native angular separation:
32761 / 256
= 127.972656250 A8 angle states
≈ 177.762₈
quarter turn = 128 = 200₈

PRIMARY RAW separation
5,000,774
- 4,344,303
= 656,471 Epoch-7 physical RAW

RAW / A8-second consistency
Mintaka→Sol · 20.038185648 RAW / A8 second
Sol pass1→pass2 · 20.037216828 RAW / A8 second
difference · 48.35 ppm

That agreement is a useful independent check that the physical carrier
and native A8 phase remained coherent across the observation interval.

DETECTOR VECTOR COMPARISON
Sep-19 Mintaka mean track · +4.0166 degrees
Sep-19 Sol joint track · +1.8449 degrees
Sol − Mintaka detector-track difference · -2.1717 degrees

YEAR-ANGLE INTERPRETATION
The first Sol pass now gives a strong native equatorial phase relationship
to the Sep-19 Mintaka witness, and the operator's +1.4 A8 north offset
adds the second geometric component.

This substantially constrains Year Angle.

However, A8 Year Angle is defined from the vernal-equinox / ecliptic zero.
This packet does NOT invent an exact Mintaka→vernal-zero constant or an
equatorial→ecliptic conversion that has not yet been physically sealed.

The remaining step is therefore orientation, not rate:
close the native equinox/ecliptic bridge from physical evidence, then the
absolute 000₈–777₈ Year Angle can be sealed without making JPL a live authority.

OPERATOR TIME NOTE
The operator also stated approximately 3640 A8 seconds before an earlier
Mintaka fix. That note is preserved outside the direct calculation because
its exact referent is not established by these two recordings.

The directly preserved Sep-19 displays used above are:
Mintaka · 14:38:11
first Sol · 22:38:04

NO HOST / UTC / JPL VALUE IS USED AS LIVE A8 AUTHORITY IN THIS PACKET.
