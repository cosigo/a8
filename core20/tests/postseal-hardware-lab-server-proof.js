'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');

const {
  createHardwareLabServer,
} = require(
  '../hardware/a8-postseal-hardware-lab-server'
);

const serverPath = path.join(
  __dirname,
  '..',
  'hardware',
  'a8-postseal-hardware-lab-server.js'
);

const source =
  fs.readFileSync(
    serverPath,
    'utf8'
  );

console.log(
  'A8 post-seal hardware branch · Gate 6E visible hardware lab server proof'
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
  '/api/hardware/real/',
  '/api/control',
]) {
  assert(
    !executable.includes(
      forbidden
    ),
    `hardware lab server contains forbidden path: ${forbidden}`
  );
}

console.log(
  'PASS G6E-S01 · dedicated hardware lab server has no A8Core, host-time, timed cadence, real-sample network injection, clock, phase, or authority path'
);

function request(
  port,
  method,
  pathname,
  body = null
) {
  return new Promise(
    (resolve, reject) => {
      const text =
        body === null
          ? null
          : JSON.stringify(body);

      const req =
        http.request(
          {
            host:
              '127.0.0.1',
            port,
            method,
            path:
              pathname,
            headers:
              text === null
                ? {}
                : {
                    'Content-Type':
                      'application/json',
                    'Content-Length':
                      Buffer.byteLength(
                        text
                      ),
                  },
          },
          res => {
            const chunks = [];

            res.on(
              'data',
              chunk =>
                chunks.push(chunk)
            );

            res.on(
              'end',
              () => {
                resolve({
                  status:
                    res.statusCode,
                  headers:
                    res.headers,
                  body:
                    Buffer.concat(
                      chunks
                    ).toString(
                      'utf8'
                    ),
                });
              }
            );
          }
        );

      req.on(
        'error',
        reject
      );

      if (text !== null) {
        req.write(text);
      }

      req.end();
    }
  );
}

(async () => {
  const {
    server,
  } =
    createHardwareLabServer();

  await new Promise(
    (resolve, reject) => {
      server.once(
        'error',
        reject
      );

      server.listen(
        0,
        '127.0.0.1',
        resolve
      );
    }
  );

  const port =
    server.address().port;

  try {
    let r =
      await request(
        port,
        'GET',
        '/api/hardware/source'
      );

    assert.equal(
      r.status,
      200
    );

    let payload =
      JSON.parse(r.body);

    assert.equal(
      payload.source.mode,
      'VIRTUAL'
    );

    assert.equal(
      payload.source.sourceEpoch,
      1
    );

    console.log(
      'PASS G6E-S02 · hardware lab starts visibly in VIRTUAL mode with explicit source epoch 1'
    );

    r =
      await request(
        port,
        'POST',
        '/api/hardware/virtual/advance',
        {
          rawAdvance:
            '64',
        }
      );

    assert.equal(
      r.status,
      200
    );

    payload =
      JSON.parse(r.body);

    assert.equal(
      payload.source.gate6a.lastRawPulse,
      '64'
    );

    assert.equal(
      payload.source.activeRig,
      'VIRTUAL_RIG_A'
    );

    console.log(
      'PASS G6E-S03 · browser-visible virtual advance produces only exact Gate-6A rawPulse state'
    );

    r =
      await request(
        port,
        'POST',
        '/api/hardware/source/select',
        {
          mode:
            'REAL',
        }
      );

    assert.equal(
      r.status,
      200
    );

    payload =
      JSON.parse(r.body);

    assert.equal(
      payload.source.mode,
      'REAL'
    );

    assert.equal(
      payload.source.sourceEpoch,
      2
    );

    assert.equal(
      payload.source.gate6a.lastRawPulse,
      null
    );

    assert.equal(
      payload.source.lastSwitch.counterContinuityCarried,
      false
    );

    console.log(
      'PASS G6E-S04 · visible VIRTUAL→REAL switch clears raw-count baseline and increments epoch without counter splicing'
    );

    r =
      await request(
        port,
        'POST',
        '/api/hardware/virtual/advance',
        {
          rawAdvance:
            '8',
        }
      );

    assert.equal(
      r.status,
      400
    );

    assert(
      JSON.parse(
        r.body
      ).error.includes(
        'requires VIRTUAL source mode'
      )
    );

    console.log(
      'PASS G6E-S05 · virtual generator is disabled while REAL mode is selected'
    );

    r =
      await request(
        port,
        'POST',
        '/api/hardware/real/sample',
        {
          rig:
            'FAKE',
          rawPulse:
            '10',
        }
      );

    assert.equal(
      r.status,
      404
    );

    console.log(
      'PASS G6E-S06 · no browser/network endpoint exists for pretending to be REAL hardware'
    );

    r =
      await request(
        port,
        'GET',
        '/hardware-source.html'
      );

    assert.equal(
      r.status,
      200
    );

    assert(
      r.body.includes(
        'VIRTUAL / REAL PULSE SOURCE'
      )
    );

    assert(
      r.body.includes(
        'SOURCE EPOCH'
      )
    );

    console.log(
      'PASS G6E-S07 · visible hardware-source interface is served by the isolated post-seal lab server'
    );

  } finally {
    await new Promise(
      resolve =>
        server.close(resolve)
    );
  }

  console.log('');
  console.log(
    'PASS · A8-POSTSEAL-GATE6E-VISIBLE-HARDWARE-LAB-SERVER'
  );
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
