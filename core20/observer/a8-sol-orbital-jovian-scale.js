'use strict';

/*
 * AUSPICIOUS 8 · v5.4.20 POST-SEAL
 * GATE 6K · SOL ORBITAL ADVANCE / JOVIAN-MINTAKA SCALE
 *
 * Purpose:
 *
 *   Gate 6J already establishes:
 *
 *     Earth axial rotation
 *       measured in recovered Jovian recurrences.
 *
 *   Gate 6I already provides:
 *
 *     Sol native A8 celestial-angle advance / selected raw pulse.
 *
 *   Gate 6K combines those two read-only results to recover:
 *
 *     Sol A8-angle advance / recovered Jovian recurrence
 *
 *   and:
 *
 *     Sol A8-angle advance / Earth axial rotation.
 *
 * This gate does NOT:
 *   - recover a solar day
 *   - define Mean Sun
 *   - define civil day
 *   - drive DAY_PHASE17
 *   - drive PHASE20
 *   - write A8Core
 *   - discipline the Jovian ruler
 *   - use legacy seconds / Hz / UTC / NTP / GPS
 *   - use an expected year or orbital rate
 */

const SCALE_SCHEMA =
  'A8-SOL-ORBITAL-JOVIAN-SCALE-V1';

const EARTH_ROTATION_SCALE_SCHEMA =
  'A8-EARTH-ROTATION-JOVIAN-SCALE-V1';

const EARTH_BRIDGE_SCHEMA =
  'A8-SELECTED-SOURCE-EARTH-OBSERVATION-BRIDGE-V1';

const SOL_SCHEMA =
  'A8-SOL-CELESTIAL-OBSERVER-V1';

const FULL_TURN =
  512n;

function absBigInt(value) {
  return value < 0n
    ? -value
    : value;
}

function gcd(a, b) {
  a = absBigInt(a);
  b = absBigInt(b);

  while (b !== 0n) {
    const t =
      a % b;

    a = b;
    b = t;
  }

  return a;
}

function reduceFraction(
  numerator,
  denominator
) {
  if (denominator === 0n) {
    throw new Error(
      'fraction denominator must be non-zero'
    );
  }

  if (denominator < 0n) {
    numerator =
      -numerator;

    denominator =
      -denominator;
  }

  const g =
    gcd(
      numerator,
      denominator
    );

  return {
    n:
      numerator / g,

    d:
      denominator / g,
  };
}

function parseInteger(
  value,
  label
) {
  const text =
    String(
      value ?? ''
    );

  if (
    !/^-?(0|[1-9][0-9]*)$/.test(
      text
    )
  ) {
    throw new Error(
      `${label} must be an integer`
    );
  }

  return BigInt(
    text
  );
}

function parseFractionObject(
  value,
  label,
  {
    allowZero =
      false,
  } = {}
) {
  if (
    !value ||
    typeof value !==
      'object' ||
    Array.isArray(
      value
    )
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

  if (d <= 0n) {
    throw new Error(
      `${label}.denominator must be positive`
    );
  }

  if (
    allowZero
      ? n < 0n
      : n <= 0n
  ) {
    throw new Error(
      allowZero
        ? `${label}.numerator must be non-negative`
        : `${label}.numerator must be positive`
    );
  }

  return reduceFraction(
    n,
    d
  );
}

function multiply(
  a,
  b
) {
  return reduceFraction(
    a.n *
      b.n,

    a.d *
      b.d
  );
}

function divideByInteger(
  value,
  integer
) {
  if (integer <= 0n) {
    throw new Error(
      'division integer must be positive'
    );
  }

  return reduceFraction(
    value.n,
    value.d *
      integer
  );
}

function fractionObject(
  value
) {
  if (value === null) {
    return null;
  }

  const reduced =
    reduceFraction(
      value.n,
      value.d
    );

  const text =
    reduced.d === 1n
      ? reduced.n.toString()
      : `${reduced.n.toString()}/${reduced.d.toString()}`;

  return {
    numerator:
      reduced.n.toString(),

    denominator:
      reduced.d.toString(),

    text,

    integer:
      reduced.d === 1n
        ? reduced.n.toString()
        : null,

    integerOctal:
      reduced.d === 1n
        ? (
            reduced.n.toString(8) +
            '₈'
          )
        : null,
  };
}

function baseSnapshot(
  earthRotationScale,
  earthBridge
) {
  return {
    schema:
      SCALE_SCHEMA,

    role:
      'SOL_ORBITAL_ADVANCE_MEASURED_AGAINST_RECOVERED_JOVIAN_MINTAKA_FRAME',

    sourceEpoch:
      earthRotationScale.sourceEpoch,

    mode:
      earthRotationScale.mode,

    rig:
      earthRotationScale.rig,

    jovianRole:
      'PRIMARY_RECOVERED_ELAPSED_TIME_RULER',

    mintakaRole:
      'EARTH_AXIAL_ROTATION_WITNESS',

    solRole:
      'EARTH_ORBITAL_ADVANCE_WITNESS',

    rawCounterAuthority:
      'GATE6F_SELECTED_RAW_OSCILLATOR_INPUT',

    equation:
      'SOL_ANGLE_PER_RAW × JOVIAN_RAW_PER_RECURRENCE',

    secondaryEquation:
      'SOL_ANGLE_PER_JOVIAN_RECURRENCE × EARTH_ROTATION_IN_JOVIAN_RECURRENCES',

    civilDayEstablished:
      false,

    meanSolarDayEstablished:
      false,

    solarRecurrenceEstablished:
      false,

    dayPhase17Driven:
      false,

    phase20Driven:
      false,

    writesA8Core:
      false,

    writesClock:
      false,

    writesPhase:
      false,

    writesDivider:
      false,

    writesAuthority:
      false,

    disciplinesJovianRuler:
      false,

    usesLegacyTime:
      false,

    usesLegacyAngle:
      false,

    usesHostTime:
      false,

    usesFrequencyHz:
      false,

    usesExpectedSolarPeriod:
      false,

    usesExpectedOrbitalRate:
      false,

    usesExpectedYear:
      false,

    solSampleCount:
      earthBridge.sol &&
      Number.isSafeInteger(
        earthBridge.sol.sampleCount
      )
        ? earthBridge.sol.sampleCount
        : 0,

    solIntervalCount:
      earthBridge.sol &&
      Number.isSafeInteger(
        earthBridge.sol.intervalCount
      )
        ? earthBridge.sol.intervalCount
        : 0,
  };
}

function deriveSolOrbitalJovianScale(
  earthRotationScale,
  earthBridge
) {
  if (
    !earthRotationScale ||
    typeof earthRotationScale !==
      'object' ||
    Array.isArray(
      earthRotationScale
    ) ||
    earthRotationScale.schema !==
      EARTH_ROTATION_SCALE_SCHEMA
  ) {
    throw new Error(
      `Earth rotation scale schema must be ${EARTH_ROTATION_SCALE_SCHEMA}`
    );
  }

  if (
    !earthBridge ||
    typeof earthBridge !==
      'object' ||
    Array.isArray(
      earthBridge
    ) ||
    earthBridge.schema !==
      EARTH_BRIDGE_SCHEMA
  ) {
    throw new Error(
      `Earth bridge schema must be ${EARTH_BRIDGE_SCHEMA}`
    );
  }

  if (
    earthRotationScale.sourceEpoch !==
      earthBridge.sourceEpoch
  ) {
    throw new Error(
      'Gate-6J scale and Gate-6I Earth bridge sourceEpoch disagree'
    );
  }

  if (
    !earthBridge.sol ||
    earthBridge.sol.schema !==
      SOL_SCHEMA
  ) {
    throw new Error(
      `Sol schema must be ${SOL_SCHEMA}`
    );
  }

  const base =
    baseSnapshot(
      earthRotationScale,
      earthBridge
    );

  if (
    earthRotationScale.status !==
      'EARTH_AXIAL_ROTATION_SCALE_RECOVERED'
  ) {
    return {
      ...base,

      status:
        'WAITING_FOR_EARTH_ROTATION_SCALE',

      jovianRawPerRecoveredRecurrence:
        null,

      earthAxialRotationInJovianRecurrences:
        null,

      solAdvancePerRawPulse512:
        null,

      solAdvancePerJovianRecurrence512:
        null,

      solAdvancePerEarthAxialRotation512:
        null,

      orbitTurnFractionPerEarthAxialRotation:
        null,
    };
  }

  const jovianRaw =
    parseFractionObject(
      earthRotationScale
        .jovianRawPerRecoveredRecurrence,

      'Jovian raw per recovered recurrence'
    );

  const earthRotationInJovian =
    parseFractionObject(
      earthRotationScale
        .earthAxialRotationInJovianRecurrences,

      'Earth rotation in Jovian recurrences'
    );

  const sol =
    earthBridge.sol;

  if (
    sol.status !==
      'TRACKING' ||
    sol.forwardAdvancePerRawPulse512 ===
      null
  ) {
    return {
      ...base,

      status:
        'WAITING_FOR_SOL_TRACKING',

      jovianRawPerRecoveredRecurrence:
        fractionObject(
          jovianRaw
        ),

      earthAxialRotationInJovianRecurrences:
        fractionObject(
          earthRotationInJovian
        ),

      solAdvancePerRawPulse512:
        null,

      solAdvancePerJovianRecurrence512:
        null,

      solAdvancePerEarthAxialRotation512:
        null,

      orbitTurnFractionPerEarthAxialRotation:
        null,
    };
  }

  const solAdvancePerRaw =
    parseFractionObject(
      sol.forwardAdvancePerRawPulse512,
      'Sol advance per raw pulse',
      {
        allowZero:
          true,
      }
    );

  if (
    solAdvancePerRaw.n ===
      0n
  ) {
    return {
      ...base,

      status:
        'WAITING_FOR_POSITIVE_SOL_ADVANCE',

      jovianRawPerRecoveredRecurrence:
        fractionObject(
          jovianRaw
        ),

      earthAxialRotationInJovianRecurrences:
        fractionObject(
          earthRotationInJovian
        ),

      solAdvancePerRawPulse512:
        fractionObject(
          solAdvancePerRaw
        ),

      solAdvancePerJovianRecurrence512:
        null,

      solAdvancePerEarthAxialRotation512:
        null,

      orbitTurnFractionPerEarthAxialRotation:
        null,
    };
  }

  /*
   * A8 angle / raw
   * ×
   * raw / recovered Jovian recurrence
   * =
   * A8 angle / recovered Jovian recurrence
   */
  const advancePerJovian =
    multiply(
      solAdvancePerRaw,
      jovianRaw
    );

  /*
   * A8 angle / Jovian recurrence
   * ×
   * Jovian recurrences / Earth axial rotation
   * =
   * A8 angle / Earth axial rotation
   */
  const advancePerEarthRotation =
    multiply(
      advancePerJovian,
      earthRotationInJovian
    );

  const orbitTurnFraction =
    divideByInteger(
      advancePerEarthRotation,
      FULL_TURN
    );

  return {
    ...base,

    status:
      'SOL_ORBITAL_ADVANCE_SCALE_RECOVERED',

    jovianRawPerRecoveredRecurrence:
      fractionObject(
        jovianRaw
      ),

    earthAxialRotationInJovianRecurrences:
      fractionObject(
        earthRotationInJovian
      ),

    solAdvancePerRawPulse512:
      fractionObject(
        solAdvancePerRaw
      ),

    solAdvancePerJovianRecurrence512:
      fractionObject(
        advancePerJovian
      ),

    solAdvancePerEarthAxialRotation512:
      fractionObject(
        advancePerEarthRotation
      ),

    orbitTurnFractionPerEarthAxialRotation:
      fractionObject(
        orbitTurnFraction
      ),

    solEvidenceWindow: {
      firstRawPulse:
        sol.firstRawPulse ??
        null,

      lastRawPulse:
        sol.lastRawPulse ??
        null,

      elapsedRawPulse:
        sol.elapsedRawPulse ??
        null,

      sampleCount:
        sol.sampleCount ??
        null,

      intervalCount:
        sol.intervalCount ??
        null,
    },

    interpretation:
      'SOL ORBITAL ADVANCE MEASURED IN THE SAME SELECTED RAW / JOVIAN / MINTAKA FRAME',

    nextUse:
      'GATE6L_RELATIVE_SUN_RETURN_RECURRENCE_ONLY',
  };
}

module.exports = {
  SCALE_SCHEMA,
  EARTH_ROTATION_SCALE_SCHEMA,
  EARTH_BRIDGE_SCHEMA,
  SOL_SCHEMA,
  FULL_TURN,
  gcd,
  reduceFraction,
  parseInteger,
  parseFractionObject,
  multiply,
  divideByInteger,
  fractionObject,
  deriveSolOrbitalJovianScale,
};
