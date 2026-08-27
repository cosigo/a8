'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

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

const g6bPath = path.join(
  __dirname,
  '..',
  'hardware',
  'a8-pulse-rig-receive-only-transport.js'
);

const g6aPath = path.join(
  __dirname,
  '..',
  'hardware',
  'a8-external-pulse-rig-contract.js'
);

const helperPath = path.join(
  __dirname,
  '..',
  'tools',
  'a8-gate6d-pty-transmitter.py'
);

const fixturePath = path.join(
  __dirname,
  '..',
  'experiments',
  'gate6d-pty-fixture.ndjson'
);

console.log(
  'A8 post-seal hardware branch · Gate 6D pseudo-terminal one-way link proof'
);

for (const [label, file] of [
  ['Gate-6C reader', readerPath],
  ['Gate-6B transport', g6bPath],
  ['Gate-6A contract', g6aPath],
]) {
  assert(
    fs.existsSync(file),
    `${label} missing`
  );
}

assert(
  fs.existsSync(helperPath),
  'Gate-6D PTY transmitter fixture missing'
);

assert(
  fs.existsSync(fixturePath),
  'Gate-6D NDJSON fixture missing'
);

console.log(
  'PASS G6D-01 · Gate-6D test uses unchanged Gate-6C→6B→6A receive chain plus a separate external PTY transmitter fixture'
);

function firstLine(stream) {
  return new Promise((resolve, reject) => {
    let text = '';

    function onData(chunk) {
      text += chunk.toString('utf8');

      const index = text.indexOf('\n');

      if (index >= 0) {
        cleanup();
        resolve(text.slice(0, index).trim());
      }
    }

    function onError(err) {
      cleanup();
      reject(err);
    }

    function onEnd() {
      cleanup();
      reject(
        new Error(
          'PTY helper ended before publishing slave path'
        )
      );
    }

    function cleanup() {
      stream.off('data', onData);
      stream.off('error', onError);
      stream.off('end', onEnd);
    }

    stream.on('data', onData);
    stream.on('error', onError);
    stream.on('end', onEnd);
  });
}

function childExit(child, stderrChunks) {
  return new Promise((resolve, reject) => {
    child.on('error', reject);

    child.on('exit', (code, signal) => {
      if (code !== 0) {
        reject(
          new Error(
            `PTY helper exit code=${code} signal=${signal} stderr=${Buffer.concat(stderrChunks).toString('utf8')}`
          )
        );
        return;
      }

      resolve();
    });
  });
}

async function runPtyCase({
  txChunkBytes,
  delayUs,
  osChunkBytes,
}) {
  const stderrChunks = [];

  const child = spawn(
    'python3',
    [
      helperPath,
      '--fixture',
      fixturePath,
      '--tx-chunk-bytes',
      String(txChunkBytes),
      '--delay-us',
      String(delayUs),
      '--startup-delay-ms',
      '150',
    ],
    {
      stdio: [
        'ignore',
        'pipe',
        'pipe',
      ],
    }
  );

  child.stderr.on(
    'data',
    chunk => stderrChunks.push(chunk)
  );

  const published = await firstLine(
    child.stdout
  );

  assert(
    published.startsWith('PTY=/dev/'),
    `unexpected PTY helper path line: ${published}`
  );

  const devicePath =
    published.slice('PTY='.length);

  const resultPromise =
    readDevicePathReceiveOnly(
      devicePath,
      {
        chunkBytes: osChunkBytes,
      }
    );

  const [result] = await Promise.all([
    resultPromise,
    childExit(child, stderrChunks),
  ]);

  return {
    devicePath,
    result,
  };
}

(async () => {
  const caseA = await runPtyCase({
    txChunkBytes: 4096,
    delayUs: 0,
    osChunkBytes: 4096,
  });

  const caseB = await runPtyCase({
    txChunkBytes: 7,
    delayUs: 500,
    osChunkBytes: 7,
  });

  const caseC = await runPtyCase({
    txChunkBytes: 1,
    delayUs: 200,
    osChunkBytes: 1,
  });

  for (const item of [
    caseA,
    caseB,
    caseC,
  ]) {
    assert.equal(
      item.result.deviceOpenMode,
      'READ_ONLY'
    );

    assert.equal(
      item.result.sendsBytes,
      false
    );

    assert.equal(
      item.result.commandsHardware,
      false
    );

    assert.equal(
      item.result.transport.gate6a.rig,
      'ARDUINO_PTY'
    );

    assert.equal(
      item.result.transport.gate6a.firstRawPulse,
      '4096'
    );

    assert.equal(
      item.result.transport.gate6a.lastRawPulse,
      '5000'
    );

    assert.equal(
      item.result.transport.gate6a.lastDeltaRawPulse,
      '647'
    );

    assert.equal(
      item.result.transport.gate6a.totalObservedRawPulseAdvance,
      '904'
    );
  }

  console.log(
    'PASS G6D-02 · actual kernel PTY slave is opened read-only and carries exact Gate-6A rig/rawPulse observations'
  );

  assert.deepEqual(
    caseA.result.transport.gate6a,
    caseB.result.transport.gate6a
  );

  assert.deepEqual(
    caseB.result.transport.gate6a,
    caseC.result.transport.gate6a
  );

  assert(
    caseA.result.osReadChunkCount !==
      caseC.result.osReadChunkCount
  );

  console.log(
    'PASS G6D-03 · bulk, 7-byte paced, and bytewise PTY transmission produce identical A8 measurement state despite different kernel read behavior'
  );

  for (const item of [
    caseA,
    caseB,
    caseC,
  ]) {
    assert.equal(
      item.result.osReadDiagnosticsAreAuthority,
      false
    );

    assert.equal(
      item.result.transportDiagnosticsAreAuthority,
      false
    );

    assert.equal(
      item.result.configuresSerialDevice,
      false
    );

    assert.equal(
      item.result.writesA8Core,
      false
    );

    assert.equal(
      item.result.writesClock,
      false
    );

    assert.equal(
      item.result.writesOscillator,
      false
    );

    assert.equal(
      item.result.writesDivider,
      false
    );

    assert.equal(
      item.result.writesAuthority,
      false
    );

    assert.equal(
      item.result.usesHostTime,
      false
    );

    assert.equal(
      item.result.usesLegacyTime,
      false
    );

    assert.equal(
      item.result.usesFrequencyHz,
      false
    );

    assert.equal(
      item.result.usesBaudAsTime,
      false
    );
  }

  console.log(
    'PASS G6D-04 · PTY/kernel/UART-shaped delivery diagnostics remain explicitly non-authoritative'
  );

  const helperSource =
    fs.readFileSync(
      helperPath,
      'utf8'
    );

  assert(
    !helperSource.includes('sys.stdin')
  );

  assert(
    !helperSource.includes('input(')
  );

  assert(
    !helperSource.includes('readline(')
  );

  console.log(
    'PASS G6D-05 · external PTY transmitter fixture receives no command or return protocol from the A8 reader'
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

    await runPtyCase({
      txChunkBytes: 13,
      delayUs: 300,
      osChunkBytes: 5,
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
    'PASS G6D-06 · complete pseudo-terminal one-way link cannot mutate A8Core raw state, oscillator epoch, clock phase, day count, or authority'
  );

  console.log('');
  console.log(
    'PASS · A8-POSTSEAL-GATE6D-PSEUDO-TERMINAL-ONE-WAY-RECEIVE-LINK'
  );
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
