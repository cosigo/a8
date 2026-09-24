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
  runSyntheticJovianHoldoverReacquisition,
} = require('../experiments/a8-jovian-holdover-reacquisition');

const sourcePath = path.join(
  __dirname,
  '..',
  'experiments',
  'a8-jovian-holdover-reacquisition.js'
);

const source = fs.readFileSync(sourcePath, 'utf8');

console.log('A8 v5.4.20 Gate 5F · Jovian observation-loss holdover / reacquisition proof');

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
    `holdover experiment executable contains forbidden dependency/value: ${forbidden}`
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
    `holdover experiment contains forbidden phase API: ${forbiddenPhase}`
  );
}

console.log('PASS G5F-01 · experiment contains no real-core import, phase setter, real actuator, host-time cadence, Earth-observer path, or seeded natural result');

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
  return runSyntheticJovianHoldoverReacquisition({
    divider: {
      numerator: '8',
      denominator: '1',
    },

    settledRateScale: {
      numerator: '500',
      denominator: '501',
    },

    startingPhase: {
      numerator: '484936142929',
      denominator: '63618984000',
    },

    holdoverAdvances: 16,

    baselineJovianSample: sample(1000),
    freshJovianSample: sample(998),

    maxRateScaleStep: {
      numerator: '1',
      denominator: '10000',
    },
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
  assert.equal(r.acceptsExternalPhaseControl, false);

  assert.equal(r.inventsCandidateDuringLoss, false);
  assert.equal(r.changesRateDuringLoss, false);
  assert.equal(r.reacquisitionChangesPhase, false);
}
console.log('PASS G5F-02 · holdover/reacquisition experiment is disconnected, rate-only, timeless, and explicitly forbids candidate invention during loss');

{
  const r = fixture();

  const hold = r.trace.filter(item => item.stage === 'HOLDOVER');

  assert.equal(r.holdoverAdvances, 16);
  assert.equal(hold.length, 16);

  for (const item of hold) {
    assert.deepEqual(item.rateScale, {
      numerator: '500',
      denominator: '501',
    });

    assert.deepEqual(item.phaseIncrement, {
      numerator: '125',
      denominator: '1002',
    });

    assert(
      compare(item.phaseAfter, item.phaseBefore) > 0
    );
  }

  assert.deepEqual(r.holdoverPhaseAdvance, {
    numerator: '1000',
    denominator: '501',
  });

  assert.deepEqual(r.phaseAtReacquisitionEvidence, {
    numerator: '611920142929',
    denominator: '63618984000',
  });
}
console.log('PASS G5F-03 · 16 observation-loss advances freeze rate exactly at 500/501 while phase advances monotonically by exact 125/1002 each step');

{
  const r = fixture();

  assert.deepEqual(
    r.candidate.baselineRawPerJovianCycle,
    { numerator: '1000', denominator: '1' }
  );

  assert.deepEqual(
    r.candidate.currentRawPerJovianCycle,
    { numerator: '998', denominator: '1' }
  );

  assert.deepEqual(
    r.candidate.signedFractionalRateError,
    { numerator: '-1', denominator: '500' }
  );

  assert.deepEqual(
    r.candidate.recommendedRateScaleCandidate,
    { numerator: '500', denominator: '499' }
  );

  assert.equal(r.candidate.applied, false);
}
console.log('PASS G5F-04 · reacquired Jovian evidence 1000→998 yields exact -1/500 error and 500/499 advisory target');

{
  const r = fixture();

  const recovery = r.trace.filter(
    item => item.stage === 'REACQUISITION_SLEW'
  );

  assert.equal(r.recoveryUpdates, 41);
  assert.equal(recovery.length, 41);

  assert.deepEqual(recovery[0].rateBefore, {
    numerator: '500',
    denominator: '501',
  });

  assert.deepEqual(recovery[0].rateAfter, {
    numerator: '5000501',
    denominator: '5010000',
  });

  assert.deepEqual(r.finalRateScale, {
    numerator: '500',
    denominator: '499',
  });

  for (let i = 1; i < recovery.length; i++) {
    assert(
      compare(
        recovery[i].rateAfter,
        recovery[i - 1].rateAfter
      ) >= 0,
      `recovery rate failed upward monotonicity at ${i}`
    );
  }
}
console.log('PASS G5F-05 · reacquisition resumes from held rate and converges upward exactly to 500/499 in 41 bounded updates');

{
  const r = fixture();

  assert.deepEqual(r.startingPhase, {
    numerator: '484936142929',
    denominator: '63618984000',
  });

  assert.deepEqual(r.phaseAtReacquisitionEvidence, {
    numerator: '611920142929',
    denominator: '63618984000',
  });

  assert.deepEqual(r.recoveryPhaseAdvance, {
    numerator: '5125499959',
    denominator: '999996000',
  });

  assert.deepEqual(r.finalClockPhase, {
    numerator: '93612454603997',
    denominator: '6349174603200',
  });

  assert.equal(r.totalPlantAdvances, 57);

  for (const item of r.trace) {
    assert(
      compare(item.phaseAfter, item.phaseBefore) > 0,
      `phase did not increase at plant advance ${item.globalPlantAdvance}`
    );
  }

  for (let i = 1; i < r.trace.length; i++) {
    assert.deepEqual(
      r.trace[i].phaseBefore,
      r.trace[i - 1].phaseAfter,
      `phase discontinuity at trace step ${i + 1}`
    );
  }
}
console.log('PASS G5F-06 · holdover plus reacquisition forms one exact 57-advance monotonic phase history with no jump at observation return');

{
  const r = fixture();

  const firstRecovery = r.trace.find(
    item => item.stage === 'REACQUISITION_SLEW'
  );

  assert.deepEqual(
    firstRecovery.phaseBefore,
    r.phaseAtReacquisitionEvidence
  );

  assert(
    compare(
      firstRecovery.phaseAfter,
      r.phaseAtReacquisitionEvidence
    ) > 0
  );
}
console.log('PASS G5F-07 · fresh Jovian evidence itself moves phase by zero; only the next integrated rate advance changes the clock');

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
console.log('PASS G5F-08 · complete loss/holdover/reacquisition experiment cannot mutate real A8Core raw state, oscillator epoch, clock phase, day count, or authority');

{
  assert.throws(
    () => runSyntheticJovianHoldoverReacquisition({
      divider: {
        numerator: '8',
        denominator: '1',
      },
      settledRateScale: {
        numerator: '500',
        denominator: '501',
      },
      holdoverAdvances: 0,
      baselineJovianSample: sample(1000),
      freshJovianSample: sample(998),
      maxRateScaleStep: {
        numerator: '1',
        denominator: '10000',
      },
    }),
    /holdoverAdvances must be a positive integer/
  );
}
console.log('PASS G5F-09 · observation-loss duration must be explicit positive abstract advance count; no hidden timed interval is accepted');

console.log('');
console.log('PASS · A8-v5.4.20-GATE5F-JOVIAN-HOLDOVER-REACQUISITION-CONTINUITY');
