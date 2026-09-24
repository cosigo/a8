'use strict';

const assert =
  require('assert');

const fs =
  require('fs');

const path =
  require('path');

const {
  OpposingClockDiscrepancy,
} = require(
  '../observer/a8-opposing-clock-discrepancy'
);

const M =
  813694976n;

/*
 * Present Core20 virtual qualification relationship:
 *
 * Sun-return =
 *   416611827712 / 511 raw
 *
 * and:
 *
 *   416611827712
 *   = 813694976 × 512
 *
 * Therefore one exact relative beat is:
 *
 *   512 Mintaka rotations
 *   511 civil Sun-returns
 *
 * No outside time unit is involved.
 */

const SUN_N =
  416611827712n;

const SUN_D =
  511n;

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
  numerator = M,
  denominator = 1n
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

function sun(
  numerator = SUN_N,
  denominator = SUN_D
) {
  return {
    schema:
      'A8-SUN-RETURN-RECURRENCE-V1',

    status:
      'SUN_RETURN_RECURRENCE_RECOVERED',

    solarRecurrenceEstablished:
      true,

    rawPerSunReturnRecurrence: {
      numerator:
        String(numerator),

      denominator:
        String(denominator),
    },
  };
}

const anchor =
  1000000000n;

const clock =
  new OpposingClockDiscrepancy();

/*
 * D-01 · common selected-raw anchor.
 */

let s =
  clock.snapshot(
    bridge(
      1,
      anchor
    ),
    scale(),
    sun()
  );

assert.strictEqual(
  s.status,
  'OPPOSING_CLOCK_DISCREPANCY_ACTIVE'
);

assert.strictEqual(
  s.accumulated
    .unwrappedDiscrepancyRotations
    .text,
  '0'
);

assert.strictEqual(
  s.relativeBeat
    .geometricLeg,
  'ALIGNED'
);

console.log(
  'PASS D-01 · opposing clocks establish one exact common raw-pulse anchor'
);

/*
 * D-02 · after one Mintaka rotation:
 *
 * Mintaka = 1
 * Civil   = 511/512
 *
 * Difference:
 *
 *   1/512 rotation
 *   256 phase17 states
 *   1 angle512 state
 */

s =
  clock.snapshot(
    bridge(
      1,
      anchor + M
    ),
    scale(),
    sun()
  );

assert.strictEqual(
  s.accumulated
    .mintakaRotations
    .text,
  '1'
);

assert.strictEqual(
  s.accumulated
    .civilReturns
    .text,
  '511/512'
);

assert.strictEqual(
  s.accumulated
    .unwrappedDiscrepancyRotations
    .text,
  '1/512'
);

assert.strictEqual(
  s.accumulated
    .unwrappedDiscrepancyPhase17
    .text,
  '256'
);

assert.strictEqual(
  s.accumulated
    .unwrappedDiscrepancyAngle512
    .text,
  '1'
);

assert.strictEqual(
  s.relativeBeat
    .geometricSeparationAngle512
    .text,
  '1'
);

assert.strictEqual(
  s.relativeBeat
    .geometricLeg,
  'OUTBOUND_FROM_ALIGNMENT'
);

console.log(
  'PASS D-02 · one Mintaka rotation produces exact native discrepancy 1/512 turn = 1 angle512 state'
);

/*
 * D-03 · halfway around relative beat.
 *
 * 256 Mintaka rotations:
 * discrepancy = 1/2 turn
 * geometric separation = opposition
 */

s =
  clock.snapshot(
    bridge(
      1,
      anchor +
        M * 256n
    ),
    scale(),
    sun()
  );

assert.strictEqual(
  s.accumulated
    .unwrappedDiscrepancyRotations
    .text,
  '1/2'
);

assert.strictEqual(
  s.relativeBeat
    .geometricSeparationPhase17
    .text,
  '65536'
);

assert.strictEqual(
  s.relativeBeat
    .geometricSeparationAngle512
    .text,
  '256'
);

assert.strictEqual(
  s.relativeBeat
    .geometricLeg,
  'OPPOSITION'
);

console.log(
  'PASS D-03 · relative geometry reaches exact half-turn opposition'
);

/*
 * D-04 · return leg.
 *
 * 384 Mintaka rotations:
 * accumulated discrepancy = 3/4 turn
 * shortest separation      = 1/4 turn
 */

s =
  clock.snapshot(
    bridge(
      1,
      anchor +
        M * 384n
    ),
    scale(),
    sun()
  );

assert.strictEqual(
  s.accumulated
    .unwrappedDiscrepancyRotations
    .text,
  '3/4'
);

assert.strictEqual(
  s.relativeBeat
    .geometricSeparationAngle512
    .text,
  '128'
);

assert.strictEqual(
  s.relativeBeat
    .geometricLeg,
  'RETURNING_TO_ALIGNMENT'
);

console.log(
  'PASS D-04 · wrapped geometry returns toward alignment while unwrapped discrepancy keeps increasing'
);

/*
 * D-05 · full relative closure.
 *
 * 512 Mintaka rotations
 * 511 civil Sun-returns
 *
 * Wrapped geometry = zero.
 * Unwrapped discrepancy = one complete turn.
 */

s =
  clock.snapshot(
    bridge(
      1,
      anchor +
        M * 512n
    ),
    scale(),
    sun()
  );

assert.strictEqual(
  s.accumulated
    .mintakaRotations
    .text,
  '512'
);

assert.strictEqual(
  s.accumulated
    .civilReturns
    .text,
  '511'
);

assert.strictEqual(
  s.accumulated
    .unwrappedDiscrepancyRotations
    .text,
  '1'
);

assert.strictEqual(
  s.accumulated
    .unwrappedDiscrepancyPhase17
    .text,
  '131072'
);

assert.strictEqual(
  s.relativeBeat
    .completedBeats,
  '1'
);

assert.strictEqual(
  s.relativeBeat
    .positionWithinBeatRotations
    .text,
  '0'
);

assert.strictEqual(
  s.relativeBeat
    .geometricSeparationAngle512
    .text,
  '0'
);

assert.strictEqual(
  s.relativeBeat
    .geometricLeg,
  'ALIGNED'
);

console.log(
  'PASS D-05 · wrapped clocks realign after 512 Mintaka / 511 civil while unwrapped accumulator preserves one full-turn discrepancy'
);

/*
 * D-06 · exact beat structure must be derived,
 * not injected as an expected count.
 */

assert.strictEqual(
  s.relativeBeat
    .mintakaRotationsPerBeat
    .text,
  '512'
);

assert.strictEqual(
  s.relativeBeat
    .civilReturnsPerBeat
    .text,
  '511'
);

assert.strictEqual(
  s.relativeBeat
    .rawPulseSpan
    .text,
  '416611827712'
);

console.log(
  'PASS D-06 · module derives exact 512 ↔ 511 relative beat from locked native recurrences'
);

/*
 * D-07 · later evidence may disagree,
 * but the active comparator cannot silently retune.
 */

s =
  clock.snapshot(
    bridge(
      1,
      anchor +
        M * 512n
    ),
    scale(
      M + 1n
    ),
    sun(
      SUN_N + 7n,
      SUN_D
    )
  );

assert.strictEqual(
  s.observedRecurrenceChanged
    .mintaka,
  true
);

assert.strictEqual(
  s.observedRecurrenceChanged
    .civil,
  true
);

assert.strictEqual(
  s.lockedRecurrences
    .mintakaRawPerEarthAxialRotation
    .text,
  M.toString()
);

assert.strictEqual(
  s.lockedRecurrences
    .civilRawPerSunReturn
    .text,
  `${SUN_N}/${SUN_D}`
);

console.log(
  'PASS D-07 · later recurrence changes are exposed without silently rewriting either locked rate'
);

/*
 * D-08 · sourceEpoch change clears the comparison
 * and establishes a new common anchor.
 */

const M2 =
  1200n;

const S2 =
  1500n;

s =
  clock.snapshot(
    bridge(
      2,
      9000000n
    ),
    scale(M2),
    sun(S2, 1n)
  );

assert.strictEqual(
  s.sourceEpoch,
  2
);

assert.strictEqual(
  s.anchorRawPulse,
  '9000000'
);

assert.strictEqual(
  s.accumulated
    .unwrappedDiscrepancyRotations
    .text,
  '0'
);

assert.strictEqual(
  s.observedRecurrenceChanged
    .mintaka,
  false
);

assert.strictEqual(
  s.observedRecurrenceChanged
    .civil,
  false
);

console.log(
  'PASS D-08 · sourceEpoch change rearms comparator and zeroes only the new-source comparison anchor'
);

/*
 * D-09 · do not assume Mintaka must always lead.
 *
 * New epoch:
 * Mintaka recurrence = 1000 raw
 * Civil recurrence   = 900 raw
 *
 * Civil is faster.
 */

const reverse =
  new OpposingClockDiscrepancy();

reverse.snapshot(
  bridge(
    7,
    10000n
  ),
  scale(
    1000n
  ),
  sun(
    900n,
    1n
  )
);

s =
  reverse.snapshot(
    bridge(
      7,
      11000n
    ),
    scale(
      1000n
    ),
    sun(
      900n,
      1n
    )
  );

assert.strictEqual(
  s.rates.rateLeader,
  'CIVIL_FASTER'
);

assert.strictEqual(
  s.accumulated.currentLeader,
  'CIVIL_LEADS'
);

assert.strictEqual(
  s.accumulated
    .unwrappedDiscrepancyRotations
    .text,
  '-1/9'
);

assert.strictEqual(
  s.relativeBeat
    .geometricSeparationRotations
    .text,
  '1/9'
);

console.log(
  'PASS D-09 · signed comparison handles the opposite rate direction instead of hard-coding Mintaka lead'
);

/*
 * D-10 · identical rates remain exactly identical.
 */

const equal =
  new OpposingClockDiscrepancy();

equal.snapshot(
  bridge(
    8,
    20000n
  ),
  scale(
    777n
  ),
  sun(
    777n,
    1n
  )
);

s =
  equal.snapshot(
    bridge(
      8,
      29999n
    ),
    scale(
      777n
    ),
    sun(
      777n,
      1n
    )
  );

assert.strictEqual(
  s.rates.rateLeader,
  'SAME_RATE'
);

assert.strictEqual(
  s.accumulated
    .unwrappedDiscrepancyRotations
    .text,
  '0'
);

assert.strictEqual(
  s.relativeBeat.exists,
  false
);

console.log(
  'PASS D-10 · truly identical native rates produce zero discrepancy and no fabricated beat'
);

/*
 * D-11 · progression must not come from host/browser clocks.
 *
 * Search executable source for common host-time pacing calls.
 */

const moduleSource =
  fs.readFileSync(
    path.join(
      __dirname,
      '../observer/a8-opposing-clock-discrepancy.js'
    ),
    'utf8'
  );

for (
  const forbidden of [
    /\bDate\.now\s*\(/,
    /\bnew\s+Date\s*\(/,
    /\bperformance\.now\s*\(/,
    /\bsetInterval\s*\(/,
    /\bsetTimeout\s*\(/,
    /\bprocess\.hrtime\b/,
  ]
) {
  assert.strictEqual(
    forbidden.test(
      moduleSource
    ),
    false
  );
}

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
    'usesBrowserTime',
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
  'PASS D-11 · selected raw pulse is the only progression input; no host-time pacing or external time authority enters the comparator'
);

console.log();
console.log(
  'PASS · OPPOSING-CLOCK DISCREPANCY PROOF COMPLETE'
);
