'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { A8Core } = require('../core/a8-core');

const {
  SAMPLE_SCHEMA,
  SAMPLE_SOURCE,
  JovianSlowDisciplineCandidate,
} = require('../observer/a8-jovian-slow-discipline-candidate');

const {
  BoundedRateSlewSimulator,
} = require('../observer/a8-bounded-rate-slew-simulator');

const {
  runMultiWindowJovianRetargetExperiment,
} = require('../experiments/a8-multi-window-jovian-retarget');

const sourcePath = path.join(
  __dirname,
  '..',
  'experiments',
  'a8-multi-window-jovian-retarget.js'
);

const source = fs.readFileSync(sourcePath, 'utf8');

console.log('A8 v5.4.20 Gate 5E · multi-window Jovian retarget continuity proof');

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
  '598016',
  '2398634',
  '599658',
  '365.25',
  '86400',
]) {
  assert(
    !executable.includes(forbidden),
    `multi-window experiment executable contains forbidden dependency/value: ${forbidden}`
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
    `multi-window experiment contains forbidden phase API: ${forbiddenPhase}`
  );
}

console.log('PASS G5E-01 · experiment contains no real-core import, phase setter, real actuator, host-time cadence, Earth-observer path, or seeded natural result');

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

function fixture() {
  return runMultiWindowJovianRetargetExperiment({
    divider: {
      numerator: '8',
      denominator: '1',
    },

    initialRateScale: {
      numerator: '1',
      denominator: '1',
    },

    maxRateScaleStep: {
      numerator: '1',
      denominator: '10000',
    },

    windows: [
      {
        label: 'FAST_SIDE_1',
        baselineJovianSample: sample(1000),
        freshJovianSample: sample(1001),
      },
      {
        label: 'SLOW_SIDE_2',
        baselineJovianSample: sample(1000),
        freshJovianSample: sample(999),
      },
      {
        label: 'FAST_SIDE_3',
        baselineJovianSample: sample(1000),
        freshJovianSample: sample(1002),
      },
    ],
  });
}

{
  const r = fixture();

  assert.equal(r.mode, 'DISCONNECTED_FROM_A8CORE');
  assert.equal(r.writesA8Core, false);
  assert.equal(r.writesRealOscillator, false);
  assert.equal(r.writesRealDivider, false);
  assert.equal(r.writesRealClock, false);
  assert.equal(r.writesClockPhase, false);
  assert.equal(r.writesAuthority, false);
  assert.equal(r.usesHostTime, false);
  assert.equal(r.usesTimedCadence, false);
  assert.equal(r.acceptsExternalPhase, false);
  assert.equal(r.allowsMidSlewRetarget, false);
}
console.log('PASS G5E-02 · multi-window experiment is disconnected, rate-only, timeless, and explicitly forbids mid-slew retarget');

{
  const r = fixture();

  assert.equal(r.windowCount, 3);

  assert.deepEqual(
    r.windows.map(w => w.errorSign),
    [1, -1, 1]
  );

  assert.deepEqual(
    r.windows.map(w => w.signChangedFromPrior),
    [null, true, true]
  );

  assert.deepEqual(
    r.windows[0].candidate.signedFractionalRateError,
    { numerator: '1', denominator: '1000' }
  );

  assert.deepEqual(
    r.windows[1].candidate.signedFractionalRateError,
    { numerator: '-1', denominator: '1000' }
  );

  assert.deepEqual(
    r.windows[2].candidate.signedFractionalRateError,
    { numerator: '1', denominator: '500' }
  );
}
console.log('PASS G5E-03 · three fresh Jovian windows exercise rate-error signs +, -, + with exact rational errors');

{
  const r = fixture();

  assert.deepEqual(
    r.windows[0].targetRateScale,
    { numerator: '1000', denominator: '1001' }
  );

  assert.deepEqual(
    r.windows[1].targetRateScale,
    { numerator: '1000', denominator: '999' }
  );

  assert.deepEqual(
    r.windows[2].targetRateScale,
    { numerator: '500', denominator: '501' }
  );

  assert.deepEqual(
    r.windows.map(w => w.slewUpdates),
    [10, 21, 30]
  );

  assert.equal(r.totalPlantAdvances, 61);

  assert.deepEqual(
    r.finalRateScale,
    { numerator: '500', denominator: '501' }
  );
}
console.log('PASS G5E-04 · exact bounded retargets settle in 10, 21, and 30 updates for 61 total synthetic plant advances');

{
  const r = fixture();

  for (const w of r.windows) {
    assert.deepEqual(
      w.phaseAfterCandidate,
      w.phaseBeforeCandidate,
      `candidate load moved phase in window ${w.windowIndex}`
    );

    assert.deepEqual(
      w.rateAfterCandidateLoad,
      w.rateBeforeCandidate,
      `candidate load changed current rate in window ${w.windowIndex}`
    );
  }

  assert.deepEqual(
    r.windows[0].phaseBeforeCandidate,
    { numerator: '0', denominator: '1' }
  );

  assert.deepEqual(
    r.windows[1].phaseBeforeCandidate,
    { numerator: '20008991', denominator: '16016000' }
  );

  assert.deepEqual(
    r.windows[2].phaseBeforeCandidate,
    { numerator: '8856140281', denominator: '2285712000' }
  );
}
console.log('PASS G5E-05 · every fresh candidate load causes exactly zero phase movement and begins from the prior settled phase history');

{
  const r = fixture();

  for (const item of r.trace) {
    assert(
      compare(item.phaseAfter, item.phaseBefore) > 0,
      `phase did not strictly advance at plant advance ${item.globalPlantAdvance}`
    );
  }

  for (let i = 1; i < r.trace.length; i++) {
    assert.deepEqual(
      r.trace[i].phaseBefore,
      r.trace[i - 1].phaseAfter,
      `global phase history discontinuity at advance ${i + 1}`
    );
  }

  assert.deepEqual(
    r.windows[0].phaseAtSettlement,
    { numerator: '20008991', denominator: '16016000' }
  );

  assert.deepEqual(
    r.windows[1].phaseAtSettlement,
    { numerator: '8856140281', denominator: '2285712000' }
  );

  assert.deepEqual(
    r.windows[2].phaseAtSettlement,
    { numerator: '484936142929', denominator: '63618984000' }
  );

  assert.deepEqual(
    r.finalClockPhase,
    { numerator: '484936142929', denominator: '63618984000' }
  );
}
console.log('PASS G5E-06 · all 61 rate-slew plant advances form one exact strictly monotonic phase history across both retarget-direction reversals');

{
  // Independent proof that the unchanged Gate-5B slew rejects an attempted
  // target replacement before settlement.
  const advisor1 = new JovianSlowDisciplineCandidate();
  advisor1.establishBaseline(sample(1000));
  const c1 = advisor1.evaluate(sample(1001));

  const advisor2 = new JovianSlowDisciplineCandidate();
  advisor2.establishBaseline(sample(1000));
  const c2 = advisor2.evaluate(sample(999));

  const sim = new BoundedRateSlewSimulator({
    maxStep: {
      numerator: '1',
      denominator: '10000',
    },
  });

  sim.loadCandidate(c1);
  sim.step();

  assert.throws(
    () => sim.loadCandidate(c2),
    /cannot replace candidate while slew is in progress/
  );
}
console.log('PASS G5E-07 · an attempted new recovery candidate before prior settlement is rejected by the unchanged Gate-5B slew model');

{
  const r = fixture();

  for (const w of r.windows) {
    const updates = w.updates;

    for (let i = 1; i < updates.length; i++) {
      const cmp = compare(
        updates[i].rateAfter,
        updates[i - 1].rateAfter
      );

      if (w.errorSign > 0) {
        // More raw pulses / natural cycle -> correction scale below 1.
        // For W1 and W3 target is below the entering scale.
        assert(cmp <= 0, `window ${w.windowIndex} rate failed downward monotonicity`);
      } else {
        assert(cmp >= 0, `window ${w.windowIndex} rate failed upward monotonicity`);
      }
    }

    const last = updates[updates.length - 1];

    assert.deepEqual(
      last.rateAfter,
      w.targetRateScale,
      `window ${w.windowIndex} did not land exactly on target`
    );
  }
}
console.log('PASS G5E-08 · each window converges monotonically in its required direction and lands exactly on the new target without overshoot');

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
console.log('PASS G5E-09 · complete three-window retarget experiment cannot mutate real A8Core raw state, oscillator epoch, clock phase, day count, or authority');

{
  assert.throws(
    () => runMultiWindowJovianRetargetExperiment({
      divider: {
        numerator: '8',
        denominator: '1',
      },
      initialRateScale: {
        numerator: '1',
        denominator: '1',
      },
      maxRateScaleStep: {
        numerator: '1',
        denominator: '10000',
      },
      windows: [
        {
          baselineJovianSample: sample(1000),
          freshJovianSample: sample(1001),
        },
      ],
    }),
    /at least two Jovian recovery windows are required/
  );
}
console.log('PASS G5E-10 · multi-window proof requires an explicit sequence rather than silently collapsing to a single recovery sample');

console.log('');
console.log('PASS · A8-v5.4.20-GATE5E-MULTI-WINDOW-JOVIAN-RETARGET-CONTINUITY');
