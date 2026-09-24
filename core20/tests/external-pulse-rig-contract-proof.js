'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { A8Core } = require('../core/a8-core');

const {
  SAMPLE_SCHEMA,
  SAMPLE_SOURCE,
  ExternalPulseRigObserver,
} = require('../hardware/a8-external-pulse-rig-contract');

const sourcePath = path.join(
  __dirname,
  '..',
  'hardware',
  'a8-external-pulse-rig-contract.js'
);

const source = fs.readFileSync(sourcePath, 'utf8');

console.log('A8 post-seal hardware branch · Gate 6A external pulse-rig contract proof');

const executable = source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '');

for (const forbidden of [
  "require('../core",
  "require('./core",
  "require('serialport')",
  "require('http')",
  "require('https')",
  "require('net')",
  "require('dgram')",
  'fetch(',
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
  'TerraShipSlip',
  'DAY_PHASE17',
  'PHASE20',
]) {
  assert(
    !executable.includes(forbidden),
    `pulse-rig contract executable contains forbidden dependency/path: ${forbidden}`
  );
}

console.log('PASS G6A-01 · contract has no A8Core, transport, host-time, frequency, phase, divider-command, or Earth-observer path');

function sample(rig, rawPulse) {
  return {
    schema: SAMPLE_SCHEMA,
    source: SAMPLE_SOURCE,
    rig,
    rawPulse: String(rawPulse),
  };
}

{
  const observer = new ExternalPulseRigObserver();
  const s = observer.snapshot();

  assert.equal(s.role, 'EXTERNAL_RAW_PULSE_WITNESS');
  assert.equal(s.mode, 'READ_ONLY_OBSERVATION_CONTRACT');

  assert.equal(s.sampleCount, 0);
  assert.equal(s.firstRawPulse, null);
  assert.equal(s.lastRawPulse, null);

  assert.equal(s.writesA8Core, false);
  assert.equal(s.writesClock, false);
  assert.equal(s.writesOscillator, false);
  assert.equal(s.writesDivider, false);
  assert.equal(s.writesAuthority, false);

  assert.equal(s.commandsHardware, false);
  assert.equal(s.usesSerialTransport, false);
  assert.equal(s.usesNetworkTransport, false);

  assert.equal(s.usesHostTime, false);
  assert.equal(s.usesLegacyTime, false);
  assert.equal(s.usesFrequencyHz, false);
  assert.equal(s.usesExpectedOscillatorRate, false);
  assert.equal(s.acceptsClockPhase, false);
  assert.equal(s.acceptsDividerRatio, false);
}
console.log('PASS G6A-02 · empty observer is explicitly read-only and contains no transport/control/timing authority');

{
  const observer = new ExternalPulseRigObserver();

  let s = observer.observe(
    sample('ARDUINO_A', 1000)
  );

  assert.equal(s.rig, 'ARDUINO_A');
  assert.equal(s.sampleCount, 1);
  assert.equal(s.firstRawPulse, '1000');
  assert.equal(s.lastRawPulse, '1000');
  assert.equal(s.lastDeltaRawPulse, null);
  assert.equal(s.totalObservedRawPulseAdvance, '0');

  s = observer.observe(
    sample('ARDUINO_A', 1097)
  );

  assert.equal(s.sampleCount, 2);
  assert.equal(s.lastRawPulse, '1097');
  assert.equal(s.lastDeltaRawPulse, '97');
  assert.equal(s.totalObservedRawPulseAdvance, '97');

  s = observer.observe(
    sample('ARDUINO_A', 1250)
  );

  assert.equal(s.sampleCount, 3);
  assert.equal(s.lastRawPulse, '1250');
  assert.equal(s.lastDeltaRawPulse, '153');
  assert.equal(s.totalObservedRawPulseAdvance, '250');
}
console.log('PASS G6A-03 · arbitrary external rig samples preserve exact raw integer counts and derive only raw-count differences');

{
  const observer = new ExternalPulseRigObserver();

  observer.observe(
    sample('ARDUINO_A', 500)
  );

  assert.throws(
    () => observer.observe(
      sample('ARDUINO_A', 500)
    ),
    /rawPulse must increase strictly/
  );

  assert.throws(
    () => observer.observe(
      sample('ARDUINO_A', 499)
    ),
    /rawPulse must increase strictly/
  );
}
console.log('PASS G6A-04 · duplicate/backward raw counts are rejected rather than interpreted as elapsed time');

{
  const observer = new ExternalPulseRigObserver();

  observer.observe(
    sample('ARDUINO_A', 100)
  );

  assert.throws(
    () => observer.observe(
      sample('ARDUINO_B', 200)
    ),
    /observer is bound to rig ARDUINO_A/
  );
}
console.log('PASS G6A-05 · one observer instance binds to one explicit physical rig identity');

{
  for (const [field, value] of [
    ['timestamp', '2026-08-24T00:00:00Z'],
    ['seconds', 1],
    ['a8Seconds', 1],
    ['frequencyHz', 1000],
    ['phase', 12],
    ['dividerRatio', '1/8'],
    ['command', 'TRIM'],
  ]) {
    const observer = new ExternalPulseRigObserver();

    const event = sample('ARDUINO_A', 1000);
    event[field] = value;

    assert.throws(
      () => observer.observe(event),
      new RegExp(`unsupported sample field: ${field}`)
    );
  }
}
console.log('PASS G6A-06 · timestamp/seconds/Hz/phase/divider-ratio/command fields are all rejected by the defining hardware sample contract');

{
  const observer = new ExternalPulseRigObserver();

  assert.throws(
    () => observer.observe({
      schema: SAMPLE_SCHEMA,
      source: 'HOST_TIMER',
      rig: 'ARDUINO_A',
      rawPulse: '1000',
    }),
    /source must be EXTERNAL_PULSE_RIG/
  );

  assert.throws(
    () => observer.observe({
      schema: SAMPLE_SCHEMA,
      source: SAMPLE_SOURCE,
      rig: 'ARDUINO A',
      rawPulse: '1000',
    }),
    /rig must be 1-64 characters/
  );

  assert.throws(
    () => observer.observe({
      schema: SAMPLE_SCHEMA,
      source: SAMPLE_SOURCE,
      rig: 'ARDUINO_A',
      rawPulse: '-1',
    }),
    /rawPulse must be a non-negative integer/
  );
}
console.log('PASS G6A-07 · wrong source, ambiguous rig id, and non-counter rawPulse values are rejected');

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

  const observer = new ExternalPulseRigObserver();

  observer.observe(
    sample('ARDUINO_A', 1000)
  );

  observer.observe(
    sample('ARDUINO_A', 1097)
  );

  observer.observe(
    sample('ARDUINO_A', 1250)
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
}
console.log('PASS G6A-08 · external pulse-rig observations cannot mutate A8Core raw state, oscillator epoch, clock phase, day count, or authority');

console.log('');
console.log('PASS · A8-POSTSEAL-GATE6A-EXTERNAL-PULSE-RIG-READ-ONLY-CONTRACT');
