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
  runSyntheticDisturbanceRecovery,
} = require('../experiments/a8-synthetic-disturbance-recovery');

const experimentPath = path.join(
  __dirname,
  '..',
  'experiments',
  'a8-synthetic-disturbance-recovery.js'
);

const source = fs.readFileSync(experimentPath, 'utf8');

console.log('A8 v5.4.20 Gate 5D · synthetic disturbance / Jovian recovery proof');

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
    `disturbance experiment executable contains forbidden dependency/value: ${forbidden}`
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
    `disturbance experiment contains forbidden phase API: ${forbiddenPhase}`
  );
}

console.log('PASS G5D-01 · experiment contains no A8Core import, phase setter, real actuator, host-time cadence, Earth-observer path, or seeded natural result');

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

function resultFixture() {
  return runSyntheticDisturbanceRecovery({
    divider: {
      numerator: '8',
      denominator: '1',
    },

    preRecoveryRateScale: {
      numerator: '1',
      denominator: '1',
    },

    disturbanceAdvances: 8,

    baselineJovianSample: sample(1000),
    freshJovianSample: sample(1001),

    maxRateScaleStep: {
      numerator: '1',
      denominator: '10000',
    },
  });
}

{
  const r = resultFixture();

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
  assert.equal(r.erasesAccumulatedPhaseHistory, false);
}
console.log('PASS G5D-02 · experiment is explicitly disconnected and cannot erase phase history or actuate any real A8 state');

{
  const r = resultFixture();

  assert.equal(r.disturbanceAdvances, 8);

  assert.deepEqual(r.phaseAtFreshRecoveryEvidence, {
    numerator: '1',
    denominator: '1',
  });

  const disturbance = r.trace.filter(
    item => item.stage === 'DISTURBANCE_HOLD'
  );

  assert.equal(disturbance.length, 8);

  for (let i = 0; i < disturbance.length; i++) {
    assert.deepEqual(disturbance[i].rateScale, {
      numerator: '1',
      denominator: '1',
    });

    assert.deepEqual(disturbance[i].phaseIncrement, {
      numerator: '1',
      denominator: '8',
    });
  }
}
console.log('PASS G5D-03 · explicit wrong-rate hold runs exactly 8 abstract plant advances and accumulates exact phase 1 before fresh recovery evidence');

{
  const r = resultFixture();

  assert.deepEqual(r.candidate.baselineRawPerJovianCycle, {
    numerator: '1000',
    denominator: '1',
  });

  assert.deepEqual(r.candidate.currentRawPerJovianCycle, {
    numerator: '1001',
    denominator: '1',
  });

  assert.deepEqual(r.candidate.signedFractionalRateError, {
    numerator: '1',
    denominator: '1000',
  });

  assert.deepEqual(r.candidate.recommendedRateScaleCandidate, {
    numerator: '1000',
    denominator: '1001',
  });

  assert.equal(r.candidate.applied, false);
}
console.log('PASS G5D-04 · fresh Jovian evidence 1000→1001 produces exact +1/1000 rate error and 1000/1001 advisory correction');

{
  const r = resultFixture();

  const recovery = r.trace.filter(
    item => item.stage === 'RECOVERY_SLEW'
  );

  assert.equal(r.recoveryAdvances, 10);
  assert.equal(recovery.length, 10);

  assert.deepEqual(recovery[0].rateBefore, {
    numerator: '1',
    denominator: '1',
  });

  assert.deepEqual(recovery[0].rateAfter, {
    numerator: '9999',
    denominator: '10000',
  });

  assert.deepEqual(recovery[0].phaseBefore, {
    numerator: '1',
    denominator: '1',
  });

  assert.deepEqual(r.finalRateScale, {
    numerator: '1000',
    denominator: '1001',
  });

  // Rate scale must move monotonically downward during recovery.
  for (let i = 1; i < recovery.length; i++) {
    assert(
      compare(
        recovery[i].rateAfter,
        recovery[i - 1].rateAfter
      ) <= 0,
      `rate increased at recovery index ${i}`
    );
  }
}
console.log('PASS G5D-05 · bounded recovery begins from existing phase, slews rate downward monotonically, and reaches exact 1000/1001 in 10 updates');

{
  const r = resultFixture();

  for (const item of r.trace) {
    assert(
      compare(item.phaseAfter, item.phaseBefore) > 0,
      `phase did not increase at plant advance ${item.plantAdvance}`
    );
  }

  for (let i = 1; i < r.trace.length; i++) {
    assert.deepEqual(
      r.trace[i].phaseBefore,
      r.trace[i - 1].phaseAfter,
      `phase history discontinuity between plant advances ${i} and ${i + 1}`
    );
  }

  assert.equal(r.totalPlantAdvances, 18);

  assert.deepEqual(r.phaseAdvanceDuringRecovery, {
    numerator: '20008991',
    denominator: '16016000',
  });

  assert.deepEqual(r.finalClockPhase, {
    numerator: '36024991',
    denominator: '16016000',
  });
}
console.log('PASS G5D-06 · all 18 synthetic plant advances form one exact continuous phase history; disturbance phase is retained and recovery adds continuously');

{
  const r = resultFixture();

  const firstRecovery = r.trace.find(
    item => item.stage === 'RECOVERY_SLEW'
  );

  assert.deepEqual(
    firstRecovery.phaseBefore,
    r.phaseAtFreshRecoveryEvidence
  );

  assert(
    compare(
      firstRecovery.phaseAfter,
      r.phaseAtFreshRecoveryEvidence
    ) > 0
  );
}
console.log('PASS G5D-07 · arrival of fresh Jovian evidence causes zero phase jump; only the next integrated rate advance changes phase');

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

  resultFixture();

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
console.log('PASS G5D-08 · complete disturbance/recovery experiment cannot mutate real A8Core raw state, oscillator epoch, clock phase, day count, or authority');

{
  assert.throws(
    () => runSyntheticDisturbanceRecovery({
      divider: {
        numerator: '8',
        denominator: '1',
      },
      preRecoveryRateScale: {
        numerator: '1',
        denominator: '1',
      },
      disturbanceAdvances: 0,
      baselineJovianSample: sample(1000),
      freshJovianSample: sample(1001),
      maxRateScaleStep: {
        numerator: '1',
        denominator: '10000',
      },
    }),
    /disturbanceAdvances must be a positive integer/
  );
}
console.log('PASS G5D-09 · disturbance duration must be explicit positive abstract plant-advance count; no implicit timed interval is accepted');

console.log('');
console.log('PASS · A8-v5.4.20-GATE5D-SYNTHETIC-DISTURBANCE-JOVIAN-RECOVERY-CONTINUITY');
