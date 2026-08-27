'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { A8Core } = require('../core/a8-core');
const {
  TerraShipSlipAccumulator,
} = require('../observer/a8-terra-ship-slip-accumulator');

const sourcePath = path.join(
  __dirname,
  '..',
  'observer',
  'a8-terra-ship-slip-accumulator.js'
);
const source = fs.readFileSync(sourcePath, 'utf8');

console.log('A8 v5.4.20 Gate 4C · Terra Ship Slip downstream accumulator proof');

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
  '365.25',
  '86400',
  '364.088',
  '45/32',
  '5.4.19',
]) {
  assert(
    !source.includes(forbidden),
    `accumulator contains forbidden seeded/legacy/authority dependency: ${forbidden}`
  );
}
console.log('PASS G4C-01 · accumulator contains no old recurrence, year/calendar answer, clock writer, authority writer, host-time source, or seeded Terra Ship Slip result');

function relationshipFixture({
  cycleCount,
  rateNumerator,
  rateDenominator,
  mintakaLastRaw,
  solLastRaw,
}) {
  return {
    schema: 'A8-MINTAKA-SOL-RELATIONSHIP-V1',
    role: 'READ_ONLY_ROTATION_ORBIT_RELATIONSHIP',
    mode: 'READ_ONLY',

    upstreamTimekeeper: 'JUPITER_IO_EUROPA_GANYMEDE',
    rotationWitness: 'MINTAKA',
    orbitalWitness: 'SOL',

    writesClock: false,
    writesMintakaObserver: false,
    writesSolObserver: false,
    changesAuthority: false,

    solAdvancePerMintakaRotation512: {
      numerator: String(rateNumerator),
      denominator: String(rateDenominator),
    },

    evidenceWindows: {
      mintaka: {
        firstRawPulse: '1000',
        lastRawPulse: String(mintakaLastRaw),
        cycleCount,
      },
      sol: {
        firstRawPulse: '2000',
        lastRawPulse: String(solLastRaw),
        intervalCount: cycleCount,
      },
    },
  };
}

{
  const a = new TerraShipSlipAccumulator();
  const initial = a.snapshot();

  assert.equal(initial.status, 'SEEKING_BASELINE');
  assert.equal(initial.accumulatedRotations, '0');
  assert.deepEqual(initial.accumulatedTerraShipSlip512, {
    numerator: '0',
    denominator: '1',
  });
}
console.log('PASS G4C-02 · empty accumulator begins with exact zero Terra Ship Slip and no implied baseline');

{
  const a = new TerraShipSlipAccumulator();

  const s = a.ingest(
    relationshipFixture({
      cycleCount: 4,
      rateNumerator: 3,
      rateDenominator: 8,
      mintakaLastRaw: 1388,
      solLastRaw: 2388,
    })
  );

  assert.equal(s.status, 'BASELINED');
  assert.equal(s.lastAction, 'BASELINE_ESTABLISHED');
  assert.equal(s.baselineMintakaCycleCount, '4');
  assert.equal(s.lastMintakaCycleCount, '4');
  assert.equal(s.accumulatedRotations, '0');
  assert.deepEqual(s.accumulatedTerraShipSlip512, {
    numerator: '0',
    denominator: '1',
  });
}
console.log('PASS G4C-03 · first qualified relationship establishes baseline only and does not back-fill prior rotations');

{
  const a = new TerraShipSlipAccumulator();

  a.ingest(
    relationshipFixture({
      cycleCount: 4,
      rateNumerator: 3,
      rateDenominator: 8,
      mintakaLastRaw: 1388,
      solLastRaw: 2388,
    })
  );

  const refreshed = a.ingest(
    relationshipFixture({
      cycleCount: 4,
      rateNumerator: 7,
      rateDenominator: 16,
      mintakaLastRaw: 1388,
      solLastRaw: 2485,
    })
  );

  assert.equal(refreshed.lastAction, 'RATE_REFRESH_NO_ROTATION');
  assert.equal(refreshed.accumulatedRotations, '0');
  assert.equal(refreshed.rateRefreshes, 1);
  assert.deepEqual(refreshed.currentTerraShipSlipPerRotation512, {
    numerator: '7',
    denominator: '16',
  });
  assert.deepEqual(refreshed.accumulatedTerraShipSlip512, {
    numerator: '0',
    denominator: '1',
  });
}
console.log('PASS G4C-04 · same-rotation Sol evidence may refresh the relationship rate but cannot add Terra Ship Slip');

{
  const a = new TerraShipSlipAccumulator();

  a.ingest(
    relationshipFixture({
      cycleCount: 4,
      rateNumerator: 3,
      rateDenominator: 8,
      mintakaLastRaw: 1388,
      solLastRaw: 2388,
    })
  );

  const one = a.ingest(
    relationshipFixture({
      cycleCount: 5,
      rateNumerator: 3,
      rateDenominator: 8,
      mintakaLastRaw: 1485,
      solLastRaw: 2485,
    })
  );

  assert.equal(one.status, 'ACCUMULATING');
  assert.equal(one.lastAction, 'INTEGRATED_ONE_ROTATION');
  assert.equal(one.accumulatedRotations, '1');
  assert.deepEqual(one.accumulatedTerraShipSlip512, {
    numerator: '3',
    denominator: '8',
  });

  const two = a.ingest(
    relationshipFixture({
      cycleCount: 6,
      rateNumerator: 7,
      rateDenominator: 16,
      mintakaLastRaw: 1582,
      solLastRaw: 2582,
    })
  );

  assert.equal(two.accumulatedRotations, '2');
  assert.equal(two.acceptedIntegrationSteps, 2);

  // 3/8 + 7/16 = 6/16 + 7/16 = 13/16 A8.
  assert.deepEqual(two.accumulatedTerraShipSlip512, {
    numerator: '13',
    denominator: '16',
  });

  assert.deepEqual(two.accumulatedTurnFraction, {
    numerator: '13',
    denominator: '8192',
  });

  assert.deepEqual(two.accumulatedPhase512, {
    numerator: '13',
    denominator: '16',
  });
}
console.log('PASS G4C-05 · successive one-rotation evidence integrates exact changing Terra Ship Slip rates without floats');

{
  const a = new TerraShipSlipAccumulator();

  a.ingest(
    relationshipFixture({
      cycleCount: 10,
      rateNumerator: 1,
      rateDenominator: 2,
      mintakaLastRaw: 2000,
      solLastRaw: 3000,
    })
  );

  assert.throws(
    () => a.ingest(
      relationshipFixture({
        cycleCount: 12,
        rateNumerator: 1,
        rateDenominator: 2,
        mintakaLastRaw: 2200,
        solLastRaw: 3200,
      })
    ),
    /refuses to infer missing rotations/
  );

  const after = a.snapshot();
  assert.equal(after.accumulatedRotations, '0');
  assert.deepEqual(after.accumulatedTerraShipSlip512, {
    numerator: '0',
    denominator: '1',
  });
}
console.log('PASS G4C-06 · skipped Mintaka rotations are rejected rather than filled with a later relationship rate');

{
  const a = new TerraShipSlipAccumulator();

  a.ingest(
    relationshipFixture({
      cycleCount: 8,
      rateNumerator: 1,
      rateDenominator: 4,
      mintakaLastRaw: 1800,
      solLastRaw: 2800,
    })
  );

  assert.throws(
    () => a.ingest(
      relationshipFixture({
        cycleCount: 7,
        rateNumerator: 1,
        rateDenominator: 4,
        mintakaLastRaw: 1700,
        solLastRaw: 2700,
      })
    ),
    /moved backward/
  );
}
console.log('PASS G4C-07 · backward Mintaka cycle evidence is rejected');

{
  const a = new TerraShipSlipAccumulator();

  const bad = relationshipFixture({
    cycleCount: 4,
    rateNumerator: 3,
    rateDenominator: 8,
    mintakaLastRaw: 1388,
    solLastRaw: 2388,
  });

  bad.writesClock = true;

  assert.throws(
    () => a.ingest(bad),
    /not qualified as upstream-read-only/
  );
}
console.log('PASS G4C-08 · accumulator accepts only relationship evidence already qualified as upstream-read-only');

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

  const a = new TerraShipSlipAccumulator();

  a.ingest(
    relationshipFixture({
      cycleCount: 4,
      rateNumerator: 3,
      rateDenominator: 8,
      mintakaLastRaw: 1388,
      solLastRaw: 2388,
    })
  );

  a.ingest(
    relationshipFixture({
      cycleCount: 5,
      rateNumerator: 3,
      rateDenominator: 8,
      mintakaLastRaw: 1485,
      solLastRaw: 2485,
    })
  );

  const after = {
    rawTicks: c.rawTicks,
    naturalStep: c.naturalStep,
    oscillatorEpoch: c.oscillatorEpoch,
    dayPhase17: c.dayPhase17,
    dayCount: c.dayCount,
    selectedAuthority: c.selectedAuthority,
  };

  assert.deepEqual(after, before);

  const s = a.snapshot();
  assert.equal(s.writesClock, false);
  assert.equal(s.writesMintakaObserver, false);
  assert.equal(s.writesSolObserver, false);
  assert.equal(s.writesRelationshipObserver, false);
  assert.equal(s.changesAuthority, false);
}
console.log('PASS G4C-09 · Terra Ship Slip accumulation cannot move A8Core or write Mintaka, Sol, relationship, or authority state');

{
  const a = new TerraShipSlipAccumulator();
  const s = a.snapshot();

  assert.equal(s.mode, 'UPSTREAM_READ_ONLY_STATEFUL_DOWNSTREAM');
  assert.equal(s.guessesMissingRotations, false);
  assert.equal(s.usesSolarRecurrence, false);
  assert.equal(s.usesMeanSun, false);
  assert.equal(s.usesCalendarRule, false);
  assert.equal(s.usesExpectedYear, false);
  assert.equal(s.usesLegacyTime, false);
  assert.equal(s.usesLegacyAngle, false);
}
console.log('PASS G4C-10 · accumulator explicitly owns downstream state only and imports no calendar/year/legacy authority');

console.log('');
console.log('PASS · A8-v5.4.20-GATE4C-TERRA-SHIP-SLIP-ACCUMULATOR-READ-ONLY-UPSTREAM');
