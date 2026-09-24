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
    'A8 post-seal · Gate 6M integrated DAY_PHASE17 civil-clock server proof'
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
        '/api/hardware/day-phase17'
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
      p.phase.status,
      'WAITING_FOR_SELECTED_RAW_COUNTER'
    );

    assert.equal(
      p.phase.currentSelectedRawPulse,
      null
    );

    console.log(
      'PASS G6M-R2-S01 · DAY_PHASE17 waits cleanly for first selected raw sample at startup'
    );

    /*
     * Establish Gate 6H / 6J / 6K / 6L fixture:
     *
     * Jovian ruler 388 raw
     * Mintaka recurrence 1552 raw = 4 Jovian recurrences
     * Sol +1 A8 angle over 1552 raw
     */
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

    r =
      await request(
        port,
        'GET',
        '/api/hardware/sun-return-recurrence'
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
      p.recurrence.status,
      'SUN_RETURN_RECURRENCE_RECOVERED'
    );

    assert.equal(
      p.recurrence.rawPerSunReturnRecurrence.text,
      '794624/511'
    );

    r =
      await request(
        port,
        'GET',
        '/api/hardware/day-phase17'
      );

    p =
      JSON.parse(
        r.body
      );

    assert.equal(
      p.phase.status,
      'WAITING_FOR_ZERO_MERIDIAN_SOLAR_MIDNIGHT'
    );

    console.log(
      'PASS G6M-S02 · recovered Sun-return rate still waits for established zero-meridian phase event'
    );

    /*
     * Reject attempts to inject the selected raw counter through the event.
     */
    r =
      await request(
        port,
        'POST',
        '/api/hardware/civil-day/anchor',
        {
          type:
            'ZERO_MERIDIAN_SOLAR_MIDNIGHT',

          witness:
            'A8_ZERO_MERIDIAN',

          rawPulse:
            '123456',
        }
      );

    assert.equal(
      r.status,
      400
    );

    p =
      JSON.parse(
        r.body
      );

    assert.match(
      p.error,
      /unsupported civil-day anchor field: rawPulse/
    );

    console.log(
      'PASS G6M-S03 · anchor event cannot inject rawPulse; server owns selected counter stamp'
    );

    r =
      await request(
        port,
        'POST',
        '/api/hardware/civil-day/anchor',
        {
          type:
            'ZERO_MERIDIAN_SOLAR_MIDNIGHT',

          witness:
            'A8_ZERO_MERIDIAN',
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
      p.phase.status,
      'DAY_PHASE17_CIVIL_CLOCK_ACTIVE'
    );

    assert.equal(
      p.phase.dayPhase17,
      '0'
    );

    assert.equal(
      p.phase.clock.textOctal,
      '00:00:00₈'
    );

    const anchorRaw =
      BigInt(
        p.phase.anchor.serverStampedRawPulse
      );

    assert.equal(
      anchorRaw.toString(),
      p.phase.currentSelectedRawPulse
    );

    console.log(
      'PASS G6M-S04 · zero-meridian solar-midnight event establishes 00:00:00₈ from server-stamped raw count'
    );

    r =
      await request(
        port,
        'POST',
        '/api/hardware/virtual/advance',
        {
          rawAdvance:
            '388',
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
        '/api/hardware/day-phase17'
      );

    p =
      JSON.parse(
        r.body
      );

    assert.equal(
      p.phase.elapsedRawPulse,
      '388'
    );

    assert.equal(
      p.phase.dayPhase17Exact.text,
      '32704'
    );

    assert.equal(
      p.phase.dayPhase17,
      '32704'
    );

    assert.equal(
      p.phase.clock.textOctal,
      '07:77:00₈'
    );

    console.log(
      'PASS G6M-S05 · recovered day scale advances live native clock to exact 07:77:00₈ after fixture Jovian recurrence'
    );

    /*
     * Advance total elapsed from anchor to 1556 raw.
     * P_sun = 794624/511 ≈ 1555.037 raw.
     * Therefore this must be just inside the next day.
     */
    r =
      await request(
        port,
        'POST',
        '/api/hardware/virtual/advance',
        {
          rawAdvance:
            '1168',
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
        '/api/hardware/day-phase17'
      );

    p =
      JSON.parse(
        r.body
      );

    assert.equal(
      p.phase.elapsedRawPulse,
      '1556'
    );

    assert.equal(
      p.phase.completedSunReturns,
      '1'
    );

    assert.equal(
      p.phase.dayPhase17Exact.text,
      '7872/97'
    );

    assert.equal(
      p.phase.dayPhase17,
      '81'
    );

    assert.equal(
      p.phase.clock.textOctal,
      '00:01:21₈'
    );

    console.log(
      'PASS G6M-S06 · exact rational recovered day wraps 2^17 phase without rounding raw-per-day'
    );

    for (const key of [
      'meanSolarDayEstablished',
      'slowDisciplineActive',
      'phase20Driven',
      'writesA8Core',
      'writesJovianRuler',
      'rewritesRecoveredJovianTime',
      'usesLegacyTime',
      'usesUTC',
      'usesNTP',
      'usesGPS',
      'usesFrequencyHz',
      'importedKnownSolarDay',
    ]) {
      assert.equal(
        p.phase[key],
        false,
        `${key} must remain false`
      );
    }

    console.log(
      'PASS G6M-S07 · 32×64×64 civil clock exists while Jupiter remains immutable and legacy time remains outside authority'
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
        '/api/hardware/day-phase17'
      );

    p =
      JSON.parse(
        r.body
      );

    assert.equal(
      p.phase.sourceEpoch,
      2
    );

    assert.equal(
      p.phase.anchor,
      null
    );

    assert.equal(
      p.phase.civilClockActive,
      false
    );

    assert.equal(
      p.phase.status,
      'WAITING_FOR_SELECTED_RAW_COUNTER'
    );

    assert.equal(
      p.phase.currentSelectedRawPulse,
      null
    );

    console.log(
      'PASS G6M-R2-S08 · source epoch switch clears anchor and waits for the new source first raw sample'
    );

  } finally {
    await new Promise(
      resolve =>
        server.close(resolve)
    );
  }

  console.log('');
  console.log(
    'PASS · A8-POSTSEAL-GATE6M-DAY-PHASE17-CIVIL-CLOCK-SERVER'
  );
  console.log(
    'PASS · A8-POSTSEAL-GATE6M-R2-INITIAL-RAW-WAIT-STATE-SERVER'
  );
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
