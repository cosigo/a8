'use strict';

/*
 * AUSPICIOUS 8 · v5.4.20 POST-SEAL
 * GATE 6M · RECOVERED SUN-RETURN → 2^17 DAY_PHASE17 → 32×64×64
 *
 * Authority chain:
 *
 *   Jupiter recovered elapsed-time ruler
 *      ↓
 *   Mintaka Earth axial rotation
 *      ↓
 *   Sol orbital advance
 *      ↓
 *   Gate 6L recovered Sun-return recurrence
 *      ↓
 *   exact 2^17 phase mapping
 *
 * Phase-zero convention:
 *
 *   established A8 zero meridian
 *   + ZERO_MERIDIAN_SOLAR_MIDNIGHT event
 *   = DAY_PHASE17 0 = 00:00:00₈
 *
 * The event contains identity only. The server stamps the selected raw
 * counter. No UTC timestamp, legacy clock reading, or supplied rawPulse
 * is accepted.
 *
 * This gate locks the exact recovered Sun-return scale at the anchor.
 * Later slow-discipline work may retune the civil layer without rewriting
 * the recovered Jovian ruler. Gate 6M itself performs no discipline.
 */

const SCHEMA =
  'A8-DAY-PHASE17-CIVIL-CLOCK-V1';

const SUN_RETURN_SCHEMA =
  'A8-SUN-RETURN-RECURRENCE-V1';

const ANCHOR_TYPE =
  'ZERO_MERIDIAN_SOLAR_MIDNIGHT';

const ANCHOR_WITNESS =
  'A8_ZERO_MERIDIAN';

const STATES_PER_DAY =
  131072n; // 2^17

const HOURS_PER_DAY =
  32n;

const MINUTES_PER_HOUR =
  64n;

const SECONDS_PER_MINUTE =
  64n;

function absBigInt(value) {
  return value < 0n ? -value : value;
}

function gcd(a, b) {
  a = absBigInt(a);
  b = absBigInt(b);

  while (b !== 0n) {
    const t = a % b;
    a = b;
    b = t;
  }

  return a;
}

function reduceFraction(numerator, denominator) {
  if (denominator === 0n) {
    throw new Error('fraction denominator must be non-zero');
  }

  if (denominator < 0n) {
    numerator = -numerator;
    denominator = -denominator;
  }

  const g = gcd(numerator, denominator);

  return {
    n: numerator / g,
    d: denominator / g,
  };
}

function parseInteger(value, label) {
  const text = String(value ?? '');

  if (!/^-?(0|[1-9][0-9]*)$/.test(text)) {
    throw new Error(`${label} must be an integer`);
  }

  return BigInt(text);
}

function parseFractionObject(value, label) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    throw new Error(`${label} must be a fraction object`);
  }

  const n = parseInteger(
    value.numerator,
    `${label}.numerator`
  );

  const d = parseInteger(
    value.denominator,
    `${label}.denominator`
  );

  if (n <= 0n) {
    throw new Error(`${label}.numerator must be positive`);
  }

  if (d <= 0n) {
    throw new Error(`${label}.denominator must be positive`);
  }

  return reduceFraction(n, d);
}

function fractionObject(value) {
  const r = reduceFraction(value.n, value.d);

  return {
    numerator: r.n.toString(),
    denominator: r.d.toString(),
    text:
      r.d === 1n
        ? r.n.toString()
        : `${r.n.toString()}/${r.d.toString()}`,
    integer:
      r.d === 1n
        ? r.n.toString()
        : null,
  };
}

function octal(value, width) {
  return value
    .toString(8)
    .padStart(width, '0');
}

function clockFromState(state) {
  if (
    state < 0n ||
    state >= STATES_PER_DAY
  ) {
    throw new Error(
      'DAY_PHASE17 state must be inside one 2^17 day'
    );
  }

  const hour =
    state /
    (MINUTES_PER_HOUR * SECONDS_PER_MINUTE);

  const minute =
    (
      state /
      SECONDS_PER_MINUTE
    ) %
    MINUTES_PER_HOUR;

  const second =
    state %
    SECONDS_PER_MINUTE;

  return {
    hourDecimal: hour.toString(),
    minuteDecimal: minute.toString(),
    secondDecimal: second.toString(),

    hourOctal: octal(hour, 2),
    minuteOctal: octal(minute, 2),
    secondOctal: octal(second, 2),

    textOctal:
      `${octal(hour, 2)}:${octal(minute, 2)}:${octal(second, 2)}₈`,
  };
}

function parseBridge(bridge) {
  if (
    !bridge ||
    typeof bridge !== 'object' ||
    Array.isArray(bridge)
  ) {
    throw new Error(
      'selected raw bridge must be an object'
    );
  }

  if (
    !Number.isSafeInteger(
      bridge.sourceEpoch
    ) ||
    bridge.sourceEpoch < 1
  ) {
    throw new Error(
      'selected raw bridge sourceEpoch must be a positive safe integer'
    );
  }

  let rawPulse =
    null;

  if (
    bridge.lastRawPulse !== null &&
    bridge.lastRawPulse !== undefined
  ) {
    rawPulse =
      parseInteger(
        bridge.lastRawPulse,
        'selected raw bridge lastRawPulse'
      );

    if (rawPulse < 0n) {
      throw new Error(
        'selected raw bridge lastRawPulse must be non-negative'
      );
    }
  }

  return {
    sourceEpoch:
      bridge.sourceEpoch,

    mode:
      bridge.mode ?? null,

    rig:
      bridge.rig ?? null,

    rawPulse,
  };
}

function parseRecoveredRecurrence(recurrence) {
  if (
    !recurrence ||
    typeof recurrence !== 'object' ||
    Array.isArray(recurrence) ||
    recurrence.schema !== SUN_RETURN_SCHEMA
  ) {
    return null;
  }

  if (
    recurrence.status !==
      'SUN_RETURN_RECURRENCE_RECOVERED' ||
    recurrence.solarRecurrenceEstablished !== true ||
    recurrence.rawPerSunReturnRecurrence === null
  ) {
    return null;
  }

  return parseFractionObject(
    recurrence.rawPerSunReturnRecurrence,
    'raw per Sun-return recurrence'
  );
}

class CivilDayPhase17 {
  constructor() {
    this._sourceEpoch = null;
    this._mode = null;
    this._rig = null;

    this._anchorRawPulse = null;
    this._lockedRawPerSunReturn = null;
    this._anchorEvent = null;
  }

  _clearAnchor() {
    this._anchorRawPulse = null;
    this._lockedRawPerSunReturn = null;
    this._anchorEvent = null;
  }

  syncSource(bridge) {
    const parsed =
      parseBridge(bridge);

    if (
      this._sourceEpoch === null ||
      this._sourceEpoch !==
        parsed.sourceEpoch
    ) {
      this._sourceEpoch =
        parsed.sourceEpoch;

      this._mode =
        parsed.mode;

      this._rig =
        parsed.rig;

      this._clearAnchor();
    } else {
      this._mode =
        parsed.mode;

      this._rig =
        parsed.rig;
    }

    return parsed;
  }

  anchor(
    bridge,
    recurrence,
    event
  ) {
    const parsedBridge =
      this.syncSource(bridge);

    if (
      !event ||
      typeof event !== 'object' ||
      Array.isArray(event)
    ) {
      throw new Error(
        'anchor event must be an object'
      );
    }

    const allowed =
      new Set([
        'type',
        'witness',
      ]);

    for (
      const key of
      Object.keys(event)
    ) {
      if (!allowed.has(key)) {
        throw new Error(
          `unsupported civil-day anchor field: ${key}`
        );
      }
    }

    if (
      event.type !==
        ANCHOR_TYPE
    ) {
      throw new Error(
        `anchor type must be ${ANCHOR_TYPE}`
      );
    }

    if (
      event.witness !==
        ANCHOR_WITNESS
    ) {
      throw new Error(
        `anchor witness must be ${ANCHOR_WITNESS}`
      );
    }

    const recovered =
      parseRecoveredRecurrence(
        recurrence
      );

    if (recovered === null) {
      throw new Error(
        'Sun-return recurrence must be recovered before civil-day anchor'
      );
    }

    if (
      recurrence.sourceEpoch !==
        parsedBridge.sourceEpoch
    ) {
      throw new Error(
        'Sun-return recurrence and selected raw bridge sourceEpoch disagree'
      );
    }

    if (parsedBridge.rawPulse === null) {
      throw new Error(
        'selected raw counter has not produced a sample'
      );
    }

    /*
     * Freeze the exact recovered scale at the natural phase-zero event.
     * No rounding of the day occurs here.
     */
    this._anchorRawPulse =
      parsedBridge.rawPulse;

    this._lockedRawPerSunReturn =
      recovered;

    this._anchorEvent = {
      type:
        ANCHOR_TYPE,

      witness:
        ANCHOR_WITNESS,

      zeroMeridianAngle512:
        '0',

      phase17:
        '0',

      clockOctal:
        '00:00:00₈',

      serverStampedRawPulse:
        parsedBridge.rawPulse.toString(),
    };

    return this.snapshot(
      bridge,
      recurrence
    );
  }

  snapshot(
    bridge,
    recurrence
  ) {
    const parsedBridge =
      this.syncSource(bridge);

    const currentRecovered =
      parseRecoveredRecurrence(
        recurrence
      );

    const base = {
      schema:
        SCHEMA,

      role:
        'RECOVERED_SUN_RETURN_MAPPED_TO_NATIVE_2^17_CIVIL_DAY',

      sourceEpoch:
        parsedBridge.sourceEpoch,

      mode:
        parsedBridge.mode,

      rig:
        parsedBridge.rig,

      zeroMeridian:
        'ESTABLISHED_A8_ZERO_MERIDIAN',

      phaseZeroEvent:
        ANCHOR_TYPE,

      phaseZeroMeaning:
        'ZERO_MERIDIAN_SOLAR_MIDNIGHT',

      statesPerDay:
        STATES_PER_DAY.toString(),

      statesPerDayPower:
        '2^17',

      clockStructure:
        '32×64×64',

      hoursPerDay:
        HOURS_PER_DAY.toString(),

      minutesPerHour:
        MINUTES_PER_HOUR.toString(),

      secondsPerMinute:
        SECONDS_PER_MINUTE.toString(),

      currentSelectedRawPulse:
        parsedBridge.rawPulse === null
          ? null
          : parsedBridge.rawPulse.toString(),

      currentRecoveredRawPerSunReturn:
        currentRecovered === null
          ? null
          : fractionObject(
              currentRecovered
            ),

      lockedRawPerSunReturn:
        this._lockedRawPerSunReturn === null
          ? null
          : fractionObject(
              this._lockedRawPerSunReturn
            ),

      anchor:
        this._anchorEvent,

      dayPhase17Established:
        false,

      civilClockActive:
        false,

      meanSolarDayEstablished:
        false,

      slowDisciplineActive:
        false,

      phase20Driven:
        false,

      writesA8Core:
        false,

      writesJovianRuler:
        false,

      rewritesRecoveredJovianTime:
        false,

      usesLegacyTime:
        false,

      usesLegacyAngle:
        false,

      usesHostTime:
        false,

      usesUTC:
        false,

      usesNTP:
        false,

      usesGPS:
        false,

      usesFrequencyHz:
        false,

      importedKnownSolarDay:
        false,
    };


    if (parsedBridge.rawPulse === null) {
      return {
        ...base,

        status:
          'WAITING_FOR_SELECTED_RAW_COUNTER',

        elapsedRawPulse:
          null,

        completedSunReturns:
          null,

        dayPhase17Exact:
          null,

        dayPhase17:
          null,

        dayPhase17Octal:
          null,

        clock:
          null,
      };
    }

    if (
      currentRecovered === null &&
      this._lockedRawPerSunReturn === null
    ) {
      return {
        ...base,

        status:
          'WAITING_FOR_SUN_RETURN_RECURRENCE',

        elapsedRawPulse:
          null,

        completedSunReturns:
          null,

        dayPhase17Exact:
          null,

        dayPhase17:
          null,

        dayPhase17Octal:
          null,

        clock:
          null,
      };
    }

    if (
      this._anchorRawPulse === null ||
      this._lockedRawPerSunReturn === null
    ) {
      return {
        ...base,

        status:
          'WAITING_FOR_ZERO_MERIDIAN_SOLAR_MIDNIGHT',

        elapsedRawPulse:
          null,

        completedSunReturns:
          null,

        dayPhase17Exact:
          null,

        dayPhase17:
          null,

        dayPhase17Octal:
          null,

        clock:
          null,
      };
    }

    if (
      parsedBridge.rawPulse <
      this._anchorRawPulse
    ) {
      throw new Error(
        'selected raw counter regressed inside one source epoch'
      );
    }

    const elapsedRaw =
      parsedBridge.rawPulse -
      this._anchorRawPulse;

    /*
     * Locked Sun-return period:
     *
     *   P = N / D raw pulses.
     *
     * Elapsed day count:
     *
     *   elapsedRaw / P
     * = elapsedRaw × D / N.
     *
     * Fractional-day remainder:
     *
     *   R = (elapsedRaw × D) mod N
     *
     * Exact DAY_PHASE17:
     *
     *   R × 131072 / N
     *
     * The represented state is floor(exact phase).
     * The recovered day scale itself is never rounded.
     */
    const N =
      this._lockedRawPerSunReturn.n;

    const D =
      this._lockedRawPerSunReturn.d;

    const scaledElapsed =
      elapsedRaw * D;

    const completedSunReturns =
      scaledElapsed / N;

    const remainder =
      scaledElapsed % N;

    const exactPhase =
      reduceFraction(
        remainder *
          STATES_PER_DAY,

        N
      );

    const state =
      exactPhase.n /
      exactPhase.d;

    if (
      state < 0n ||
      state >= STATES_PER_DAY
    ) {
      throw new Error(
        'derived DAY_PHASE17 state out of range'
      );
    }

    return {
      ...base,

      status:
        'DAY_PHASE17_CIVIL_CLOCK_ACTIVE',

      dayPhase17Established:
        true,

      civilClockActive:
        true,

      elapsedRawPulse:
        elapsedRaw.toString(),

      completedSunReturns:
        completedSunReturns.toString(),

      dayPhase17Exact:
        fractionObject(
          exactPhase
        ),

      dayPhase17:
        state.toString(),

      dayPhase17Octal:
        `${octal(state, 6)}₈`,

      clock:
        clockFromState(
          state
        ),

      interpretation:
        'EXACT RECOVERED SUN-RETURN SCALE DRIVES 2^17 NATIVE A8 CIVIL-DAY PHASE',

      nextUse:
        'REALITY_CHECK_THEN_OPTIONAL_SLOW_CIVIL_DISCIPLINE',
    };
  }
}

module.exports = {
  SCHEMA,
  SUN_RETURN_SCHEMA,
  ANCHOR_TYPE,
  ANCHOR_WITNESS,
  STATES_PER_DAY,
  HOURS_PER_DAY,
  MINUTES_PER_HOUR,
  SECONDS_PER_MINUTE,
  gcd,
  reduceFraction,
  parseInteger,
  parseFractionObject,
  fractionObject,
  clockFromState,
  parseBridge,
  parseRecoveredRecurrence,
  CivilDayPhase17,
};
