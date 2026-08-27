'use strict';

const assert =
  require('assert');

const fs =
  require('fs');

const path =
  require('path');

const { A8Core } =
  require('../core/a8-core');

const {
  MODE_VIRTUAL,
  MODE_REAL,
  A8PulseSourceEpochSelector,
} = require(
  '../hardware/a8-pulse-source-selector'
);

const {
  Core20RecoveryInputBridge,
} = require(
  '../hardware/a8-core20-recovery-input-bridge'
);

const {
  Core20JovianRecoveryWrapper,
} = require(
  '../hardware/a8-jovian-recovery-wrapper'
);

const {
  Gate6GVirtualJovianFixture,
} = require(
  '../experiments/a8-gate6g-jovian-virtual-fixture'
);

const {
  JovianPhaseTimekeeper,
} = require(
  '../hardware/a8-jovian-phase-timekeeper'
);

console.log(
  'A8 post-seal hardware branch · Gate 6H continuous Jovian A8 phase proof'
);

const source =
  fs.readFileSync(
    path.join(
      __dirname,
      '..',
      'hardware',
      'a8-jovian-phase-timekeeper.js'
    ),
    'utf8'
  );

const executable =
  source
    .replace(
      /\/\*[\s\S]*?\*\//g,
      ''
    )
    .replace(
      /\/\/.*$/gm,
      ''
    );

for (const forbidden of [
  "require('../core",
  "require('./core",
  'Date.now',
  'new Date',
  'performance.now',
  'process.hrtime',
  'setTimeout',
  'setInterval',
  'setClockPhase',
  'adjustClockTicks',
  'setAuthority',
  'setOscillator',
  'setDivider',
]) {
  assert(
    !executable.includes(
      forbidden
    ),
    `Gate-6H contains forbidden dependency/path: ${forbidden}`
  );
}

console.log(
  'PASS G6H-01 · timekeeper contains no A8Core import, host clock, timer, UTC/NTP/GPS, Hz, phase setter, divider setter, or authority write'
);

function makeHarness() {
  const selector =
    new A8PulseSourceEpochSelector();

  const bridge =
    new Core20RecoveryInputBridge();

  const recovery =
    new Core20JovianRecoveryWrapper();

  const fixture =
    new Gate6GVirtualJovianFixture();

  const timekeeper =
    new JovianPhaseTimekeeper();

  selector.select(
    MODE_VIRTUAL
  );

  bridge.sync(
    selector.snapshot()
  );

  recovery.syncRecoveryInput(
    bridge.snapshot()
  );

  timekeeper.sync(
    bridge.snapshot(),
    recovery.snapshot(
      bridge.snapshot()
        .lastRawPulse
    )
  );

  return {
    selector,
    bridge,
    recovery,
    fixture,
    timekeeper,
  };
}

function syncAll(h) {
  h.bridge.sync(
    h.selector.snapshot()
  );

  h.recovery.syncRecoveryInput(
    h.bridge.snapshot()
  );

  return h.timekeeper.sync(
    h.bridge.snapshot(),
    h.recovery.snapshot(
      h.bridge.snapshot()
        .lastRawPulse
    )
  );
}

function runFixtureToQualification(h) {
  h.fixture.start(
    h.selector.snapshot()
      .gate6a
      .lastRawPulse
  );

  let guard = 0;

  while (
    h.fixture.active &&
    guard < 64
  ) {
    const target =
      h.fixture.consume();

    const currentText =
      h.selector.snapshot()
        .gate6a
        .lastRawPulse;

    const current =
      currentText === null
        ? 0n
        : BigInt(
            currentText
          );

    const advance =
      target.absoluteRawPulse -
      current;

    if (advance > 0n) {
      h.selector.advanceVirtual(
        advance.toString()
      );
    }

    h.bridge.sync(
      h.selector.snapshot()
    );

    h.recovery.syncRecoveryInput(
      h.bridge.snapshot()
    );

    for (
      const event of
      target.events
    ) {
      h.recovery.observe(
        h.bridge.snapshot(),
        event
      );
    }

    h.timekeeper.sync(
      h.bridge.snapshot(),
      h.recovery.snapshot(
        h.bridge.snapshot()
          .lastRawPulse
      )
    );

    guard += 1;
  }

  assert(
    guard < 64
  );

  return h.timekeeper.snapshot();
}

{
  const h =
    makeHarness();

  const before =
    h.timekeeper.snapshot();

  assert.equal(
    before.status,
    'WAITING_FOR_RAW_BASELINE'
  );

  assert.equal(
    before.lockedRulerRawPer512,
    null
  );

  console.log(
    'PASS G6H-02 · timekeeper begins re-armed and cannot invent a phase ruler before Jovian qualification'
  );

  const locked =
    runFixtureToQualification(h);

  assert.equal(
    locked.status,
    'JOVIAN_PHASE_LOCKED'
  );

  assert.equal(
    locked.lockedRulerRawPer512,
    '388'
  );

  assert.equal(
    locked.phase.phase9Octal,
    '000₈'
  );

  assert.equal(
    locked.phase.elapsedRaw,
    '0'
  );

  console.log(
    'PASS G6H-03 · exact 8:4:2 recovery locks arbitrary common ruler 388 raw / 512 A8 phase states at phase 000₈'
  );

  h.selector.advanceVirtual(
    '97'
  );

  let s =
    syncAll(h);

  assert.equal(
    s.phase.elapsedRaw,
    '97'
  );

  assert.equal(
    s.phase.phase9Octal,
    '200₈'
  );

  assert.equal(
    s.phase.subphase,
    '0'
  );

  console.log(
    'PASS G6H-04 · +97 raw advances exactly 128 A8 phase states = 200₈ with no wall-clock input'
  );

  h.selector.advanceVirtual(
    '97'
  );

  s =
    syncAll(h);

  assert.equal(
    s.phase.elapsedRaw,
    '194'
  );

  assert.equal(
    s.phase.phase9Octal,
    '400₈'
  );

  assert.equal(
    s.phase.completedRecurrences,
    '0'
  );

  console.log(
    'PASS G6H-05 · another +97 raw advances exactly to half recurrence = 400₈'
  );

  h.selector.advanceVirtual(
    '194'
  );

  s =
    syncAll(h);

  assert.equal(
    s.phase.elapsedRaw,
    '388'
  );

  assert.equal(
    s.phase.phase9Octal,
    '000₈'
  );

  assert.equal(
    s.phase.completedRecurrences,
    '1'
  );

  assert.equal(
    s.phase.recurrenceOctal,
    '1₈'
  );

  console.log(
    'PASS G6H-06 · total +388 raw closes exactly one 1000₈ Jovian phase recurrence'
  );

  h.selector.advanceVirtual(
    '1'
  );

  s =
    syncAll(h);

  assert.equal(
    s.phase.elapsedRaw,
    '389'
  );

  assert.equal(
    s.phase.exactTotalPhase,
    '49792/97'
  );

  assert.equal(
    s.phase.phase9,
    1
  );

  assert.equal(
    s.phase.phase9Octal,
    '001₈'
  );

  assert.equal(
    s.phase.subphase,
    '31/97'
  );

  console.log(
    'PASS G6H-07 · non-integral raw-to-phase mapping remains exact rational rather than float-rounded'
  );
}

{
  const h =
    makeHarness();

  runFixtureToQualification(
    h
  );

  h.selector.advanceVirtual(
    '97'
  );

  let s =
    syncAll(h);

  assert.equal(
    s.phase.phase9Octal,
    '200₈'
  );

  /*
   * Directly present contradictory later evidence to Gate 6H.
   * It must HOLD the locked 388 ruler rather than retune.
   */
  const contradictory =
    h.recovery.snapshot(
      h.bridge.snapshot()
        .lastRawPulse
    );

  contradictory.comparator = {
    ...contradictory.comparator,
    qualified: true,
    referenceNormalizedRaw:
      '400',
  };

  contradictory.recoveredJovianRawRuler =
    '400';

  s =
    h.timekeeper.sync(
      h.bridge.snapshot(),
      contradictory
    );

  assert.equal(
    s.status,
    'LOCKED_RULER_MISMATCH_HELD'
  );

  assert.equal(
    s.lockedRulerRawPer512,
    '388'
  );

  assert.equal(
    s.observedContradictoryRuler,
    '400'
  );

  assert.equal(
    s.phase.phase9Octal,
    '200₈'
  );

  console.log(
    'PASS G6H-08 · contradictory later recovery evidence cannot silently retune the locked ruler or jump phase'
  );

  h.selector.select(
    MODE_REAL
  );

  h.bridge.sync(
    h.selector.snapshot()
  );

  h.recovery.syncRecoveryInput(
    h.bridge.snapshot()
  );

  s =
    h.timekeeper.sync(
      h.bridge.snapshot(),
      h.recovery.snapshot()
    );

  assert.equal(
    s.sourceEpoch,
    2
  );

  assert.equal(
    s.lockedRulerRawPer512,
    null
  );

  assert.equal(
    s.phase,
    null
  );

  assert(
    s.status ===
      'WAITING_FOR_RAW_BASELINE' ||
    s.status ===
      'WAITING_FOR_JOVIAN_QUALIFICATION'
  );

  console.log(
    'PASS G6H-09 · VIRTUAL→REAL sourceEpoch change re-arms the Jovian phase timekeeper and carries no virtual phase continuity'
  );
}

{
  const c =
    new A8Core({
      oscillator: 73,
    });

  const before = {
    rawTicks:
      c.rawTicks,
    naturalStep:
      c.naturalStep,
    oscillatorEpoch:
      c.oscillatorEpoch,
    dayPhase17:
      c.dayPhase17,
    dayCount:
      c.dayCount,
    selectedAuthority:
      c.selectedAuthority,
  };

  const h =
    makeHarness();

  runFixtureToQualification(
    h
  );

  h.selector.advanceVirtual(
    '512'
  );

  syncAll(h);

  const after = {
    rawTicks:
      c.rawTicks,
    naturalStep:
      c.naturalStep,
    oscillatorEpoch:
      c.oscillatorEpoch,
    dayPhase17:
      c.dayPhase17,
    dayCount:
      c.dayCount,
    selectedAuthority:
      c.selectedAuthority,
  };

  assert.deepEqual(
    after,
    before
  );

  const s =
    h.timekeeper.snapshot();

  assert.equal(
    s.dayPhase17Driven,
    false
  );

  assert.equal(
    s.dayPhase17Status,
    'WAITING_FOR_RECOVERED_EARTH_DAY_SCALE'
  );

  assert.equal(
    s.phase20Driven,
    false
  );

  console.log(
    'PASS G6H-10 · continuous Jovian phase does not mutate sealed A8Core and explicitly leaves DAY_PHASE17 / PHASE20 un-driven'
  );
}

console.log('');
console.log(
  'PASS · A8-POSTSEAL-GATE6H-CONTINUOUS-JOVIAN-A8-PHASE'
);
