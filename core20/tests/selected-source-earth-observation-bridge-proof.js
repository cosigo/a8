'use strict';

const assert =
  require('assert');

const fs =
  require('fs');

const path =
  require('path');

const { A8Core } =
  require('../core/a8-core');

const {
  MODE_VIRTUAL,
  MODE_REAL,
  A8PulseSourceEpochSelector,
} = require(
  '../hardware/a8-pulse-source-selector'
);

const {
  Core20RecoveryInputBridge,
} = require(
  '../hardware/a8-core20-recovery-input-bridge'
);

const {
  SelectedSourceEarthObservationBridge,
} = require(
  '../hardware/a8-selected-source-earth-observation-bridge'
);

console.log(
  'A8 post-seal hardware branch · Gate 6I selected-source Earth-observation bridge proof'
);

const source =
  fs.readFileSync(
    path.join(
      __dirname,
      '..',
      'hardware',
      'a8-selected-source-earth-observation-bridge.js'
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
  'setOscillator',
  'setDivider',
]) {
  assert(
    !executable.includes(
      forbidden
    ),
    `Gate-6I contains forbidden dependency/path: ${forbidden}`
  );
}

console.log(
  'PASS G6I-01 · bridge contains no A8Core, host-clock, timer, clock/phase/divider/authority setter'
);

function makeHarness() {
  const selector =
    new A8PulseSourceEpochSelector();

  const recovery =
    new Core20RecoveryInputBridge();

  const earth =
    new SelectedSourceEarthObservationBridge();

  selector.select(
    MODE_VIRTUAL
  );

  recovery.sync(
    selector.snapshot()
  );

  earth.sync(
    recovery.snapshot()
  );

  return {
    selector,
    recovery,
    earth,
  };
}

function sync(h) {
  h.recovery.sync(
    h.selector.snapshot()
  );

  return h.earth.sync(
    h.recovery.snapshot()
  );
}

{
  const h =
    makeHarness();

  let s =
    h.earth.snapshot();

  assert.equal(
    s.sourceEpoch,
    1
  );

  assert.equal(
    s.selectedRawPulse,
    null
  );

  assert.equal(
    s.externalObservationAcceptsRawPulse,
    false
  );

  assert.equal(
    s.mintaka.eventCount,
    0
  );

  assert.equal(
    s.sol.sampleCount,
    0
  );

  console.log(
    'PASS G6I-02 · Earth observers re-arm on selected source epoch and cannot observe before Gate-6F establishes raw baseline'
  );

  assert.throws(
    () =>
      h.earth.observeMintaka(
        h.recovery.snapshot(),
        {
          type:
            'STELLAR_MERIDIAN',

          witness:
            'MINTAKA',
        }
      ),
    /selected Gate-6F rawPulse is not established/
  );

  h.selector.advanceVirtual(
    '100'
  );

  sync(h);

  const m1 =
    h.earth.observeMintaka(
      h.recovery.snapshot(),
      {
        type:
          'STELLAR_MERIDIAN',

        witness:
          'MINTAKA',
      }
    );

  assert.equal(
    m1.observer.lastRawPulse,
    '100'
  );

  assert.equal(
    m1.observer.events[0].rawPulse,
    h.recovery.snapshot()
      .lastRawPulse
  );

  console.log(
    'PASS G6I-03 · Mintaka event rawPulse is inserted from the exact current Gate-6F selected counter'
  );

  assert.throws(
    () =>
      h.earth.observeMintaka(
        h.recovery.snapshot(),
        {
          type:
            'STELLAR_MERIDIAN',

          rawPulse:
            '999999',

          witness:
            'MINTAKA',
        }
      ),
    /unsupported Mintaka observation field: rawPulse/
  );

  assert.equal(
    h.earth.snapshot()
      .mintaka.eventCount,
    1
  );

  console.log(
    'PASS G6I-04 · external Mintaka payload cannot supply or spoof rawPulse'
  );

  h.selector.advanceVirtual(
    '388'
  );

  sync(h);

  const m2 =
    h.earth.observeMintaka(
      h.recovery.snapshot(),
      {
        type:
          'STELLAR_MERIDIAN',

        witness:
          'MINTAKA',
      }
    );

  assert.equal(
    m2.observer.lastRawPulse,
    '488'
  );

  assert.equal(
    m2.observer.latestSpanRaw,
    '388'
  );

  assert.equal(
    m2.observer.recurrence.reducedNumerator,
    '388'
  );

  assert.equal(
    m2.observer.recurrence.reducedDenominator,
    '1'
  );

  console.log(
    'PASS G6I-05 · Mintaka recurrence is measured against selected raw progress, with no independent observer counter'
  );

  h.selector.advanceVirtual(
    '12'
  );

  sync(h);

  const sol1 =
    h.earth.observeSol(
      h.recovery.snapshot(),
      {
        type:
          'SOL_CELESTIAL_DIRECTION',

        witness:
          'SOL',

        angle512: {
          numerator:
            '0',

          denominator:
            '1',
        },
      }
    );

  assert.equal(
    sol1.observer.lastRawPulse,
    '500'
  );

  assert.equal(
    sol1.observer.samples[0].rawPulse,
    h.recovery.snapshot()
      .lastRawPulse
  );

  console.log(
    'PASS G6I-06 · Sol direction sample rawPulse is inserted from the same Gate-6F selected counter'
  );

  assert.throws(
    () =>
      h.earth.observeSol(
        h.recovery.snapshot(),
        {
          type:
            'SOL_CELESTIAL_DIRECTION',

          rawPulse:
            '123456',

          witness:
            'SOL',

          angle512: {
            numerator:
              '1',

            denominator:
              '1',
          },
        }
      ),
    /unsupported Sol observation field: rawPulse/
  );

  console.log(
    'PASS G6I-07 · external Sol payload cannot supply or spoof rawPulse'
  );

  h.selector.advanceVirtual(
    '200'
  );

  sync(h);

  const sol2 =
    h.earth.observeSol(
      h.recovery.snapshot(),
      {
        type:
          'SOL_CELESTIAL_DIRECTION',

        witness:
          'SOL',

        angle512: {
          numerator:
            '3',

          denominator:
            '2',
        },
      }
    );

  assert.equal(
    sol2.observer.lastRawPulse,
    '700'
  );

  assert.deepEqual(
    sol2.observer.accumulatedForwardAdvance512,
    {
      numerator:
        '3',

      denominator:
        '2',
    }
  );

  assert.deepEqual(
    sol2.observer.forwardAdvancePerRawPulse512,
    {
      numerator:
        '3',

      denominator:
        '400',
    }
  );

  console.log(
    'PASS G6I-08 · Sol exact native-angle advance remains rational while elapsed raw comes only from Gate-6F'
  );

  const beforeSwitch =
    h.earth.snapshot();

  assert.equal(
    beforeSwitch.mintaka.eventCount,
    2
  );

  assert.equal(
    beforeSwitch.sol.sampleCount,
    2
  );

  h.selector.select(
    MODE_REAL
  );

  sync(h);

  const afterSwitch =
    h.earth.snapshot();

  assert.equal(
    afterSwitch.sourceEpoch,
    2
  );

  assert.equal(
    afterSwitch.selectedRawPulse,
    null
  );

  assert.equal(
    afterSwitch.mintaka.eventCount,
    0
  );

  assert.equal(
    afterSwitch.sol.sampleCount,
    0
  );

  assert.equal(
    afterSwitch.rearmCount,
    1
  );

  console.log(
    'PASS G6I-09 · VIRTUAL→REAL sourceEpoch change discards Mintaka and Sol evidence rather than splicing unrelated raw counters'
  );
}

{
  const core =
    new A8Core({
      oscillator:
        73,
    });

  const before = {
    rawTicks:
      core.rawTicks,

    naturalStep:
      core.naturalStep,

    oscillatorEpoch:
      core.oscillatorEpoch,

    dayPhase17:
      core.dayPhase17,

    dayCount:
      core.dayCount,

    selectedAuthority:
      core.selectedAuthority,
  };

  const h =
    makeHarness();

  h.selector.advanceVirtual(
    '64'
  );

  sync(h);

  h.earth.observeMintaka(
    h.recovery.snapshot(),
    {
      type:
        'STELLAR_MERIDIAN',

      witness:
        'MINTAKA',
    }
  );

  h.selector.advanceVirtual(
    '64'
  );

  sync(h);

  h.earth.observeSol(
    h.recovery.snapshot(),
    {
      type:
        'SOL_CELESTIAL_DIRECTION',

      witness:
        'SOL',

      angle512: {
        numerator:
          '1',

        denominator:
          '8',
      },
    }
  );

  const after = {
    rawTicks:
      core.rawTicks,

    naturalStep:
      core.naturalStep,

    oscillatorEpoch:
      core.oscillatorEpoch,

    dayPhase17:
      core.dayPhase17,

    dayCount:
      core.dayCount,

    selectedAuthority:
      core.selectedAuthority,
  };

  assert.deepEqual(
    after,
    before
  );

  const s =
    h.earth.snapshot();

  assert.equal(
    s.writesA8Core,
    false
  );

  assert.equal(
    s.dayPhase17Driven,
    false
  );

  assert.equal(
    s.phase20Driven,
    false
  );

  console.log(
    'PASS G6I-10 · selected-source Earth observations remain read-only and do not drive A8Core, DAY_PHASE17, or PHASE20'
  );
}

console.log('');
console.log(
  'PASS · A8-POSTSEAL-GATE6I-SELECTED-SOURCE-EARTH-OBSERVATION-BRIDGE'
);
