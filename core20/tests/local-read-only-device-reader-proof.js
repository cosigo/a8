'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { A8Core } = require('../core/a8-core');

const {
  readDevicePathReceiveOnly,
} = require('../hardware/a8-local-read-only-device-reader');

const readerPath = path.join(
  __dirname,
  '..',
  'hardware',
  'a8-local-read-only-device-reader.js'
);

const fixturePath = path.resolve(
  __dirname,
  '..',
  'experiments',
  'gate6c-device-path-fixture.ndjson'
);

const source = fs.readFileSync(
  readerPath,
  'utf8'
);

console.log(
  'A8 post-seal hardware branch · Gate 6C local OS read-only device-path reader proof'
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
  'createWriteStream',
  'writeFile',
  'appendFile',
  'openSync',
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
    `device reader contains forbidden dependency/path: ${forbidden}`
  );
}

assert(
  executable.includes("flags: 'r'"),
  'device reader must explicitly open the OS path read-only'
);

for (const forbiddenFlag of [
  "flags: 'w'",
  "flags: 'w+'",
  "flags: 'a'",
  "flags: 'a+'",
  "flags: 'r+'",
]) {
  assert(
    !executable.includes(forbiddenFlag),
    `device reader contains write-capable open flag: ${forbiddenFlag}`
  );
}

console.log(
  'PASS G6C-01 · reader uses explicit read-only OS open semantics and contains no write-capable descriptor, network, host-time, timer, phase, authority, or outbound path'
);

async function readAt(chunkBytes) {
  return readDevicePathReceiveOnly(
    fixturePath,
    {
      chunkBytes,
    }
  );
}

(async () => {
  {
    const r = await readAt(64);

    assert.equal(
      r.role,
      'LOCAL_OS_RECEIVE_ONLY_DEVICE_PATH_READER'
    );

    assert.equal(
      r.mode,
      'READ_ONLY_FILE_DESCRIPTOR'
    );

    assert.equal(
      r.deviceOpenMode,
      'READ_ONLY'
    );

    assert.equal(
      r.transport.gate6a.rig,
      'ARDUINO_A'
    );

    assert.equal(
      r.transport.gate6a.firstRawPulse,
      '2000'
    );

    assert.equal(
      r.transport.gate6a.lastRawPulse,
      '2400'
    );

    assert.equal(
      r.transport.gate6a.lastDeltaRawPulse,
      '277'
    );

    assert.equal(
      r.transport.gate6a.totalObservedRawPulseAdvance,
      '400'
    );
  }

  console.log(
    'PASS G6C-02 · local OS path reader feeds the unchanged Gate-6B/Gate-6A chain and preserves exact raw-count observations'
  );

  {
    const one =
      await readAt(1);

    const seven =
      await readAt(7);

    const large =
      await readAt(4096);

    assert.deepEqual(
      one.transport.gate6a,
      seven.transport.gate6a
    );

    assert.deepEqual(
      seven.transport.gate6a,
      large.transport.gate6a
    );

    assert.notEqual(
      one.osReadChunkCount,
      seven.osReadChunkCount
    );

    assert.notEqual(
      seven.osReadChunkCount,
      large.osReadChunkCount
    );

    assert.equal(
      one.osReadByteCount,
      seven.osReadByteCount
    );

    assert.equal(
      seven.osReadByteCount,
      large.osReadByteCount
    );
  }

  console.log(
    'PASS G6C-03 · 1-byte, 7-byte, and 4096-byte OS read buffers produce identical A8 measurement state despite different OS chunk counts'
  );

  {
    const r =
      await readAt(7);

    assert.equal(
      r.osReadDiagnosticsAreAuthority,
      false
    );

    assert.equal(
      r.transportDiagnosticsAreAuthority,
      false
    );

    assert.equal(
      r.configuresSerialDevice,
      false
    );

    assert.equal(
      r.sendsBytes,
      false
    );

    assert.equal(
      r.commandsHardware,
      false
    );

    assert.equal(
      r.writesA8Core,
      false
    );

    assert.equal(
      r.writesClock,
      false
    );

    assert.equal(
      r.writesOscillator,
      false
    );

    assert.equal(
      r.writesDivider,
      false
    );

    assert.equal(
      r.writesAuthority,
      false
    );

    assert.equal(
      r.usesHostTime,
      false
    );

    assert.equal(
      r.usesLegacyTime,
      false
    );

    assert.equal(
      r.usesFrequencyHz,
      false
    );

    assert.equal(
      r.usesBaudAsTime,
      false
    );

    assert.equal(
      r.acceptsTimestamp,
      false
    );

    assert.equal(
      r.acceptsClockPhase,
      false
    );

    assert.equal(
      r.acceptsDividerRatio,
      false
    );
  }

  console.log(
    'PASS G6C-04 · OS read/chunk diagnostics and any underlying UART/USB cadence are explicitly non-authoritative'
  );

  {
    await assert.rejects(
      () => readDevicePathReceiveOnly(
        'relative/device',
        {
          chunkBytes: 8,
        }
      ),
      /devicePath must be absolute/
    );

    await assert.rejects(
      () => readDevicePathReceiveOnly(
        fixturePath,
        {
          chunkBytes: 0,
        }
      ),
      /chunkBytes must be an integer/
    );
  }

  console.log(
    'PASS G6C-05 · reader requires an explicit absolute local OS path and bounded transport-buffer size'
  );

  {
    const badPath = path.join(
      __dirname,
      '..',
      'experiments',
      'gate6c-bad-timestamp-fixture.tmp'
    );

    fs.writeFileSync(
      badPath,
      JSON.stringify({
        schema:
          'A8-EXTERNAL-PULSE-RIG-SAMPLE-V1',
        source:
          'EXTERNAL_PULSE_RIG',
        rig:
          'ARDUINO_A',
        rawPulse:
          '3000',
        timestamp:
          '2026-08-24T00:00:00Z',
      }) + '\n',
      'ascii'
    );

    try {
      await assert.rejects(
        () => readDevicePathReceiveOnly(
          path.resolve(badPath),
          {
            chunkBytes: 5,
          }
        ),
        /unsupported sample field: timestamp/
      );
    } finally {
      fs.unlinkSync(badPath);
    }
  }

  console.log(
    'PASS G6C-06 · even through a real OS read stream, timestamp metadata cannot cross the unchanged Gate-6A contract'
  );

  {
    const badPath = path.join(
      __dirname,
      '..',
      'experiments',
      'gate6c-bad-command-fixture.tmp'
    );

    fs.writeFileSync(
      badPath,
      JSON.stringify({
        schema:
          'A8-EXTERNAL-PULSE-RIG-SAMPLE-V1',
        source:
          'EXTERNAL_PULSE_RIG',
        rig:
          'ARDUINO_A',
        rawPulse:
          '3000',
        command:
          'TRIM',
      }) + '\n',
      'ascii'
    );

    try {
      await assert.rejects(
        () => readDevicePathReceiveOnly(
          path.resolve(badPath),
          {
            chunkBytes: 9,
          }
        ),
        /unsupported sample field: command/
      );
    } finally {
      fs.unlinkSync(badPath);
    }
  }

  console.log(
    'PASS G6C-07 · hardware command metadata cannot be received through the Gate-6C→6B→6A chain'
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

    await readAt(3);

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
    'PASS G6C-08 · complete local OS read-stream replay cannot mutate A8Core raw state, oscillator epoch, clock phase, day count, or authority'
  );

  console.log('');
  console.log(
    'PASS · A8-POSTSEAL-GATE6C-LOCAL-OS-READ-ONLY-DEVICE-PATH-READER'
  );
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
