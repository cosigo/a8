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

const sourcePath = path.join(
  __dirname,
  '..',
  'observer',
  'a8-jovian-slow-discipline-candidate.js'
);

const source = fs.readFileSync(sourcePath, 'utf8');

console.log('A8 v5.4.20 Gate 5A · Jovian slow-discipline candidate proof');

const executable = source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '');

for (const forbidden of [
  'setClockPhase',
  'adjustClockTicks',
  'setAuthority',
  'setEarthDayRawSpan',
  'setOscillator',
  'setDivider',
  'Date.now',
  'new Date',
  'performance.now',
  'process.hrtime',
  'STELLAR_MERIDIAN',
  'SOL_CELESTIAL_DIRECTION',
  'MEAN_SUN',
  'SOLAR_MERIDIAN',
  'terraShipSlip',
  '598016',
  '2398634',
  '599658',
  '365.25',
  '86400',
]) {
  assert(
    !executable.includes(forbidden),
    `discipline candidate executable contains forbidden dependency/value: ${forbidden}`
  );
}
console.log('PASS G5A-01 · candidate executable contains no actuator, Earth-observer path, host-time source, seeded Jovian/Earth result, or legacy day constant');

function sample(rawNumerator, cycleDenominator = 1) {
  return {
    schema: SAMPLE_SCHEMA,
    source: SAMPLE_SOURCE,
    rawNumerator: String(rawNumerator),
    cycleDenominator: String(cycleDenominator),
  };
}

{
  const d = new JovianSlowDisciplineCandidate();
  const initial = d.snapshot();

  assert.equal(initial.status, 'SEEKING_BASELINE');
  assert.equal(initial.applied, false);
  assert.equal(initial.writesOscillator, false);
  assert.equal(initial.writesDivider, false);
  assert.equal(initial.writesClock, false);
  assert.equal(initial.writesAuthority, false);
}
console.log('PASS G5A-02 · empty discipline layer is explicitly advisory-only with no actuator');

{
  const d = new JovianSlowDisciplineCandidate();

  const baseline = d.establishBaseline(sample(1000));

  assert.equal(baseline.status, 'BASELINED');
  assert.deepEqual(baseline.baselineRawPerJovianCycle, {
    numerator: '1000',
    denominator: '1',
  });
  assert.equal(baseline.currentRawPerJovianCycle, null);
  assert.equal(baseline.recommendedRateScaleCandidate, null);
  assert.equal(baseline.applied, false);
}
console.log('PASS G5A-03 · first exact recovered Jovian recurrence establishes baseline only and applies nothing');

{
  const d = new JovianSlowDisciplineCandidate();
  d.establishBaseline(sample(1000));

  const s = d.evaluate(sample(1001));

  assert.equal(s.status, 'CANDIDATE_AVAILABLE');

  assert.deepEqual(s.currentRawPerJovianCycle, {
    numerator: '1001',
    denominator: '1',
  });

  assert.deepEqual(s.currentOverBaseline, {
    numerator: '1001',
    denominator: '1000',
  });

  assert.deepEqual(s.signedFractionalRateError, {
    numerator: '1',
    denominator: '1000',
  });

  assert.deepEqual(s.recommendedRateScaleCandidate, {
    numerator: '1000',
    denominator: '1001',
  });

  assert.equal(s.applied, false);
}
console.log('PASS G5A-04 · exact fast-side fixture 1000→1001 yields +1/1000 fractional error and 1000/1001 rate-scale candidate');

{
  const d = new JovianSlowDisciplineCandidate();
  d.establishBaseline(sample(1000));

  const s = d.evaluate(sample(999));

  assert.deepEqual(s.signedFractionalRateError, {
    numerator: '-1',
    denominator: '1000',
  });

  assert.deepEqual(s.recommendedRateScaleCandidate, {
    numerator: '1000',
    denominator: '999',
  });

  assert.equal(s.applied, false);
}
console.log('PASS G5A-05 · exact slow-side fixture 1000→999 yields -1/1000 fractional error and 1000/999 rate-scale candidate');

{
  const d = new JovianSlowDisciplineCandidate();

  d.establishBaseline(sample(3000, 3));
  const s = d.evaluate(sample(7007, 7));

  // Baseline = 3000/3 = 1000.
  // Current  = 7007/7 = 1001.
  assert.deepEqual(s.baselineRawPerJovianCycle, {
    numerator: '1000',
    denominator: '1',
  });

  assert.deepEqual(s.currentRawPerJovianCycle, {
    numerator: '1001',
    denominator: '1',
  });

  assert.deepEqual(s.signedFractionalRateError, {
    numerator: '1',
    denominator: '1000',
  });
}
console.log('PASS G5A-06 · multi-cycle exact rational recurrence samples reduce before discipline comparison');

{
  const d = new JovianSlowDisciplineCandidate();

  assert.throws(
    () => d.evaluate(sample(1000)),
    /baseline must be established first/
  );

  d.establishBaseline(sample(1000));

  assert.throws(
    () => d.establishBaseline(sample(1000)),
    /baseline already established/
  );

  assert.throws(
    () => d.evaluate({
      ...sample(1001),
      timestamp: 'forbidden',
    }),
    /unsupported Jovian recurrence sample field: timestamp/
  );

  assert.throws(
    () => d.evaluate({
      ...sample(1001),
      source: 'MINTAKA',
    }),
    /sample source must be JOVIAN_RECOVERED_RECURRENCE/
  );
}
console.log('PASS G5A-07 · candidate refuses missing baseline, baseline replacement, timestamps, and non-Jovian sources');

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

  const d = new JovianSlowDisciplineCandidate();
  d.establishBaseline(sample(1000));
  d.evaluate(sample(1001));

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
console.log('PASS G5A-08 · calculating a rate candidate cannot mutate A8Core raw state, oscillator epoch, clock phase, day count, or authority');

{
  const d = new JovianSlowDisciplineCandidate();
  d.establishBaseline(sample(1000));
  const s = d.evaluate(sample(1001));

  assert.equal(s.role, 'RATE_DISCIPLINE_ADVISOR_ONLY');
  assert.equal(s.mode, 'NO_ACTUATOR');
  assert.equal(s.source, 'JOVIAN_RECOVERED_RECURRENCE');
  assert.equal(s.usesEarthObserverEvidence, false);
  assert.equal(s.usesExpectedJovianPeriod, false);
  assert.equal(s.usesLegacyTime, false);
  assert.equal(s.applied, false);
}
console.log('PASS G5A-09 · candidate role is explicit: Jovian recovered evidence in, exact advisory rate scale out, nothing applied');

console.log('');
console.log('PASS · A8-v5.4.20-GATE5A-JOVIAN-SLOW-DISCIPLINE-CANDIDATE-ADVISORY-ONLY');
