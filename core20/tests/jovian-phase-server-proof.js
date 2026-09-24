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
          : JSON.stringify(
              body
            );

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
    'A8 post-seal hardware branch · Gate 6H visible continuous Jovian phase proof'
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
        '/api/hardware/jovian-timekeeper'
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
      p.timekeeper.lockedRulerRawPer512,
      null
    );

    console.log(
      'PASS G6H-S01 · server exposes unqualified Jovian timekeeper without inventing a ruler'
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
      p.result.timekeeper.status,
      'JOVIAN_PHASE_RUNNING'
    );

    assert.equal(
      p.result.timekeeper.lockedRulerRawPer512,
      '388'
    );

    assert.equal(
      p.result.timekeeper.phase.phase9Octal,
      '000₈'
    );

    console.log(
      'PASS G6H-S02 · RUN CORE virtual qualification locks exact recovered ruler 388 at native phase 000₈'
    );

    r =
      await request(
        port,
        'POST',
        '/api/hardware/virtual/advance',
        {
          rawAdvance:
            '97',
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
      p.timekeeper.phase.phase9Octal,
      '200₈'
    );

    console.log(
      'PASS G6H-S03 · existing virtual raw-input endpoint advances displayed Jovian timekeeper exactly to 200₈'
    );

    r =
      await request(
        port,
        'POST',
        '/api/hardware/virtual/advance',
        {
          rawAdvance:
            '97',
        }
      );

    p =
      JSON.parse(
        r.body
      );

    assert.equal(
      p.timekeeper.phase.phase9Octal,
      '400₈'
    );

    console.log(
      'PASS G6H-S04 · second +97 raw advances exactly to 400₈'
    );

    r =
      await request(
        port,
        'POST',
        '/api/hardware/jovian/forget',
        {}
      );

    p =
      JSON.parse(
        r.body
      );

    assert.equal(
      p.timekeeper.lockedRulerRawPer512,
      null
    );

    assert.equal(
      p.timekeeper.phase,
      null
    );

    console.log(
      'PASS G6H-S05 · FORGET RECOVERY also clears Gate-6H ruler lock; no hidden holdover survives an explicit memory erase'
    );

    r =
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
        'JOVIAN A8 PHASE9'
      )
    );

    assert(
      r.body.includes(
        'WAITING FOR RECOVERED EARTH-DAY SCALE'
      )
    );

    assert(
      r.body.includes(
        'id="core20-main-lab-link"'
      )
    );

    console.log(
      'PASS G6H-S06 · Core-20 facing page displays continuous Jovian PHASE9, keeps Earth-day scale explicitly waiting, and retains main-lab link'
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
    'PASS · A8-POSTSEAL-GATE6H-VISIBLE-CONTINUOUS-JOVIAN-PHASE'
  );
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
