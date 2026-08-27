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
  SyntheticRateContinuityPlant,
} = require('../observer/a8-synthetic-rate-continuity-plant');

const plantPath = path.join(
  __dirname,
  '..',
  'observer',
  'a8-synthetic-rate-continuity-plant.js'
);

const plantSource = fs.readFileSync(plantPath, 'utf8');

console.log('A8 v5.4.20 Gate 5C · synthetic rate-continuity plant proof');

const executable = plantSource
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
    `synthetic plant executable contains forbidden dependency/value: ${forbidden}`
  );
}

for (const forbiddenApi of [
  'setPhase(',
  'setClock(',
  'snapPhase(',
  'alignPhase(',
  'correctPhase(',
  'applyPhase(',
]) {
  assert(
    !executable.includes(forbiddenApi),
    `synthetic plant contains forbidden phase API: ${forbiddenApi}`
  );
}

console.log('PASS G5C-01 · synthetic plant contains no A8Core import, phase setter, clock/authority actuator, host-time cadence, Earth-observer path, or seeded natural result');

function sample(rawNumerator, cycleDenominator = 1) {
  return {
    schema: SAMPLE_SCHEMA,
    source: SAMPLE_SOURCE,
    rawNumerator: String(rawNumerator),
    cycleDenominator: String(cycleDenominator),
  };
}

function candidate({ baseline, current }) {
  const advisor = new JovianSlowDisciplineCandidate();
  advisor.establishBaseline(sample(baseline));
  return advisor.evaluate(sample(current));
}

function ratToBigPair(r) {
  return {
    numerator: BigInt(r.numerator),
    denominator: BigInt(r.denominator),
  };
}

function compareSerialized(a, b) {
  const A = ratToBigPair(a);
  const B = ratToBigPair(b);

  const left = A.numerator * B.denominator;
  const right = B.numerator * A.denominator;

  return left < right ? -1 : left > right ? 1 : 0;
}

function exactExpectedPhase(rateScales, divider = 8n) {
  let numerator = 0n;
  let denominator = 1n;

  function gcd(a, b) {
    a = a < 0n ? -a : a;
    b = b < 0n ? -b : b;
    while (b !== 0n) {
      const t = a % b;
      a = b;
      b = t;
    }
    return a;
  }

  function add(aN, aD, bN, bD) {
    let n = aN * bD + bN * aD;
    let d = aD * bD;
    const g = gcd(n, d);
    return [n / g, d / g];
  }

  for (const r of rateScales) {
    [numerator, denominator] = add(
      numerator,
      denominator,
      BigInt(r.numerator),
      BigInt(r.denominator)
    );
  }

  const d = denominator * divider;
  const g = gcd(numerator, d);

  return {
    numerator: (numerator / g).toString(),
    denominator: (d / g).toString(),
  };
}

{
  const p = new SyntheticRateContinuityPlant();
  const s = p.snapshot();

  assert.equal(s.mode, 'DISCONNECTED_FROM_A8CORE');
  assert.equal(s.role, 'EXPERIMENT_OWNED_SYNTHETIC_OSCILLATOR_DIVIDER_CLOCK');
  assert.equal(s.ownsRealOscillator, false);
  assert.equal(s.ownsRealDivider, false);
  assert.equal(s.writesA8Core, false);
  assert.equal(s.writesRealClock, false);
  assert.equal(s.writesAuthority, false);
  assert.equal(s.hasPhaseSetter, false);
  assert.equal(s.acceptsExternalPhase, false);
  assert.equal(s.acceptsTimestamp, false);
  assert.equal(s.usesHostTime, false);
  assert.equal(s.usesTimedCadence, false);

  assert.deepEqual(s.divider, {
    numerator: '8',
    denominator: '1',
  });

  assert.deepEqual(s.clockPhase, {
    numerator: '0',
    denominator: '1',
  });
}
console.log('PASS G5C-02 · synthetic plant owns only experiment oscillator/divider/phase state and begins at exact zero with no external phase interface');

{
  const p = new SyntheticRateContinuityPlant({
    divider: { numerator: '8', denominator: '1' },
  });

  const a = p.advance({
    numerator: '1',
    denominator: '1',
  });

  assert.deepEqual(a.oscillatorProgress, {
    numerator: '1',
    denominator: '1',
  });

  assert.deepEqual(a.clockPhase, {
    numerator: '1',
    denominator: '8',
  });

  assert.deepEqual(a.lastClockPhaseIncrement, {
    numerator: '1',
    denominator: '8',
  });
}
console.log('PASS G5C-03 · nominal synthetic plant step integrates rate through divider exactly; phase is derived, not assigned');

{
  const sim = new BoundedRateSlewSimulator({
    maxStep: { numerator: '1', denominator: '10000' },
  });

  sim.loadCandidate(
    candidate({ baseline: 1000, current: 1001 })
  );

  const p = new SyntheticRateContinuityPlant({
    divider: { numerator: '8', denominator: '1' },
  });

  const seenRates = [];
  const seenPhases = [];

  // Plant advances once at each current rate-scale state, then slew moves rate
  // for the next experiment-owned plant quantum.
  while (true) {
    const simState = sim.snapshot();
    const rate = simState.currentRateScale;

    seenRates.push(rate);

    const plantState = p.advance(rate);
    seenPhases.push(plantState.clockPhase);

    if (simState.targetReached) break;

    sim.step();

    if (seenRates.length > 100) {
      throw new Error('fast-side continuity experiment failed to converge');
    }
  }

  assert.equal(seenRates.length, 11);
  assert.equal(seenPhases.length, 11);

  for (let i = 1; i < seenPhases.length; i++) {
    assert(
      compareSerialized(seenPhases[i], seenPhases[i - 1]) > 0,
      `clock phase failed strict monotonicity at index ${i}`
    );
  }

  const finalPlant = p.snapshot();

  assert.equal(finalPlant.advanceCount, 11);

  const expected = exactExpectedPhase(seenRates, 8n);

  assert.deepEqual(finalPlant.clockPhase, expected);

  assert.deepEqual(
    seenRates[seenRates.length - 1],
    { numerator: '1000', denominator: '1001' }
  );

  // Each phase increment must be exact current rate / 8 and positive.
  for (let i = 0; i < seenRates.length; i++) {
    const r = ratToBigPair(seenRates[i]);
    const phaseDelta = i === 0
      ? ratToBigPair(seenPhases[0])
      : (() => {
          const cur = ratToBigPair(seenPhases[i]);
          const prev = ratToBigPair(seenPhases[i - 1]);

          return {
            numerator:
              cur.numerator * prev.denominator -
              prev.numerator * cur.denominator,
            denominator:
              cur.denominator * prev.denominator,
          };
        })();

    assert(phaseDelta.numerator > 0n);

    // phaseDelta == rate / 8
    const left = phaseDelta.numerator * r.denominator * 8n;
    const right = r.numerator * phaseDelta.denominator;
    assert.equal(left, right, `phase increment mismatch at ${i}`);
  }
}
console.log('PASS G5C-04 · fast-side slew changes only synthetic rate; exact clock phase stays strictly monotonic and equals integrated rate/divider with no jump');

{
  const sim = new BoundedRateSlewSimulator({
    maxStep: { numerator: '1', denominator: '10000' },
  });

  sim.loadCandidate(
    candidate({ baseline: 1000, current: 999 })
  );

  const p = new SyntheticRateContinuityPlant({
    divider: { numerator: '8', denominator: '1' },
  });

  const phases = [];
  const rates = [];

  while (true) {
    const simState = sim.snapshot();
    rates.push(simState.currentRateScale);

    const plantState = p.advance(simState.currentRateScale);
    phases.push(plantState.clockPhase);

    if (simState.targetReached) break;

    sim.step();

    if (phases.length > 100) {
      throw new Error('slow-side continuity experiment failed to converge');
    }
  }

  assert.equal(rates.length, 12);

  for (let i = 1; i < phases.length; i++) {
    assert(compareSerialized(phases[i], phases[i - 1]) > 0);
  }

  assert.deepEqual(
    rates[rates.length - 1],
    { numerator: '1000', denominator: '999' }
  );

  assert.deepEqual(
    p.snapshot().clockPhase,
    exactExpectedPhase(rates, 8n)
  );
}
console.log('PASS G5C-05 · slow-side slew also preserves strict phase continuity while rate converges upward');

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

  const sim = new BoundedRateSlewSimulator({
    maxStep: { numerator: '1', denominator: '10000' },
  });

  sim.loadCandidate(candidate({ baseline: 1000, current: 1001 }));

  const p = new SyntheticRateContinuityPlant();

  while (true) {
    const state = sim.snapshot();
    p.advance(state.currentRateScale);

    if (state.targetReached) break;

    sim.step();
  }

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
console.log('PASS G5C-06 · complete synthetic continuity experiment cannot mutate real A8Core raw state, oscillator epoch, phase, day count, or authority');

{
  const p = new SyntheticRateContinuityPlant();

  assert.throws(
    () => p.advance({
      numerator: '0',
      denominator: '1',
    }),
    /rateScale.numerator must be greater than zero/
  );

  assert.throws(
    () => new SyntheticRateContinuityPlant({
      divider: {
        numerator: '0',
        denominator: '1',
      },
    }),
    /divider.numerator must be greater than zero/
  );
}
console.log('PASS G5C-07 · zero/negative synthetic rate or divider cannot create a stalled/reversed phase path');

console.log('');
console.log('PASS · A8-v5.4.20-GATE5C-SYNTHETIC-RATE-CONTINUITY-PLANT');
