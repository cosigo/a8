'use strict';

/*
 * AUSPICIOUS 8 · ONE-SHOT YEAR-ANGLE ALIGNMENT BRIDGE
 *
 * PURPOSE
 * -------
 * Give the already-running recovered Sol orbital advance one
 * absolute seasonal/ecliptic position.
 *
 * ONE-SHOT COMPARISON SOURCE
 * --------------------------
 * JPL Horizons:
 *
 *   target   = Sun
 *   observer = Earth geocenter
 *   quantity = 31 · ObsEcLon / ObsEcLat
 *
 * JPL and UTC are used ONLY to establish an epoch-local
 * positional offset.
 *
 * AFTER ALIGNMENT
 * ---------------
 * YEAR_PHASE advances only from:
 *
 *   selected raw counter
 *   +
 *   recovered SOL_ANGLE_PER_RAW
 *
 * JPL does NOT provide rate.
 * UTC does NOT provide rate.
 * network arrival time does NOT provide rate.
 *
 * A new source epoch invalidates the alignment.
 */

const https = require('https');

const YEAR_PHASE27_BITS = 27n;
const YEAR_PHASE27_STATES =
  1n << YEAR_PHASE27_BITS;

const FINE_STATES_PER_ANGLE512 =
  1n << 18n;


function mod(value, modulus) {
  return (
    (value % modulus) +
    modulus
  ) % modulus;
}


function decimalRational(text) {
  const s =
    String(text).trim();

  const m =
    /^([+-]?)([0-9]+)(?:\.([0-9]*))?(?:[eE]([+-]?[0-9]+))?$/
      .exec(s);

  if (!m) {
    throw new Error(
      `invalid decimal rational: ${text}`
    );
  }

  const sign =
    m[1] === '-'
      ? -1n
      : 1n;

  const whole =
    m[2];

  const fraction =
    m[3] || '';

  const exponent =
    Number(m[4] || 0);

  let numerator =
    BigInt(
      whole + fraction
    );

  let denominator =
    10n ** BigInt(fraction.length);

  if (exponent > 0) {
    numerator *=
      10n ** BigInt(exponent);
  } else if (exponent < 0) {
    denominator *=
      10n ** BigInt(-exponent);
  }

  numerator *= sign;

  return {
    numerator,
    denominator,
  };
}


function positiveRationalObject(obj) {
  if (
    !obj ||
    obj.numerator === undefined ||
    obj.denominator === undefined
  ) {
    return null;
  }

  try {
    const numerator =
      BigInt(obj.numerator);

    const denominator =
      BigInt(obj.denominator);

    if (
      numerator <= 0n ||
      denominator <= 0n
    ) {
      return null;
    }

    return {
      numerator,
      denominator,
    };
  } catch (_) {
    return null;
  }
}


function formatUtcForHorizons(date) {
  const d =
    date instanceof Date
      ? date
      : new Date(date);

  if (
    Number.isNaN(
      d.getTime()
    )
  ) {
    throw new Error(
      'invalid UTC bridge instant'
    );
  }

  const months = [
    'Jan', 'Feb', 'Mar', 'Apr',
    'May', 'Jun', 'Jul', 'Aug',
    'Sep', 'Oct', 'Nov', 'Dec',
  ];

  const pad2 =
    n =>
      String(n).padStart(2, '0');

  const pad3 =
    n =>
      String(n).padStart(3, '0');

  return (
    `${d.getUTCFullYear()}-` +
    `${months[d.getUTCMonth()]}-` +
    `${pad2(d.getUTCDate())} ` +
    `${pad2(d.getUTCHours())}:` +
    `${pad2(d.getUTCMinutes())}:` +
    `${pad2(d.getUTCSeconds())}.` +
    `${pad3(d.getUTCMilliseconds())}`
  );
}


function requestJson(url) {
  return new Promise(
    (resolve, reject) => {
      const req =
        https.get(
          url,
          {
            headers: {
              'User-Agent':
                'COSIGO-A8-Time-Lab/5.4.20',
            },
          },
          res => {
            if (
              res.statusCode < 200 ||
              res.statusCode >= 300
            ) {
              res.resume();

              reject(
                new Error(
                  `JPL Horizons HTTP ${res.statusCode}`
                )
              );

              return;
            }

            const chunks = [];

            res.on(
              'data',
              chunk =>
                chunks.push(chunk)
            );

            res.on(
              'end',
              () => {
                try {
                  resolve(
                    JSON.parse(
                      Buffer.concat(
                        chunks
                      ).toString('utf8')
                    )
                  );
                } catch (err) {
                  reject(err);
                }
              }
            );
          }
        );

      req.setTimeout(
        30000,
        () => {
          req.destroy(
            new Error(
              'JPL Horizons request timeout'
            )
          );
        }
      );

      req.on(
        'error',
        reject
      );
    }
  );
}


function extractObsEcLonLat(result) {
  const text =
    String(result || '');

  if (
    !text.includes('$$SOE') ||
    !text.includes('$$EOE')
  ) {
    throw new Error(
      'JPL Horizons returned no ephemeris row'
    );
  }

  const body =
    text
      .split('$$SOE', 2)[1]
      .split('$$EOE', 1)[0];

  const row =
    body
      .split(/\r?\n/)
      .map(line => line.trim())
      .find(Boolean);

  if (!row) {
    throw new Error(
      'JPL Horizons ephemeris row empty'
    );
  }

  /*
   * QUANTITIES=31 is the only requested observer
   * quantity. ObsEcLon and ObsEcLat are therefore
   * the final two numeric fields in the CSV row.
   */
  const cells =
    row.split(',');

  const numeric = [];

  for (
    let i = 1;
    i < cells.length;
    i += 1
  ) {
    const value =
      cells[i].trim();

    if (
      /^[+-]?[0-9]+(?:\.[0-9]*)?(?:[eE][+-]?[0-9]+)?$/
        .test(value)
    ) {
      numeric.push(value);
    }
  }

  if (numeric.length < 2) {
    throw new Error(
      `cannot identify JPL ObsEcLon/ObsEcLat: ${row}`
    );
  }

  return {
    longitude:
      numeric[numeric.length - 2],

    latitude:
      numeric[numeric.length - 1],
  };
}


async function queryHorizonsOnce(
  jplTime
) {
  const params =
    new URLSearchParams({
      format: 'json',
      COMMAND: "'10'",
      OBJ_DATA: "'NO'",
      MAKE_EPHEM: "'YES'",
      EPHEM_TYPE: "'OBSERVER'",
      CENTER: "'500@399'",
      TLIST:
        `'${jplTime}'`,
      TLIST_TYPE: "'CAL'",
      TIME_TYPE: "'UT'",
      TIME_DIGITS: "'FRACSEC'",
      QUANTITIES: "'31'",
      CSV_FORMAT: "'YES'",
      EXTRA_PREC: "'YES'",
    });

  const url =
    'https://ssd.jpl.nasa.gov/api/horizons.api?' +
    params.toString();

  const payload =
    await requestJson(url);

  return extractObsEcLonLat(
    payload.result
  );
}


class A8YearAngleJplBridge {
  constructor({
    getRaw,
    getSourceEpoch,
    getSolOrbitalScale,
    utcNow =
      () => new Date(),
    queryHorizons =
      queryHorizonsOnce,
  }) {
    if (
      typeof getRaw !== 'function' ||
      typeof getSourceEpoch !== 'function' ||
      typeof getSolOrbitalScale !== 'function'
    ) {
      throw new Error(
        'A8 year-angle bridge requires raw, epoch and Sol-scale readers'
      );
    }

    this.getRaw =
      getRaw;

    this.getSourceEpoch =
      getSourceEpoch;

    this.getSolOrbitalScale =
      getSolOrbitalScale;

    this.utcNow =
      utcNow;

    this.queryHorizons =
      queryHorizons;

    this.alignment =
      null;

    /*
     * JPL asks clients not to make simultaneous requests.
     * Concurrent button clicks therefore share one promise.
     */
    this.pending =
      null;
  }


  _epoch() {
    const epoch =
      this.getSourceEpoch();

    if (
      epoch === null ||
      epoch === undefined
    ) {
      throw new Error(
        'source epoch unavailable'
      );
    }

    return String(epoch);
  }


  _solRate() {
    const scale =
      this.getSolOrbitalScale();

    if (
      !scale ||
      scale.status !==
        'SOL_ORBITAL_ADVANCE_SCALE_RECOVERED'
    ) {
      throw new Error(
        'recovered Sol orbital scale unavailable'
      );
    }

    const rate =
      positiveRationalObject(
        scale.solAdvancePerRawPulse512
      );

    if (!rate) {
      throw new Error(
        'recovered SOL_ANGLE_PER_RAW unavailable'
      );
    }

    return rate;
  }


  async _alignFresh(
    epoch
  ) {
    /*
     * Capture raw first and UTC immediately adjacent.
     *
     * Network latency after this point is irrelevant:
     * Horizons is asked for this captured UTC instant,
     * and its answer is attached to this captured raw.
     */
    const rawAtAlign =
      BigInt(
        this.getRaw()
      );

    const utc =
      this.utcNow();

    const jplTime =
      formatUtcForHorizons(
        utc
      );

    /*
     * Verify the recovered Sol scale exists BEFORE
     * external comparison is accepted.
     *
     * JPL can position the wheel; it cannot create
     * the wheel or its rate.
     */
    this._solRate();

    const jpl =
      await this.queryHorizons(
        jplTime
      );

    /*
     * Source continuity is mandatory. If epoch changed
     * while JPL was answering, throw the sample away.
     */
    if (
      this._epoch() !== epoch
    ) {
      throw new Error(
        'source epoch changed during JPL one-shot query; result discarded'
      );
    }

    const longitude =
      decimalRational(
        jpl.longitude
      );

    if (
      longitude.numerator < 0n ||
      longitude.numerator >=
        360n * longitude.denominator
    ) {
      throw new Error(
        `unexpected JPL ObsEcLon ${jpl.longitude}`
      );
    }

    /*
     * conventional degrees -> full 2^27 A8 year register
     *
     * 360° ↔ 2^27 states
     */
    const phase27AtAlign =
      (
        longitude.numerator *
        YEAR_PHASE27_STATES
      ) /
      (
        longitude.denominator *
        360n
      );

    const phase9AtAlign =
      phase27AtAlign >>
      18n;

    this.alignment = {
      schema:
        'A8-YEAR-ANGLE-JPL-ONE-SHOT-V1',

      sourceEpoch:
        epoch,

      rawAtYearAlign:
        rawAtAlign.toString(),

      /*
       * Stored for audit/provenance only.
       * It is not read by running phase arithmetic.
       */
      utcBridgeInstantProvenance:
        utc.toISOString(),

      jplTimeArgument:
        jplTime,

      jplObsEcLon360:
        String(jpl.longitude),

      jplObsEcLat360:
        String(jpl.latitude),

      a8YearPhase27AtAlign:
        phase27AtAlign.toString(),

      a8YearPhase9AtAlign:
        phase9AtAlign.toString(),

      comparisonSource:
        'JPL_HORIZONS',

      target:
        'SUN',

      observer:
        'EARTH_GEOCENTER_500@399',

      quantity:
        '31_OBSECLON_OBSECLAT',

      zeroDefinition:
        'SOL_APPARENT_ECLIPTIC_LONGITUDE_0_VERNAL_EQUINOX',

      externalBridgeOnly:
        true,

      externalSourceDefinesRate:
        false,

      externalSourceDefinesRecurrence:
        false,

      networkCadenceAuthority:
        false,
    };

    return {
      applied:
        true,

      alignment:
        { ...this.alignment },

      yearAngle:
        this.snapshot(),
    };
  }


  async alignOnce() {
    const epoch =
      this._epoch();

    if (
      this.alignment &&
      this.alignment.sourceEpoch ===
        epoch
    ) {
      return {
        applied:
          false,

        alignment:
          { ...this.alignment },

        yearAngle:
          this.snapshot(),
      };
    }

    if (this.pending) {
      return this.pending;
    }

    this.pending =
      this._alignFresh(
        epoch
      );

    try {
      return await this.pending;
    } finally {
      this.pending =
        null;
    }
  }


  snapshot() {
    const epoch =
      this._epoch();

    if (!this.alignment) {
      return {
        schema:
          'A8-YEAR-PHASE27-V1',

        status:
          'YEAR_ANGLE_AWAITING_ONE_SHOT_JPL_ALIGN',

        sourceEpoch:
          epoch,

        aligned:
          false,

        yearZero:
          'VERNAL_EQUINOX',

        range:
          '000₈–777₈',

        ongoingAuthority:
          'RECOVERED_SOL_ORBITAL_ADVANCE_ONLY',

        usesJplAfterAlignment:
          false,

        usesUtcAfterAlignment:
          false,

        usesNetworkCadence:
          false,
      };
    }

    if (
      this.alignment.sourceEpoch !==
      epoch
    ) {
      return {
        schema:
          'A8-YEAR-PHASE27-V1',

        status:
          'YEAR_ANGLE_ALIGNMENT_STALE_SOURCE_EPOCH',

        sourceEpoch:
          epoch,

        aligned:
          false,

        previousAlignment:
          { ...this.alignment },

        ongoingAuthority:
          'RECOVERED_SOL_ORBITAL_ADVANCE_ONLY',

        usesJplAfterAlignment:
          false,

        usesUtcAfterAlignment:
          false,

        usesNetworkCadence:
          false,
      };
    }

    let rate;

    try {
      rate =
        this._solRate();
    } catch (err) {
      return {
        schema:
          'A8-YEAR-PHASE27-V1',

        status:
          'YEAR_ANGLE_RECOVERED_SOL_RATE_UNAVAILABLE',

        sourceEpoch:
          epoch,

        aligned:
          true,

        alignment:
          { ...this.alignment },

        error:
          err.message,
      };
    }

    const rawNow =
      BigInt(
        this.getRaw()
      );

    const rawAtAlign =
      BigInt(
        this.alignment
          .rawAtYearAlign
      );

    const deltaRaw =
      rawNow -
      rawAtAlign;

    if (deltaRaw < 0n) {
      return {
        schema:
          'A8-YEAR-PHASE27-V1',

        status:
          'YEAR_ANGLE_RAW_REGRESSION',

        sourceEpoch:
          epoch,

        aligned:
          false,
      };
    }

    /*
     * recovered Sol rate units:
     *
     *   angle512 / raw
     *
     * one angle512 unit contains 2^18 PHASE27 states.
     */
    const advanceNumerator =
      deltaRaw *
      rate.numerator *
      FINE_STATES_PER_ANGLE512;

    const advance27 =
      advanceNumerator /
      rate.denominator;

    const remainder =
      advanceNumerator %
      rate.denominator;

    const phase27 =
      mod(
        BigInt(
          this.alignment
            .a8YearPhase27AtAlign
        ) +
        advance27,
        YEAR_PHASE27_STATES
      );

    const phase9 =
      phase27 >>
      18n;

    return {
      schema:
        'A8-YEAR-PHASE27-V1',

      status:
        'YEAR_ANGLE_RUNNING_FROM_RECOVERED_SOL',

      sourceEpoch:
        epoch,

      aligned:
        true,

      currentSelectedRawPulse:
        rawNow.toString(),

      rawDeltaSinceAlignment:
        deltaRaw.toString(),

      phase9:
        phase9.toString(),

      phase9Binary:
        phase9
          .toString(2)
          .padStart(9, '0') +
        '₂',

      phase9Octal:
        phase9
          .toString(8)
          .padStart(3, '0') +
        '₈',

      phase27:
        phase27.toString(),

      phase27Binary:
        phase27
          .toString(2)
          .padStart(27, '0') +
        '₂',

      phase27Octal:
        phase27
          .toString(8)
          .padStart(9, '0') +
        '₈',

      exactFineRemainder: {
        numerator:
          remainder.toString(),

        denominator:
          rate.denominator.toString(),
      },

      alignment:
        { ...this.alignment },

      yearZero:
        'VERNAL_EQUINOX',

      range:
        '000₈–777₈',

      ongoingAuthority:
        'SELECTED_RAW_PLUS_RECOVERED_SOL_ANGLE_PER_RAW',

      usesJplAfterAlignment:
        false,

      usesUtcAfterAlignment:
        false,

      usesNetworkCadence:
        false,
    };
  }
}


module.exports = {
  A8YearAngleJplBridge,
  queryHorizonsOnce,
};
