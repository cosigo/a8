'use strict';

/*
 * AUSPICIOUS 8 · v5.4.20 POST-SEAL
 * GATE 6J · EARTH AXIAL ROTATION / JOVIAN TIMEKEEPER SCALE
 *
 * Purpose:
 *
 *   recovered Mintaka recurrence in selected raw counts
 *                    ÷
 *   recovered Jovian ruler in the SAME selected raw counts
 *                    =
 *   Earth axial rotation measured in Jovian recovered recurrences
 *
 * This is a relationship between two independently recovered natural
 * observations sharing the same Gate-6F selected raw counter.
 *
 * It does NOT:
 *   - declare Mintaka to be the clock
 *   - define a civil / mean-solar day
 *   - use Sol
 *   - drive DAY_PHASE17
 *   - drive PHASE20
 *   - write A8Core
 *   - use seconds, Hz, UTC, NTP, GPS, browser or host time
 */

const SCALE_SCHEMA =
  'A8-EARTH-ROTATION-JOVIAN-SCALE-V1';

const TIMEKEEPER_SCHEMA =
  'A8-JOVIAN-PHASE-TIMEKEEPER-V1';

const EARTH_BRIDGE_SCHEMA =
  'A8-SELECTED-SOURCE-EARTH-OBSERVATION-BRIDGE-V1';

const MINTAKA_SCHEMA =
  'A8-MINTAKA-ROTATION-OBSERVER-V1';

function gcd(a, b) {
  a =
    a < 0n
      ? -a
      : a;

  b =
    b < 0n
      ? -b
      : b;

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
  if (
    numerator < 0n ||
    denominator <= 0n
  ) {
    throw new Error(
      'fraction must have non-negative numerator and positive denominator'
    );
  }

  if (numerator === 0n) {
    return {
      n: 0n,
      d: 1n,
    };
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

function positiveBigInt(
  value,
  label
) {
  const s =
    String(
      value ?? ''
    );

  if (
    !/^[1-9][0-9]*$/.test(
      s
    )
  ) {
    throw new Error(
      `${label} must be a positive integer`
    );
  }

  return BigInt(s);
}

function parsePositiveFractionText(
  value,
  label
) {
  const s =
    String(
      value ?? ''
    );

  if (
    /^[1-9][0-9]*$/.test(
      s
    )
  ) {
    return {
      n:
        BigInt(s),

      d:
        1n,
    };
  }

  const match =
    s.match(
      /^([1-9][0-9]*)\/([1-9][0-9]*)$/
    );

  if (!match) {
    throw new Error(
      `${label} must be a positive exact integer or fraction`
    );
  }

  return reduceFraction(
    BigInt(
      match[1]
    ),

    BigInt(
      match[2]
    )
  );
}

function fractionObject(
  fraction
) {
  const reduced =
    reduceFraction(
      fraction.n,
      fraction.d
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
        ? reduced.n
            .toString(8) +
          '₈'
        : null,
  };
}

function baseSnapshot(
  timekeeper,
  earthBridge
) {
  return {
    schema:
      SCALE_SCHEMA,

    role:
      'EARTH_AXIAL_ROTATION_MEASURED_AGAINST_RECOVERED_JOVIAN_TIMEKEEPER',

    sourceEpoch:
      timekeeper.sourceEpoch,

    mode:
      timekeeper.mode,

    rig:
      timekeeper.rig,

    equation:
      'MINTAKA_RAW_PER_ROTATION / JOVIAN_RAW_PER_RECURRENCE',

    rawCounterAuthority:
      'GATE6F_SELECTED_RAW_OSCILLATOR_INPUT',

    mintakaRole:
      'EARTH_AXIAL_ROTATION_WITNESS',

    jovianRole:
      'PRIMARY_RECOVERED_ELAPSED_TIME_RULER',

    civilDayEstablished:
      false,

    meanSolarDayEstablished:
      false,

    usesSol:
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

    usesLegacyTime:
      false,

    usesHostTime:
      false,

    usesFrequencyHz:
      false,

    mintakaEventCount:
      earthBridge.mintaka &&
      Number.isSafeInteger(
        earthBridge.mintaka.eventCount
      )
        ? earthBridge.mintaka.eventCount
        : 0,
  };
}

function deriveEarthRotationJovianScale(
  timekeeper,
  earthBridge
) {
  if (
    !timekeeper ||
    typeof timekeeper !==
      'object' ||
    Array.isArray(
      timekeeper
    ) ||
    timekeeper.schema !==
      TIMEKEEPER_SCHEMA
  ) {
    throw new Error(
      `timekeeper schema must be ${TIMEKEEPER_SCHEMA}`
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
    timekeeper.sourceEpoch !==
    earthBridge.sourceEpoch
  ) {
    throw new Error(
      'Gate-6H and Gate-6I sourceEpoch disagree'
    );
  }

  if (
    !earthBridge.mintaka ||
    earthBridge.mintaka.schema !==
      MINTAKA_SCHEMA
  ) {
    throw new Error(
      `Mintaka schema must be ${MINTAKA_SCHEMA}`
    );
  }

  const base =
    baseSnapshot(
      timekeeper,
      earthBridge
    );

  if (
    timekeeper.lockedRulerRawPer512 ===
      null
  ) {
    return {
      ...base,

      status:
        'WAITING_FOR_JOVIAN_RULER',

      jovianRawPerRecoveredRecurrence:
        null,

      mintakaRawPerEarthAxialRotation:
        null,

      earthAxialRotationInJovianRecurrences:
        null,

      jovianPhaseStatesPerEarthAxialRotation:
        null,
    };
  }

  const jovianRaw =
    parsePositiveFractionText(
      timekeeper.lockedRulerRawPer512,
      'recovered Jovian raw ruler'
    );

  const recurrence =
    earthBridge.mintaka.recurrence;

  if (
    earthBridge.mintaka.status !==
      'RECOVERED' ||
    recurrence === null
  ) {
    return {
      ...base,

      status:
        'WAITING_FOR_MINTAKA_RECURRENCE',

      jovianRawPerRecoveredRecurrence:
        fractionObject(
          jovianRaw
        ),

      mintakaRawPerEarthAxialRotation:
        null,

      earthAxialRotationInJovianRecurrences:
        null,

      jovianPhaseStatesPerEarthAxialRotation:
        null,
    };
  }

  const mintakaRaw =
    reduceFraction(
      positiveBigInt(
        recurrence.reducedNumerator,
        'Mintaka reduced numerator'
      ),

      positiveBigInt(
        recurrence.reducedDenominator,
        'Mintaka reduced denominator'
      )
    );

  /*
   * Earth rotation in Jovian recovered recurrences:
   *
   *   (Mintaka raw / rotation)
   *   ------------------------
   *   (Jovian raw / recurrence)
   *
   * = mintaka.n * jovian.d
   *   ----------------------
   *   mintaka.d * jovian.n
   */
  const rotationInJovian =
    reduceFraction(
      mintakaRaw.n *
        jovianRaw.d,

      mintakaRaw.d *
        jovianRaw.n
    );

  /*
   * Gate-6H defines one recovered Jovian recurrence as 512 PHASE9 states.
   * This is NOT DAY_PHASE17.
   */
  const phaseStates =
    reduceFraction(
      rotationInJovian.n *
        512n,

      rotationInJovian.d
    );

  return {
    ...base,

    status:
      'EARTH_AXIAL_ROTATION_SCALE_RECOVERED',

    jovianRawPerRecoveredRecurrence:
      fractionObject(
        jovianRaw
      ),

    mintakaRawPerEarthAxialRotation:
      fractionObject(
        mintakaRaw
      ),

    earthAxialRotationInJovianRecurrences:
      fractionObject(
        rotationInJovian
      ),

    jovianPhaseStatesPerEarthAxialRotation:
      fractionObject(
        phaseStates
      ),

    interpretation:
      'ONE MINTAKA EARTH-ROTATION RECURRENCE MEASURED BY THE RECOVERED JOVIAN ELAPSED-TIME RULER',
  };
}

module.exports = {
  SCALE_SCHEMA,
  TIMEKEEPER_SCHEMA,
  EARTH_BRIDGE_SCHEMA,
  MINTAKA_SCHEMA,
  gcd,
  reduceFraction,
  positiveBigInt,
  parsePositiveFractionText,
  fractionObject,
  deriveEarthRotationJovianScale,
};
