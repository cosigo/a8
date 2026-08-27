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

const sourcePath = path.join(
  __dirname,
  '..',
  'observer',
  'a8-bounded-rate-slew-simulator.js'
);

const source = fs.readFileSync(sourcePath, 'utf8');

console.log('A8 v5.4.20 Gate 5B · bounded rate-slew simulator proof');

const executable = source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '');

for (const forbidden of [
  "require('../core",
  "require('./core",
  'setClockPhase',
  'adjustClockTicks',
  'setAuthority',
  'setEarthDayRawSpan',
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
    `slew simulator executable contains forbidden dependency/value: ${forbidden}`
  );
}
console.log('PASS G5B-01 · slew executable contains no A8Core import, clock/authority actuator, host-time cadence, Earth-observer path, or seeded natural result');

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

{
  const s = new BoundedRateSlewSimulator({
    maxStep: { numerator: '1', denominator: '10000' },
  }).snapshot();

  assert.equal(s.status, 'SEEKING_CANDIDATE');
  assert.equal(s.stateOwned, 'SIMULATED_RATE_SCALE_ONLY');
  assert.equal(s.writesRealOscillator, false);
  assert.equal(s.writesRealDivider, false);
  assert.equal(s.writesClock, false);
  assert.equal(s.writesClockPhase, false);
  assert.equal(s.writesAuthority, false);
  assert.equal(s.usesHostTime, false);
  assert.equal(s.usesTimedCadence, false);
  assert.equal(s.acceptsSimulatorPhase, false);
}
console.log('PASS G5B-02 · simulator owns only a simulated rate-scale state and has zero real actuator/phase/timing capability');

{
  const sim = new BoundedRateSlewSimulator({
    maxStep: { numerator: '1', denominator: '10000' },
  });

  const loaded = sim.loadCandidate(
    candidate({ baseline: 1000, current: 1001 })
  );

  assert.equal(loaded.status, 'SLEWING');
  assert.deepEqual(loaded.currentRateScale, {
    numerator: '1',
    denominator: '1',
  });
  assert.deepEqual(loaded.targetRateScale, {
    numerator: '1000',
    denominator: '1001',
  });
  assert.equal(loaded.updateCount, 0);
}
console.log('PASS G5B-03 · exact Gate-5A advisory candidate loads as target only; initial simulated rate remains unchanged');

{
  const sim = new BoundedRateSlewSimulator({
    maxStep: { numerator: '1', denominator: '10000' },
  });

  sim.loadCandidate(candidate({ baseline: 1000, current: 1001 }));

  let previous = sim.snapshot();
  let steps = 0;

  while (!previous.targetReached) {
    const next = sim.step();
    steps += 1;

    // Decreasing target: monotonic non-increasing current scale.
    const p = BigInt(previous.currentRateScale.numerator) *
      BigInt(next.currentRateScale.denominator);
    const n = BigInt(next.currentRateScale.numerator) *
      BigInt(previous.currentRateScale.denominator);

    assert(n <= p, 'decreasing slew must be monotonic');

    const deltaNum = BigInt(next.lastAppliedDelta.numerator);
    const deltaDen = BigInt(next.lastAppliedDelta.denominator);

    assert(deltaNum <= 0n, 'decreasing target must never apply positive delta');

    const absNum = deltaNum < 0n ? -deltaNum : deltaNum;
    assert(
      absNum * 10000n <= deltaDen,
      `per-update delta exceeds 1/10000: ${deltaNum}/${deltaDen}`
    );

    // Must not cross below target.
    const curVsTarget =
      BigInt(next.currentRateScale.numerator) *
      BigInt(next.targetRateScale.denominator) -
      BigInt(next.targetRateScale.numerator) *
      BigInt(next.currentRateScale.denominator);

    assert(curVsTarget >= 0n, 'decreasing slew overshot target');

    previous = next;

    if (steps > 100) {
      throw new Error('decreasing slew failed to converge');
    }
  }

  assert.equal(steps, 10);
  assert.deepEqual(previous.currentRateScale, {
    numerator: '1000',
    denominator: '1001',
  });
  assert.deepEqual(previous.remainingRateScaleError, {
    numerator: '0',
    denominator: '1',
  });
}
console.log('PASS G5B-04 · fast-side candidate converges monotonically in 10 exact bounded updates with no overshoot');

{
  const sim = new BoundedRateSlewSimulator({
    maxStep: { numerator: '1', denominator: '10000' },
  });

  sim.loadCandidate(candidate({ baseline: 1000, current: 999 }));

  let previous = sim.snapshot();
  let steps = 0;

  while (!previous.targetReached) {
    const next = sim.step();
    steps += 1;

    // Increasing target: monotonic non-decreasing current scale.
    const p = BigInt(previous.currentRateScale.numerator) *
      BigInt(next.currentRateScale.denominator);
    const n = BigInt(next.currentRateScale.numerator) *
      BigInt(previous.currentRateScale.denominator);

    assert(n >= p, 'increasing slew must be monotonic');

    const deltaNum = BigInt(next.lastAppliedDelta.numerator);
    const deltaDen = BigInt(next.lastAppliedDelta.denominator);

    assert(deltaNum >= 0n, 'increasing target must never apply negative delta');
    assert(
      deltaNum * 10000n <= deltaDen,
      `per-update delta exceeds 1/10000: ${deltaNum}/${deltaDen}`
    );

    // Must not cross above target.
    const curVsTarget =
      BigInt(next.currentRateScale.numerator) *
      BigInt(next.targetRateScale.denominator) -
      BigInt(next.targetRateScale.numerator) *
      BigInt(next.currentRateScale.denominator);

    assert(curVsTarget <= 0n, 'increasing slew overshot target');

    previous = next;

    if (steps > 100) {
      throw new Error('increasing slew failed to converge');
    }
  }

  assert.equal(steps, 11);
  assert.deepEqual(previous.currentRateScale, {
    numerator: '1000',
    denominator: '999',
  });
}
console.log('PASS G5B-05 · slow-side candidate converges monotonically in 11 exact bounded updates with no overshoot');

{
  const sim = new BoundedRateSlewSimulator({
    maxStep: { numerator: '1', denominator: '10000' },
  });

  sim.loadCandidate(candidate({ baseline: 1000, current: 1001 }));
  sim.step();

  assert.throws(
    () => sim.loadCandidate(candidate({ baseline: 1000, current: 999 })),
    /cannot replace candidate while slew is in progress/
  );
}
console.log('PASS G5B-06 · in-progress slew target cannot be silently replaced');

{
  const advisor = new JovianSlowDisciplineCandidate();
  advisor.establishBaseline(sample(1000));
  const bad = advisor.evaluate(sample(1001));
  bad.applied = true;

  const sim = new BoundedRateSlewSimulator({
    maxStep: { numerator: '1', denominator: '10000' },
  });

  assert.throws(
    () => sim.loadCandidate(bad),
    /candidate must be unapplied/
  );
}
console.log('PASS G5B-07 · simulator accepts only an unapplied Gate-5A advisory candidate');

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

  for (let i = 0; i < 10; i++) {
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
console.log('PASS G5B-08 · complete simulated convergence cannot mutate A8Core raw state, oscillator epoch, clock phase, day count, or authority');

{
  const sim = new BoundedRateSlewSimulator({
    maxStep: { numerator: '1', denominator: '10000' },
  });

  assert.throws(
    () => sim.step(),
    /candidate must be loaded first/
  );
}
console.log('PASS G5B-09 · slew cannot run without an explicit qualified rate-scale candidate');

console.log('');
console.log('PASS · A8-v5.4.20-GATE5B-BOUNDED-RATE-SLEW-SIMULATOR-DISCONNECTED');
