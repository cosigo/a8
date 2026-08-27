'use strict';

const assert = require('assert');
const http = require('http');

const {
  createHardwareLabServer,
} = require(
  '../hardware/a8-postseal-hardware-lab-server'
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
              c => chunks.push(c)
            );

            res.on(
              'end',
              () => resolve({
                status:
                  res.statusCode,
                body:
                  Buffer.concat(
                    chunks
                  ).toString(
                    'utf8'
                  ),
              })
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
  console.log(
    'A8 post-seal hardware branch · Gate 6F visible recovery-input bridge proof'
  );

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
        '/api/hardware/recovery-input'
      );

    assert.equal(
      r.status,
      200
    );

    let p =
      JSON.parse(r.body);

    assert.equal(
      p.recoveryInput.status,
      'REARMED_WAITING_RAW_BASELINE'
    );

    console.log(
      'PASS G6F-S01 · visible lab exposes recovery-input bridge armed in VIRTUAL epoch before a raw baseline exists'
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

    p =
      JSON.parse(r.body);

    assert.equal(
      p.recoveryInput.status,
      'RAW_BASELINE_ESTABLISHED'
    );

    assert.equal(
      p.recoveryInput.lastRawPulse,
      '8'
    );

    console.log(
      'PASS G6F-S02 · first visible virtual advance establishes the Core-20 recovery-input raw baseline'
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

    p =
      JSON.parse(r.body);

    assert.equal(
      p.recoveryInput.status,
      'RAW_OSCILLATOR_INPUT_ACTIVE'
    );

    assert.equal(
      p.recoveryInput.lastRawPulse,
      '72'
    );

    assert.equal(
      p.recoveryInput.epochRawAdvance,
      '64'
    );

    console.log(
      'PASS G6F-S03 · later visible virtual count activates exact forward raw-oscillator recovery input'
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

    p =
      JSON.parse(r.body);

    assert.equal(
      p.recoveryInput.sourceEpoch,
      2
    );

    assert.equal(
      p.recoveryInput.status,
      'REARMED_WAITING_RAW_BASELINE'
    );

    assert.equal(
      p.recoveryInput.lastRawPulse,
      null
    );

    assert.equal(
      p.recoveryInput.rearmCount,
      1
    );

    console.log(
      'PASS G6F-S04 · visible VIRTUAL→REAL switch immediately re-arms recovery input and drops virtual raw baseline'
    );

    r =
      await request(
        port,
        'POST',
        '/api/hardware/real/sample',
        {
          rawPulse:
            '17',
        }
      );

    assert.equal(
      r.status,
      404
    );

    console.log(
      'PASS G6F-S05 · browser/network still cannot inject a fake REAL recovery input'
    );

  } finally {
    await new Promise(
      resolve =>
        server.close(resolve)
    );
  }

  console.log('');
  console.log(
    'PASS · A8-POSTSEAL-GATE6F-VISIBLE-CORE20-RECOVERY-INPUT-BRIDGE'
  );
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
