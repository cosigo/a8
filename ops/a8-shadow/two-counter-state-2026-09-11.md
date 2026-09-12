# Minimi · Two-Counter Hardware State · 2026-09-11

## Primary physical heartbeat

- Source: LM555 physical oscillator.
- Arduino B: USB physical path 1.4.
- Arduino B firmware: A8_EVENT_COUNTER_B_V3.
- Arduino B remains the authoritative physical raw counter for the current Shadow experiment.
- Current SOURCE_EPOCH remained 4 throughout Arduino A work.
- Pulse Box reporter remained ACTIVE.
- Live Arduino B serial path was not opened or reflashed during Arduino A reactivation.

## Arduino A reactivation

- Arduino A: USB physical path 1.3.
- ATmega328P signature: 0x1e950f.
- Bootloader communication qualified at 115200 baud.
- Pre-reactivation flash backup:
  /home/pi/a8-clock-hardware/backups/arduino-a-pre-reactivation-20260911T230646Z.hex
- Backup SHA-256:
  4a15c365813ca3f45b0345ad0a2df7d2077a820dbead8014fa0e8dd7171d0811
- Installed firmware:
  a8-counter-b-v2.hex
- Firmware SHA-256:
  9382a47bab66f01551d8d5198da4a1db4eb7785c71847410f6bcfce0bb20003a
- Flash write and verification passed.
- Arduino A responds to '?' with RAW_COUNT decimal + HEX.

## Historical hardware proof

The preserved Stage 6 proof records both ATmega328P Timer1 D5/T1 counters
tracking the same LM555 pin-3 signal through the common hardware node.

Historical result:
- maximum interval disagreement: 1 edge
- result: PASS

## Current qualification result

Current simultaneous comparison did NOT reproduce the historical agreement.

30-second sample:
- Counter A delta: 529472
- Counter B delta: 91519
- difference: 437953

Five shorter samples produced A/B delta ratios:

- 6.858
- 7.028
- 6.976
- 7.297
- 7.144

The discrepancy is systematic, approximately 7x, not random.

## Current ruling

COUNTER A SECOND-RAIL QUALIFICATION = FAIL / HOLD

Do not use Arduino A as defining timing evidence until its physical D5/T1
signal path is inspected at the bench.

Suspect the present Arduino-A electrical/input path, signal integrity,
connection, or input hardware. Do not infer a Minimi/Core20 timing defect.

Arduino B / SOURCE_EPOCH 4 remains the valid live physical heartbeat.

Recommended physical inspection:
- verify common 555 / Arduino A / Arduino B ground
- verify Arduino A D5/T1 reaches the same LM555 output node
- give each Arduino D5/T1 branch its own series resistor
- verify no additional connection exists on Arduino A D5/T1
- repeat independent delta comparison

No Core20 authority was used to calibrate either counter.
