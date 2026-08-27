'use strict';

/*
 * GATE 6G · VIRTUAL JOVIAN OBSERVATION FIXTURE
 *
 * This is explicit LAB EVIDENCE ONLY.
 *
 * Arbitrary native recurrence:
 *   Io       = 97 raw edges
 *   Europa   = 194 raw edges
 *   Ganymede = 388 raw edges
 *
 * Therefore:
 *   Io ×4 = Europa ×2 = Ganymede ×1 = 388 raw edges.
 *
 * These numbers are NOT a natural constant, published astronomical period,
 * legacy-time conversion, or expected answer seeded into the recovery wrapper.
 * They exist only in this isolated fixture to prove the wrapper can recover an
 * arbitrary exact 1:2:4 relationship from raw counter observations.
 */

const Q = 97n;

const RELATIVE_GROUPS = [];

for (let k = 0; k <= 8; k += 1) {
  const offset =
    Q * BigInt(k);

  const events = [
    {
      moon: 'io',
      turn: 'WEST',
    },
  ];

  if (k % 2 === 0) {
    events.push({
      moon: 'eu',
      turn: 'WEST',
    });
  }

  if (k % 4 === 0) {
    events.push({
      moon: 'ga',
      turn: 'WEST',
    });
  }

  RELATIVE_GROUPS.push({
    offset,
    events,
  });
}

class Gate6GVirtualJovianFixture {
  constructor() {
    this.active = false;
    this.baseRawPulse = null;
    this.groupIndex = 0;
  }

  reset() {
    this.active = false;
    this.baseRawPulse = null;
    this.groupIndex = 0;
  }

  start(currentRawPulse) {
    const current =
      currentRawPulse === null ||
      currentRawPulse === undefined
        ? 0n
        : BigInt(
            String(
              currentRawPulse
            )
          );

    this.baseRawPulse =
      current + 8n;

    this.groupIndex = 0;
    this.active = true;

    return this.snapshot();
  }

  nextTarget() {
    if (!this.active) {
      return null;
    }

    if (
      this.groupIndex >=
      RELATIVE_GROUPS.length
    ) {
      return null;
    }

    const group =
      RELATIVE_GROUPS[
        this.groupIndex
      ];

    return {
      absoluteRawPulse:
        this.baseRawPulse +
        group.offset,

      events:
        group.events.map(
          e => ({ ...e })
        ),

      groupIndex:
        this.groupIndex,
    };
  }

  consume() {
    const target =
      this.nextTarget();

    if (target === null) {
      this.active = false;
      return null;
    }

    this.groupIndex += 1;

    if (
      this.groupIndex >=
      RELATIVE_GROUPS.length
    ) {
      this.active = false;
    }

    return target;
  }

  snapshot() {
    return {
      schema:
        'A8-GATE6G-VIRTUAL-JOVIAN-FIXTURE-V1',

      role:
        'NON_AUTHORITY_EXPLICIT_TEST_FIXTURE',

      arbitraryNativeRaw: {
        io: '97',
        eu: '194',
        ga: '388',
      },

      expectedOnlyInsideFixture:
        '388',

      usesTimer:
        false,

      usesHostTime:
        false,

      usesFrequencyHz:
        false,

      usesPublishedMoonPeriods:
        false,

      active:
        this.active,

      baseRawPulse:
        this.baseRawPulse === null
          ? null
          : this.baseRawPulse.toString(),

      groupIndex:
        this.groupIndex,

      groupCount:
        RELATIVE_GROUPS.length,
    };
  }
}

module.exports = {
  Q,
  RELATIVE_GROUPS,
  Gate6GVirtualJovianFixture,
};
