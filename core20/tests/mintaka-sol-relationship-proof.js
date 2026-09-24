'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { A8Core } = require('../core/a8-core');
const {
  MintakaRotationObserver,
} = require('../observer/a8-mintaka-observer');
const {
  SolCelestialObserver,
} = require('../observer/a8-sol-observer');
const {
  deriveMintakaSolRelationship,
  MintakaSolRelationshipObserver,
} = require('../observer/a8-mintaka-sol-relationship');

const modulePath = path.join(
  __dirname,
  '..',
  'observer',
  'a8-mintaka-sol-relationship.js'
);
const source = fs.readFileSync(modulePath, 'utf8');

console.log('A8 v5.4.20 Gate 4A · Mintaka ↔ Sol read-only relationship proof');

for (const forbidden of [
  'SOLAR_MERIDIAN',
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
  '598016',
  '45/32',
  '365.25',
  '86400',
  '5.4.19',
]) {
  assert(
    !source.includes(forbidden),
    `relationship module contains forbidden seeded/legacy/authority dependency: ${forbidden}`
  );
}
console.log('PASS G4A-01 · relationship module contains no old solar recurrence, seeded result, calendar/day constant, clock writer, authority writer, or host-time source');

function buildIndependentEvidence() {
  const mintaka = new MintakaRotationObserver();

  for (const raw of ['1000', '1097', '1194', '1291', '1388']) {
    mintaka.observe({
      type: 'STELLAR_MERIDIAN',
      rawPulse: raw,
      witness: 'MINTAKA',
    });
  }

  const sol = new SolCelestialObserver();

  const solSamples = [
    ['2000', '2047', '4'], // 511.75
    ['2097', '1', '8'],    // 0.125
    ['2194', '1', '2'],    // 0.5
    ['2291', '7', '8'],    // 0.875
    ['2388', '5', '4'],    // 1.25
  ];

  for (const [rawPulse, numerator, denominator] of solSamples) {
    sol.observe({
      type: 'SOL_CELESTIAL_DIRECTION',
      rawPulse,
      witness: 'SOL',
      angle512: { numerator, denominator },
    });
  }

  return {
    mintaka: mintaka.snapshot(),
    sol: sol.snapshot(),
  };
}

{
  const evidence = buildIndependentEvidence();

  assert.equal(evidence.mintaka.status, 'RECOVERED');
  assert.deepEqual(evidence.mintaka.recurrence, {
    rawNumerator: '388',
    cycleDenominator: '4',
    reducedNumerator: '97',
    reducedDenominator: '1',
  });

  assert.equal(evidence.sol.status, 'TRACKING');
  assert.deepEqual(evidence.sol.forwardAdvancePerRawPulse512, {
    numerator: '3',
    denominator: '776',
  });
}
console.log('PASS G4A-02 · independent fixtures recover 97 raw pulses/Mintaka rotation and 3/776 A8 angle/raw from separate evidence windows');

{
  const { mintaka, sol } = buildIndependentEvidence();
  const result = deriveMintakaSolRelationship(mintaka, sol);

  assert.deepEqual(result.mintakaRawPulsesPerRotation, {
    numerator: '97',
    denominator: '1',
  });

  assert.deepEqual(result.solAdvancePerRawPulse512, {
    numerator: '3',
    denominator: '776',
  });

  assert.deepEqual(result.solAdvancePerMintakaRotation512, {
    numerator: '3',
    denominator: '8',
  });

  assert.deepEqual(result.orbitTurnFractionPerMintakaRotation, {
    numerator: '3',
    denominator: '4096',
  });
}
console.log('PASS G4A-03 · exact cancellation recovers 3/8 A8 Sol orbital advance per Mintaka rotation and 3/4096 turn/rotation');

{
  const { mintaka, sol } = buildIndependentEvidence();

  const beforeMintaka = JSON.stringify(mintaka);
  const beforeSol = JSON.stringify(sol);

  const observer = new MintakaSolRelationshipObserver();
  const result = observer.compare(mintaka, sol);

  assert.equal(JSON.stringify(mintaka), beforeMintaka);
  assert.equal(JSON.stringify(sol), beforeSol);

  assert.equal(result.writesMintakaObserver, false);
  assert.equal(result.writesSolObserver, false);
  assert.equal(result.writesClock, false);
  assert.equal(result.changesAuthority, false);
}
console.log('PASS G4A-04 · relationship observer is purely read-only and does not mutate either source snapshot');

{
  const { mintaka, sol } = buildIndependentEvidence();

  const c = new A8Core({ oscillator: 73 });
  const before = {
    rawTicks: c.rawTicks,
    naturalStep: c.naturalStep,
    oscillatorEpoch: c.oscillatorEpoch,
    dayPhase17: c.dayPhase17,
    dayCount: c.dayCount,
    selectedAuthority: c.selectedAuthority,
  };

  deriveMintakaSolRelationship(mintaka, sol);

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
console.log('PASS G4A-05 · deriving the Mintaka↔Sol relationship cannot move A8Core raw state, clock phase, day count, oscillator epoch, or Jovian authority');

{
  const { mintaka, sol } = buildIndependentEvidence();

  const badMintaka = JSON.parse(JSON.stringify(mintaka));
  badMintaka.status = 'SEEKING_SECOND_EVENT';

  assert.throws(
    () => deriveMintakaSolRelationship(badMintaka, sol),
    /Mintaka recurrence must be RECOVERED/
  );

  const badSol = JSON.parse(JSON.stringify(sol));
  badSol.status = 'SEEKING_SECOND_SAMPLE';

  assert.throws(
    () => deriveMintakaSolRelationship(mintaka, badSol),
    /Sol observer must be TRACKING/
  );
}
console.log('PASS G4A-06 · relationship refuses to manufacture a result from unqualified Mintaka or Sol evidence');

{
  const { mintaka, sol } = buildIndependentEvidence();
  const result = deriveMintakaSolRelationship(mintaka, sol);

  assert.equal(result.basis, 'INDEPENDENT_RECOVERED_OBSERVER_RATES');
  assert.equal(result.upstreamTimekeeper, 'JUPITER_IO_EUROPA_GANYMEDE');
  assert.equal(result.rotationWitness, 'MINTAKA');
  assert.equal(result.orbitalWitness, 'SOL');

  assert.equal(result.usesSolarRecurrence, false);
  assert.equal(result.usesMeanSun, false);
  assert.equal(result.usesLegacyTime, false);
  assert.equal(result.usesLegacyAngle, false);
  assert.equal(result.usesCalendarRule, false);
  assert.equal(result.usesExpectedYear, false);

  assert.deepEqual(result.evidenceWindows.mintaka, {
    firstRawPulse: '1000',
    lastRawPulse: '1388',
    cycleCount: 4,
  });

  assert.deepEqual(result.evidenceWindows.sol, {
    firstRawPulse: '2000',
    lastRawPulse: '2388',
    intervalCount: 4,
  });
}
console.log('PASS G4A-07 · independent evidence windows remain explicit; the relationship does not pretend the two observer histories are one stream');

console.log('');
console.log('PASS · A8-v5.4.20-GATE4A-MINTAKA-SOL-RELATIONSHIP-READ-ONLY');
