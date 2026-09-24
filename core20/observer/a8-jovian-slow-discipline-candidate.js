'use strict';

/*
 * AUSPICIOUS 8 · v5.4.20
 * GATE 5A · JOVIAN SLOW-DISCIPLINE CANDIDATE · ADVISORY ONLY
 *
 * Purpose:
 *   Compare a newly recovered exact Jovian natural recurrence against an
 *   earlier recovered exact Jovian baseline and calculate an exact candidate
 *   rate correction.
 *
 * This module is an ADVISOR ONLY.
 *
 * It has no actuator and cannot:
 *   - change oscillator state
 *   - change divider state
 *   - change clock state
 *   - change authority
 *   - read host wall time
 *
 * Input sample:
 *   {
 *     schema: 'A8-JOVIAN-RECURRENCE-SAMPLE-V1',
 *     source: 'JOVIAN_RECOVERED_RECURRENCE',
 *     rawNumerator: '<positive integer>',
 *     cycleDenominator: '<positive integer>'
 *   }
 *
 * Exact quantities:
 *
 *   baseline = raw pulses / Jovian natural cycle
 *   current  = raw pulses / Jovian natural cycle
 *
 *   signed fractional rate error
 *     = current / baseline - 1
 *
 *   recommended rate scale candidate
 *     = baseline / current
 *
 * Example meaning only:
 *   if current > baseline, more raw pulses are being counted per same recovered
 *   natural cycle; the candidate scale is therefore < 1.
 *
 * Nothing in this module applies that scale.
 */

const SAMPLE_SCHEMA = 'A8-JOVIAN-RECURRENCE-SAMPLE-V1';
const SAMPLE_SOURCE = 'JOVIAN_RECOVERED_RECURRENCE';

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

function parsePositiveInteger(value, name) {
  const text = String(value ?? '');

  if (!/^[1-9][0-9]*$/.test(text)) {
    throw new Error(`${name} must be a positive integer`);
  }

  return BigInt(text);
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

function subtract(a, b) {
  return reduce(
    a.numerator * b.denominator - b.numerator * a.denominator,
    a.denominator * b.denominator
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

function parseSample(sample) {
  if (!sample || typeof sample !== 'object' || Array.isArray(sample)) {
    throw new Error('Jovian recurrence sample must be an object');
  }

  const allowed = new Set([
    'schema',
    'source',
    'rawNumerator',
    'cycleDenominator',
  ]);

  for (const key of Object.keys(sample)) {
    if (!allowed.has(key)) {
      throw new Error(`unsupported Jovian recurrence sample field: ${key}`);
    }
  }

  if (sample.schema !== SAMPLE_SCHEMA) {
    throw new Error(`sample schema must be ${SAMPLE_SCHEMA}`);
  }

  if (sample.source !== SAMPLE_SOURCE) {
    throw new Error(`sample source must be ${SAMPLE_SOURCE}`);
  }

  const rawNumerator = parsePositiveInteger(
    sample.rawNumerator,
    'rawNumerator'
  );

  const cycleDenominator = parsePositiveInteger(
    sample.cycleDenominator,
    'cycleDenominator'
  );

  return reduce(rawNumerator, cycleDenominator);
}

class JovianSlowDisciplineCandidate {
  constructor() {
    this.baseline = null;
    this.evaluations = 0;
    this.lastEvaluation = null;
  }

  establishBaseline(sample) {
    if (this.baseline) {
      throw new Error('Jovian discipline baseline already established');
    }

    this.baseline = parseSample(sample);

    return this.snapshot();
  }

  evaluate(sample) {
    if (!this.baseline) {
      throw new Error('Jovian discipline baseline must be established first');
    }

    const current = parseSample(sample);

    const currentOverBaseline = divide(current, this.baseline);
    const signedFractionalRateError = subtract(
      currentOverBaseline,
      { numerator: 1n, denominator: 1n }
    );

    const recommendedRateScale = divide(this.baseline, current);

    this.evaluations += 1;
    this.lastEvaluation = {
      current,
      currentOverBaseline,
      signedFractionalRateError,
      recommendedRateScale,
    };

    return this.snapshot();
  }

  snapshot() {
    return {
      schema: 'A8-JOVIAN-SLOW-DISCIPLINE-CANDIDATE-V1',
      role: 'RATE_DISCIPLINE_ADVISOR_ONLY',
      mode: 'NO_ACTUATOR',

      source: SAMPLE_SOURCE,

      writesOscillator: false,
      writesDivider: false,
      writesClock: false,
      writesAuthority: false,

      usesHostTime: false,
      usesLegacyTime: false,
      usesExpectedJovianPeriod: false,
      usesEarthObserverEvidence: false,

      status:
        this.baseline === null
          ? 'SEEKING_BASELINE'
          : this.lastEvaluation === null
            ? 'BASELINED'
            : 'CANDIDATE_AVAILABLE',

      baselineRawPerJovianCycle:
        this.baseline ? serialize(this.baseline) : null,

      evaluations: this.evaluations,

      currentRawPerJovianCycle:
        this.lastEvaluation
          ? serialize(this.lastEvaluation.current)
          : null,

      currentOverBaseline:
        this.lastEvaluation
          ? serialize(this.lastEvaluation.currentOverBaseline)
          : null,

      signedFractionalRateError:
        this.lastEvaluation
          ? serialize(this.lastEvaluation.signedFractionalRateError)
          : null,

      recommendedRateScaleCandidate:
        this.lastEvaluation
          ? serialize(this.lastEvaluation.recommendedRateScale)
          : null,

      applied: false,
    };
  }
}

module.exports = {
  SAMPLE_SCHEMA,
  SAMPLE_SOURCE,
  gcd,
  reduce,
  multiply,
  divide,
  subtract,
  parseSample,
  JovianSlowDisciplineCandidate,
};
