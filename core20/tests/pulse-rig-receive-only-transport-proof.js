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

const {
  PulseRigReceiveOnlyTransport,
} = require('../hardware/a8-pulse-rig-receive-only-transport');

const adapterPath = path.join(
  __dirname,
  '..',
  'hardware',
  'a8-pulse-rig-receive-only-transport.js'
);

const fixturePath = path.join(
  __dirname,
  '..',
  'experiments',
  'gate6b-serial-shaped-fixture.ndjson'
);

const source = fs.readFileSync(
  adapterPath,
  'utf8'
);

const fixture = fs.readFileSync(
  fixturePath
);

console.log(
  'A8 post-seal hardware branch · Gate 6B receive-only transport proof'
);

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
  "require('child_process')",
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
  'DAY_PHASE17',
  'PHASE20',
]) {
  assert(
    !executable.includes(forbidden),
    `receive-only transport contains forbidden dependency/path: ${forbidden}`
  );
}

for (const forbiddenOutbound of [
  '.write(',
  '.send(',
  '.transmit(',
  '.command(',
]) {
  assert(
    !executable.includes(forbiddenOutbound),
    `receive-only transport contains outbound method pattern: ${forbiddenOutbound}`
  );
}

console.log(
  'PASS G6B-01 · adapter contains no real serial/network device, host-time, timer, A8Core, phase, authority, or outbound command path'
);

function snapshotsFromChunks(chunks) {
  const transport =
    new PulseRigReceiveOnlyTransport();

  const accepted = [];

  for (const chunk of chunks) {
    accepted.push(
      ...transport.receiveChunk(chunk)
    );
  }

  const end = transport.end();

  return {
    accepted,
    end,
  };
}

{
  const r = snapshotsFromChunks([
    fixture,
  ]);

  assert.equal(r.accepted.length, 3);

  assert.equal(
    r.end.role,
    'RECEIVE_ONLY_SERIAL_SHAPED_ADAPTER'
  );

  assert.equal(
    r.end.mode,
    'SIMULATED_BYTE_STREAM_ONLY'
  );

  assert.equal(
    r.end.acceptedFrameCount,
    3
  );

  assert.equal(
    r.end.pendingByteCount,
    0
  );

  assert.equal(
    r.end.gate6a.rig,
    'ARDUINO_A'
  );

  assert.equal(
    r.end.gate6a.firstRawPulse,
    '1000'
  );

  assert.equal(
    r.end.gate6a.lastRawPulse,
    '1250'
  );

  assert.equal(
    r.end.gate6a.lastDeltaRawPulse,
    '153'
  );

  assert.equal(
    r.end.gate6a.totalObservedRawPulseAdvance,
    '250'
  );
}

console.log(
  'PASS G6B-02 · serial-shaped NDJSON fixture reduces exactly to the unchanged Gate-6A raw-count observer result'
);

{
  const whole = snapshotsFromChunks([
    fixture,
  ]);

  const cuts = [
    fixture.subarray(0, 7),
    fixture.subarray(7, 41),
    fixture.subarray(41, 103),
    fixture.subarray(103, 172),
    fixture.subarray(172, 215),
    fixture.subarray(215),
  ];

  const fragmented =
    snapshotsFromChunks(cuts);

  const bytes = [...fixture].map(
    byte => Buffer.from([byte])
  );

  const bytewise =
    snapshotsFromChunks(bytes);

  assert.deepEqual(
    fragmented.accepted,
    whole.accepted
  );

  assert.deepEqual(
    bytewise.accepted,
    whole.accepted
  );

  assert.deepEqual(
    fragmented.end.gate6a,
    whole.end.gate6a
  );

  assert.deepEqual(
    bytewise.end.gate6a,
    whole.end.gate6a
  );

  assert.notEqual(
    fragmented.end.receivedChunkCount,
    whole.end.receivedChunkCount
  );

  assert.notEqual(
    bytewise.end.receivedChunkCount,
    whole.end.receivedChunkCount
  );
}

console.log(
  'PASS G6B-03 · all-at-once, arbitrary fragmentation, and one-byte-at-a-time delivery produce identical Gate-6A measurement state'
);

{
  const transport =
    new PulseRigReceiveOnlyTransport();

  const firstLine =
    fixture.subarray(
      0,
      fixture.indexOf(0x0a) + 1
    );

  transport.receiveChunk(
    firstLine.subarray(0, 5)
  );

  let s = transport.snapshot();

  assert.equal(
    s.acceptedFrameCount,
    0
  );

  assert(
    s.pendingByteCount > 0
  );

  transport.receiveChunk(
    firstLine.subarray(5)
  );

  s = transport.snapshot();

  assert.equal(
    s.acceptedFrameCount,
    1
  );

  assert.equal(
    s.gate6a.lastRawPulse,
    '1000'
  );
}

console.log(
  'PASS G6B-04 · partial serial frames create no pulse observation until the terminating newline completes one full Gate-6A event'
);

{
  const observer =
    new ExternalPulseRigObserver();

  const transport =
    new PulseRigReceiveOnlyTransport({
      observer,
    });

  const bad = Buffer.from(
    JSON.stringify({
      schema: SAMPLE_SCHEMA,
      source: SAMPLE_SOURCE,
      rig: 'ARDUINO_A',
      rawPulse: '1000',
      timestamp: '2026-08-24T00:00:00Z',
    }) + '\n',
    'ascii'
  );

  assert.throws(
    () => transport.receiveChunk(bad),
    /unsupported sample field: timestamp/
  );

  assert.equal(
    observer.snapshot().sampleCount,
    0
  );
}

console.log(
  'PASS G6B-05 · transport cannot smuggle a host timestamp through the unchanged Gate-6A defining sample contract'
);

{
  for (const [field, value] of [
    ['seconds', 1],
    ['a8Seconds', 1],
    ['frequencyHz', 9600],
    ['baud', 9600],
    ['phase', 12],
    ['dividerRatio', '1/8'],
    ['command', 'TRIM'],
  ]) {
    const transport =
      new PulseRigReceiveOnlyTransport();

    const event = {
      schema: SAMPLE_SCHEMA,
      source: SAMPLE_SOURCE,
      rig: 'ARDUINO_A',
      rawPulse: '1000',
      [field]: value,
    };

    const frame = Buffer.from(
      JSON.stringify(event) + '\n',
      'ascii'
    );

    assert.throws(
      () => transport.receiveChunk(frame),
      new RegExp(
        `unsupported sample field: ${field}`
      )
    );
  }
}

console.log(
  'PASS G6B-06 · seconds/A8-seconds/frequency/baud/phase/divider/command metadata cannot cross the transport boundary'
);

{
  const transport =
    new PulseRigReceiveOnlyTransport();

  assert.throws(
    () => transport.receiveChunk(
      Buffer.from(
        '{"not":"json"\n',
        'ascii'
      )
    ),
    /invalid transport JSON frame/
  );

  assert.throws(
    () => transport.receiveChunk(
      Buffer.from([0xff, 0x0a])
    ),
    /ASCII bytes only/
  );

  assert.throws(
    () => transport.receiveChunk(
      Buffer.from([0x00, 0x0a])
    ),
    /rejects NUL bytes/
  );
}

console.log(
  'PASS G6B-07 · malformed JSON, non-ASCII transport data, and NUL bytes are rejected before measurement acceptance'
);

{
  const transport =
    new PulseRigReceiveOnlyTransport({
      maxFrameBytes: 128,
    });

  const tooLong = Buffer.from(
    'x'.repeat(129),
    'ascii'
  );

  assert.throws(
    () => transport.receiveChunk(
      tooLong
    ),
    /unterminated transport frame exceeds maxFrameBytes/
  );

  const incomplete =
    new PulseRigReceiveOnlyTransport();

  incomplete.receiveChunk(
    Buffer.from(
      '{"schema":"A8-EXTERNAL',
      'ascii'
    )
  );

  assert.throws(
    () => incomplete.end(),
    /ended with incomplete frame/
  );
}

console.log(
  'PASS G6B-08 · overlong and incomplete serial-shaped frames fail closed rather than manufacturing pulse observations'
);

{
  const r = snapshotsFromChunks([
    fixture,
  ]);

  assert.equal(
    r.end.transportDiagnosticsAreAuthority,
    false
  );

  assert.equal(
    r.end.usesRealSerialDevice,
    false
  );

  assert.equal(
    r.end.usesUsbDevice,
    false
  );

  assert.equal(
    r.end.usesNetworkTransport,
    false
  );

  assert.equal(
    r.end.sendsBytes,
    false
  );

  assert.equal(
    r.end.commandsHardware,
    false
  );

  assert.equal(
    r.end.writesA8Core,
    false
  );

  assert.equal(
    r.end.writesClock,
    false
  );

  assert.equal(
    r.end.writesOscillator,
    false
  );

  assert.equal(
    r.end.writesDivider,
    false
  );

  assert.equal(
    r.end.writesAuthority,
    false
  );

  assert.equal(
    r.end.usesHostTime,
    false
  );

  assert.equal(
    r.end.usesLegacyTime,
    false
  );

  assert.equal(
    r.end.usesFrequencyHz,
    false
  );

  assert.equal(
    r.end.usesBaudAsTime,
    false
  );
}

console.log(
  'PASS G6B-09 · transport byte/chunk diagnostics are explicitly non-authoritative and no conventional communication timing enters A8 measurement'
);

{
  const c = new A8Core({
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

  snapshotsFromChunks([
    fixture.subarray(0, 37),
    fixture.subarray(37, 91),
    fixture.subarray(91),
  ]);

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
  'PASS G6B-10 · complete receive-only transport replay cannot mutate A8Core raw state, oscillator epoch, clock phase, day count, or authority'
);

console.log('');
console.log(
  'PASS · A8-POSTSEAL-GATE6B-RECEIVE-ONLY-SERIAL-SHAPED-TRANSPORT'
);
