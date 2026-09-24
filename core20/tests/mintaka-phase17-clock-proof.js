'use strict';

const assert =
  require('assert');

const {
  MintakaPhase17,
} = require(
  '../observer/a8-mintaka-phase17-clock'
);

function bridge(
  sourceEpoch,
  rawPulse
) {
  return {
    sourceEpoch,
    mode: 'VIRTUAL',
    rig: 'PROOF_RIG',
    lastRawPulse:
      String(rawPulse),
  };
}

function scale(
  numerator,
  denominator = 1
) {
  return {
    schema:
      'A8-EARTH-ROTATION-JOVIAN-SCALE-V1',

    status:
      'EARTH_AXIAL_ROTATION_SCALE_RECOVERED',

    mintakaRawPerEarthAxialRotation: {
      numerator:
        String(numerator),

      denominator:
        String(denominator),
    },
  };
}

function observer(
  lastRawPulse,
  eventCount = 2,
  cycleCount = 1
) {
  return {
    schema:
      'A8-MINTAKA-ROTATION-OBSERVER-V1',

    status:
      'RECOVERED',

    lastRawPulse:
      String(lastRawPulse),

    eventCount,
    cycleCount,
  };
}

const clock =
  new MintakaPhase17();

/*
 * Lock a 1000-raw-pulse Mintaka rotation
 * at STELLAR_MERIDIAN rawPulse 1000.
 */

let s =
  clock.snapshot(
    bridge(1, 1000),
    scale(1000),
    observer(1000)
  );

assert.strictEqual(
  s.status,
  'MINTAKA_PHASE17_STELLAR_CLOCK_ACTIVE'
);

assert.strictEqual(
  s.mintakaPhase17,
  '0'
);

assert.strictEqual(
  s.mintakaPhase17Binary,
  '00000000000000000'
);

assert.strictEqual(
  s.clock.textOctal,
  '00:00:00₈'
);

console.log(
  'PASS M17-01 · recovered Mintaka meridian anchor establishes exact phase zero'
);

/*
 * Quarter rotation:
 * 250 / 1000 × 131072 = 32768
 * = 8 decimal A8 stellar hours
 * = 10 octal hours.
 */

s =
  clock.snapshot(
    bridge(1, 1250),
    scale(1000),
    observer(1000)
  );

assert.strictEqual(
  s.mintakaPhase17,
  '32768'
);

assert.strictEqual(
  s.clock.textOctal,
  '10:00:00₈'
);

console.log(
  'PASS M17-02 · quarter stellar rotation = exact 32768/2^17 = 10:00:00₈'
);

/*
 * One exact rotation wraps naturally to zero.
 */

s =
  clock.snapshot(
    bridge(1, 2000),
    scale(1000),
    observer(1000)
  );

assert.strictEqual(
  s.completedMintakaRotations,
  '1'
);

assert.strictEqual(
  s.mintakaPhase17,
  '0'
);

console.log(
  'PASS M17-03 · 17-bit stellar phase wraps at one recovered Mintaka rotation'
);

/*
 * One and one-quarter rotations.
 */

s =
  clock.snapshot(
    bridge(1, 2250),
    scale(1000),
    observer(1000)
  );

assert.strictEqual(
  s.completedMintakaRotations,
  '1'
);

assert.strictEqual(
  s.mintakaPhase17,
  '32768'
);

console.log(
  'PASS M17-04 · completed rotation count remains separate from modulo 17-bit phase'
);

/*
 * Later observer evidence changes recurrence.
 * Clock must expose mismatch but must NOT silently retune.
 */

s =
  clock.snapshot(
    bridge(1, 2250),
    scale(1001),
    observer(
      2001,
      3,
      2
    )
  );

assert.strictEqual(
  s.observedRecurrenceChanged,
  true
);

assert.strictEqual(
  s.lockedRawPerEarthAxialRotation.numerator,
  '1000'
);

assert.strictEqual(
  s.currentlyObservedRawPerEarthAxialRotation.numerator,
  '1001'
);

assert.strictEqual(
  s.mintakaPhase17,
  '32768'
);

console.log(
  'PASS M17-05 · later Mintaka evidence cannot silently retune locked stellar clock'
);

/*
 * Source epoch change must rearm and permit a new natural lock.
 */

s =
  clock.snapshot(
    bridge(2, 5000),
    scale(1200),
    observer(
      5000,
      2,
      1
    )
  );

assert.strictEqual(
  s.sourceEpoch,
  2
);

assert.strictEqual(
  s.lockedRawPerEarthAxialRotation.numerator,
  '1200'
);

assert.strictEqual(
  s.mintakaPhase17,
  '0'
);

assert.strictEqual(
  s.observedRecurrenceChanged,
  false
);

console.log(
  'PASS M17-06 · sourceEpoch change rearms Mintaka clock and establishes a new natural lock'
);

/*
 * Authority/read-only boundary.
 */

for (
  const key of [
    'writesA8Core',
    'writesJovianTimekeeper',
    'writesMintakaObserver',
    'writesSolObserver',
    'writesTerraShipSlip',
    'writesCivilClock',
    'writesCalendar',
    'changesAuthority',
    'usesHostTime',
    'usesLegacyTime',
    'usesFrequencyHz',
    'usesUTC',
    'usesNTP',
    'usesGPS',
  ]
) {
  assert.strictEqual(
    s[key],
    false,
    `${key} must remain false`
  );
}

console.log(
  'PASS M17-07 · Mintaka stellar clock is downstream/read-only and introduces no legacy timing authority'
);

console.log(
  'PASS · MINTAKA PHASE17 CLOCK PROOF COMPLETE'
);
