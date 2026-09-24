'use strict';

/*
 * AUSPICIOUS 8 · v5.4.20 POST-SEAL
 * MINTAKA STELLAR ROTATION CLOCK
 *
 * Recovered Mintaka Earth-rotation recurrence
 *             ↓
 * exact 2^17 phase mapping
 *             ↓
 * 32 × 64 × 64
 *
 * ROLE BOUNDARY:
 *   - independent stellar-rotation clock
 *   - downstream of the read-only Mintaka observer
 *   - uses the selected raw counter only
 *   - does not drive the civil clock
 *   - does not write Jupiter, Mintaka, Sol, Ship Slip, calendar or authority
 *   - no UTC, NTP, GPS, legacy seconds, Hz, browser or host-time pacing
 *
 * Lock policy:
 *   The first recovered Mintaka recurrence seen inside one sourceEpoch is
 *   locked. Later observations may reveal a different recurrence but cannot
 *   silently retune this clock. A sourceEpoch change rearms the lock.
 */

const SCHEMA =
  'A8-MINTAKA-PHASE17-CLOCK-V1';

const EARTH_SCALE_SCHEMA =
  'A8-EARTH-ROTATION-JOVIAN-SCALE-V1';

const MINTAKA_SCHEMA =
  'A8-MINTAKA-ROTATION-OBSERVER-V1';

const STATES_PER_ROTATION = 131072n;

const HOURS_PER_ROTATION = 32n;
const MINUTES_PER_HOUR = 64n;
const SECONDS_PER_MINUTE = 64n;

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
    throw new Error(
      'fraction denominator must be non-zero'
    );
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
    throw new Error(
      `${label} must be an integer`
    );
  }

  return BigInt(text);
}

function parsePositiveFraction(value, label) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    throw new Error(
      `${label} must be a fraction object`
    );
  }

  const n =
    parseInteger(
      value.numerator,
      `${label}.numerator`
    );

  const d =
    parseInteger(
      value.denominator,
      `${label}.denominator`
    );

  if (n <= 0n || d <= 0n) {
    throw new Error(
      `${label} must be positive`
    );
  }

  return reduceFraction(n, d);
}

function fractionObject(value) {
  const r =
    reduceFraction(
      value.n,
      value.d
    );

  return {
    numerator: r.n.toString(),
    denominator: r.d.toString(),

    text:
      r.d === 1n
        ? r.n.toString()
        : `${r.n}/${r.d}`,

    integer:
      r.d === 1n
        ? r.n.toString()
        : null,
  };
}

function sameFraction(a, b) {
  const aa =
    reduceFraction(a.n, a.d);

  const bb =
    reduceFraction(b.n, b.d);

  return (
    aa.n === bb.n &&
    aa.d === bb.d
  );
}

function octal(value, width) {
  return value
    .toString(8)
    .padStart(width, '0');
}

function binary(value, width) {
  return value
    .toString(2)
    .padStart(width, '0');
}

function clockFromState(state) {
  if (
    state < 0n ||
    state >= STATES_PER_ROTATION
  ) {
    throw new Error(
      'MINTAKA_PHASE17 state must be inside one 2^17 rotation'
    );
  }

  const hour =
    state /
    (
      MINUTES_PER_HOUR *
      SECONDS_PER_MINUTE
    );

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
    hourDecimal:
      hour.toString(),

    minuteDecimal:
      minute.toString(),

    secondDecimal:
      second.toString(),

    hourOctal:
      octal(hour, 2),

    minuteOctal:
      octal(minute, 2),

    secondOctal:
      octal(second, 2),

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
      'sourceEpoch must be a positive safe integer'
    );
  }

  let rawPulse = null;

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
        'selected raw pulse must be non-negative'
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

function parseRecoveredMintaka(
  scale,
  observer
) {
  if (
    !scale ||
    typeof scale !== 'object' ||
    Array.isArray(scale) ||
    scale.schema !==
      EARTH_SCALE_SCHEMA ||
    scale.status !==
      'EARTH_AXIAL_ROTATION_SCALE_RECOVERED' ||
    !scale.mintakaRawPerEarthAxialRotation
  ) {
    return null;
  }

  if (
    !observer ||
    typeof observer !== 'object' ||
    Array.isArray(observer) ||
    observer.schema !==
      MINTAKA_SCHEMA ||
    observer.status !==
      'RECOVERED' ||
    observer.lastRawPulse === null ||
    observer.lastRawPulse === undefined
  ) {
    return null;
  }

  const rawPerRotation =
    parsePositiveFraction(
      scale.mintakaRawPerEarthAxialRotation,
      'Mintaka raw per Earth axial rotation'
    );

  const anchorRawPulse =
    parseInteger(
      observer.lastRawPulse,
      'Mintaka lastRawPulse'
    );

  if (anchorRawPulse < 0n) {
    throw new Error(
      'Mintaka lastRawPulse must be non-negative'
    );
  }

  return {
    rawPerRotation,
    anchorRawPulse,

    eventCount:
      observer.eventCount ?? null,

    cycleCount:
      observer.cycleCount ?? null,
  };
}

class MintakaPhase17 {
  constructor() {
    this._sourceEpoch = null;
    this._mode = null;
    this._rig = null;

    this._anchorRawPulse = null;
    this._lockedRawPerRotation = null;

    this._anchorEventCount = null;
    this._anchorCycleCount = null;
  }

  _clearLock() {
    this._anchorRawPulse = null;
    this._lockedRawPerRotation = null;
    this._anchorEventCount = null;
    this._anchorCycleCount = null;
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

      this._clearLock();
    } else {
      this._mode =
        parsed.mode;

      this._rig =
        parsed.rig;
    }

    return parsed;
  }

  snapshot(
    bridge,
    scale,
    observer
  ) {
    const parsedBridge =
      this.syncSource(bridge);

    const base = {
      schema: SCHEMA,

      role:
        'INDEPENDENT_MINTAKA_STELLAR_ROTATION_CLOCK',

      mode:
        'DOWNSTREAM_READ_ONLY',

      sourceEpoch:
        this._sourceEpoch,

      sourceMode:
        this._mode,

      rig:
        this._rig,

      statesPerRotation:
        STATES_PER_ROTATION.toString(),

      divider:
        '32×64×64',

      registerBits:
        17,

      writesA8Core: false,
      writesJovianTimekeeper: false,
      writesMintakaObserver: false,
      writesSolObserver: false,
      writesTerraShipSlip: false,
      writesCivilClock: false,
      writesCalendar: false,
      changesAuthority: false,

      usesHostTime: false,
      usesLegacyTime: false,
      usesFrequencyHz: false,
      usesUTC: false,
      usesNTP: false,
      usesGPS: false,

      lockPolicy:
        'LOCK_FIRST_RECOVERED_MINTAKA_RECURRENCE_PER_SOURCE_EPOCH_NO_SILENT_RETUNE',
    };

    if (parsedBridge.rawPulse === null) {
      return {
        ...base,

        status:
          'WAITING_FOR_SELECTED_RAW_PULSE',

        mintakaPhase17Established:
          false,
      };
    }

    const recovered =
      parseRecoveredMintaka(
        scale,
        observer
      );

    if (recovered === null) {
      return {
        ...base,

        status:
          'WAITING_FOR_RECOVERED_MINTAKA_RECURRENCE',

        mintakaPhase17Established:
          false,
      };
    }

    if (
      this._lockedRawPerRotation ===
        null
    ) {
      this._lockedRawPerRotation =
        recovered.rawPerRotation;

      this._anchorRawPulse =
        recovered.anchorRawPulse;

      this._anchorEventCount =
        recovered.eventCount;

      this._anchorCycleCount =
        recovered.cycleCount;
    }

    if (
      parsedBridge.rawPulse <
        this._anchorRawPulse
    ) {
      throw new Error(
        'selected raw counter regressed behind Mintaka clock anchor inside one source epoch'
      );
    }

    const observedRecurrenceChanged =
      !sameFraction(
        recovered.rawPerRotation,
        this._lockedRawPerRotation
      );

    const elapsedRaw =
      parsedBridge.rawPulse -
      this._anchorRawPulse;

    const N =
      this._lockedRawPerRotation.n;

    const D =
      this._lockedRawPerRotation.d;

    const scaledElapsed =
      elapsedRaw * D;

    const completedRotations =
      scaledElapsed / N;

    const remainder =
      scaledElapsed % N;

    const exactPhase =
      reduceFraction(
        remainder *
          STATES_PER_ROTATION,
        N
      );

    const state =
      exactPhase.n /
      exactPhase.d;

    if (
      state < 0n ||
      state >= STATES_PER_ROTATION
    ) {
      throw new Error(
        'derived MINTAKA_PHASE17 state out of range'
      );
    }

    return {
      ...base,

      status:
        'MINTAKA_PHASE17_STELLAR_CLOCK_ACTIVE',

      mintakaPhase17Established:
        true,

      stellarClockActive:
        true,

      anchor: {
        eventType:
          'STELLAR_MERIDIAN',

        witness:
          'MINTAKA',

        rawPulse:
          this._anchorRawPulse.toString(),

        eventCount:
          this._anchorEventCount,

        cycleCount:
          this._anchorCycleCount,
      },

      lockedRawPerEarthAxialRotation:
        fractionObject(
          this._lockedRawPerRotation
        ),

      currentlyObservedRawPerEarthAxialRotation:
        fractionObject(
          recovered.rawPerRotation
        ),

      observedRecurrenceChanged,

      selectedRawPulse:
        parsedBridge.rawPulse.toString(),

      elapsedRawPulse:
        elapsedRaw.toString(),

      completedMintakaRotations:
        completedRotations.toString(),

      mintakaPhase17Exact:
        fractionObject(
          exactPhase
        ),

      mintakaPhase17:
        state.toString(),

      mintakaPhase17Binary:
        binary(state, 17),

      mintakaPhase17Octal:
        `${octal(state, 6)}₈`,

      clock:
        clockFromState(
          state
        ),

      interpretation:
        'RECOVERED MINTAKA EARTH-ROTATION RECURRENCE DRIVES INDEPENDENT 2^17 STELLAR PHASE',

      nextUse:
        'COMPARE_FUTURE_MINTAKA_TRANSITS_WITH_LOCKED_STELLAR_CLOCK',
    };
  }
}

module.exports = {
  SCHEMA,
  EARTH_SCALE_SCHEMA,
  MINTAKA_SCHEMA,
  STATES_PER_ROTATION,
  HOURS_PER_ROTATION,
  MINUTES_PER_HOUR,
  SECONDS_PER_MINUTE,
  gcd,
  reduceFraction,
  parseInteger,
  parsePositiveFraction,
  fractionObject,
  clockFromState,
  parseBridge,
  parseRecoveredMintaka,
  MintakaPhase17,
};
