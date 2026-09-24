'use strict';

/*
 * AUSPICIOUS 8 · v5.4.20
 * GATE 3A · SOL READ-ONLY CELESTIAL-FRAME OBSERVER
 *
 * Purpose:
 *   Observe Sol's changing direction in the native 512-unit celestial frame
 *   against the shared monotonic raw-pulse coordinate already used upstream
 *   by the Jovian recovered timekeeper.
 *
 * This is NOT a Mean-Sun / solar-meridian civil-day observer.
 *
 * Defining sample contract:
 *   {
 *     type: 'SOL_CELESTIAL_DIRECTION',
 *     rawPulse: '<monotonic non-negative integer>',
 *     witness: 'SOL',
 *     angle512: {
 *       numerator: '<integer>',
 *       denominator: '<positive integer>'
 *     }
 *   }
 *
 * angle512 is an exact rational A8 angular coordinate where one full turn is
 * 512 native angle units. Values are normalized modulo 512.
 *
 * No expected orbital rate, solar recurrence, year length, day length,
 * legacy degree, or legacy time constant is embedded here.
 */

const EVENT_TYPE = 'SOL_CELESTIAL_DIRECTION';
const WITNESS = 'SOL';
const FULL_TURN = 512n;
const ALLOWED_KEYS = new Set(['type', 'rawPulse', 'witness', 'angle512']);
const ALLOWED_ANGLE_KEYS = new Set(['numerator', 'denominator']);

function absBigInt(v) {
  return v < 0n ? -v : v;
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

function reduce(numerator, denominator) {
  if (denominator === 0n) throw new Error('rational denominator must be non-zero');
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

function parseInteger(value, name, { nonNegative = false, positive = false } = {}) {
  const text = String(value ?? '');
  if (!/^-?(0|[1-9][0-9]*)$/.test(text)) {
    throw new Error(`${name} must be an integer`);
  }

  const out = BigInt(text);

  if (positive && out <= 0n) {
    throw new Error(`${name} must be greater than zero`);
  }

  if (nonNegative && out < 0n) {
    throw new Error(`${name} must be non-negative`);
  }

  return out;
}

function parseRawPulse(value) {
  return parseInteger(value, 'rawPulse', { nonNegative: true });
}

function normalizeAngle512(angle) {
  if (!angle || typeof angle !== 'object' || Array.isArray(angle)) {
    throw new Error('angle512 must be an object');
  }

  for (const key of Object.keys(angle)) {
    if (!ALLOWED_ANGLE_KEYS.has(key)) {
      throw new Error(`unsupported angle512 field: ${key}`);
    }
  }

  if (!Object.prototype.hasOwnProperty.call(angle, 'numerator') ||
      !Object.prototype.hasOwnProperty.call(angle, 'denominator')) {
    throw new Error('angle512 requires numerator and denominator');
  }

  const numerator = parseInteger(angle.numerator, 'angle512.numerator');
  const denominator = parseInteger(
    angle.denominator,
    'angle512.denominator',
    { positive: true }
  );

  const modulus = FULL_TURN * denominator;
  let normalizedNumerator = numerator % modulus;
  if (normalizedNumerator < 0n) normalizedNumerator += modulus;

  return reduce(normalizedNumerator, denominator);
}

function forwardDelta512(previous, current) {
  const commonDen = previous.denominator * current.denominator;
  const previousNum = previous.numerator * current.denominator;
  const currentNum = current.numerator * previous.denominator;
  const modulus = FULL_TURN * commonDen;

  let deltaNum = (currentNum - previousNum) % modulus;
  if (deltaNum < 0n) deltaNum += modulus;

  return reduce(deltaNum, commonDen);
}

function addRationals(a, b) {
  return reduce(
    a.numerator * b.denominator + b.numerator * a.denominator,
    a.denominator * b.denominator
  );
}

function divideRationalByInteger(value, divisor) {
  if (divisor <= 0n) throw new Error('divisor must be greater than zero');
  return reduce(value.numerator, value.denominator * divisor);
}

function serializeRational(value) {
  if (!value) return null;
  const reduced = reduce(value.numerator, value.denominator);
  return {
    numerator: reduced.numerator.toString(),
    denominator: reduced.denominator.toString(),
  };
}

class SolCelestialObserver {
  constructor() {
    this.samples = [];
    this.forwardDeltas = [];
    this.totalAdvance = { numerator: 0n, denominator: 1n };
  }

  observe(event) {
    if (!event || typeof event !== 'object' || Array.isArray(event)) {
      throw new Error('Sol celestial observation must be an object');
    }

    for (const key of Object.keys(event)) {
      if (!ALLOWED_KEYS.has(key)) {
        throw new Error(`unsupported defining observation field: ${key}`);
      }
    }

    if (event.type !== EVENT_TYPE) {
      throw new Error(`Sol observer accepts only ${EVENT_TYPE}`);
    }

    if (event.witness !== WITNESS) {
      throw new Error(`Sol observer accepts only witness ${WITNESS}`);
    }

    const rawPulse = parseRawPulse(event.rawPulse);
    const angle = normalizeAngle512(event.angle512);

    const previousSample = this.samples.length
      ? this.samples[this.samples.length - 1]
      : null;

    if (previousSample && rawPulse <= BigInt(previousSample.rawPulse)) {
      throw new Error('rawPulse must increase monotonically');
    }

    if (previousSample) {
      const previousAngle = {
        numerator: BigInt(previousSample.angle512.numerator),
        denominator: BigInt(previousSample.angle512.denominator),
      };

      const delta = forwardDelta512(previousAngle, angle);
      this.forwardDeltas.push(serializeRational(delta));
      this.totalAdvance = addRationals(this.totalAdvance, delta);
    }

    this.samples.push({
      type: EVENT_TYPE,
      rawPulse: rawPulse.toString(),
      witness: WITNESS,
      angle512: serializeRational(angle),
    });

    return this.snapshot();
  }

  snapshot() {
    const sampleCount = this.samples.length;
    const intervalCount = sampleCount > 0 ? sampleCount - 1 : 0;

    const firstRaw = sampleCount ? BigInt(this.samples[0].rawPulse) : null;
    const lastRaw = sampleCount ? BigInt(this.samples[sampleCount - 1].rawPulse) : null;
    const elapsedRaw = intervalCount > 0 ? lastRaw - firstRaw : null;

    const advancePerRawPulse =
      elapsedRaw !== null && elapsedRaw > 0n
        ? divideRationalByInteger(this.totalAdvance, elapsedRaw)
        : null;

    return {
      schema: 'A8-SOL-CELESTIAL-OBSERVER-V1',
      role: 'EARTH_ORBITAL_ADVANCE_WITNESS',
      mode: 'READ_ONLY',
      witness: WITNESS,
      eventType: EVENT_TYPE,
      angularFrame: 'A8_CELESTIAL_512',
      fullTurnA8: '512',
      definingInput: 'event type + raw pulse + witness + exact native angle512',

      writesClock: false,
      changesAuthority: false,
      usesLegacyTime: false,
      usesLegacyAngle: false,
      usesExpectedSolarPeriod: false,
      usesExpectedOrbitalRate: false,

      status:
        sampleCount === 0
          ? 'SEEKING_FIRST_SAMPLE'
          : sampleCount === 1
            ? 'SEEKING_SECOND_SAMPLE'
            : 'TRACKING',

      sampleCount,
      intervalCount,
      firstRawPulse: firstRaw === null ? null : firstRaw.toString(),
      lastRawPulse: lastRaw === null ? null : lastRaw.toString(),
      elapsedRawPulse: elapsedRaw === null ? null : elapsedRaw.toString(),

      firstAngle512: sampleCount ? this.samples[0].angle512 : null,
      lastAngle512: sampleCount ? this.samples[sampleCount - 1].angle512 : null,
      latestForwardDelta512:
        this.forwardDeltas.length
          ? this.forwardDeltas[this.forwardDeltas.length - 1]
          : null,

      accumulatedForwardAdvance512:
        intervalCount > 0 ? serializeRational(this.totalAdvance) : null,

      forwardAdvancePerRawPulse512:
        advancePerRawPulse ? serializeRational(advancePerRawPulse) : null,

      forwardDeltas512: this.forwardDeltas.slice(),
      samples: this.samples.slice(),
    };
  }
}

module.exports = {
  EVENT_TYPE,
  WITNESS,
  FULL_TURN,
  gcd,
  reduce,
  normalizeAngle512,
  forwardDelta512,
  addRationals,
  SolCelestialObserver,
};
