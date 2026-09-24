'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { A8Core } = require('../core/a8-core');
const {
  EVENT_TYPE,
  WITNESS,
  normalizeAngle512,
  forwardDelta512,
  SolCelestialObserver,
} = require('../observer/a8-sol-observer');

const modulePath = path.join(__dirname, '..', 'observer', 'a8-sol-observer.js');
const source = fs.readFileSync(modulePath, 'utf8');

console.log('A8 v5.4.20 Gate 3A · Sol read-only celestial-frame observer proof');

for (const forbidden of [
  'SOLAR_MERIDIAN',
  'MEAN_SUN',
  'DAY_PHASE17',
  'PHASE20',
  'earthDayRawSpan',
  'setClockPhase',
  'adjustClockTicks',
  'setAuthority',
  'Date.now',
  'new Date',
  'performance.now',
  'process.hrtime',
  '2398634',
  '599658',
  '599622',
  '599695',
  '365.25',
  '86400',
  '45/32',
  '5.4.19',
]) {
  assert(!source.includes(forbidden), `Sol module contains forbidden legacy/v19/authority dependency: ${forbidden}`);
}
console.log('PASS G3A-01 · Sol module contains no Mean-Sun recurrence, day divider, seeded solar result, clock writer, authority writer, or host-time source');

{
  const o = new SolCelestialObserver();

  assert.throws(
    () => o.observe({
      type: EVENT_TYPE,
      rawPulse: '1',
      witness: WITNESS,
      angle512: { numerator: '10', denominator: '1' },
      timestamp: 'forbidden',
    }),
    /unsupported defining observation field: timestamp/
  );

  assert.throws(
    () => o.observe({
      type: 'SOLAR_MERIDIAN',
      rawPulse: '1',
      witness: WITNESS,
      angle512: { numerator: '10', denominator: '1' },
    }),
    /accepts only SOL_CELESTIAL_DIRECTION/
  );

  assert.throws(
    () => o.observe({
      type: EVENT_TYPE,
      rawPulse: '1',
      witness: 'MEAN_SUN',
      angle512: { numerator: '10', denominator: '1' },
    }),
    /accepts only witness SOL/
  );
}
console.log('PASS G3A-02 · defining sample contract is SOL_CELESTIAL_DIRECTION + monotonic rawPulse + SOL + exact native angle512');

{
  const a = normalizeAngle512({ numerator: '1025', denominator: '2' });
  assert.deepEqual(
    { numerator: a.numerator.toString(), denominator: a.denominator.toString() },
    { numerator: '1', denominator: '2' }
  );

  const b = normalizeAngle512({ numerator: '-1', denominator: '4' });
  assert.deepEqual(
    { numerator: b.numerator.toString(), denominator: b.denominator.toString() },
    { numerator: '2047', denominator: '4' }
  );
}
console.log('PASS G3A-03 · native exact angles normalize modulo the 512-unit celestial turn without degrees or floats');

{
  const previous = normalizeAngle512({ numerator: '2047', denominator: '4' }); // 511.75
  const current = normalizeAngle512({ numerator: '1', denominator: '4' });     // 0.25
  const delta = forwardDelta512(previous, current);

  assert.equal(delta.numerator.toString(), '1');
  assert.equal(delta.denominator.toString(), '2');
}
console.log('PASS G3A-04 · celestial 512-wrap is exact: 511.75 → 0.25 recovers +1/2 A8 angular advance');

{
  const o = new SolCelestialObserver();

  o.observe({
    type: EVENT_TYPE,
    rawPulse: '1000',
    witness: WITNESS,
    angle512: { numerator: '10', denominator: '1' },
  });

  o.observe({
    type: EVENT_TYPE,
    rawPulse: '1100',
    witness: WITNESS,
    angle512: { numerator: '23', denominator: '2' }, // 11.5
  });

  o.observe({
    type: EVENT_TYPE,
    rawPulse: '1250',
    witness: WITNESS,
    angle512: { numerator: '53', denominator: '4' }, // 13.25
  });

  const s = o.snapshot();

  assert.equal(s.status, 'TRACKING');
  assert.equal(s.sampleCount, 3);
  assert.equal(s.intervalCount, 2);
  assert.equal(s.elapsedRawPulse, '250');

  assert.deepEqual(s.forwardDeltas512, [
    { numerator: '3', denominator: '2' },
    { numerator: '7', denominator: '4' },
  ]);

  assert.deepEqual(s.accumulatedForwardAdvance512, {
    numerator: '13',
    denominator: '4',
  });

  assert.deepEqual(s.forwardAdvancePerRawPulse512, {
    numerator: '13',
    denominator: '1000',
  });
}
console.log('PASS G3A-05 · arbitrary Sol direction samples recover exact accumulated angular advance and exact angle/raw-pulse ratio');

{
  const o = new SolCelestialObserver();

  o.observe({
    type: EVENT_TYPE,
    rawPulse: '100',
    witness: WITNESS,
    angle512: { numerator: '100', denominator: '1' },
  });

  assert.throws(
    () => o.observe({
      type: EVENT_TYPE,
      rawPulse: '100',
      witness: WITNESS,
      angle512: { numerator: '101', denominator: '1' },
    }),
    /increase monotonically/
  );

  assert.throws(
    () => o.observe({
      type: EVENT_TYPE,
      rawPulse: '99',
      witness: WITNESS,
      angle512: { numerator: '101', denominator: '1' },
    }),
    /increase monotonically/
  );
}
console.log('PASS G3A-06 · duplicate/backward raw-pulse samples cannot manufacture solar angular motion');

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

  const o = new SolCelestialObserver();
  o.observe({
    type: EVENT_TYPE,
    rawPulse: '1000',
    witness: WITNESS,
    angle512: { numerator: '200', denominator: '1' },
  });
  o.observe({
    type: EVENT_TYPE,
    rawPulse: '2000',
    witness: WITNESS,
    angle512: { numerator: '1601', denominator: '8' },
  });

  const after = {
    rawTicks: c.rawTicks,
    naturalStep: c.naturalStep,
    oscillatorEpoch: c.oscillatorEpoch,
    dayPhase17: c.dayPhase17,
    dayCount: c.dayCount,
    selectedAuthority: c.selectedAuthority,
  };

  assert.deepEqual(after, before);

  const s = o.snapshot();
  assert.equal(s.writesClock, false);
  assert.equal(s.changesAuthority, false);
}
console.log('PASS G3A-07 · standalone Sol observer cannot move raw core state, clock phase, day count, oscillator epoch, or Jovian authority');

{
  const s = new SolCelestialObserver().snapshot();

  assert.equal(s.role, 'EARTH_ORBITAL_ADVANCE_WITNESS');
  assert.equal(s.mode, 'READ_ONLY');
  assert.equal(s.angularFrame, 'A8_CELESTIAL_512');
  assert.equal(s.fullTurnA8, '512');
  assert.equal(s.usesLegacyTime, false);
  assert.equal(s.usesLegacyAngle, false);
  assert.equal(s.usesExpectedSolarPeriod, false);
  assert.equal(s.usesExpectedOrbitalRate, false);
}
console.log('PASS G3A-08 · Sol is explicitly an orbital-advance celestial-frame witness, not a clock or Mean-Sun civil-day authority');

console.log('');
console.log('PASS · A8-v5.4.20-GATE3A-SOL-READ-ONLY');
