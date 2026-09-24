'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { A8Core } = require('../core/a8-core');
const {
  EVENT_TYPE,
  WITNESS,
  MintakaRotationObserver,
} = require('../observer/a8-mintaka-observer');

const modulePath = path.join(__dirname, '..', 'observer', 'a8-mintaka-observer.js');
const source = fs.readFileSync(modulePath, 'utf8');

console.log('A8 v5.4.20 Gate 2A · Mintaka read-only celestial observer proof');

// 1. Observer source has no seeded answer and no old Earth-authority machinery.
assert(!source.includes('598016'), 'observer module must not embed previously recovered Mintaka span');

for (const forbidden of [
  'DAY_PHASE17',
  'PHASE20',
  'MEAN_SUN',
  'SOLAR_MERIDIAN',
  'earthDayRawSpan',
  'setClockPhase',
  'adjustClockTicks',
  'setAuthority',
  'selectedAuthority',
  'process.hrtime',
  'performance.now',
  'Date.now',
  '5.4.19',
]) {
  assert(!source.includes(forbidden), `observer module contains forbidden dependency: ${forbidden}`);
}
console.log('PASS G2-01 · Mintaka module contains no seeded recurrence, Sol/Mean-Sun path, clock writer, authority writer, or host-time source');

// 2. Contract is exactly event type + raw pulse + witness.
{
  const o = new MintakaRotationObserver();

  assert.throws(
    () => o.observe({ type: EVENT_TYPE, rawPulse: '1', witness: WITNESS, timestamp: '2026-08-24T00:00:00Z' }),
    /unsupported defining observation field: timestamp/
  );

  assert.throws(
    () => o.observe({ type: EVENT_TYPE, rawPulse: '1', witness: WITNESS, expectedSpan: '123' }),
    /unsupported defining observation field: expectedSpan/
  );

  assert.throws(
    () => o.observe({ type: 'SOLAR_MERIDIAN', rawPulse: '1', witness: WITNESS }),
    /accepts only STELLAR_MERIDIAN/
  );

  assert.throws(
    () => o.observe({ type: EVENT_TYPE, rawPulse: '1', witness: 'OTHER_STAR' }),
    /accepts only witness MINTAKA/
  );
}
console.log('PASS G2-02 · defining event contract is restricted to STELLAR_MERIDIAN + monotonic rawPulse + MINTAKA');

// 3. No baked-in expected answer: arbitrary recurrence is recovered exactly.
{
  const o = new MintakaRotationObserver();
  const arbitrarySpan = 123457n;
  const start = 991n;

  o.observe({ type: EVENT_TYPE, rawPulse: start, witness: WITNESS });
  o.observe({ type: EVENT_TYPE, rawPulse: start + arbitrarySpan, witness: WITNESS });
  o.observe({ type: EVENT_TYPE, rawPulse: start + 2n * arbitrarySpan, witness: WITNESS });
  o.observe({ type: EVENT_TYPE, rawPulse: start + 3n * arbitrarySpan, witness: WITNESS });

  const s = o.snapshot();
  assert.equal(s.status, 'RECOVERED');
  assert.equal(s.eventCount, 4);
  assert.equal(s.cycleCount, 3);
  assert.equal(s.latestSpanRaw, arbitrarySpan.toString());
  assert.deepEqual(s.spansRaw, [
    arbitrarySpan.toString(),
    arbitrarySpan.toString(),
    arbitrarySpan.toString(),
  ]);
  assert.deepEqual(s.recurrence, {
    rawNumerator: (3n * arbitrarySpan).toString(),
    cycleDenominator: '3',
    reducedNumerator: arbitrarySpan.toString(),
    reducedDenominator: '1',
  });
}
console.log('PASS G2-03 · arbitrary recurrence is recovered by exact multi-cycle rational arithmetic with no expected-period constant');

// 4. Unequal spans remain exact evidence; they are not averaged through floats.
{
  const o = new MintakaRotationObserver();
  o.observe({ type: EVENT_TYPE, rawPulse: '100', witness: WITNESS });
  o.observe({ type: EVENT_TYPE, rawPulse: '210', witness: WITNESS });
  o.observe({ type: EVENT_TYPE, rawPulse: '321', witness: WITNESS });

  const s = o.snapshot();
  assert.deepEqual(s.spansRaw, ['110', '111']);
  assert.deepEqual(s.recurrence, {
    rawNumerator: '221',
    cycleDenominator: '2',
    reducedNumerator: '221',
    reducedDenominator: '2',
  });
}
console.log('PASS G2-04 · unequal observed spans remain an exact 221/2 raw-pulse recurrence rather than a floating approximation');

// 5. Monotonic counter discipline.
{
  const o = new MintakaRotationObserver();
  o.observe({ type: EVENT_TYPE, rawPulse: '1000', witness: WITNESS });
  assert.throws(
    () => o.observe({ type: EVENT_TYPE, rawPulse: '1000', witness: WITNESS }),
    /increase monotonically/
  );
  assert.throws(
    () => o.observe({ type: EVENT_TYPE, rawPulse: '999', witness: WITNESS }),
    /increase monotonically/
  );
}
console.log('PASS G2-05 · Mintaka recurrence cannot be manufactured from duplicate or backward raw-pulse order');

// 6. Previously observed Mintaka evidence can be reproduced as INPUT EVIDENCE,
// but the value is not encoded in the observer implementation.
{
  const o = new MintakaRotationObserver();
  const recoveredEvidenceSpan = 598016n;

  for (let i = 0n; i <= 4n; i++) {
    o.observe({
      type: EVENT_TYPE,
      rawPulse: i * recoveredEvidenceSpan,
      witness: WITNESS,
    });
  }

  const s = o.snapshot();
  assert.equal(s.recurrence.rawNumerator, '2392064');
  assert.equal(s.recurrence.cycleDenominator, '4');
  assert.equal(s.recurrence.reducedNumerator, '598016');
  assert.equal(s.recurrence.reducedDenominator, '1');
}
console.log('PASS G2-06 · prior Mintaka 2392064/4 evidence reproduces 598016 only when supplied as observation fixture, never as module authority');

// 7. Core isolation: observer does not receive a core reference and cannot mutate it.
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

  const o = new MintakaRotationObserver();
  o.observe({ type: EVENT_TYPE, rawPulse: '0', witness: WITNESS });
  o.observe({ type: EVENT_TYPE, rawPulse: '123457', witness: WITNESS });
  o.observe({ type: EVENT_TYPE, rawPulse: '246914', witness: WITNESS });

  const after = {
    rawTicks: c.rawTicks,
    naturalStep: c.naturalStep,
    oscillatorEpoch: c.oscillatorEpoch,
    dayPhase17: c.dayPhase17,
    dayCount: c.dayCount,
    selectedAuthority: c.selectedAuthority,
  };

  assert.deepEqual(after, before);
  assert.equal(o.snapshot().writesClock, false);
  assert.equal(o.snapshot().changesAuthority, false);
}
console.log('PASS G2-07 · Mintaka observer cannot move raw core state, displayed clock phase, day count, oscillator epoch, or Jovian authority');

// 8. Snapshot semantics state the correct role.
{
  const s = new MintakaRotationObserver().snapshot();
  assert.equal(s.role, 'EARTH_AXIAL_ROTATION_WITNESS');
  assert.equal(s.mode, 'READ_ONLY');
  assert.equal(s.witness, 'MINTAKA');
  assert.equal(s.eventType, 'STELLAR_MERIDIAN');
  assert.equal(s.definingInput, 'event type + raw pulse + witness');
  assert.equal(s.usesLegacyTime, false);
  assert.equal(s.usesExpectedPeriod, false);
}
console.log('PASS G2-08 · Mintaka is explicitly an Earth-rotation witness against upstream recovered time, not another clock');

console.log('');
console.log('PASS · A8-v5.4.20-GATE2A-MINTAKA-READ-ONLY');
