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
            const chunks =
              [];

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
    'A8 post-seal · Gate 6K integrated Sol orbital / Jovian-Mintaka server proof'
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
        '/api/hardware/sol-orbital-scale'
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
      'WAITING_FOR_EARTH_ROTATION_SCALE'
    );

    console.log(
      'PASS G6K-S01 · Sol scale cannot exist before Gate-6J Earth rotation scale'
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
      'EARTH_AXIAL_ROTATION_SCALE_RECOVERED'
    );

    assert.equal(
      p.scale.earthAxialRotationInJovianRecurrences.text,
      '4'
    );

    r =
      await request(
        port,
        'GET',
        '/api/hardware/sol-orbital-scale'
      );

    p =
      JSON.parse(
        r.body
      );

    assert.equal(
      p.scale.status,
      'WAITING_FOR_SOL_TRACKING'
    );

    console.log(
      'PASS G6K-S02 · Gate-6J can be recovered while Gate-6K still waits independently for Sol'
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

    assert.equal(
      r.status,
      200
    );

    const firstSol =
      JSON.parse(
        r.body
      );

    const firstRaw =
      firstSol.observer.lastRawPulse;

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

    assert.equal(
      r.status,
      200
    );

    const secondSol =
      JSON.parse(
        r.body
      );

    assert.equal(
      (
        BigInt(
          secondSol.observer.lastRawPulse
        ) -
        BigInt(
          firstRaw
        )
      ).toString(),
      '1552'
    );

    assert.equal(
      secondSol.observer.forwardAdvancePerRawPulse512.numerator,
      '1'
    );

    assert.equal(
      secondSol.observer.forwardAdvancePerRawPulse512.denominator,
      '1552'
    );

    console.log(
      'PASS G6K-S03 · Sol fixture observes exact +1 A8 angle over 1552 selected raw counts'
    );

    r =
      await request(
        port,
        'GET',
        '/api/hardware/sol-orbital-scale'
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
      'SOL_ORBITAL_ADVANCE_SCALE_RECOVERED'
    );

    assert.equal(
      p.scale.solAdvancePerRawPulse512.text,
      '1/1552'
    );

    assert.equal(
      p.scale.solAdvancePerJovianRecurrence512.text,
      '1/4'
    );

    assert.equal(
      p.scale.solAdvancePerEarthAxialRotation512.text,
      '1'
    );

    assert.equal(
      p.scale.orbitTurnFractionPerEarthAxialRotation.text,
      '1/512'
    );

    console.log(
      'PASS G6K-S04 · exact selected-source fixture recovers Sol advance in Jovian and Earth-rotation units'
    );

    for (const key of [
      'civilDayEstablished',
      'meanSolarDayEstablished',
      'solarRecurrenceEstablished',
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
      'usesExpectedOrbitalRate',
      'usesExpectedYear',
    ]) {
      assert.equal(
        p.scale[key],
        false,
        `${key} must remain false`
      );
    }

    console.log(
      'PASS G6K-S05 · Gate 6K makes no civil-day, solar-day, divider or discipline claim'
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
        '/api/hardware/sol-orbital-scale'
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
      'WAITING_FOR_EARTH_ROTATION_SCALE'
    );

    assert.equal(
      p.scale.solSampleCount,
      0
    );

    console.log(
      'PASS G6K-S06 · source switch rearms the whole Earth/Sol relationship; no epoch splice survives'
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
      'PASS G6K-S07 · Gate 6K remains downstream read-only presentation/relationship state'
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
    'PASS · A8-POSTSEAL-GATE6K-SOL-ORBITAL-JOVIAN-MINTAKA-SCALE-SERVER'
  );
})().catch(err => {
  console.error(err);
  process.exitCode =
    1;
});
