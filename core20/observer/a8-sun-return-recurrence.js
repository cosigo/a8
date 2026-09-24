'use strict';

/*
 * AUSPICIOUS 8 · v5.4.20 POST-SEAL
 * GATE 6L · SUN-RETURN RECURRENCE
 *
 * Inputs:
 *   Gate 6J · Earth axial rotation measured in recovered Jovian recurrences.
 *   Gate 6K · Sol orbital advance measured in the same Jovian/Mintaka frame.
 *
 * Native relation:
 *
 *   Earth closes 512 A8 angle units per stellar axial rotation.
 *   During that same rotation Sol advances delta A8 angle units eastward.
 *
 *   Relative Earth-vs-Sol closure per axial rotation:
 *
 *     512 - delta
 *
 *   Therefore one complete Sun return requires:
 *
 *     512 / (512 - delta)
 *
 *   Earth axial rotations.
 *
 *   Multiply by the recovered Jovian recurrences per Earth axial rotation
 *   to obtain the Sun-return recurrence in recovered Jovian time.
 *
 * No legacy day length, seconds, UTC, NTP, GPS, expected orbital rate,
 * expected year, or known sidereal/solar ratio is used.
 */

const SCHEMA =
  'A8-SUN-RETURN-RECURRENCE-V1';

const EARTH_ROTATION_SCHEMA =
  'A8-EARTH-ROTATION-JOVIAN-SCALE-V1';

const SOL_SCALE_SCHEMA =
  'A8-SOL-ORBITAL-JOVIAN-SCALE-V1';

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

function parseFractionObject(
  value,
  label,
  {
    allowZero = false,
  } = {}
) {
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

  if (d <= 0n) {
    throw new Error(`${label}.denominator must be positive`);
  }

  if (allowZero ? n < 0n : n <= 0n) {
    throw new Error(
      allowZero
        ? `${label}.numerator must be non-negative`
        : `${label}.numerator must be positive`
    );
  }

  return reduceFraction(n, d);
}

function add(a, b) {
  return reduceFraction(
    a.n * b.d + b.n * a.d,
    a.d * b.d
  );
}

function subtract(a, b) {
  return reduceFraction(
    a.n * b.d - b.n * a.d,
    a.d * b.d
  );
}

function multiply(a, b) {
  return reduceFraction(
    a.n * b.n,
    a.d * b.d
  );
}

function divide(a, b) {
  if (b.n === 0n) {
    throw new Error('cannot divide by zero fraction');
  }

  return reduceFraction(
    a.n * b.d,
    a.d * b.n
  );
}

function integerFraction(n) {
  return {
    n,
    d: 1n,
  };
}

function fractionObject(value) {
  if (value === null) {
    return null;
  }

  const r = reduceFraction(
    value.n,
    value.d
  );

  const text =
    r.d === 1n
      ? r.n.toString()
      : `${r.n.toString()}/${r.d.toString()}`;

  return {
    numerator: r.n.toString(),
    denominator: r.d.toString(),
    text,
    integer:
      r.d === 1n
        ? r.n.toString()
        : null,
    integerOctal:
      r.d === 1n
        ? `${r.n.toString(8)}₈`
        : null,
  };
}

function baseSnapshot(
  earthRotationScale,
  solScale
) {
  return {
    schema: SCHEMA,

    role:
      'SUN_RETURN_RECURRENCE_RECOVERED_FROM_EARTH_ROTATION_MINUS_SOL_ADVANCE',

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
      'ORBITAL_ADVANCE_WITNESS',

    equation:
      'SUN_RETURN = EARTH_AXIAL_ROTATION × 512 / (512 - SOL_ADVANCE_PER_EARTH_ROTATION)',

    solarRecurrenceEstablished:
      false,

    meanSolarDayEstablished:
      false,

    civilDayEstablished:
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

    usesExpectedSiderealPeriod:
      false,

    usesExpectedOrbitalRate:
      false,

    usesExpectedYear:
      false,
  };
}

function deriveSunReturnRecurrence(
  earthRotationScale,
  solScale
) {
  if (
    !earthRotationScale ||
    typeof earthRotationScale !== 'object' ||
    Array.isArray(earthRotationScale) ||
    earthRotationScale.schema !== EARTH_ROTATION_SCHEMA
  ) {
    throw new Error(
      `Earth rotation scale schema must be ${EARTH_ROTATION_SCHEMA}`
    );
  }

  if (
    !solScale ||
    typeof solScale !== 'object' ||
    Array.isArray(solScale) ||
    solScale.schema !== SOL_SCALE_SCHEMA
  ) {
    throw new Error(
      `Sol orbital scale schema must be ${SOL_SCALE_SCHEMA}`
    );
  }

  if (
    earthRotationScale.sourceEpoch !==
    solScale.sourceEpoch
  ) {
    throw new Error(
      'Gate-6J and Gate-6K sourceEpoch disagree'
    );
  }

  const base =
    baseSnapshot(
      earthRotationScale,
      solScale
    );

  if (
    earthRotationScale.status !==
    'EARTH_AXIAL_ROTATION_SCALE_RECOVERED'
  ) {
    return {
      ...base,

      status:
        'WAITING_FOR_EARTH_ROTATION_SCALE',

      earthAxialRotationInJovianRecurrences:
        null,

      solAdvancePerEarthAxialRotation512:
        null,

      sunClosurePerEarthAxialRotation512:
        null,

      sunReturnInEarthAxialRotations:
        null,

      sunReturnInJovianRecurrences:
        null,

      rawPerSunReturnRecurrence:
        null,
    };
  }

  if (
    solScale.status !==
    'SOL_ORBITAL_ADVANCE_SCALE_RECOVERED'
  ) {
    return {
      ...base,

      status:
        'WAITING_FOR_SOL_ORBITAL_SCALE',

      earthAxialRotationInJovianRecurrences:
        fractionObject(
          parseFractionObject(
            earthRotationScale
              .earthAxialRotationInJovianRecurrences,
            'Earth axial rotation in Jovian recurrences'
          )
        ),

      solAdvancePerEarthAxialRotation512:
        null,

      sunClosurePerEarthAxialRotation512:
        null,

      sunReturnInEarthAxialRotations:
        null,

      sunReturnInJovianRecurrences:
        null,

      rawPerSunReturnRecurrence:
        null,
    };
  }

  const earthRotationInJovian =
    parseFractionObject(
      earthRotationScale
        .earthAxialRotationInJovianRecurrences,

      'Earth axial rotation in Jovian recurrences'
    );

  const jovianRaw =
    parseFractionObject(
      earthRotationScale
        .jovianRawPerRecoveredRecurrence,

      'Jovian raw per recovered recurrence'
    );

  const solAdvance =
    parseFractionObject(
      solScale
        .solAdvancePerEarthAxialRotation512,

      'Sol advance per Earth axial rotation',
      {
        allowZero: true,
      }
    );

  const fullTurn =
    integerFraction(
      FULL_TURN
    );

  const closure =
    subtract(
      fullTurn,
      solAdvance
    );

  if (closure.n <= 0n) {
    throw new Error(
      'Sol advance must be less than one full 512-unit turn per Earth axial rotation'
    );
  }

  /*
   * Earth axial rotations per Sun return:
   *
   *   512 / (512 - delta)
   */
  const sunReturnInEarthRotations =
    divide(
      fullTurn,
      closure
    );

  /*
   * Jovian recurrences per Sun return:
   *
   *   Earth-rotation Jovian scale
   *   ×
   *   Earth rotations per Sun return
   */
  const sunReturnInJovian =
    multiply(
      earthRotationInJovian,
      sunReturnInEarthRotations
    );

  /*
   * Selected raw pulses per Sun return:
   *
   *   raw / Jovian recurrence
   *   ×
   *   Jovian recurrences / Sun return
   */
  const rawPerSunReturn =
    multiply(
      jovianRaw,
      sunReturnInJovian
    );

  return {
    ...base,

    status:
      'SUN_RETURN_RECURRENCE_RECOVERED',

    solarRecurrenceEstablished:
      true,

    /*
     * This gate recovers the observed Sun-return recurrence.
     * It does NOT yet declare a multi-window Mean-Sun civil-day authority.
     */
    meanSolarDayEstablished:
      false,

    civilDayEstablished:
      false,

    earthAxialRotationInJovianRecurrences:
      fractionObject(
        earthRotationInJovian
      ),

    solAdvancePerEarthAxialRotation512:
      fractionObject(
        solAdvance
      ),

    sunClosurePerEarthAxialRotation512:
      fractionObject(
        closure
      ),

    sunReturnInEarthAxialRotations:
      fractionObject(
        sunReturnInEarthRotations
      ),

    sunReturnInJovianRecurrences:
      fractionObject(
        sunReturnInJovian
      ),

    rawPerSunReturnRecurrence:
      fractionObject(
        rawPerSunReturn
      ),

    interpretation:
      'ONE OBSERVED SUN-RETURN RECURRENCE RECOVERED FROM JUPITER-TIMED EARTH ROTATION AND SOL ADVANCE',

    nextUse:
      'GATE6M_MAP_RECOVERED_SUN_RETURN_TO_2^17_DAY_PHASE17',
  };
}

module.exports = {
  SCHEMA,
  EARTH_ROTATION_SCHEMA,
  SOL_SCALE_SCHEMA,
  FULL_TURN,
  gcd,
  reduceFraction,
  parseInteger,
  parseFractionObject,
  add,
  subtract,
  multiply,
  divide,
  integerFraction,
  fractionObject,
  deriveSunReturnRecurrence,
};
