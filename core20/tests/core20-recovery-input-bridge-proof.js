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

const sourcePath = path.join(
  __dirname,
  '..',
  'hardware',
  'a8-core20-recovery-input-bridge.js'
);

const source =
  fs.readFileSync(
    sourcePath,
    'utf8'
  );

console.log(
  'A8 post-seal hardware branch · Gate 6F Core-20 recovery-input bridge proof'
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
    !executable.includes(forbidden),
    `bridge contains forbidden path: ${forbidden}`
  );
}

console.log(
  'PASS G6F-01 · bridge contains no A8Core import, host time, timer, phase, authority, divider, or Earth-observer path'
);

{
  const selector =
    new A8PulseSourceEpochSelector();

  const bridge =
    new Core20RecoveryInputBridge();

  selector.select(
    MODE_VIRTUAL
  );

  let b =
    bridge.sync(
      selector.snapshot()
    );

  assert.equal(
    b.status,
    'REARMED_WAITING_RAW_BASELINE'
  );

  assert.equal(
    b.sourceEpoch,
    1
  );

  assert.equal(
    b.recoveryInput,
    null
  );

  console.log(
    'PASS G6F-02 · selecting VIRTUAL arms epoch 1 but creates no raw-oscillator input before a Gate-6A baseline exists'
  );

  selector.advanceVirtual(
    '8'
  );

  b =
    bridge.sync(
      selector.snapshot()
    );

  assert.equal(
    b.status,
    'RAW_BASELINE_ESTABLISHED'
  );

  assert.equal(
    b.baselineRawPulse,
    '8'
  );

  assert.equal(
    b.lastRawPulse,
    '8'
  );

  assert.equal(
    b.epochRawAdvance,
    '0'
  );

  assert.equal(
    b.recoveryInput.schema,
    'A8-CORE20-RAW-OSCILLATOR-INPUT-V1'
  );

  assert.equal(
    b.recoveryInput.rig,
    'VIRTUAL_RIG_A'
  );

  assert.equal(
    b.recoveryInput.rawPulse,
    '8'
  );

  console.log(
    'PASS G6F-03 · first virtual raw count becomes fresh epoch baseline only and produces qualified Core-20 raw-oscillator state'
  );

  selector.advanceVirtual(
    '64'
  );

  b =
    bridge.sync(
      selector.snapshot()
    );

  assert.equal(
    b.status,
    'RAW_OSCILLATOR_INPUT_ACTIVE'
  );

  assert.equal(
    b.lastRawPulse,
    '72'
  );

  assert.equal(
    b.epochRawAdvance,
    '64'
  );

  assert.equal(
    b.acceptedRawStates,
    2
  );

  console.log(
    'PASS G6F-04 · later higher raw count activates forward Core-20 raw-oscillator input with exact epoch-local advance'
  );

  const same =
    bridge.sync(
      selector.snapshot()
    );

  assert.equal(
    same.acceptedRawStates,
    2
  );

  assert.equal(
    same.lastRawPulse,
    '72'
  );

  console.log(
    'PASS G6F-05 · repeated synchronization of the same selector snapshot is idempotent'
  );
}

{
  const selector =
    new A8PulseSourceEpochSelector();

  const bridge =
    new Core20RecoveryInputBridge();

  selector.select(
    MODE_VIRTUAL
  );

  selector.advanceVirtual(
    '1000'
  );

  selector.advanceVirtual(
    '250'
  );

  let b =
    bridge.sync(
      selector.snapshot()
    );

  assert.equal(
    b.lastRawPulse,
    '1250'
  );

  selector.select(
    MODE_REAL
  );

  b =
    bridge.sync(
      selector.snapshot()
    );

  assert.equal(
    b.sourceEpoch,
    2
  );

  assert.equal(
    b.status,
    'REARMED_WAITING_RAW_BASELINE'
  );

  assert.equal(
    b.lastRawPulse,
    null
  );

  assert.equal(
    b.baselineRawPulse,
    null
  );

  assert.equal(
    b.recoveryInput,
    null
  );

  assert.equal(
    b.rearmCount,
    1
  );

  selector.ingestRealSample({
    schema:
      'A8-EXTERNAL-PULSE-RIG-SAMPLE-V1',
    source:
      'EXTERNAL_PULSE_RIG',
    rig:
      'ARDUINO_REAL_A',
    rawPulse:
      '17',
  });

  b =
    bridge.sync(
      selector.snapshot()
    );

  assert.equal(
    b.baselineRawPulse,
    '17'
  );

  assert.equal(
    b.lastRawPulse,
    '17'
  );

  assert.equal(
    b.epochRawAdvance,
    '0'
  );

  assert.equal(
    b.recoveryInput.sourceEpoch,
    2
  );

  console.log(
    'PASS G6F-06 · VIRTUAL 1250 → REAL 17 forces re-arm and treats real 17 as a fresh baseline rather than a negative or spliced delta'
  );
}

{
  const selector =
    new A8PulseSourceEpochSelector();

  const bridge =
    new Core20RecoveryInputBridge();

  selector.select(
    MODE_REAL
  );

  selector.ingestRealSample({
    schema:
      'A8-EXTERNAL-PULSE-RIG-SAMPLE-V1',
    source:
      'EXTERNAL_PULSE_RIG',
    rig:
      'ARDUINO_REAL_A',
    rawPulse:
      '500',
  });

  bridge.sync(
    selector.snapshot()
  );

  selector.select(
    MODE_VIRTUAL
  );

  let b =
    bridge.sync(
      selector.snapshot()
    );

  assert.equal(
    b.status,
    'REARMED_WAITING_RAW_BASELINE'
  );

  selector.advanceVirtual(
    '8'
  );

  b =
    bridge.sync(
      selector.snapshot()
    );

  assert.equal(
    b.baselineRawPulse,
    '8'
  );

  assert.equal(
    b.epochRawAdvance,
    '0'
  );

  console.log(
    'PASS G6F-07 · REAL→VIRTUAL likewise re-arms and starts the new virtual epoch from its own fresh raw baseline'
  );
}

{
  const selector =
    new A8PulseSourceEpochSelector();

  const bridge =
    new Core20RecoveryInputBridge();

  selector.select(
    MODE_VIRTUAL
  );

  selector.advanceVirtual(
    '512'
  );

  let b =
    bridge.sync(
      selector.snapshot()
    );

  assert.equal(
    b.sourceEpochChangeForcesRearm,
    true
  );

  assert.equal(
    b.carriesCounterContinuityAcrossEpoch,
    false
  );

  assert.equal(
    b.manufacturesPhaseContinuity,
    false
  );

  assert.equal(
    b.writesA8Core,
    false
  );

  assert.equal(
    b.writesClock,
    false
  );

  assert.equal(
    b.writesPhase,
    false
  );

  assert.equal(
    b.writesAuthority,
    false
  );

  assert.equal(
    b.usesHostTime,
    false
  );

  assert.equal(
    b.usesFrequencyHz,
    false
  );

  console.log(
    'PASS G6F-08 · bridge explicitly exposes re-arm/no-splice/no-phase/no-time-authority boundaries'
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

  const selector =
    new A8PulseSourceEpochSelector();

  const bridge =
    new Core20RecoveryInputBridge();

  selector.select(
    MODE_VIRTUAL
  );

  selector.advanceVirtual(
    '8'
  );

  bridge.sync(
    selector.snapshot()
  );

  selector.advanceVirtual(
    '64'
  );

  bridge.sync(
    selector.snapshot()
  );

  selector.select(
    MODE_REAL
  );

  bridge.sync(
    selector.snapshot()
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

  console.log(
    'PASS G6F-09 · complete selected-source bridge exercise cannot mutate sealed A8Core raw state, oscillator epoch, clock phase, day count, or authority'
  );
}

console.log('');
console.log(
  'PASS · A8-POSTSEAL-GATE6F-CORE20-RAW-OSCILLATOR-RECOVERY-INPUT-BRIDGE'
);
