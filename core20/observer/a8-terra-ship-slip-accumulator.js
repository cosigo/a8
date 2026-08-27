'use strict';

/*
 * AUSPICIOUS 8 · v5.4.20
 * GATE 4C · TERRA SHIP SLIP DOWNSTREAM ACCUMULATOR
 *
 * Purpose:
 *   Integrate successive qualified Gate-4A Terra Ship Slip relationships into
 *   a downstream accumulated native A8 orbital-advance quantity.
 *
 * IMPORTANT ROLE BOUNDARY:
 *   - stateful internally
 *   - read-only with respect to every upstream layer
 *   - never writes A8Core
 *   - never writes Mintaka observer
 *   - never writes Sol observer
 *   - never writes the Gate-4A relationship derivation
 *
 * Conservative integration rule:
 *   1. First qualified relationship establishes a baseline only.
 *   2. Same Mintaka cycleCount may refresh the current relationship rate but
 *      adds zero accumulated advance.
 *   3. The next integrated sample must advance Mintaka cycleCount by EXACTLY 1.
 *   4. A gap >1 is rejected. Missing rotations are never guessed/fabricated.
 *
 * For each accepted new Mintaka rotation:
 *
 *   accumulated Terra Ship Slip
 *     += current qualified
 *        Sol A8 orbital advance / Mintaka rotation
 *
 * No expected year, orbital closure count, solar recurrence, civil-day scale,
 * calendar rule, host clock, or legacy unit is embedded here.
 */

const RELATIONSHIP_SCHEMA = 'A8-MINTAKA-SOL-RELATIONSHIP-V1';
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

function parseInteger(value, name, { nonNegative = false, positive = false } = {}) {
  const text = String(value ?? '');

  if (!/^-?(0|[1-9][0-9]*)$/.test(text)) {
    throw new Error(`${name} must be an integer`);
  }

  const out = BigInt(text);

  if (nonNegative && out < 0n) {
    throw new Error(`${name} must be non-negative`);
  }

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

function add(a, b) {
  return reduce(
    a.numerator * b.denominator + b.numerator * a.denominator,
    a.denominator * b.denominator
  );
}

function divideByInteger(value, divisor) {
  if (divisor <= 0n) {
    throw new Error('divisor must be greater than zero');
  }

  return reduce(value.numerator, value.denominator * divisor);
}

function moduloFullTurn(value) {
  const modulus = FULL_TURN * value.denominator;
  let numerator = value.numerator % modulus;

  if (numerator < 0n) {
    numerator += modulus;
  }

  return reduce(numerator, value.denominator);
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

  const numerator = parseInteger(value.numerator, `${name}.numerator`, {
    positive: true,
  });

  const denominator = parseInteger(value.denominator, `${name}.denominator`, {
    positive: true,
  });

  return reduce(numerator, denominator);
}

function validateRelationship(relationship) {
  if (!relationship || typeof relationship !== 'object' || Array.isArray(relationship)) {
    throw new Error('Terra Ship Slip relationship must be an object');
  }

  if (relationship.schema !== RELATIONSHIP_SCHEMA) {
    throw new Error(`relationship schema must be ${RELATIONSHIP_SCHEMA}`);
  }

  if (relationship.role !== 'READ_ONLY_ROTATION_ORBIT_RELATIONSHIP') {
    throw new Error('relationship role must be READ_ONLY_ROTATION_ORBIT_RELATIONSHIP');
  }

  if (relationship.mode !== 'READ_ONLY') {
    throw new Error('relationship mode must be READ_ONLY');
  }

  if (relationship.writesClock !== false ||
      relationship.writesMintakaObserver !== false ||
      relationship.writesSolObserver !== false ||
      relationship.changesAuthority !== false) {
    throw new Error('relationship is not qualified as upstream-read-only');
  }

  const mintakaWindow = relationship.evidenceWindows &&
    relationship.evidenceWindows.mintaka;

  const solWindow = relationship.evidenceWindows &&
    relationship.evidenceWindows.sol;

  if (!mintakaWindow || !solWindow) {
    throw new Error('separate Mintaka and Sol evidence windows are required');
  }

  const cycleCount = parseInteger(
    mintakaWindow.cycleCount,
    'Mintaka cycleCount',
    { positive: true }
  );

  const rate = parsePositiveRational(
    relationship.solAdvancePerMintakaRotation512,
    'Terra Ship Slip per Mintaka rotation'
  );

  return {
    cycleCount,
    rate,
    mintakaWindow: {
      firstRawPulse: mintakaWindow.firstRawPulse ?? null,
      lastRawPulse: mintakaWindow.lastRawPulse ?? null,
      cycleCount: Number(cycleCount),
    },
    solWindow: {
      firstRawPulse: solWindow.firstRawPulse ?? null,
      lastRawPulse: solWindow.lastRawPulse ?? null,
      intervalCount: solWindow.intervalCount ?? null,
    },
  };
}

class TerraShipSlipAccumulator {
  constructor() {
    this.baselineCycleCount = null;
    this.lastCycleCount = null;

    this.accumulatedRotations = 0n;
    this.accumulatedAdvance = { numerator: 0n, denominator: 1n };

    this.currentRate = null;
    this.acceptedIntegrationSteps = 0;
    this.rateRefreshes = 0;

    this.lastMintakaWindow = null;
    this.lastSolWindow = null;
    this.lastAction = 'EMPTY';
  }

  ingest(relationship) {
    const evidence = validateRelationship(relationship);

    if (this.lastCycleCount === null) {
      this.baselineCycleCount = evidence.cycleCount;
      this.lastCycleCount = evidence.cycleCount;
      this.currentRate = evidence.rate;
      this.lastMintakaWindow = evidence.mintakaWindow;
      this.lastSolWindow = evidence.solWindow;
      this.lastAction = 'BASELINE_ESTABLISHED';
      return this.snapshot();
    }

    if (evidence.cycleCount < this.lastCycleCount) {
      throw new Error(
        `Mintaka cycleCount moved backward: ${evidence.cycleCount} < ${this.lastCycleCount}`
      );
    }

    if (evidence.cycleCount === this.lastCycleCount) {
      this.currentRate = evidence.rate;
      this.lastMintakaWindow = evidence.mintakaWindow;
      this.lastSolWindow = evidence.solWindow;
      this.rateRefreshes += 1;
      this.lastAction = 'RATE_REFRESH_NO_ROTATION';
      return this.snapshot();
    }

    const delta = evidence.cycleCount - this.lastCycleCount;

    if (delta !== 1n) {
      throw new Error(
        `Mintaka rotation gap ${delta}; accumulator refuses to infer missing rotations`
      );
    }

    this.accumulatedAdvance = add(this.accumulatedAdvance, evidence.rate);
    this.accumulatedRotations += 1n;

    this.lastCycleCount = evidence.cycleCount;
    this.currentRate = evidence.rate;
    this.lastMintakaWindow = evidence.mintakaWindow;
    this.lastSolWindow = evidence.solWindow;

    this.acceptedIntegrationSteps += 1;
    this.lastAction = 'INTEGRATED_ONE_ROTATION';

    return this.snapshot();
  }

  snapshot() {
    const turnFraction = this.accumulatedAdvance.numerator === 0n
      ? { numerator: 0n, denominator: 1n }
      : divideByInteger(this.accumulatedAdvance, FULL_TURN);

    const phase512 = moduloFullTurn(this.accumulatedAdvance);

    return {
      schema: 'A8-TERRA-SHIP-SLIP-ACCUMULATOR-V1',
      role: 'DOWNSTREAM_TERRA_SHIP_SLIP_ACCUMULATOR',
      mode: 'UPSTREAM_READ_ONLY_STATEFUL_DOWNSTREAM',

      writesClock: false,
      writesMintakaObserver: false,
      writesSolObserver: false,
      writesRelationshipObserver: false,
      changesAuthority: false,

      usesSolarRecurrence: false,
      usesMeanSun: false,
      usesCalendarRule: false,
      usesExpectedYear: false,
      usesLegacyTime: false,
      usesLegacyAngle: false,
      guessesMissingRotations: false,

      status:
        this.lastCycleCount === null
          ? 'SEEKING_BASELINE'
          : this.accumulatedRotations === 0n
            ? 'BASELINED'
            : 'ACCUMULATING',

      lastAction: this.lastAction,

      baselineMintakaCycleCount:
        this.baselineCycleCount === null
          ? null
          : this.baselineCycleCount.toString(),

      lastMintakaCycleCount:
        this.lastCycleCount === null
          ? null
          : this.lastCycleCount.toString(),

      accumulatedRotations: this.accumulatedRotations.toString(),

      currentTerraShipSlipPerRotation512:
        this.currentRate ? serialize(this.currentRate) : null,

      accumulatedTerraShipSlip512:
        serialize(this.accumulatedAdvance),

      accumulatedTurnFraction:
        serialize(turnFraction),

      accumulatedPhase512:
        serialize(phase512),

      acceptedIntegrationSteps: this.acceptedIntegrationSteps,
      rateRefreshes: this.rateRefreshes,

      lastEvidenceWindows: {
        mintaka: this.lastMintakaWindow,
        sol: this.lastSolWindow,
      },
    };
  }
}

module.exports = {
  RELATIONSHIP_SCHEMA,
  FULL_TURN,
  gcd,
  reduce,
  add,
  divideByInteger,
  moduloFullTurn,
  validateRelationship,
  TerraShipSlipAccumulator,
};
