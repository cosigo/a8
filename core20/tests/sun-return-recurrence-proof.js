'use strict';

const assert =
  require('assert');

const {
  deriveSunReturnRecurrence,
} = require(
  '../observer/a8-sun-return-recurrence'
);

console.log(
  'A8 post-seal · Gate 6L exact Sun-return recurrence proof'
);

function earthScale(
  overrides = {}
) {
  return {
    schema:
      'A8-EARTH-ROTATION-JOVIAN-SCALE-V1',

    sourceEpoch:
      9,

    mode:
      'VIRTUAL',

    rig:
      'FIXTURE',

    status:
      'EARTH_AXIAL_ROTATION_SCALE_RECOVERED',

    jovianRawPerRecoveredRecurrence: {
      numerator:
        '388',

      denominator:
        '1',
    },

    earthAxialRotationInJovianRecurrences: {
      numerator:
        '4',

      denominator:
        '1',
    },

    ...overrides,
  };
}

function solScale(
  overrides = {}
) {
  return {
    schema:
      'A8-SOL-ORBITAL-JOVIAN-SCALE-V1',

    sourceEpoch:
      9,

    mode:
      'VIRTUAL',

    rig:
      'FIXTURE',

    status:
      'SOL_ORBITAL_ADVANCE_SCALE_RECOVERED',

    solAdvancePerEarthAxialRotation512: {
      numerator:
        '1',

      denominator:
        '1',
    },

    ...overrides,
  };
}

let result =
  deriveSunReturnRecurrence(
    earthScale({
      status:
        'WAITING_FOR_MINTAKA_RECURRENCE',

      earthAxialRotationInJovianRecurrences:
        null,
    }),

    solScale()
  );

assert.equal(
  result.status,
  'WAITING_FOR_EARTH_ROTATION_SCALE'
);

assert.equal(
  result.solarRecurrenceEstablished,
  false
);

console.log(
  'PASS G6L-01 · no Earth-rotation scale means no Sun-return recurrence'
);

result =
  deriveSunReturnRecurrence(
    earthScale(),

    solScale({
      status:
        'WAITING_FOR_SOL_TRACKING',

      solAdvancePerEarthAxialRotation512:
        null,
    })
  );

assert.equal(
  result.status,
  'WAITING_FOR_SOL_ORBITAL_SCALE'
);

assert.equal(
  result.solarRecurrenceEstablished,
  false
);

console.log(
  'PASS G6L-02 · no Sol orbital scale means no Sun-return recurrence'
);

result =
  deriveSunReturnRecurrence(
    earthScale(),
    solScale()
  );

/*
 * Fixture:
 *
 * Earth stellar rotation = 512 A8 angle.
 * Sol advances +1 A8 angle during that rotation.
 *
 * Relative Sun closure = 511.
 *
 * Sun return requires:
 *
 *   512/511 Earth axial rotations.
 *
 * Earth axial rotation = 4 Jovian recurrences:
 *
 *   4 × 512/511
 *   = 2048/511 Jovian recurrences.
 *
 * Jovian ruler = 388 raw / recurrence:
 *
 *   388 × 2048/511
 *   = 794624/511 raw / Sun return.
 */
assert.equal(
  result.status,
  'SUN_RETURN_RECURRENCE_RECOVERED'
);

assert.equal(
  result.sunClosurePerEarthAxialRotation512.text,
  '511'
);

assert.equal(
  result.sunReturnInEarthAxialRotations.text,
  '512/511'
);

assert.equal(
  result.sunReturnInJovianRecurrences.text,
  '2048/511'
);

assert.equal(
  result.rawPerSunReturnRecurrence.text,
  '794624/511'
);

assert.equal(
  result.solarRecurrenceEstablished,
  true
);

assert.equal(
  result.meanSolarDayEstablished,
  false
);

assert.equal(
  result.civilDayEstablished,
  false
);

console.log(
  'PASS G6L-03 · exact fixture recovers 512/511 Earth rotations = 2048/511 Jovian recurrences per Sun return'
);

for (const key of [
  'dayPhase17Driven',
  'phase20Driven',
  'writesA8Core',
  'writesClock',
  'writesPhase',
  'writesDivider',
  'writesAuthority',
  'disciplinesJovianRuler',
  'usesLegacyTime',
  'usesLegacyAngle',
  'usesHostTime',
  'usesFrequencyHz',
  'usesExpectedSolarPeriod',
  'usesExpectedSiderealPeriod',
  'usesExpectedOrbitalRate',
  'usesExpectedYear',
]) {
  assert.equal(
    result[key],
    false,
    `${key} must remain false`
  );
}

console.log(
  'PASS G6L-04 · recurrence is recovered without legacy timing, expected astronomy constants, divider or discipline'
);

assert.throws(
  () =>
    deriveSunReturnRecurrence(
      earthScale({
        sourceEpoch:
          10,
      }),

      solScale()
    ),

  /sourceEpoch disagree/
);

console.log(
  'PASS G6L-05 · source-epoch splice is rejected'
);

/*
 * Zero orbital advance must collapse to exactly one axial rotation.
 * This is an important algebraic sanity case, not an astronomical claim.
 */
result =
  deriveSunReturnRecurrence(
    earthScale({
      earthAxialRotationInJovianRecurrences: {
        numerator:
          '7',

        denominator:
          '3',
      },

      jovianRawPerRecoveredRecurrence: {
        numerator:
          '125',

        denominator:
          '2',
      },
    }),

    solScale({
      solAdvancePerEarthAxialRotation512: {
        numerator:
          '0',

        denominator:
          '1',
      },
    })
  );

assert.equal(
  result.sunReturnInEarthAxialRotations.text,
  '1'
);

assert.equal(
  result.sunReturnInJovianRecurrences.text,
  '7/3'
);

assert.equal(
  result.rawPerSunReturnRecurrence.text,
  '875/6'
);

console.log(
  'PASS G6L-06 · zero-Sol-advance algebra collapses exactly to one stellar rotation'
);

/*
 * Non-integral Sol advance remains exact:
 *
 * delta = 3/2 A8 angle.
 * closure = 1021/2.
 * rotations = 512 / (1021/2) = 1024/1021.
 */
result =
  deriveSunReturnRecurrence(
    earthScale({
      earthAxialRotationInJovianRecurrences: {
        numerator:
          '16',

        denominator:
          '3',
      },

      jovianRawPerRecoveredRecurrence: {
        numerator:
          '125',

        denominator:
          '2',
      },
    }),

    solScale({
      solAdvancePerEarthAxialRotation512: {
        numerator:
          '3',

        denominator:
          '2',
      },
    })
  );

assert.equal(
  result.sunClosurePerEarthAxialRotation512.text,
  '1021/2'
);

assert.equal(
  result.sunReturnInEarthAxialRotations.text,
  '1024/1021'
);

assert.equal(
  result.sunReturnInJovianRecurrences.text,
  '16384/3063'
);

console.log(
  'PASS G6L-07 · non-integral orbital advance remains exact rational'
);

console.log('');
console.log(
  'PASS · A8-POSTSEAL-GATE6L-SUN-RETURN-RECURRENCE'
);
