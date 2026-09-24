'use strict';

/*
 * AUSPICIOUS 8 · v5.4.20
 * GATE 5C · SYNTHETIC RATE-CONTINUITY PLANT
 *
 * Entirely experiment-owned. Completely disconnected from real A8Core.
 *
 * Purpose:
 *   Prove that a bounded RATE slew can change the rate of a synthetic
 *   oscillator/divider/clock plant while synthetic clock phase remains
 *   strictly monotonic and continuous.
 *
 * This plant owns:
 *   - exact synthetic oscillator progress
 *   - exact synthetic divider ratio
 *   - exact synthetic clock phase
 *
 * It does NOT own:
 *   - A8Core
 *   - real oscillator
 *   - real divider
 *   - DAY_PHASE17
 *   - authority
 *   - host time
 *
 * Plant step:
 *
 *   oscillatorProgress += rateScale
 *   clockPhase = oscillatorProgress / divider
 *
 * The clock phase is therefore derived only by integration.
 *
 * There is intentionally:
 *   - no phase setter
 *   - no phase correction API
 *   - no snap-to-target API
 *   - no timestamp input
 *   - no timer/cadence input
 *
 * One advance() call is one abstract experiment-owned plant quantum.
 * It is not a second, A8 second, wall-clock interval, or scheduler cadence.
 */

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

function parsePositiveRational(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${name} must be a rational object`);
  }

  return reduce(
    parseInteger(value.numerator, `${name}.numerator`, { positive: true }),
    parseInteger(value.denominator, `${name}.denominator`, { positive: true })
  );
}

function add(a, b) {
  return reduce(
    a.numerator * b.denominator + b.numerator * a.denominator,
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

function compare(a, b) {
  const left = a.numerator * b.denominator;
  const right = b.numerator * a.denominator;

  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function serialize(value) {
  const r = reduce(value.numerator, value.denominator);

  return {
    numerator: r.numerator.toString(),
    denominator: r.denominator.toString(),
  };
}

class SyntheticRateContinuityPlant {
  constructor({
    divider = { numerator: '8', denominator: '1' },
  } = {}) {
    this.divider = parsePositiveRational(divider, 'divider');

    this.oscillatorProgress = {
      numerator: 0n,
      denominator: 1n,
    };

    this.clockPhase = {
      numerator: 0n,
      denominator: 1n,
    };

    this.advanceCount = 0;
    this.lastRateScale = null;
    this.lastOscillatorIncrement = null;
    this.lastClockPhaseIncrement = null;
  }

  advance(rateScaleInput) {
    const rateScale = parsePositiveRational(
      rateScaleInput,
      'rateScale'
    );

    const previousPhase = this.clockPhase;

    this.oscillatorProgress = add(
      this.oscillatorProgress,
      rateScale
    );

    this.clockPhase = divide(
      this.oscillatorProgress,
      this.divider
    );

    const phaseIncrement = add(
      this.clockPhase,
      {
        numerator: -previousPhase.numerator,
        denominator: previousPhase.denominator,
      }
    );

    if (phaseIncrement.numerator <= 0n) {
      throw new Error('synthetic clock phase must advance strictly on every plant step');
    }

    this.advanceCount += 1;
    this.lastRateScale = rateScale;
    this.lastOscillatorIncrement = rateScale;
    this.lastClockPhaseIncrement = phaseIncrement;

    return this.snapshot();
  }

  snapshot() {
    return {
      schema: 'A8-SYNTHETIC-RATE-CONTINUITY-PLANT-V1',
      role: 'EXPERIMENT_OWNED_SYNTHETIC_OSCILLATOR_DIVIDER_CLOCK',
      mode: 'DISCONNECTED_FROM_A8CORE',

      ownsRealOscillator: false,
      ownsRealDivider: false,
      writesA8Core: false,
      writesRealClock: false,
      writesAuthority: false,

      hasPhaseSetter: false,
      acceptsExternalPhase: false,
      acceptsTimestamp: false,
      usesHostTime: false,
      usesTimedCadence: false,

      divider: serialize(this.divider),
      oscillatorProgress: serialize(this.oscillatorProgress),
      clockPhase: serialize(this.clockPhase),

      advanceCount: this.advanceCount,

      lastRateScale:
        this.lastRateScale ? serialize(this.lastRateScale) : null,

      lastOscillatorIncrement:
        this.lastOscillatorIncrement
          ? serialize(this.lastOscillatorIncrement)
          : null,

      lastClockPhaseIncrement:
        this.lastClockPhaseIncrement
          ? serialize(this.lastClockPhaseIncrement)
          : null,
    };
  }
}

module.exports = {
  gcd,
  reduce,
  add,
  divide,
  compare,
  SyntheticRateContinuityPlant,
};
