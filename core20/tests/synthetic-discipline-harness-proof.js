'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { A8Core } = require('../core/a8-core');

const {
  SAMPLE_SCHEMA,
  SAMPLE_SOURCE,
} = require('../observer/a8-jovian-slow-discipline-candidate');

const {
  runSyntheticDisciplineHarness,
} = require('../experiments/a8-synthetic-discipline-harness');

const sourcePath = path.join(
  __dirname,
  '..',
  'experiments',
  'a8-synthetic-discipline-harness.js'
);

const source = fs.readFileSync(sourcePath, 'utf8');

console.log('A8 v5.4.20 Gate 5H · synthetic discipline state-machine harness proof');

const executable = source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '');

for (const forbidden of [
  "require('../core",
  "require('./core",
  'DAY_PHASE17',
  'PHASE20',
  'setClockPhase',
  'adjustClockTicks',
  'setAuthority',
  'Date.now',
  'new Date',
  'performance.now',
  'process.hrtime',
  'setTimeout',
  'setInterval',
  'STELLAR_MERIDIAN',
  'SOL_CELESTIAL_DIRECTION',
  'MEAN_SUN',
  'SOLAR_MERIDIAN',
  'TerraShipSlip',
  '598016',
  '2398634',
  '599658',
  '365.25',
  '86400',
]) {
  assert(
    !executable.includes(forbidden),
    `discipline harness executable contains forbidden dependency/value: ${forbidden}`
  );
}

for (const forbiddenPhase of [
  'setPhase(',
  'snapPhase(',
  'alignPhase(',
  'correctPhase(',
  'applyPhase(',
]) {
  assert(
    !executable.includes(forbiddenPhase),
    `discipline harness contains forbidden phase API: ${forbiddenPhase}`
  );
}

console.log('PASS G5H-01 · harness contains no real-core import, phase setter, Earth-observer path, host-time cadence, real actuator, or seeded natural result');

function sample(rawNumerator, cycleDenominator = 1) {
  return {
    schema: SAMPLE_SCHEMA,
    source: SAMPLE_SOURCE,
    rawNumerator: String(rawNumerator),
    cycleDenominator: String(cycleDenominator),
  };
}

function compare(a, b) {
  const left = BigInt(a.numerator) * BigInt(b.denominator);
  const right = BigInt(b.numerator) * BigInt(a.denominator);

  return left < right ? -1 : left > right ? 1 : 0;
}

function scriptFixture() {
  return [
    {
      state: 'RECOVERED',
      label: 'INITIAL_RECOVERED',
    },
    {
      state: 'LOSS',
      label: 'LOSS_4',
      advances: 4,
    },
    {
      state: 'REACQUIRED',
      label: 'REACQUIRE_DOWN',
      baselineJovianSample: sample(1000),
      freshJovianSample: sample(1001),
    },
    {
      state: 'LOSS',
      label: 'LOSS_6',
      advances: 6,
    },
    {
      state: 'REACQUIRED',
      label: 'REACQUIRE_UP',
      baselineJovianSample: sample(1000),
      freshJovianSample: sample(997),
    },
    {
      state: 'LOSS',
      label: 'LOSS_3',
      advances: 3,
    },
    {
      state: 'REACQUIRED',
      label: 'REACQUIRE_DOWN_AGAIN',
      baselineJovianSample: sample(1000),
      freshJovianSample: sample(1003),
    },
  ];
}

function fixture() {
  return runSyntheticDisciplineHarness({
    divider: {
      numerator: '8',
      denominator: '1',
    },

    initialSettledRateScale: {
      numerator: '1',
      denominator: '1',
    },

    maxRateScaleStep: {
      numerator: '1',
      denominator: '10000',
    },

    script: scriptFixture(),
  });
}

{
  const r = fixture();

  assert.equal(r.mode, 'DISCONNECTED_FROM_A8CORE');
  assert.equal(r.role, 'EXPERIMENT_OWNED_SCRIPTED_DISCIPLINE_STATE_MACHINE');
  assert.deepEqual(
    r.supportedStates,
    ['RECOVERED', 'LOSS', 'REACQUIRED']
  );
  assert.equal(r.finalState, 'RECOVERED');

  assert.equal(r.writesA8Core, false);
  assert.equal(r.writesRealOscillator, false);
  assert.equal(r.writesRealDivider, false);
  assert.equal(r.writesRealClock, false);
  assert.equal(r.writesClockPhase, false);
  assert.equal(r.writesAuthority, false);

  assert.equal(r.usesHostTime, false);
  assert.equal(r.usesTimedCadence, false);
  assert.equal(r.acceptsExternalPhaseControl, false);

  assert.equal(r.inventsCandidateDuringLoss, false);
  assert.equal(r.changesRateDuringLoss, false);
  assert.equal(r.candidateLoadChangesRate, false);
  assert.equal(r.candidateLoadChangesPhase, false);
  assert.equal(r.requiresSettlementBeforeLoss, true);
  assert.equal(r.requiresLossBeforeReacquisition, true);
}
console.log('PASS G5H-02 · consolidated harness exposes only RECOVERED/LOSS/REACQUIRED and preserves all no-actuator/no-phase/no-cadence boundaries');

{
  const r = fixture();

  assert.equal(r.scriptEventCount, 7);

  assert.deepEqual(
    r.stateTransitions.map(t => `${t.from}->${t.to}`),
    [
      'UNINITIALIZED->RECOVERED',
      'RECOVERED->LOSS',
      'LOSS->REACQUIRED',
      'REACQUIRED->RECOVERED',
      'RECOVERED->LOSS',
      'LOSS->REACQUIRED',
      'REACQUIRED->RECOVERED',
      'RECOVERED->LOSS',
      'LOSS->REACQUIRED',
      'REACQUIRED->RECOVERED',
    ]
  );
}
console.log('PASS G5H-03 · legal scripted state machine executes UNINITIALIZED→RECOVERED then three LOSS→REACQUIRED→RECOVERED cycles');

{
  const r = fixture();

  const initial = r.events[0];

  assert.equal(initial.state, 'RECOVERED');

  assert.deepEqual(
    initial.phaseMovement,
    { numerator: '0', denominator: '1' }
  );

  assert.deepEqual(
    initial.rateMovement,
    { numerator: '0', denominator: '1' }
  );
}
console.log('PASS G5H-04 · initial RECOVERED declaration changes neither synthetic rate nor phase');

{
  const r = fixture();

  const losses = r.events.filter(
    e => e.state === 'LOSS'
  );

  assert.deepEqual(
    losses.map(e => e.advances),
    [4, 6, 3]
  );

  assert.deepEqual(
    losses.map(e => e.heldRateScale),
    [
      { numerator: '1', denominator: '1' },
      { numerator: '1000', denominator: '1001' },
      { numerator: '1000', denominator: '997' },
    ]
  );

  assert.deepEqual(
    losses.map(e => e.phaseAdvance),
    [
      { numerator: '1', denominator: '2' },
      { numerator: '750', denominator: '1001' },
      { numerator: '375', denominator: '997' },
    ]
  );

  for (const loss of losses) {
    assert.equal(loss.candidateInvented, false);

    assert.deepEqual(
      loss.rateAtLossEnd,
      loss.heldRateScale
    );

    for (const item of loss.lossTrace) {
      assert.deepEqual(
        item.rateScale,
        loss.heldRateScale
      );

      assert(
        compare(item.phaseAfter, item.phaseBefore) > 0
      );
    }
  }
}
console.log('PASS G5H-05 · every LOSS freezes the last settled rate, invents no candidate, and advances phase only by exact integration');

{
  const r = fixture();

  const reacquired = r.events.filter(
    e => e.state === 'REACQUIRED'
  );

  assert.deepEqual(
    reacquired.map(e => e.errorSign),
    [1, -1, 1]
  );

  assert.deepEqual(
    reacquired.map(e => e.slewDirection),
    ['DOWN', 'UP', 'DOWN']
  );

  assert.deepEqual(
    reacquired.map(e => e.targetRateScale),
    [
      { numerator: '1000', denominator: '1001' },
      { numerator: '1000', denominator: '997' },
      { numerator: '1000', denominator: '1003' },
    ]
  );

  assert.deepEqual(
    reacquired.map(e => e.recoveryUpdates),
    [10, 41, 61]
  );

  for (const event of reacquired) {
    assert.deepEqual(
      event.candidateLoadPhaseMovement,
      { numerator: '0', denominator: '1' }
    );

    assert.deepEqual(
      event.candidateLoadRateMovement,
      { numerator: '0', denominator: '1' }
    );

    assert.deepEqual(
      event.settledRateScale,
      event.targetRateScale
    );
  }
}
console.log('PASS G5H-06 · each REACQUIRED window derives exact Jovian candidate, loads with zero phase/rate movement, then settles by bounded rate-only slew');

{
  const r = fixture();

  assert.equal(r.totalPlantAdvances, 125);

  assert.deepEqual(
    r.finalRateScale,
    { numerator: '1000', denominator: '1003' }
  );

  assert.deepEqual(
    r.finalClockPhase,
    {
      numerator: '250322088666899',
      denominator: '16015855856000',
    }
  );

  for (const item of r.plantTrace) {
    assert(
      compare(item.phaseAfter, item.phaseBefore) > 0,
      `phase did not strictly advance at plant advance ${item.globalPlantAdvance}`
    );
  }

  for (let i = 1; i < r.plantTrace.length; i++) {
    assert.deepEqual(
      r.plantTrace[i].phaseBefore,
      r.plantTrace[i - 1].phaseAfter,
      `global phase discontinuity at plant advance ${i + 1}`
    );
  }
}
console.log('PASS G5H-07 · all 125 synthetic plant advances form one exact uninterrupted strictly monotonic phase history');

{
  assert.throws(
    () => runSyntheticDisciplineHarness({
      initialSettledRateScale: {
        numerator: '1',
        denominator: '1',
      },
      maxRateScaleStep: {
        numerator: '1',
        denominator: '10000',
      },
      script: [
        {
          state: 'LOSS',
          advances: 2,
        },
        {
          state: 'REACQUIRED',
          baselineJovianSample: sample(1000),
          freshJovianSample: sample(1001),
        },
        {
          state: 'RECOVERED',
        },
      ],
    }),
    /LOSS event 1 requires RECOVERED state/
  );

  assert.throws(
    () => runSyntheticDisciplineHarness({
      initialSettledRateScale: {
        numerator: '1',
        denominator: '1',
      },
      maxRateScaleStep: {
        numerator: '1',
        denominator: '10000',
      },
      script: [
        {
          state: 'RECOVERED',
        },
        {
          state: 'REACQUIRED',
          baselineJovianSample: sample(1000),
          freshJovianSample: sample(1001),
        },
        {
          state: 'LOSS',
          advances: 2,
        },
      ],
    }),
    /REACQUIRED event 2 requires LOSS state/
  );

  assert.throws(
    () => runSyntheticDisciplineHarness({
      initialSettledRateScale: {
        numerator: '1',
        denominator: '1',
      },
      maxRateScaleStep: {
        numerator: '1',
        denominator: '10000',
      },
      script: [
        {
          state: 'RECOVERED',
        },
        {
          state: 'RECOVERED',
        },
        {
          state: 'LOSS',
          advances: 2,
        },
      ],
    }),
    /RECOVERED event 2 is only legal as the initial state declaration/
  );
}
console.log('PASS G5H-08 · illegal state transitions are rejected: no LOSS before RECOVERED, no REACQUIRED before LOSS, no duplicate initial RECOVERED');

{
  assert.throws(
    () => runSyntheticDisciplineHarness({
      initialSettledRateScale: {
        numerator: '1',
        denominator: '1',
      },
      maxRateScaleStep: {
        numerator: '1',
        denominator: '10000',
      },
      script: [
        {
          state: 'RECOVERED',
        },
        {
          state: 'LOSS',
          advances: 3,
        },
        {
          state: 'LOSS',
          advances: 2,
        },
      ],
    }),
    /LOSS event 3 requires RECOVERED state/
  );
}
console.log('PASS G5H-09 · a second LOSS cannot begin until fresh reacquisition has returned the machine to RECOVERED');

{
  const c = new A8Core({ oscillator: 73 });

  const before = {
    rawTicks: c.rawTicks,
    naturalStep: c.naturalStep,
    oscillatorEpoch: c.oscillatorEpoch,
    dayPhase17: c.dayPhase17,
    dayCount: c.dayCount,
    selectedAuthority: c.selectedAuthority,
  };

  fixture();

  const after = {
    rawTicks: c.rawTicks,
    naturalStep: c.naturalStep,
    oscillatorEpoch: c.oscillatorEpoch,
    dayPhase17: c.dayPhase17,
    dayCount: c.dayCount,
    selectedAuthority: c.selectedAuthority,
  };

  assert.deepEqual(after, before);
}
console.log('PASS G5H-10 · complete scripted discipline state machine cannot mutate real A8Core raw state, oscillator epoch, clock phase, day count, or authority');

console.log('');
console.log('PASS · A8-v5.4.20-GATE5H-SYNTHETIC-DISCIPLINE-STATE-MACHINE-HARNESS');
