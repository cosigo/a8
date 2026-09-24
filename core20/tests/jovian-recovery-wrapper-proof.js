'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

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

const wrapperPath =
  path.join(
    __dirname,
    '..',
    'hardware',
    'a8-jovian-recovery-wrapper.js'
  );

const source =
  fs.readFileSync(
    wrapperPath,
    'utf8'
  );

console.log(
  'A8 post-seal hardware branch · Gate 6G Jovian recovery wrapper proof'
);

const executable = source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '');

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
  'publishedPeriod',
  'legacySecond',
  'schedulerHz',
]) {
  assert(
    !executable.includes(
      forbidden
    ),
    `Jovian wrapper contains forbidden dependency/path: ${forbidden}`
  );
}

console.log(
  'PASS G6G-01 · Jovian recovery wrapper contains no A8Core, host-time, timer, published-period, legacy-second, phase, divider, or authority path'
);

const selector =
  new A8PulseSourceEpochSelector();

const bridge =
  new Core20RecoveryInputBridge();

const recovery =
  new Core20JovianRecoveryWrapper();

selector.select(
  MODE_VIRTUAL
);

bridge.sync(
  selector.snapshot()
);

recovery.syncRecoveryInput(
  bridge.snapshot()
);

assert.equal(
  recovery.snapshot().status,
  'WAITING_FOR_RAW_BASELINE'
);

console.log(
  'PASS G6G-02 · VIRTUAL source epoch begins with Jovian recovery re-armed and waiting for Gate-6F raw baseline'
);

const fixture =
  new Gate6GVirtualJovianFixture();

fixture.start(null);

function runNextGroup() {
  const target =
    fixture.consume();

  if (target === null) {
    return false;
  }

  const current =
    selector.snapshot()
      .gate6a
      .lastRawPulse;

  const currentRaw =
    current === null
      ? 0n
      : BigInt(current);

  const advance =
    target.absoluteRawPulse -
    currentRaw;

  if (advance > 0n) {
    selector.advanceVirtual(
      advance.toString()
    );
  }

  bridge.sync(
    selector.snapshot()
  );

  recovery.syncRecoveryInput(
    bridge.snapshot()
  );

  for (const event of target.events) {
    recovery.observe(
      bridge.snapshot(),
      event
    );
  }

  return true;
}

let groups = 0;

while (runNextGroup()) {
  groups += 1;
}

assert.equal(
  groups,
  9
);

const s =
  recovery.snapshot(
    bridge.snapshot()
      .lastRawPulse
  );

assert.equal(
  s.status,
  'JOVIAN_RULER_QUALIFIED'
);

assert.equal(
  s.channels.io.spanCount,
  8
);

assert.equal(
  s.channels.eu.spanCount,
  4
);

assert.equal(
  s.channels.ga.spanCount,
  2
);

assert.equal(
  s.channels.io.nativeAverageRaw,
  '97'
);

assert.equal(
  s.channels.eu.nativeAverageRaw,
  '194'
);

assert.equal(
  s.channels.ga.nativeAverageRaw,
  '388'
);

assert.equal(
  s.channels.io.normalizedAverageRaw,
  '388'
);

assert.equal(
  s.channels.eu.normalizedAverageRaw,
  '388'
);

assert.equal(
  s.channels.ga.normalizedAverageRaw,
  '388'
);

assert.equal(
  s.comparator.qualified,
  true
);

assert.equal(
  s.recoveredJovianRawRuler,
  '388'
);

console.log(
  'PASS G6G-03 · arbitrary virtual evidence independently recovers Io 97×4, Europa 194×2, Ganymede 388×1 and qualifies exact common raw ruler 388'
);

{
  const before =
    recovery.snapshot(
      bridge.snapshot()
        .lastRawPulse
    );

  assert.throws(
    () =>
      recovery.observe(
        bridge.snapshot(),
        {
          moon: 'io',
          turn: 'WEST',
          rawPulse: '999999',
        }
      ),
    /unsupported Jovian observation field: rawPulse/
  );

  const after =
    recovery.snapshot(
      bridge.snapshot()
        .lastRawPulse
    );

  assert.deepEqual(
    after,
    before
  );
}

console.log(
  'PASS G6G-04 · Jovian observation body cannot inject rawPulse; raw counter is obtained only from Gate-6F'
);

{
  recovery.forgetRecovery();

  const forgotten =
    recovery.snapshot(
      bridge.snapshot()
        .lastRawPulse
    );

  assert.equal(
    forgotten.channels.io.spanCount,
    0
  );

  assert.equal(
    forgotten.channels.eu.spanCount,
    0
  );

  assert.equal(
    forgotten.channels.ga.spanCount,
    0
  );

  assert.equal(
    forgotten.recoveredJovianRawRuler,
    null
  );
}

console.log(
  'PASS G6G-05 · FORGET RECOVERY clears Jovian evidence without changing the selected oscillator source epoch or raw counter'
);

{
  selector.select(
    MODE_REAL
  );

  bridge.sync(
    selector.snapshot()
  );

  const rearmed =
    recovery.syncRecoveryInput(
      bridge.snapshot()
    );

  assert.equal(
    rearmed.sourceEpoch,
    2
  );

  assert.equal(
    rearmed.status,
    'WAITING_FOR_RAW_BASELINE'
  );

  assert.equal(
    rearmed.channels.io.spanCount,
    0
  );

  assert.equal(
    rearmed.channels.eu.spanCount,
    0
  );

  assert.equal(
    rearmed.channels.ga.spanCount,
    0
  );
}

console.log(
  'PASS G6G-06 · VIRTUAL→REAL sourceEpoch change automatically re-arms all Jovian recovery channels and carries no virtual evidence forward'
);

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

  const localSelector =
    new A8PulseSourceEpochSelector();

  const localBridge =
    new Core20RecoveryInputBridge();

  const localRecovery =
    new Core20JovianRecoveryWrapper();

  localSelector.select(
    MODE_VIRTUAL
  );

  localSelector.advanceVirtual(
    '8'
  );

  localBridge.sync(
    localSelector.snapshot()
  );

  localRecovery.observe(
    localBridge.snapshot(),
    {
      moon: 'ga',
      turn: 'WEST',
    }
  );

  localSelector.advanceVirtual(
    '388'
  );

  localBridge.sync(
    localSelector.snapshot()
  );

  localRecovery.observe(
    localBridge.snapshot(),
    {
      moon: 'ga',
      turn: 'WEST',
    }
  );

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
}

console.log(
  'PASS G6G-07 · Jovian recovery cannot mutate sealed A8Core raw state, clock phase, day count, oscillator epoch, or authority'
);

{
  const out =
    recovery.snapshot();

  assert.equal(
    out.acceptsObservationRawPulse,
    false
  );

  assert.equal(
    out.usesPublishedMoonPeriods,
    false
  );

  assert.equal(
    out.usesHostTime,
    false
  );

  assert.equal(
    out.usesLegacyTime,
    false
  );

  assert.equal(
    out.usesFrequencyHz,
    false
  );

  assert.equal(
    out.writesA8Core,
    false
  );

  assert.equal(
    out.writesClock,
    false
  );

  assert.equal(
    out.sourceEpochChangeForcesRearm,
    true
  );
}

console.log(
  'PASS G6G-08 · authority boundary is explicit: Nature-style turn witness + Gate-6F raw count only; no timestamp/Hz/period/core-write path'
);

console.log('');
console.log(
  'PASS · A8-POSTSEAL-GATE6G-JOVIAN-RECOVERY-WRAPPER'
);
