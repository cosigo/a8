'use strict';

const assert =
  require('assert');

const http =
  require('http');

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
              c =>
                chunks.push(c)
            );

            res.on(
              'end',
              () =>
                resolve({
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
    'A8 post-seal hardware branch · Gate 6G Jovian operations server proof'
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
        '/'
      );

    assert.equal(
      r.status,
      200
    );

    assert(
      r.body.includes(
        'A8 Time Laboratory v5.4.20'
      )
    );

    assert(
      r.body.includes(
        'Three independent recovery channels'
      )
    );

    assert(
      r.body.includes(
        'IO ×4'
      )
    );

    assert(
      r.body.includes(
        'EUROPA ×2'
      )
    );

    assert(
      r.body.includes(
        'GANYMEDE ×1'
      )
    );

    console.log(
      'PASS G6G-S01 · hardware-lab root now serves the Jovian operations surface rather than the small source dashboard'
    );

    r =
      await request(
        port,
        'GET',
        '/api/hardware/jovian'
      );

    assert.equal(
      r.status,
      200
    );

    let p =
      JSON.parse(
        r.body
      );

    assert.equal(
      p.jovian.status,
      'WAITING_FOR_RAW_BASELINE'
    );

    console.log(
      'PASS G6G-S02 · visible Jovian state begins re-armed on the selected VIRTUAL source epoch'
    );

    r =
      await request(
        port,
        'POST',
        '/api/hardware/jovian/observe',
        {
          moon:
            'ga',
          turn:
            'WEST',
          rawPulse:
            '999',
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
        'unsupported Jovian request field: rawPulse'
      )
    );

    console.log(
      'PASS G6G-S03 · network Jovian observation cannot inject rawPulse'
    );

    r =
      await request(
        port,
        'POST',
        '/api/hardware/jovian/fixture/run',
        {}
      );

    assert.equal(
      r.status,
      200
    );

    p =
      JSON.parse(
        r.body
      );

    assert.equal(
      p.result.jovian.status,
      'JOVIAN_RULER_QUALIFIED'
    );

    assert.equal(
      p.result.jovian.channels.io.spanCount,
      8
    );

    assert.equal(
      p.result.jovian.channels.eu.spanCount,
      4
    );

    assert.equal(
      p.result.jovian.channels.ga.spanCount,
      2
    );

    assert.equal(
      p.result.jovian.recoveredJovianRawRuler,
      '388'
    );

    console.log(
      'PASS G6G-S04 · visible RUN CORE virtual fixture drives the real Gate-6E→6F→6G chain to exact 8:4:2 Jovian qualification'
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

    p =
      JSON.parse(
        r.body
      );

    assert.equal(
      p.jovian.sourceEpoch,
      2
    );

    assert.equal(
      p.jovian.status,
      'WAITING_FOR_RAW_BASELINE'
    );

    assert.equal(
      p.jovian.channels.io.spanCount,
      0
    );

    console.log(
      'PASS G6G-S05 · visible VIRTUAL→REAL switch re-arms the Jovian recovery wrapper and carries no virtual evidence'
    );

    r =
      await request(
        port,
        'POST',
        '/api/hardware/jovian/fixture/run',
        {}
      );

    assert.equal(
      r.status,
      400
    );

    console.log(
      'PASS G6G-S06 · virtual Jovian fixture cannot run while REAL hardware mode is selected'
    );

  } finally {
    await new Promise(
      resolve =>
        server.close(
          resolve
        )
    );
  }

  console.log('');
  console.log(
    'PASS · A8-POSTSEAL-GATE6G-JOVIAN-OPERATIONS-SERVER'
  );
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
