'use strict';

const assert =
  require('assert');

const fs =
  require('fs');

const path =
  require('path');

const {
  deriveEarthRotationJovianScale,
} = require(
  '../observer/a8-earth-rotation-jovian-scale'
);

console.log(
  'A8 post-seal · Gate 6J Earth axial rotation / Jovian ruler proof'
);

const source =
  fs.readFileSync(
    path.join(
      __dirname,
      '..',
      'observer',
      'a8-earth-rotation-jovian-scale.js'
    ),
    'utf8'
  );

const executable =
  source
    .replace(
      /\/\*[\s\S]*?\*\//g,
      ''
    )
    .replace(
      /\/\/.*$/gm,
      ''
    );

for (const forbidden of [
  "require('../core",
  "require('./core",
  'Date.now',
  'new Date',
  'performance.now',
  'process.hrtime',
  'setTimeout',
  'setInterval',
  'setClockPhase',
  'adjustClockTicks',
  'setAuthority',
  'setEarthDayRawSpan',
  'setDivider',
]) {
  assert(
    !executable.includes(
      forbidden
    ),
    `Gate-6J contains forbidden path: ${forbidden}`
  );
}

console.log(
  'PASS G6J-01 · relationship has no A8Core, host clock, timer, phase/divider/authority setter'
);

function tk({
  epoch = 1,
  ruler = null,
} = {}) {
  return {
    schema:
      'A8-JOVIAN-PHASE-TIMEKEEPER-V1',

    sourceEpoch:
      epoch,

    mode:
      'VIRTUAL',

    rig:
      'VIRTUAL_RIG',

    lockedRulerRawPer512:
      ruler,
  };
}

function earth({
  epoch = 1,
  recurrence = null,
  events = 0,
} = {}) {
  return {
    schema:
      'A8-SELECTED-SOURCE-EARTH-OBSERVATION-BRIDGE-V1',

    sourceEpoch:
      epoch,

    mode:
      'VIRTUAL',

    rig:
      'VIRTUAL_RIG',

    mintaka: {
      schema:
        'A8-MINTAKA-ROTATION-OBSERVER-V1',

      status:
        recurrence === null
          ? (
              events === 0
                ? 'SEEKING_FIRST_EVENT'
                : 'SEEKING_SECOND_EVENT'
            )
          : 'RECOVERED',

      eventCount:
        events,

      recurrence,
    },
  };
}

{
  const s =
    deriveEarthRotationJovianScale(
      tk(),
      earth()
    );

  assert.equal(
    s.status,
    'WAITING_FOR_JOVIAN_RULER'
  );

  assert.equal(
    s.civilDayEstablished,
    false
  );

  assert.equal(
    s.dayPhase17Driven,
    false
  );

  console.log(
    'PASS G6J-02 · no Jovian ruler means no Earth rotation scale is invented'
  );
}

{
  const s =
    deriveEarthRotationJovianScale(
      tk({
        ruler:
          '388',
      }),
      earth({
        events:
          1,
      })
    );

  assert.equal(
    s.status,
    'WAITING_FOR_MINTAKA_RECURRENCE'
  );

  assert.equal(
    s.jovianRawPerRecoveredRecurrence.text,
    '388'
  );

  assert.equal(
    s.earthAxialRotationInJovianRecurrences,
    null
  );

  console.log(
    'PASS G6J-03 · recovered Jovian ruler alone does not manufacture Earth rotation'
  );
}

{
  const s =
    deriveEarthRotationJovianScale(
      tk({
        ruler:
          '388',
      }),
      earth({
        events:
          2,

        recurrence: {
          reducedNumerator:
            '1552',

          reducedDenominator:
            '1',
        },
      })
    );

  assert.equal(
    s.status,
    'EARTH_AXIAL_ROTATION_SCALE_RECOVERED'
  );

  assert.equal(
    s.mintakaRawPerEarthAxialRotation.text,
    '1552'
  );

  assert.equal(
    s.earthAxialRotationInJovianRecurrences.text,
    '4'
  );

  assert.equal(
    s.jovianPhaseStatesPerEarthAxialRotation.text,
    '2048'
  );

  assert.equal(
    s.jovianPhaseStatesPerEarthAxialRotation.integerOctal,
    '4000₈'
  );

  assert.equal(
    s.civilDayEstablished,
    false
  );

  assert.equal(
    s.meanSolarDayEstablished,
    false
  );

  assert.equal(
    s.usesSol,
    false
  );

  console.log(
    'PASS G6J-04 · arbitrary 1552 raw Mintaka recurrence / 388 raw Jovian ruler = exactly 4 Jovian recurrences = 4000₈ PHASE9 states'
  );
}

{
  const s =
    deriveEarthRotationJovianScale(
      tk({
        ruler:
          '125/2',
      }),
      earth({
        events:
          5,

        recurrence: {
          reducedNumerator:
            '1000',

          reducedDenominator:
            '3',
        },
      })
    );

  assert.equal(
    s.earthAxialRotationInJovianRecurrences.text,
    '16/3'
  );

  assert.equal(
    s.jovianPhaseStatesPerEarthAxialRotation.text,
    '8192/3'
  );

  assert.equal(
    s.jovianPhaseStatesPerEarthAxialRotation.integer,
    null
  );

  console.log(
    'PASS G6J-05 · non-integral recovered relationships remain exact rational with no float rounding'
  );
}

assert.throws(
  () =>
    deriveEarthRotationJovianScale(
      tk({
        epoch:
          1,

        ruler:
          '388',
      }),
      earth({
        epoch:
          2,

        events:
          2,

        recurrence: {
          reducedNumerator:
            '1552',

          reducedDenominator:
            '1',
        },
      })
    ),
  /sourceEpoch disagree/
);

console.log(
  'PASS G6J-06 · Earth rotation evidence cannot be combined across different selected raw-counter epochs'
);

console.log('');
console.log(
  'PASS · A8-POSTSEAL-GATE6J-EARTH-AXIAL-ROTATION-JOVIAN-SCALE'
);
