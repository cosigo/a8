'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { A8Core } =
  require('../core/a8-core');

const {
  SAMPLE_SCHEMA,
  SAMPLE_SOURCE,
} = require(
  '../hardware/a8-external-pulse-rig-contract'
);

const {
  MODE_VIRTUAL,
  MODE_REAL,
  VIRTUAL_RIG_ID,
  A8PulseSourceEpochSelector,
} = require(
  '../hardware/a8-pulse-source-selector'
);

const sourcePath = path.join(
  __dirname,
  '..',
  'hardware',
  'a8-pulse-source-selector.js'
);

const source =
  fs.readFileSync(
    sourcePath,
    'utf8'
  );

console.log(
  'A8 post-seal hardware branch · Gate 6E virtual/real source epoch selector proof'
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
  'STELLAR_MERIDIAN',
  'SOL_CELESTIAL_DIRECTION',
  'MEAN_SUN',
  'SOLAR_MERIDIAN',
  'DAY_PHASE17',
  'PHASE20',
]) {
  assert(
    !executable.includes(
      forbidden
    ),
    `selector contains forbidden path: ${forbidden}`
  );
}

console.log(
  'PASS G6E-01 · selector has no A8Core, host-time, timed cadence, phase, authority, or Earth-observer path'
);

{
  const selector =
    new A8PulseSourceEpochSelector();

  let s = selector.snapshot();

  assert.equal(s.mode, 'NONE');
  assert.equal(s.sourceEpoch, 0);

  s = selector.select(
    MODE_VIRTUAL
  );

  assert.equal(s.mode, 'VIRTUAL');
  assert.equal(s.sourceEpoch, 1);
  assert.equal(
    s.gate6a.sampleCount,
    0
  );
  assert.equal(
    s.gate6a.firstRawPulse,
    null
  );

  selector.advanceVirtual('8');
  selector.advanceVirtual('64');

  s = selector.snapshot();

  assert.equal(
    s.activeRig,
    VIRTUAL_RIG_ID
  );

  assert.equal(
    s.gate6a.firstRawPulse,
    '8'
  );

  assert.equal(
    s.gate6a.lastRawPulse,
    '72'
  );

  assert.equal(
    s.gate6a.lastDeltaRawPulse,
    '64'
  );
}

console.log(
  'PASS G6E-02 · VIRTUAL mode emits only exact Gate-6A rig/rawPulse observations from explicit raw-edge advances'
);

{
  const selector =
    new A8PulseSourceEpochSelector();

  selector.select(
    MODE_VIRTUAL
  );

  selector.advanceVirtual(
    '1000'
  );

  let before =
    selector.snapshot();

  assert.equal(
    before.gate6a.lastRawPulse,
    '1000'
  );

  const switched =
    selector.select(
      MODE_REAL
    );

  assert.equal(
    switched.sourceEpoch,
    2
  );

  assert.equal(
    switched.gate6a.sampleCount,
    0
  );

  assert.equal(
    switched.gate6a.firstRawPulse,
    null
  );

  assert.equal(
    switched.gate6a.lastRawPulse,
    null
  );

  assert.equal(
    switched.lastSwitch.baselineCleared,
    true
  );

  assert.equal(
    switched.lastSwitch.counterContinuityCarried,
    false
  );

  selector.ingestRealSample({
    schema:
      SAMPLE_SCHEMA,
    source:
      SAMPLE_SOURCE,
    rig:
      'ARDUINO_REAL_A',
    rawPulse:
      '17',
  });

  const real =
    selector.snapshot();

  assert.equal(
    real.gate6a.firstRawPulse,
    '17'
  );

  assert.equal(
    real.gate6a.lastRawPulse,
    '17'
  );

  assert.equal(
    real.gate6a.totalObservedRawPulseAdvance,
    '0'
  );
}

console.log(
  'PASS G6E-03 · VIRTUAL→REAL switch increments source epoch and establishes real rawPulse 17 as a fresh baseline instead of splicing it to virtual 1000'
);

{
  const selector =
    new A8PulseSourceEpochSelector();

  selector.select(
    MODE_REAL
  );

  selector.ingestRealSample({
    schema:
      SAMPLE_SCHEMA,
    source:
      SAMPLE_SOURCE,
    rig:
      'ARDUINO_REAL_A',
    rawPulse:
      '500',
  });

  selector.ingestRealSample({
    schema:
      SAMPLE_SCHEMA,
    source:
      SAMPLE_SOURCE,
    rig:
      'ARDUINO_REAL_A',
    rawPulse:
      '580',
  });

  const switched =
    selector.select(
      MODE_VIRTUAL
    );

  assert.equal(
    switched.sourceEpoch,
    2
  );

  assert.equal(
    switched.gate6a.sampleCount,
    0
  );

  selector.advanceVirtual(
    '8'
  );

  const virtual =
    selector.snapshot();

  assert.equal(
    virtual.gate6a.firstRawPulse,
    '8'
  );

  assert.equal(
    virtual.gate6a.totalObservedRawPulseAdvance,
    '0'
  );
}

console.log(
  'PASS G6E-04 · REAL→VIRTUAL likewise starts a new raw-count epoch and manufactures no counter or phase continuity'
);

{
  const selector =
    new A8PulseSourceEpochSelector();

  selector.select(
    MODE_VIRTUAL
  );

  const epoch =
    selector.sourceEpoch;

  selector.select(
    MODE_VIRTUAL
  );

  assert.equal(
    selector.sourceEpoch,
    epoch
  );
}

console.log(
  'PASS G6E-05 · selecting the already-active source is idempotent and cannot silently reset the active epoch'
);

{
  const selector =
    new A8PulseSourceEpochSelector();

  selector.select(
    MODE_REAL
  );

  assert.throws(
    () => selector.advanceVirtual('1'),
    /requires VIRTUAL source mode/
  );

  assert.throws(
    () =>
      selector.ingestRealSample({
        schema:
          SAMPLE_SCHEMA,
        source:
          SAMPLE_SOURCE,
        rig:
          VIRTUAL_RIG_ID,
        rawPulse:
          '1',
      }),
    /rejects virtual rig identity/
  );

  selector.select(
    MODE_VIRTUAL
  );

  assert.throws(
    () =>
      selector.ingestRealSample({
        schema:
          SAMPLE_SCHEMA,
        source:
          SAMPLE_SOURCE,
        rig:
          'ARDUINO_REAL_A',
        rawPulse:
          '1',
      }),
    /requires REAL source mode/
  );

  for (const bad of [
    '0',
    '-1',
    '1.5',
    'abc',
  ]) {
    assert.throws(
      () =>
        selector.advanceVirtual(
          bad
        ),
      /positive integer/
    );
  }
}

console.log(
  'PASS G6E-06 · virtual and real inputs are mutually exclusive by active mode and virtual raw-edge advances must be explicit positive integers'
);

{
  const selector =
    new A8PulseSourceEpochSelector();

  selector.select(
    MODE_VIRTUAL
  );

  selector.advanceVirtual(
    '8'
  );

  const s =
    selector.snapshot();

  assert.equal(
    s.counterContinuityAcrossSourceSwitch,
    false
  );

  assert.equal(
    s.phaseContinuityManufacturedAcrossSourceSwitch,
    false
  );

  assert.equal(
    s.switchRequiresFreshRawBaseline,
    true
  );

  assert.equal(
    s.definingPayload,
    'EXTERNAL_PULSE_RIG + rig + rawPulse'
  );

  assert.equal(
    s.virtualRig.usesTimer,
    false
  );

  assert.equal(
    s.virtualRig.usesHostTime,
    false
  );

  assert.equal(
    s.virtualRig.usesFrequencyHz,
    false
  );

  assert.equal(
    s.writesA8Core,
    false
  );

  assert.equal(
    s.writesClock,
    false
  );

  assert.equal(
    s.writesPhase,
    false
  );

  assert.equal(
    s.writesAuthority,
    false
  );
}

console.log(
  'PASS G6E-07 · selector explicitly forbids cross-source continuity fabrication and keeps virtual generation free of timer/Hz authority'
);

{
  const c =
    new A8Core({
      oscillator: 73,
    });

  const before = {
    rawTicks: c.rawTicks,
    naturalStep: c.naturalStep,
    oscillatorEpoch: c.oscillatorEpoch,
    dayPhase17: c.dayPhase17,
    dayCount: c.dayCount,
    selectedAuthority: c.selectedAuthority,
  };

  const selector =
    new A8PulseSourceEpochSelector();

  selector.select(
    MODE_VIRTUAL
  );

  selector.advanceVirtual(
    '512'
  );

  selector.select(
    MODE_REAL
  );

  selector.ingestRealSample({
    schema:
      SAMPLE_SCHEMA,
    source:
      SAMPLE_SOURCE,
    rig:
      'ARDUINO_REAL_A',
    rawPulse:
      '23',
  });

  const after = {
    rawTicks: c.rawTicks,
    naturalStep: c.naturalStep,
    oscillatorEpoch: c.oscillatorEpoch,
    dayPhase17: c.dayPhase17,
    dayCount: c.dayCount,
    selectedAuthority: c.selectedAuthority,
  };

  assert.deepEqual(
    after,
    before
  );
}

console.log(
  'PASS G6E-08 · complete virtual→real epoch switch cannot mutate A8Core raw state, oscillator epoch, clock phase, day count, or authority'
);

console.log('');
console.log(
  'PASS · A8-POSTSEAL-GATE6E-VIRTUAL-REAL-PULSE-SOURCE-EPOCH-SELECTOR'
);
