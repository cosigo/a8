'use strict';

/*
 * AUSPICIOUS 8 · v5.4.20
 * GATE 5B · BOUNDED RATE-SLEW ACTUATOR SIMULATOR
 *
 * Experimental downstream model only.
 *
 * Input:
 *   a qualified Gate-5A advisory candidate snapshot
 *
 * Internal state:
 *   simulated rate scale only
 *
 * It does NOT:
 *   - import A8Core
 *   - write an oscillator
 *   - write a divider
 *   - own or write clock phase
 *   - own or write clock ticks
 *   - change authority
 *   - use host wall time
 *   - use browser/server cadence as authority
 *
 * One "step" means one abstract simulator control update.
 * It is deliberately timeless in Gate 5B.
 *
 * Update rule:
 *
 *   error = targetScale - currentScale
 *
 *   if |error| <= maxStep:
 *       currentScale = targetScale
 *
 *   else:
 *       currentScale += sign(error) * maxStep
 *
 * Properties:
 *   - exact rational arithmetic
 *   - bounded per-update rate change
 *   - monotonic convergence
 *   - no overshoot
 *   - exact target landing
 *   - no phase state exists in the control model
 */

const CANDIDATE_SCHEMA = 'A8-JOVIAN-SLOW-DISCIPLINE-CANDIDATE-V1';

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

function serialize(value) {
  if (!value) return null;

  const r = reduce(value.numerator, value.denominator);

  return {
    numerator: r.numerator.toString(),
    denominator: r.denominator.toString(),
  };
}

function add(a, b) {
  return reduce(
    a.numerator * b.denominator + b.numerator * a.denominator,
    a.denominator * b.denominator
  );
}

function subtract(a, b) {
  return reduce(
    a.numerator * b.denominator - b.numerator * a.denominator,
    a.denominator * b.denominator
  );
}

function compare(a, b) {
  const left = a.numerator * b.denominator;
  const right = b.numerator * a.denominator;

  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function absolute(value) {
  return {
    numerator: value.numerator < 0n ? -value.numerator : value.numerator,
    denominator: value.denominator,
  };
}

function negate(value) {
  return {
    numerator: -value.numerator,
    denominator: value.denominator,
  };
}

function validateCandidate(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new Error('Gate-5A candidate snapshot must be an object');
  }

  if (snapshot.schema !== CANDIDATE_SCHEMA) {
    throw new Error(`candidate schema must be ${CANDIDATE_SCHEMA}`);
  }

  if (snapshot.role !== 'RATE_DISCIPLINE_ADVISOR_ONLY') {
    throw new Error('candidate role must be RATE_DISCIPLINE_ADVISOR_ONLY');
  }

  if (snapshot.mode !== 'NO_ACTUATOR') {
    throw new Error('candidate mode must be NO_ACTUATOR');
  }

  if (snapshot.applied !== false) {
    throw new Error('candidate must be unapplied');
  }

  if (snapshot.writesOscillator !== false ||
      snapshot.writesDivider !== false ||
      snapshot.writesClock !== false ||
      snapshot.writesAuthority !== false) {
    throw new Error('candidate is not qualified as advisory-only');
  }

  if (!snapshot.recommendedRateScaleCandidate) {
    throw new Error('recommended rate-scale candidate is required');
  }

  return parsePositiveRational(
    snapshot.recommendedRateScaleCandidate,
    'recommendedRateScaleCandidate'
  );
}

class BoundedRateSlewSimulator {
  constructor({
    initialScale = { numerator: '1', denominator: '1' },
    maxStep,
  } = {}) {
    this.currentScale = parsePositiveRational(
      initialScale,
      'initialScale'
    );

    this.maxStep = parsePositiveRational(
      maxStep,
      'maxStep'
    );

    this.targetScale = null;
    this.updateCount = 0;
    this.lastAppliedDelta = { numerator: 0n, denominator: 1n };
  }

  loadCandidate(candidateSnapshot) {
    if (this.targetScale && compare(this.currentScale, this.targetScale) !== 0) {
      throw new Error('cannot replace candidate while slew is in progress');
    }

    this.targetScale = validateCandidate(candidateSnapshot);
    this.lastAppliedDelta = { numerator: 0n, denominator: 1n };

    return this.snapshot();
  }

  step() {
    if (!this.targetScale) {
      throw new Error('rate-scale candidate must be loaded first');
    }

    const error = subtract(this.targetScale, this.currentScale);

    if (error.numerator === 0n) {
      this.lastAppliedDelta = { numerator: 0n, denominator: 1n };
      return this.snapshot();
    }

    const magnitude = absolute(error);

    let delta;

    if (compare(magnitude, this.maxStep) <= 0) {
      delta = error;
    } else {
      delta = error.numerator > 0n
        ? this.maxStep
        : negate(this.maxStep);
    }

    const next = add(this.currentScale, delta);

    if (error.numerator > 0n && compare(next, this.targetScale) > 0) {
      throw new Error('internal slew overshoot on increasing target');
    }

    if (error.numerator < 0n && compare(next, this.targetScale) < 0) {
      throw new Error('internal slew overshoot on decreasing target');
    }

    this.currentScale = next;
    this.lastAppliedDelta = delta;
    this.updateCount += 1;

    return this.snapshot();
  }

  snapshot() {
    const remaining = this.targetScale
      ? subtract(this.targetScale, this.currentScale)
      : null;

    return {
      schema: 'A8-BOUNDED-RATE-SLEW-SIMULATOR-V1',
      role: 'EXPERIMENTAL_RATE_ACTUATOR_SIMULATOR',
      mode: 'DISCONNECTED_FROM_A8CORE',

      stateOwned: 'SIMULATED_RATE_SCALE_ONLY',

      writesRealOscillator: false,
      writesRealDivider: false,
      writesClock: false,
      writesClockPhase: false,
      writesAuthority: false,

      usesHostTime: false,
      usesTimedCadence: false,
      acceptsSimulatorPhase: false,

      status:
        this.targetScale === null
          ? 'SEEKING_CANDIDATE'
          : compare(this.currentScale, this.targetScale) === 0
            ? 'TARGET_REACHED'
            : 'SLEWING',

      currentRateScale: serialize(this.currentScale),
      targetRateScale: serialize(this.targetScale),
      maxRateScaleStepPerUpdate: serialize(this.maxStep),
      lastAppliedDelta: serialize(this.lastAppliedDelta),
      remainingRateScaleError: serialize(remaining),

      updateCount: this.updateCount,
      targetReached:
        this.targetScale !== null &&
        compare(this.currentScale, this.targetScale) === 0,
    };
  }
}

module.exports = {
  CANDIDATE_SCHEMA,
  gcd,
  reduce,
  add,
  subtract,
  compare,
  absolute,
  validateCandidate,
  BoundedRateSlewSimulator,
};
