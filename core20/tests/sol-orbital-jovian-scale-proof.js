'use strict';

const assert =
  require('assert');

const {
  deriveSolOrbitalJovianScale,
} = require(
  '../observer/a8-sol-orbital-jovian-scale'
);

console.log(
  'A8 post-seal · Gate 6K exact Sol orbital / Jovian-Mintaka scale proof'
);

function earthScale(
  overrides = {}
) {
  return {
    schema:
      'A8-EARTH-ROTATION-JOVIAN-SCALE-V1',

    role:
      'EARTH_AXIAL_ROTATION_MEASURED_AGAINST_RECOVERED_JOVIAN_TIMEKEEPER',

    sourceEpoch:
      7,

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

      text:
        '388',
    },

    earthAxialRotationInJovianRecurrences: {
      numerator:
        '4',

      denominator:
        '1',

      text:
        '4',
    },

    ...overrides,
  };
}

function earthBridge(
  overrides = {}
) {
  return {
    schema:
      'A8-SELECTED-SOURCE-EARTH-OBSERVATION-BRIDGE-V1',

    role:
      'EARTH_OBSERVERS_USE_GATE6F_SELECTED_RAW_COUNTER',

    sourceEpoch:
      7,

    mode:
      'VIRTUAL',

    rig:
      'FIXTURE',

    sol: {
      schema:
        'A8-SOL-CELESTIAL-OBSERVER-V1',

      role:
        'EARTH_ORBITAL_ADVANCE_WITNESS',

      mode:
        'READ_ONLY',

      status:
        'TRACKING',

      sampleCount:
        2,

      intervalCount:
        1,

      firstRawPulse:
        '9000',

      lastRawPulse:
        '10552',

      elapsedRawPulse:
        '1552',

      forwardAdvancePerRawPulse512: {
        numerator:
          '1',

        denominator:
          '1552',
      },
    },

    ...overrides,
  };
}

let result =
  deriveSolOrbitalJovianScale(
    earthScale({
      status:
        'WAITING_FOR_MINTAKA_RECURRENCE',

      jovianRawPerRecoveredRecurrence:
        {
          numerator:
            '388',

          denominator:
            '1',

          text:
            '388',
        },

      earthAxialRotationInJovianRecurrences:
        null,
    }),

    earthBridge()
  );

assert.equal(
  result.status,
  'WAITING_FOR_EARTH_ROTATION_SCALE'
);

assert.equal(
  result.civilDayEstablished,
  false
);

assert.equal(
  result.solarRecurrenceEstablished,
  false
);

console.log(
  'PASS G6K-01 · Sol cannot create Gate-6K scale before Gate-6J Earth rotation is recovered'
);

result =
  deriveSolOrbitalJovianScale(
    earthScale(),

    earthBridge({
      sol: {
        ...earthBridge().sol,

        status:
          'SEEKING_SECOND_SAMPLE',

        intervalCount:
          0,

        forwardAdvancePerRawPulse512:
          null,
      },
    })
  );

assert.equal(
  result.status,
  'WAITING_FOR_SOL_TRACKING'
);

console.log(
  'PASS G6K-02 · recovered Earth rotation alone cannot invent Sol orbital advance'
);

result =
  deriveSolOrbitalJovianScale(
    earthScale(),

    earthBridge()
  );

assert.equal(
  result.status,
  'SOL_ORBITAL_ADVANCE_SCALE_RECOVERED'
);

/*
 * Fixture only:
 *
 * Sol = 1 / 1552 A8 angle per raw pulse.
 * Jovian = 388 raw per recovered recurrence.
 *
 * 1/1552 × 388 = 1/4 A8 angle / Jovian recurrence.
 *
 * Earth rotation = 4 Jovian recurrences.
 *
 * 1/4 × 4 = 1 A8 angle / Earth rotation.
 *
 * = 1/512 full turn per Earth rotation.
 */
assert.equal(
  result.solAdvancePerRawPulse512.text,
  '1/1552'
);

assert.equal(
  result.solAdvancePerJovianRecurrence512.text,
  '1/4'
);

assert.equal(
  result.solAdvancePerEarthAxialRotation512.text,
  '1'
);

assert.equal(
  result.solAdvancePerEarthAxialRotation512.integerOctal,
  '1₈'
);

assert.equal(
  result.orbitTurnFractionPerEarthAxialRotation.text,
  '1/512'
);

console.log(
  'PASS G6K-03 · exact fixture recovers 1/4 A8 angle per Jovian recurrence and 1 A8 angle per Earth rotation'
);

for (const key of [
  'civilDayEstablished',
  'meanSolarDayEstablished',
  'solarRecurrenceEstablished',
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
  'PASS G6K-04 · Gate 6K is read-only orbital geometry; no solar-day/civil-day/discipline claim'
);

assert.throws(
  () =>
    deriveSolOrbitalJovianScale(
      earthScale({
        sourceEpoch:
          8,
      }),

      earthBridge()
    ),

  /sourceEpoch disagree/
);

console.log(
  'PASS G6K-05 · source-epoch splice is rejected'
);

result =
  deriveSolOrbitalJovianScale(
    earthScale({
      jovianRawPerRecoveredRecurrence: {
        numerator:
          '125',

        denominator:
          '2',
      },

      earthAxialRotationInJovianRecurrences: {
        numerator:
          '16',

        denominator:
          '3',
      },
    }),

    earthBridge({
      sol: {
        ...earthBridge().sol,

        forwardAdvancePerRawPulse512: {
          numerator:
            '3',

          denominator:
            '1000',
        },
      },
    })
  );

/*
 * 3/1000 × 125/2 = 3/16 A8 angle / Jovian recurrence.
 * × 16/3 = 1 A8 angle / Earth rotation exactly.
 *
 * This proves the path is rational, not float-dependent.
 */
assert.equal(
  result.solAdvancePerJovianRecurrence512.text,
  '3/16'
);

assert.equal(
  result.solAdvancePerEarthAxialRotation512.text,
  '1'
);

console.log(
  'PASS G6K-06 · non-integral rational inputs remain exact'
);

console.log('');
console.log(
  'PASS · A8-POSTSEAL-GATE6K-SOL-ORBITAL-JOVIAN-MINTAKA-SCALE'
);
