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
  runRepeatedJovianHoldoverReacquisition,
} = require('../experiments/a8-repeated-jovian-holdover-reacquisition');

const sourcePath = path.join(
  __dirname,
  '..',
  'experiments',
  'a8-repeated-jovian-holdover-reacquisition.js'
);

const source = fs.readFileSync(sourcePath, 'utf8');

console.log('A8 v5.4.20 Gate 5G · repeated Jovian holdover / reacquisition proof');

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
    `repeated holdover executable contains forbidden dependency/value: ${forbidden}`
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
    `repeated holdover experiment contains forbidden phase API: ${forbiddenPhase}`
  );
}

console.log('PASS G5G-01 · experiment contains no real-core import, phase setter, real actuator, host-time cadence, Earth-observer path, or seeded natural result');

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
  return runRepeatedJovianHoldoverReacquisition({
    divider: {
      numerator: '8',
      denominator: '1',
    },

    initialSettledRateScale: {
      numerator: '500',
      denominator: '499',
    },

    startingPhase: {
      numerator: '93612454603997',
      denominator: '6349174603200',
    },

    maxRateScaleStep: {
      numerator: '1',
      denominator: '10000',
    },

    episodes: [
      {
        label: 'LOSS_8_DOWN',
        holdoverAdvances: 8,
        baselineJovianSample: sample(1000),
        freshJovianSample: sample(1001),
      },
      {
        label: 'LOSS_12_UP',
        holdoverAdvances: 12,
        baselineJovianSample: sample(1000),
        freshJovianSample: sample(997),
      },
      {
        label: 'LOSS_5_DOWN',
        holdoverAdvances: 5,
        baselineJovianSample: sample(1000),
        freshJovianSample: sample(1003),
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
  assert.equal(r.acceptsExternalPhaseControl, false);

  assert.equal(r.inventsCandidateDuringLoss, false);
  assert.equal(r.changesRateDuringLoss, false);
  assert.equal(r.reacquisitionChangesPhase, false);
  assert.equal(r.requiresPriorSlewSettlement, true);
}
console.log('PASS G5G-02 · repeated loss/recovery experiment is disconnected, timeless, rate-only, and explicitly preserves holdover/settlement rules');

{
  const r = fixture();

  assert.equal(r.episodeCount, 3);

  assert.deepEqual(
    r.episodes.map(e => e.holdoverAdvances),
    [8, 12, 5]
  );

  assert.deepEqual(
    r.episodes.map(e => e.slewDirection),
    ['DOWN', 'UP', 'DOWN']
  );

  assert.deepEqual(
    r.episodes.map(e => e.slewDirectionChangedFromPrior),
    [null, true, true]
  );

  assert.deepEqual(
    r.episodes.map(e => e.errorSign),
    [1, -1, 1]
  );

  assert.deepEqual(
    r.episodes.map(e => e.errorSignChangedFromPrior),
    [null, true, true]
  );
}
console.log('PASS G5G-03 · holdover lengths vary 8/12/5 while recovered error signs and correction directions reverse +/−/+ and down/up/down');

{
  const r = fixture();

  assert.deepEqual(
    r.episodes[0].heldRateScale,
    { numerator: '500', denominator: '499' }
  );

  assert.deepEqual(
    r.episodes[1].heldRateScale,
    { numerator: '1000', denominator: '1001' }
  );

  assert.deepEqual(
    r.episodes[2].heldRateScale,
    { numerator: '1000', denominator: '997' }
  );

  assert.deepEqual(
    r.episodes[0].holdoverPhaseAdvance,
    { numerator: '500', denominator: '499' }
  );

  assert.deepEqual(
    r.episodes[1].holdoverPhaseAdvance,
    { numerator: '1500', denominator: '1001' }
  );

  assert.deepEqual(
    r.episodes[2].holdoverPhaseAdvance,
    { numerator: '625', denominator: '997' }
  );

  for (const episode of r.episodes) {
    for (const item of episode.holdTrace) {
      assert.deepEqual(
        item.rateScale,
        episode.heldRateScale,
        `episode ${episode.episodeIndex} changed held rate`
      );

      assert(
        compare(item.phaseAfter, item.phaseBefore) > 0
      );
    }
  }
}
console.log('PASS G5G-04 · every observation-loss interval freezes its own last-settled rate exactly while phase continues strictly forward');

{
  const r = fixture();

  assert.deepEqual(
    r.episodes[0].candidate.signedFractionalRateError,
    { numerator: '1', denominator: '1000' }
  );

  assert.deepEqual(
    r.episodes[0].targetRateScale,
    { numerator: '1000', denominator: '1001' }
  );

  assert.deepEqual(
    r.episodes[1].candidate.signedFractionalRateError,
    { numerator: '-3', denominator: '1000' }
  );

  assert.deepEqual(
    r.episodes[1].targetRateScale,
    { numerator: '1000', denominator: '997' }
  );

  assert.deepEqual(
    r.episodes[2].candidate.signedFractionalRateError,
    { numerator: '3', denominator: '1000' }
  );

  assert.deepEqual(
    r.episodes[2].targetRateScale,
    { numerator: '1000', denominator: '1003' }
  );

  assert.deepEqual(
    r.episodes.map(e => e.recoveryUpdates),
    [31, 41, 61]
  );
}
console.log('PASS G5G-05 · fresh reacquisitions derive exact new targets and bounded recoveries settle in 31/41/61 updates');

{
  const r = fixture();

  for (const e of r.episodes) {
    assert.deepEqual(
      e.candidateLoadPhaseMovement,
      { numerator: '0', denominator: '1' },
      `episode ${e.episodeIndex} candidate load moved phase`
    );

    assert.deepEqual(
      e.candidateLoadRateAfter,
      e.candidateLoadRateBefore,
      `episode ${e.episodeIndex} candidate load changed rate`
    );

    const last = e.recoveryTrace[e.recoveryTrace.length - 1];

    assert.deepEqual(
      last.rateAfter,
      e.targetRateScale,
      `episode ${e.episodeIndex} did not settle exactly`
    );
  }
}
console.log('PASS G5G-06 · every reacquisition event changes phase by zero and current rate by zero; only bounded slew steps move rate');

{
  const r = fixture();

  assert.deepEqual(
    r.episodes[0].phaseAtReacquisitionEvidence,
    {
      numerator: '99974353003997',
      denominator: '6349174603200',
    }
  );

  assert.deepEqual(
    r.episodes[0].phaseAtSettlement,
    {
      numerator: '792829045260283',
      denominator: '40403838384000',
    }
  );

  assert.deepEqual(
    r.episodes[1].phaseAtReacquisitionEvidence,
    {
      numerator: '9387116833863113',
      denominator: '444442222224000',
    }
  );

  assert.deepEqual(
    r.episodes[1].phaseAtSettlement,
    {
      numerator: '11632383773958986273',
      denominator: '443108895557328000',
    }
  );

  assert.deepEqual(
    r.episodes[2].phaseAtReacquisitionEvidence,
    {
      numerator: '11910160162848986273',
      denominator: '443108895557328000',
    }
  );

  assert.deepEqual(
    r.episodes[2].phaseAtSettlement,
    {
      numerator: '3066885869525681546437',
      denominator: '88887644448799996800',
    }
  );

  assert.equal(r.totalPlantAdvances, 158);

  assert.deepEqual(
    r.finalRateScale,
    { numerator: '1000', denominator: '1003' }
  );

  assert.deepEqual(
    r.finalClockPhase,
    {
      numerator: '3066885869525681546437',
      denominator: '88887644448799996800',
    }
  );

  for (const item of r.trace) {
    assert(
      compare(item.phaseAfter, item.phaseBefore) > 0,
      `phase failed strict monotonicity at plant advance ${item.globalPlantAdvance}`
    );
  }

  for (let i = 1; i < r.trace.length; i++) {
    assert.deepEqual(
      r.trace[i].phaseBefore,
      r.trace[i - 1].phaseAfter,
      `global phase discontinuity at plant advance ${i + 1}`
    );
  }
}
console.log('PASS G5G-07 · all 158 holdover+recovery plant advances form one exact uninterrupted strictly monotonic phase history');

{
  const r = fixture();

  for (const e of r.episodes) {
    const updates = e.recoveryTrace;

    for (let i = 1; i < updates.length; i++) {
      const cmp = compare(
        updates[i].rateAfter,
        updates[i - 1].rateAfter
      );

      if (e.slewDirection === 'DOWN') {
        assert(
          cmp <= 0,
          `episode ${e.episodeIndex} failed downward rate monotonicity`
        );
      } else {
        assert(
          cmp >= 0,
          `episode ${e.episodeIndex} failed upward rate monotonicity`
        );
      }
    }
  }
}
console.log('PASS G5G-08 · each reacquisition slew remains monotonic in its required direction despite direction reversals between episodes');

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
console.log('PASS G5G-09 · complete repeated loss/recovery experiment cannot mutate real A8Core raw state, oscillator epoch, clock phase, day count, or authority');

{
  assert.throws(
    () => runRepeatedJovianHoldoverReacquisition({
      divider: {
        numerator: '8',
        denominator: '1',
      },
      initialSettledRateScale: {
        numerator: '500',
        denominator: '499',
      },
      maxRateScaleStep: {
        numerator: '1',
        denominator: '10000',
      },
      episodes: [
        {
          holdoverAdvances: 8,
          baselineJovianSample: sample(1000),
          freshJovianSample: sample(1001),
        },
      ],
    }),
    /at least two holdover\/reacquisition episodes are required/
  );
}
console.log('PASS G5G-10 · repeated-holdover proof requires an explicit multi-episode sequence rather than silently reducing to one loss interval');

console.log('');
console.log('PASS · A8-v5.4.20-GATE5G-REPEATED-JOVIAN-HOLDOVER-REACQUISITION-CONTINUITY');
