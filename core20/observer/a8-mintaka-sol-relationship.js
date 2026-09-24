'use strict';

/*
 * AUSPICIOUS 8 · v5.4.20
 * GATE 4A · MINTAKA ↔ SOL READ-ONLY RELATIONSHIP OBSERVER
 *
 * This module does not observe Nature directly.
 * It reads two already-independent recovered observer snapshots:
 *
 *   Mintaka:
 *     raw pulses / Earth axial rotation
 *
 *   Sol:
 *     native A8 celestial-angle advance / raw pulse
 *
 * and derives:
 *
 *   native Sol orbital advance / Mintaka-observed Earth rotation
 *
 * Exact relationship:
 *
 *   (raw / rotation) × (A8 angle / raw)
 *   = A8 angle / rotation
 *
 * No solar-day recurrence is required.
 * No Mean-Sun path is required.
 * No clock write, observer write, authority write, calendar rule,
 * legacy time, or legacy angle enters this relationship.
 */

const MINTAKA_SCHEMA = 'A8-MINTAKA-ROTATION-OBSERVER-V1';
const SOL_SCHEMA = 'A8-SOL-CELESTIAL-OBSERVER-V1';
const FULL_TURN = 512n;

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

function parseInteger(value, name, { positive = false } = {}) {
  const text = String(value ?? '');
  if (!/^-?(0|[1-9][0-9]*)$/.test(text)) {
    throw new Error(`${name} must be an integer`);
  }

  const out = BigInt(text);
  if (positive && out <= 0n) {
    throw new Error(`${name} must be greater than zero`);
  }
  return out;
}


function reduce(numerator, denominator) {
  if (denominator === 0n) {
    throw new Error('rational denominator must be non-zero');
  }

  if (denominator < 0n) {
    numerator = -numerator;
    denominator = -denominator;
  }

  const d = gcd(numerator, denominator);
  return {
    numerator: numerator / d,
    denominator: denominator / d,
  };
}

function multiply(a, b) {
  return reduce(
    a.numerator * b.numerator,
    a.denominator * b.denominator
  );
}

function divide(a, b) {
  if (b.numerator === 0n) {
    throw new Error('cannot divide by zero rational');
  }

  return reduce(
    a.numerator * b.denominator,
    a.denominator * b.numerator
  );
}

function serialize(value) {
  if (!value) return null;
  const r = reduce(value.numerator, value.denominator);
  return {
    numerator: r.numerator.toString(),
    denominator: r.denominator.toString(),
  };
}

function parsePositiveRational(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${name} must be a rational object`);
  }

  const numerator = parseInteger(value.numerator, `${name}.numerator`);
  const denominator = parseInteger(
    value.denominator,
    `${name}.denominator`,
    { positive: true }
  );

  if (numerator <= 0n) {
    throw new Error(`${name}.numerator must be greater than zero`);
  }

  return reduce(numerator, denominator);
}

function requireMintakaSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new Error('Mintaka snapshot must be an object');
  }

  if (snapshot.schema !== MINTAKA_SCHEMA) {
    throw new Error(`Mintaka schema must be ${MINTAKA_SCHEMA}`);
  }

  if (snapshot.role !== 'EARTH_AXIAL_ROTATION_WITNESS') {
    throw new Error('Mintaka role must be EARTH_AXIAL_ROTATION_WITNESS');
  }

  if (snapshot.mode !== 'READ_ONLY') {
    throw new Error('Mintaka observer must be READ_ONLY');
  }

  if (snapshot.status !== 'RECOVERED') {
    throw new Error('Mintaka recurrence must be RECOVERED');
  }

  if (!snapshot.recurrence) {
    throw new Error('Mintaka recovered recurrence is required');
  }

  return parsePositiveRational(
    {
      numerator: snapshot.recurrence.reducedNumerator,
      denominator: snapshot.recurrence.reducedDenominator,
    },
    'Mintaka raw-pulses-per-rotation'
  );
}

function requireSolSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new Error('Sol snapshot must be an object');
  }

  if (snapshot.schema !== SOL_SCHEMA) {
    throw new Error(`Sol schema must be ${SOL_SCHEMA}`);
  }

  if (snapshot.role !== 'EARTH_ORBITAL_ADVANCE_WITNESS') {
    throw new Error('Sol role must be EARTH_ORBITAL_ADVANCE_WITNESS');
  }

  if (snapshot.mode !== 'READ_ONLY') {
    throw new Error('Sol observer must be READ_ONLY');
  }

  if (snapshot.status !== 'TRACKING') {
    throw new Error('Sol observer must be TRACKING');
  }

  if (!snapshot.forwardAdvancePerRawPulse512) {
    throw new Error('Sol forward advance per raw pulse is required');
  }

  return parsePositiveRational(
    snapshot.forwardAdvancePerRawPulse512,
    'Sol A8-angle-advance-per-raw-pulse'
  );
}

function deriveMintakaSolRelationship(mintakaSnapshot, solSnapshot) {
  const rawPerRotation = requireMintakaSnapshot(mintakaSnapshot);
  const anglePerRaw = requireSolSnapshot(solSnapshot);

  const anglePerRotation = multiply(rawPerRotation, anglePerRaw);
  const turnFractionPerRotation = divide(
    anglePerRotation,
    { numerator: FULL_TURN, denominator: 1n }
  );

  return {
    schema: 'A8-MINTAKA-SOL-RELATIONSHIP-V1',
    role: 'READ_ONLY_ROTATION_ORBIT_RELATIONSHIP',
    mode: 'READ_ONLY',

    upstreamTimekeeper: 'JUPITER_IO_EUROPA_GANYMEDE',
    rotationWitness: 'MINTAKA',
    orbitalWitness: 'SOL',

    basis: 'INDEPENDENT_RECOVERED_OBSERVER_RATES',
    definingRelationship:
      '(raw pulses / Mintaka rotation) × (Sol A8-angle advance / raw pulse)',

    writesClock: false,
    writesMintakaObserver: false,
    writesSolObserver: false,
    changesAuthority: false,
    usesSolarRecurrence: false,
    usesMeanSun: false,
    usesLegacyTime: false,
    usesLegacyAngle: false,
    usesCalendarRule: false,
    usesExpectedYear: false,

    mintakaRawPulsesPerRotation: serialize(rawPerRotation),
    solAdvancePerRawPulse512: serialize(anglePerRaw),

    solAdvancePerMintakaRotation512: serialize(anglePerRotation),
    orbitTurnFractionPerMintakaRotation: serialize(turnFractionPerRotation),

    evidenceWindows: {
      mintaka: {
        firstRawPulse: mintakaSnapshot.firstRawPulse ?? null,
        lastRawPulse: mintakaSnapshot.lastRawPulse ?? null,
        cycleCount: mintakaSnapshot.cycleCount ?? null,
      },
      sol: {
        firstRawPulse: solSnapshot.firstRawPulse ?? null,
        lastRawPulse: solSnapshot.lastRawPulse ?? null,
        intervalCount: solSnapshot.intervalCount ?? null,
      },
    },

    sourceSnapshots: {
      mintakaSchema: mintakaSnapshot.schema,
      solSchema: solSnapshot.schema,
    },
  };
}

class MintakaSolRelationshipObserver {
  compare(mintakaSnapshot, solSnapshot) {
    return deriveMintakaSolRelationship(mintakaSnapshot, solSnapshot);
  }
}

module.exports = {
  MINTAKA_SCHEMA,
  SOL_SCHEMA,
  FULL_TURN,
  gcd,
  reduce,
  multiply,
  divide,
  deriveMintakaSolRelationship,
  MintakaSolRelationshipObserver,
};
