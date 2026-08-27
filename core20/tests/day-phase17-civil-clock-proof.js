'use strict';

const assert =
  require('assert');

const {
  CivilDayPhase17,
} = require(
  '../observer/a8-day-phase17-civil-clock'
);

console.log(
  'A8 post-seal · Gate 6M exact 2^17 civil-day phase proof'
);

function bridge(
  rawPulse,
  sourceEpoch = 11
) {
  return {
    sourceEpoch,
    mode:
      'VIRTUAL',
    rig:
      'FIXTURE',
    lastRawPulse:
      rawPulse === null
        ? null
        : String(rawPulse),
  };
}

function recurrence(
  overrides = {}
) {
  return {
    schema:
      'A8-SUN-RETURN-RECURRENCE-V1',

    sourceEpoch:
      11,

    status:
      'SUN_RETURN_RECURRENCE_RECOVERED',

    solarRecurrenceEstablished:
      true,

    rawPerSunReturnRecurrence: {
      numerator:
        '794624',

      denominator:
        '511',

      text:
        '794624/511',
    },

    ...overrides,
  };
}

const clock =
  new CivilDayPhase17();

let s =
  clock.snapshot(
    bridge(null),
    {
      schema:
        'A8-SUN-RETURN-RECURRENCE-V1',

      sourceEpoch:
        11,

      status:
        'WAITING_FOR_SOL_ORBITAL_SCALE',

      solarRecurrenceEstablished:
        false,

      rawPerSunReturnRecurrence:
        null,
    }
  );

assert.equal(
  s.status,
  'WAITING_FOR_SELECTED_RAW_COUNTER'
);

assert.equal(
  s.currentSelectedRawPulse,
  null
);

console.log(
  'PASS G6M-R2-01 · uninitialized selected raw source waits cleanly instead of throwing'
);

s =
  clock.snapshot(
    bridge(1000),
    {
      schema:
        'A8-SUN-RETURN-RECURRENCE-V1',

      sourceEpoch:
        11,

      status:
        'WAITING_FOR_SOL_ORBITAL_SCALE',

      solarRecurrenceEstablished:
        false,

      rawPerSunReturnRecurrence:
        null,
    }
  );

assert.equal(
  s.status,
  'WAITING_FOR_SUN_RETURN_RECURRENCE'
);

console.log(
  'PASS G6M-01 · no recovered Sun return means no civil-day phase'
);

s =
  clock.snapshot(
    bridge(1000),
    recurrence()
  );

assert.equal(
  s.status,
  'WAITING_FOR_ZERO_MERIDIAN_SOLAR_MIDNIGHT'
);

console.log(
  'PASS G6M-02 · recovered day rate alone does not invent phase zero'
);

assert.throws(
  () =>
    clock.anchor(
      bridge(1000),
      recurrence(),
      {
        type:
          'ZERO_MERIDIAN_SOLAR_MIDNIGHT',

        witness:
          'A8_ZERO_MERIDIAN',

        rawPulse:
          '1000',
      }
    ),

  /unsupported civil-day anchor field: rawPulse/
);

console.log(
  'PASS G6M-03 · external anchor cannot inject rawPulse/timestamp-style authority'
);

s =
  clock.anchor(
    bridge(1000),
    recurrence(),
    {
      type:
        'ZERO_MERIDIAN_SOLAR_MIDNIGHT',

      witness:
        'A8_ZERO_MERIDIAN',
    }
  );

assert.equal(
  s.status,
  'DAY_PHASE17_CIVIL_CLOCK_ACTIVE'
);

assert.equal(
  s.dayPhase17,
  '0'
);

assert.equal(
  s.dayPhase17Exact.text,
  '0'
);

assert.equal(
  s.dayPhase17Octal,
  '000000₈'
);

assert.equal(
  s.clock.textOctal,
  '00:00:00₈'
);

assert.equal(
  s.anchor.serverStampedRawPulse,
  '1000'
);

console.log(
  'PASS G6M-04 · established zero-meridian solar-midnight event anchors DAY_PHASE17=0 = 00:00:00₈'
);

/*
 * Gate-6L fixture:
 *
 * P_sun = 794624/511 raw.
 *
 * After 388 raw:
 *
 * phase =
 *   388 × 511 / 794624 × 131072
 * = 32704 exactly
 * = 07:77:00₈.
 */
s =
  clock.snapshot(
    bridge(1388),
    recurrence()
  );

assert.equal(
  s.elapsedRawPulse,
  '388'
);

assert.equal(
  s.dayPhase17Exact.text,
  '32704'
);

assert.equal(
  s.dayPhase17,
  '32704'
);

assert.equal(
  s.dayPhase17Octal,
  '077700₈'
);

assert.equal(
  s.clock.textOctal,
  '07:77:00₈'
);

console.log(
  'PASS G6M-05 · one Jovian fixture recurrence advances exact native 2^17 phase to 07:77:00₈'
);

/*
 * At 1555 raw after anchor, exact phase is still below wrap.
 */
s =
  clock.snapshot(
    bridge(2555),
    recurrence()
  );

assert.equal(
  s.completedSunReturns,
  '0'
);

assert.equal(
  s.dayPhase17,
  '131068'
);

assert.equal(
  s.clock.textOctal,
  '37:77:74₈'
);

console.log(
  'PASS G6M-06 · rational recovered day remains exact immediately before wrap'
);

/*
 * The recovered day is 794624/511 ≈ 1555.037 raw.
 * Therefore the next integer raw sample (1556 raw after anchor)
 * lies just inside the next day.
 *
 * Gate 6M must wrap mathematically without rounding P_sun to 1555.
 */
s =
  clock.snapshot(
    bridge(2556),
    recurrence()
  );

assert.equal(
  s.completedSunReturns,
  '1'
);

assert.equal(
  s.dayPhase17Exact.text,
  '7872/97'
);

assert.equal(
  s.dayPhase17,
  '81'
);

assert.equal(
  s.dayPhase17Octal,
  '000121₈'
);

assert.equal(
  s.clock.textOctal,
  '00:01:21₈'
);

console.log(
  'PASS G6M-07 · rational Sun-return wraps exactly; no rounded raw-pulses-per-day constant is introduced'
);

for (const key of [
  'meanSolarDayEstablished',
  'slowDisciplineActive',
  'phase20Driven',
  'writesA8Core',
  'writesJovianRuler',
  'rewritesRecoveredJovianTime',
  'usesLegacyTime',
  'usesLegacyAngle',
  'usesHostTime',
  'usesUTC',
  'usesNTP',
  'usesGPS',
  'usesFrequencyHz',
  'importedKnownSolarDay',
]) {
  assert.equal(
    s[key],
    false,
    `${key} must remain false`
  );
}

console.log(
  'PASS G6M-08 · 32×64×64 phase is native; Jupiter remains untouched and no legacy timing authority enters'
);

/*
 * Source epoch change must invalidate the anchor.
 */
s =
  clock.snapshot(
    bridge(0, 12),
    recurrence({
      sourceEpoch:
        12,
    })
  );

assert.equal(
  s.status,
  'WAITING_FOR_ZERO_MERIDIAN_SOLAR_MIDNIGHT'
);

assert.equal(
  s.anchor,
  null
);

console.log(
  'PASS G6M-09 · source-epoch change invalidates phase anchor; no cross-epoch splice'
);

console.log('');
console.log(
  'PASS · A8-POSTSEAL-GATE6M-DAY-PHASE17-CIVIL-CLOCK'
);
console.log(
  'PASS · A8-POSTSEAL-GATE6M-R2-INITIAL-RAW-WAIT-STATE'
);
