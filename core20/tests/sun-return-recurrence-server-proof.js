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
            host: '127.0.0.1',
            port,
            method,
            path: pathname,
            headers:
              text === null
                ? {}
                : {
                    'Content-Type':
                      'application/json',
                    'Content-Length':
                      Buffer.byteLength(text),
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
              () =>
                resolve({
                  status:
                    res.statusCode,
                  body:
                    Buffer.concat(chunks)
                      .toString('utf8'),
                })
            );
          }
        );

      req.on('error', reject);

      if (text !== null) {
        req.write(text);
      }

      req.end();
    }
  );
}

(async () => {
  console.log(
    'A8 post-seal · Gate 6L integrated Sun-return recurrence server proof'
  );

  const {server} =
    createHardwareLabServer();

  await new Promise(
    (resolve, reject) => {
      server.once('error', reject);
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
        '/api/hardware/sun-return-recurrence'
      );

    assert.equal(
      r.status,
      200
    );

    let p =
      JSON.parse(r.body);

    assert.equal(
      p.recurrence.status,
      'WAITING_FOR_EARTH_ROTATION_SCALE'
    );

    console.log(
      'PASS G6L-S01 · Sun-return recurrence waits for recovered Earth rotation'
    );

    r =
      await request(
        port,
        'POST',
        '/api/hardware/jovian/fixture/run',
        {}
      );

    assert.equal(r.status, 200);

    p = JSON.parse(r.body);

    assert.equal(
      p.result.timekeeper.lockedRulerRawPer512,
      '388'
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

    assert.equal(r.status, 200);

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

    assert.equal(r.status, 200);

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

    assert.equal(r.status, 200);

    r =
      await request(
        port,
        'GET',
        '/api/hardware/sun-return-recurrence'
      );

    p =
      JSON.parse(r.body);

    assert.equal(
      p.recurrence.status,
      'WAITING_FOR_SOL_ORBITAL_SCALE'
    );

    console.log(
      'PASS G6L-S02 · recovered stellar rotation alone does not invent a Sun-return recurrence'
    );

    r =
      await request(
        port,
        'POST',
        '/api/sol/observe',
        {
          type:
            'SOL_CELESTIAL_DIRECTION',
          witness:
            'SOL',
          angle512: {
            numerator:
              '100',
            denominator:
              '1',
          },
        }
      );

    assert.equal(r.status, 200);

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

    assert.equal(r.status, 200);

    r =
      await request(
        port,
        'POST',
        '/api/sol/observe',
        {
          type:
            'SOL_CELESTIAL_DIRECTION',
          witness:
            'SOL',
          angle512: {
            numerator:
              '101',
            denominator:
              '1',
          },
        }
      );

    assert.equal(r.status, 200);

    r =
      await request(
        port,
        'GET',
        '/api/hardware/sun-return-recurrence'
      );

    assert.equal(r.status, 200);

    p =
      JSON.parse(r.body);

    assert.equal(
      p.recurrence.status,
      'SUN_RETURN_RECURRENCE_RECOVERED'
    );

    assert.equal(
      p.recurrence.sunClosurePerEarthAxialRotation512.text,
      '511'
    );

    assert.equal(
      p.recurrence.sunReturnInEarthAxialRotations.text,
      '512/511'
    );

    assert.equal(
      p.recurrence.sunReturnInJovianRecurrences.text,
      '2048/511'
    );

    assert.equal(
      p.recurrence.rawPerSunReturnRecurrence.text,
      '794624/511'
    );

    assert.equal(
      p.recurrence.solarRecurrenceEstablished,
      true
    );

    assert.equal(
      p.recurrence.meanSolarDayEstablished,
      false
    );

    assert.equal(
      p.recurrence.civilDayEstablished,
      false
    );

    console.log(
      'PASS G6L-S03 · exact selected-source fixture recovers Sun-return recurrence from Jupiter + Mintaka + Sol only'
    );

    for (const key of [
      'dayPhase17Driven',
      'phase20Driven',
      'writesA8Core',
      'writesClock',
      'writesPhase',
      'writesDivider',
      'writesAuthority',
      'disciplinesJovianRuler',
      'usesLegacyTime',
      'usesExpectedSolarPeriod',
      'usesExpectedSiderealPeriod',
      'usesExpectedOrbitalRate',
      'usesExpectedYear',
    ]) {
      assert.equal(
        p.recurrence[key],
        false,
        `${key} must remain false`
      );
    }

    console.log(
      'PASS G6L-S04 · Gate 6L uses no imported legacy/known astronomy timing authority'
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

    assert.equal(r.status, 200);

    r =
      await request(
        port,
        'GET',
        '/api/hardware/sun-return-recurrence'
      );

    p =
      JSON.parse(r.body);

    assert.equal(
      p.recurrence.sourceEpoch,
      2
    );

    assert.equal(
      p.recurrence.status,
      'WAITING_FOR_EARTH_ROTATION_SCALE'
    );

    assert.equal(
      p.recurrence.solarRecurrenceEstablished,
      false
    );

    console.log(
      'PASS G6L-S05 · source switch invalidates Sun-return evidence; no counter-history splice'
    );

    r =
      await request(
        port,
        'GET',
        '/api/state'
      );

    assert.equal(r.status, 200);

    p =
      JSON.parse(r.body);

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
      'PASS G6L-S06 · Gate 6L remains read-only; civil clock is still untouched'
    );

  } finally {
    await new Promise(
      resolve =>
        server.close(resolve)
    );
  }

  console.log('');
  console.log(
    'PASS · A8-POSTSEAL-GATE6L-SUN-RETURN-RECURRENCE-SERVER'
  );
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
