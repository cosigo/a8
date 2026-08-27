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
        req.write(
          text
        );
      }

      req.end();
    }
  );
}

(async () => {
  console.log(
    'A8 post-seal · Gate 6J integrated Earth axial rotation / Jovian ruler server proof'
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
        '/api/hardware/earth-rotation-scale'
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
      p.scale.status,
      'WAITING_FOR_JOVIAN_RULER'
    );

    assert.equal(
      p.scale.civilDayEstablished,
      false
    );

    console.log(
      'PASS G6J-S01 · server cannot expose an Earth rotation scale before the Jovian ruler is recovered'
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
      p.result.timekeeper.lockedRulerRawPer512,
      '388'
    );

    r =
      await request(
        port,
        'GET',
        '/api/hardware/earth-rotation-scale'
      );

    p =
      JSON.parse(
        r.body
      );

    assert.equal(
      p.scale.status,
      'WAITING_FOR_MINTAKA_RECURRENCE'
    );

    assert.equal(
      p.scale.jovianRawPerRecoveredRecurrence.text,
      '388'
    );

    console.log(
      'PASS G6J-S02 · recovered Jovian ruler 388 is visible but does not itself create Earth rotation'
    );

    r =
      await request(
        port,
        'POST',
        '/api/mintaka/observe',
        {
          type:
            'STELLAR_MERIDIAN',

          witness:
            'MINTAKA',
        }
      );

    assert.equal(
      r.status,
      200
    );

    const first =
      JSON.parse(
        r.body
      );

    const firstRaw =
      first.observer.lastRawPulse;

    r =
      await request(
        port,
        'POST',
        '/api/hardware/virtual/advance',
        {
          rawAdvance:
            '1552',
        }
      );

    assert.equal(
      r.status,
      200
    );

    r =
      await request(
        port,
        'POST',
        '/api/mintaka/observe',
        {
          type:
            'STELLAR_MERIDIAN',

          witness:
            'MINTAKA',
        }
      );

    assert.equal(
      r.status,
      200
    );

    const second =
      JSON.parse(
        r.body
      );

    assert.equal(
      (
        BigInt(
          second.observer.lastRawPulse
        ) -
        BigInt(
          firstRaw
        )
      ).toString(),
      '1552'
    );

    assert.equal(
      second.observer.latestSpanRaw,
      '1552'
    );

    console.log(
      'PASS G6J-S03 · Mintaka recurrence is observed 1552 selected raw counts after the first event'
    );

    r =
      await request(
        port,
        'GET',
        '/api/hardware/earth-rotation-scale'
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
      p.scale.status,
      'EARTH_AXIAL_ROTATION_SCALE_RECOVERED'
    );

    assert.equal(
      p.scale.jovianRawPerRecoveredRecurrence.text,
      '388'
    );

    assert.equal(
      p.scale.mintakaRawPerEarthAxialRotation.text,
      '1552'
    );

    assert.equal(
      p.scale.earthAxialRotationInJovianRecurrences.text,
      '4'
    );

    assert.equal(
      p.scale.jovianPhaseStatesPerEarthAxialRotation.text,
      '2048'
    );

    assert.equal(
      p.scale.jovianPhaseStatesPerEarthAxialRotation.integerOctal,
      '4000₈'
    );

    assert.equal(
      p.scale.civilDayEstablished,
      false
    );

    assert.equal(
      p.scale.meanSolarDayEstablished,
      false
    );

    assert.equal(
      p.scale.usesSol,
      false
    );

    assert.equal(
      p.scale.dayPhase17Driven,
      false
    );

    assert.equal(
      p.scale.phase20Driven,
      false
    );

    console.log(
      'PASS G6J-S04 · selected-source Mintaka rotation / recovered Jovian ruler = exact 4 Jovian recurrences = 4000₈ Jovian phase states'
    );

    console.log(
      'PASS G6J-S05 · result is explicitly axial/starside rotation only; no civil-day, Mean-Sun, Sol, DAY_PHASE17 or PHASE20 claim'
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

    r =
      await request(
        port,
        'GET',
        '/api/hardware/earth-rotation-scale'
      );

    p =
      JSON.parse(
        r.body
      );

    assert.equal(
      p.scale.sourceEpoch,
      2
    );

    assert.equal(
      p.scale.status,
      'WAITING_FOR_JOVIAN_RULER'
    );

    assert.equal(
      p.scale.mintakaEventCount,
      0
    );

    console.log(
      'PASS G6J-S06 · sourceEpoch switch invalidates both recovered ingredients; no Earth-scale splice survives'
    );

    r =
      await request(
        port,
        'GET',
        '/api/state'
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
      p.version,
      '5.4.20'
    );

    assert.equal(
      p.writesClock,
      false
    );

    assert.equal(
      p.presentationOnly,
      true
    );

    console.log(
      'PASS G6J-S07 · Gate-6J remains read-only downstream of the selected-source presentation state'
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
    'PASS · A8-POSTSEAL-GATE6J-EARTH-AXIAL-ROTATION-JOVIAN-SCALE-SERVER'
  );
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
