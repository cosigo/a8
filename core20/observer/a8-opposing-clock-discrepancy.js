'use strict';

/*
 * AUSPICIOUS 8 · v5.4.20 POST-SEAL
 * MINTAKA ↔ CIVIL OPPOSING-CLOCK DISCREPANCY
 *
 * Two independently recovered native recurrences
 * share one selected raw counter.
 *
 * This diagnostic establishes one common raw-pulse anchor,
 * locks both recurrences for that sourceEpoch, and exposes:
 *
 *   1. unwrapped accumulated discrepancy;
 *   2. directed wrapped phase;
 *   3. shortest geometric separation;
 *   4. outbound / opposition / return / alignment;
 *   5. completed relative-beat carries;
 *   6. exact relative-beat closure;
 *   7. later recurrence mismatch without silent retuning.
 *
 * IMPORTANT:
 *
 * Wrapped realignment does NOT erase accumulated discrepancy.
 *
 * If the clocks separate by one complete relative revolution,
 * their wrapped phases realign while the unwrapped accumulator
 * records one full turn.
 *
 * PURE DOWNSTREAM DERIVATION.
 *
 * No clock is retuned.
 * No observer is written.
 * No Ship Slip accumulator is written.
 * No calendar is written.
 * No authority is changed.
 *
 * Selected raw pulse is the only progression input.
 */

const SCHEMA =
  'A8-OPPOSING-CLOCK-DISCREPANCY-V1';

const EARTH_SCALE_SCHEMA =
  'A8-EARTH-ROTATION-JOVIAN-SCALE-V1';

const SUN_RETURN_SCHEMA =
  'A8-SUN-RETURN-RECURRENCE-V1';

const STATES_PHASE17 =
  131072n;

const ANGLE_STATES_PER_TURN =
  512n;

const HALF_TURN_PHASE17 =
  STATES_PHASE17 / 2n;

function absBigInt(value) {
  return value < 0n
    ? -value
    : value;
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

function reduceFraction(n, d) {
  if (d === 0n) {
    throw new Error(
      'fraction denominator must be non-zero'
    );
  }

  if (d < 0n) {
    n = -n;
    d = -d;
  }

  if (n === 0n) {
    return {
      n: 0n,
      d: 1n,
    };
  }

  const g =
    gcd(n, d);

  return {
    n: n / g,
    d: d / g,
  };
}

function parseInteger(value, label) {
  const text =
    String(value ?? '');

  if (
    !/^-?(0|[1-9][0-9]*)$/.test(text)
  ) {
    throw new Error(
      `${label} must be an integer`
    );
  }

  return BigInt(text);
}

function parsePositiveFraction(
  value,
  label
) {
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

  return reduceFraction(
    n,
    d
  );
}

function fractionObject(value) {
  const r =
    reduceFraction(
      value.n,
      value.d
    );

  return {
    numerator:
      r.n.toString(),

    denominator:
      r.d.toString(),

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

function multiply(a, b) {
  return reduceFraction(
    a.n * b.n,
    a.d * b.d
  );
}

function subtract(a, b) {
  return reduceFraction(
    a.n * b.d -
      b.n * a.d,

    a.d * b.d
  );
}

function reciprocalPositive(value) {
  if (value.n <= 0n) {
    throw new Error(
      'reciprocal requires positive fraction'
    );
  }

  return reduceFraction(
    value.d,
    value.n
  );
}

function absoluteFraction(value) {
  return reduceFraction(
    absBigInt(value.n),
    value.d
  );
}

function compareFractions(a, b) {
  const left =
    a.n * b.d;

  const right =
    b.n * a.d;

  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}

function sameFraction(a, b) {
  return (
    compareFractions(
      a,
      b
    ) === 0
  );
}

function integerFraction(value) {
  return {
    n: value,
    d: 1n,
  };
}

function moduloOnePositive(value) {
  if (value.n < 0n) {
    throw new Error(
      'moduloOnePositive requires non-negative fraction'
    );
  }

  return reduceFraction(
    value.n % value.d,
    value.d
  );
}

function floorPositiveFraction(value) {
  if (value.n < 0n) {
    throw new Error(
      'floorPositiveFraction requires non-negative fraction'
    );
  }

  return value.n / value.d;
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

function parseMintakaRecurrence(
  scale
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

  return parsePositiveFraction(
    scale.mintakaRawPerEarthAxialRotation,
    'Mintaka raw per Earth axial rotation'
  );
}

function parseCivilRecurrence(
  recurrence
) {
  if (
    !recurrence ||
    typeof recurrence !== 'object' ||
    Array.isArray(recurrence) ||
    recurrence.schema !==
      SUN_RETURN_SCHEMA ||
    recurrence.status !==
      'SUN_RETURN_RECURRENCE_RECOVERED' ||
    recurrence.solarRecurrenceEstablished !==
      true ||
    recurrence.rawPerSunReturnRecurrence ===
      null ||
    recurrence.rawPerSunReturnRecurrence ===
      undefined
  ) {
    return null;
  }

  return parsePositiveFraction(
    recurrence.rawPerSunReturnRecurrence,
    'raw per Sun-return recurrence'
  );
}

const BOUNDARY = Object.freeze({
  nativeOnly: true,

  writesA8Core: false,
  writesJovianTimekeeper: false,
  writesMintakaObserver: false,
  writesSolObserver: false,
  writesTerraShipSlip: false,
  writesCivilClock: false,
  writesCalendar: false,

  changesAuthority: false,

  usesHostTime: false,
  usesBrowserTime: false,
  usesLegacyTime: false,
  usesFrequencyHz: false,
  usesUTC: false,
  usesNTP: false,
  usesGPS: false,
});

class OpposingClockDiscrepancy {
  constructor() {
    this._sourceEpoch = null;
    this._mode = null;
    this._rig = null;

    this._anchorRawPulse = null;

    this._lockedMintakaRawPerRotation =
      null;

    this._lockedCivilRawPerSunReturn =
      null;
  }

  _clearLock() {
    this._anchorRawPulse = null;

    this._lockedMintakaRawPerRotation =
      null;

    this._lockedCivilRawPerSunReturn =
      null;
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
    earthScale,
    sunReturnRecurrence
  ) {
    const parsedBridge =
      this.syncSource(
        bridge
      );

    const observedMintaka =
      parseMintakaRecurrence(
        earthScale
      );

    const observedCivil =
      parseCivilRecurrence(
        sunReturnRecurrence
      );

    const base = {
      schema:
        SCHEMA,

      role:
        'READ_ONLY_OPPOSING_NATIVE_CLOCK_DIAGNOSTIC',

      sourceEpoch:
        this._sourceEpoch,

      mode:
        this._mode,

      rig:
        this._rig,

      accumulatorMethod:
        'COMMON_RAW_ANCHOR_EXACT_RATIONAL',

      ...BOUNDARY,
    };

    if (
      parsedBridge.rawPulse === null
    ) {
      return {
        ...base,

        status:
          'WAITING_FOR_SELECTED_RAW_PULSE',

        ready: false,
      };
    }

    if (
      observedMintaka === null ||
      observedCivil === null
    ) {
      return {
        ...base,

        status:
          'WAITING_FOR_BOTH_RECOVERED_RECURRENCES',

        ready: false,

        observed: {
          mintakaReady:
            observedMintaka !== null,

          civilReady:
            observedCivil !== null,
        },
      };
    }

    if (
      this._anchorRawPulse === null
    ) {
      this._anchorRawPulse =
        parsedBridge.rawPulse;

      this._lockedMintakaRawPerRotation =
        observedMintaka;

      this._lockedCivilRawPerSunReturn =
        observedCivil;
    }

    if (
      parsedBridge.rawPulse <
        this._anchorRawPulse
    ) {
      throw new Error(
        'selected raw pulse moved backward inside one sourceEpoch'
      );
    }

    const elapsedRaw =
      parsedBridge.rawPulse -
      this._anchorRawPulse;

    /*
     * rawPerCycle = N/D raw pulses.
     *
     * Therefore:
     *
     * cycles per raw pulse = D/N.
     */

    const mintakaRate =
      reduceFraction(
        this
          ._lockedMintakaRawPerRotation
          .d,

        this
          ._lockedMintakaRawPerRotation
          .n
      );

    const civilRate =
      reduceFraction(
        this
          ._lockedCivilRawPerSunReturn
          .d,

        this
          ._lockedCivilRawPerSunReturn
          .n
      );

    const relativeRate =
      subtract(
        mintakaRate,
        civilRate
      );

    const elapsed =
      integerFraction(
        elapsedRaw
      );

    const mintakaRotations =
      multiply(
        elapsed,
        mintakaRate
      );

    const civilReturns =
      multiply(
        elapsed,
        civilRate
      );

    const discrepancyRotations =
      subtract(
        mintakaRotations,
        civilReturns
      );

    const discrepancyPhase17 =
      multiply(
        discrepancyRotations,
        integerFraction(
          STATES_PHASE17
        )
      );

    const discrepancyAngle512 =
      multiply(
        discrepancyRotations,
        integerFraction(
          ANGLE_STATES_PER_TURN
        )
      );

    const absDiscrepancyRotations =
      absoluteFraction(
        discrepancyRotations
      );

    const completedRelativeBeats =
      floorPositiveFraction(
        absDiscrepancyRotations
      );

    const beatPosition =
      moduloOnePositive(
        absDiscrepancyRotations
      );

    const oneMinusBeatPosition =
      subtract(
        integerFraction(1n),
        beatPosition
      );

    const geometricSeparation =
      compareFractions(
        beatPosition,
        oneMinusBeatPosition
      ) <= 0
        ? beatPosition
        : oneMinusBeatPosition;

    const geometricPhase17 =
      multiply(
        geometricSeparation,
        integerFraction(
          STATES_PHASE17
        )
      );

    const geometricAngle512 =
      multiply(
        geometricSeparation,
        integerFraction(
          ANGLE_STATES_PER_TURN
        )
      );

    let geometricLeg;

    if (beatPosition.n === 0n) {
      geometricLeg =
        'ALIGNED';
    } else {
      const comparisonToHalf =
        compareFractions(
          beatPosition,
          reduceFraction(
            1n,
            2n
          )
        );

      if (comparisonToHalf < 0) {
        geometricLeg =
          'OUTBOUND_FROM_ALIGNMENT';
      } else if (
        comparisonToHalf === 0
      ) {
        geometricLeg =
          'OPPOSITION';
      } else {
        geometricLeg =
          'RETURNING_TO_ALIGNMENT';
      }
    }

    let rateLeader;

    if (relativeRate.n > 0n) {
      rateLeader =
        'MINTAKA_FASTER';
    } else if (
      relativeRate.n < 0n
    ) {
      rateLeader =
        'CIVIL_FASTER';
    } else {
      rateLeader =
        'SAME_RATE';
    }

    let currentLeader;

    if (
      discrepancyRotations.n > 0n
    ) {
      currentLeader =
        'MINTAKA_LEADS';
    } else if (
      discrepancyRotations.n < 0n
    ) {
      currentLeader =
        'CIVIL_LEADS';
    } else {
      currentLeader =
        'ALIGNED';
    }

    let relativeBeat;

    if (relativeRate.n === 0n) {
      relativeBeat = {
        exists: false,

        reason:
          'LOCKED_RECURRENCES_HAVE_IDENTICAL_RATE',

        rawPulseSpan:
          null,

        mintakaRotationsPerBeat:
          null,

        civilReturnsPerBeat:
          null,

        completedBeats:
          completedRelativeBeats
            .toString(),

        positionWithinBeatRotations:
          fractionObject(
            beatPosition
          ),

        geometricLeg,
      };
    } else {
      const absoluteRelativeRate =
        absoluteFraction(
          relativeRate
        );

      const beatRawPulseSpan =
        reciprocalPositive(
          absoluteRelativeRate
        );

      const mintakaPerBeat =
        multiply(
          beatRawPulseSpan,
          mintakaRate
        );

      const civilPerBeat =
        multiply(
          beatRawPulseSpan,
          civilRate
        );

      relativeBeat = {
        exists: true,

        rawPulseSpan:
          fractionObject(
            beatRawPulseSpan
          ),

        mintakaRotationsPerBeat:
          fractionObject(
            mintakaPerBeat
          ),

        civilReturnsPerBeat:
          fractionObject(
            civilPerBeat
          ),

        completedBeats:
          completedRelativeBeats
            .toString(),

        positionWithinBeatRotations:
          fractionObject(
            beatPosition
          ),

        geometricSeparationRotations:
          fractionObject(
            geometricSeparation
          ),

        geometricSeparationPhase17:
          fractionObject(
            geometricPhase17
          ),

        geometricSeparationAngle512:
          fractionObject(
            geometricAngle512
          ),

        geometricLeg,
      };
    }

    return {
      ...base,

      status:
        'OPPOSING_CLOCK_DISCREPANCY_ACTIVE',

      ready: true,

      anchorRawPulse:
        this._anchorRawPulse
          .toString(),

      selectedRawPulse:
        parsedBridge.rawPulse
          .toString(),

      elapsedRawPulse:
        elapsedRaw.toString(),

      lockedRecurrences: {
        mintakaRawPerEarthAxialRotation:
          fractionObject(
            this
              ._lockedMintakaRawPerRotation
          ),

        civilRawPerSunReturn:
          fractionObject(
            this
              ._lockedCivilRawPerSunReturn
          ),
      },

      observedRecurrences: {
        mintakaRawPerEarthAxialRotation:
          fractionObject(
            observedMintaka
          ),

        civilRawPerSunReturn:
          fractionObject(
            observedCivil
          ),
      },

      observedRecurrenceChanged: {
        mintaka:
          !sameFraction(
            observedMintaka,
            this
              ._lockedMintakaRawPerRotation
          ),

        civil:
          !sameFraction(
            observedCivil,
            this
              ._lockedCivilRawPerSunReturn
          ),
      },

      rates: {
        mintakaRotationsPerRawPulse:
          fractionObject(
            mintakaRate
          ),

        civilReturnsPerRawPulse:
          fractionObject(
            civilRate
          ),

        relativeRotationsPerRawPulse:
          fractionObject(
            relativeRate
          ),

        rateLeader,
      },

      accumulated: {
        mintakaRotations:
          fractionObject(
            mintakaRotations
          ),

        civilReturns:
          fractionObject(
            civilReturns
          ),

        unwrappedDiscrepancyRotations:
          fractionObject(
            discrepancyRotations
          ),

        unwrappedDiscrepancyPhase17:
          fractionObject(
            discrepancyPhase17
          ),

        unwrappedDiscrepancyAngle512:
          fractionObject(
            discrepancyAngle512
          ),

        currentLeader,
      },

      relativeBeat,
    };
  }
}

module.exports = {
  SCHEMA,
  EARTH_SCALE_SCHEMA,
  SUN_RETURN_SCHEMA,

  STATES_PHASE17,
  ANGLE_STATES_PER_TURN,
  HALF_TURN_PHASE17,

  gcd,
  reduceFraction,
  parseInteger,
  parsePositiveFraction,
  fractionObject,
  multiply,
  subtract,
  reciprocalPositive,
  absoluteFraction,
  compareFractions,
  sameFraction,

  OpposingClockDiscrepancy,
};
