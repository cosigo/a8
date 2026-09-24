'use strict';

/*
 * AUSPICIOUS 8 · v5.4.20
 * GATE 5F · SYNTHETIC JOVIAN OBSERVATION-LOSS / HOLDOVER / REACQUISITION
 *
 * Entirely synthetic and experiment-owned.
 * Real A8Core remains disconnected.
 *
 * Sequence:
 *   1. Begin from an already-settled synthetic rate scale.
 *   2. Fresh Jovian recovery evidence becomes unavailable.
 *   3. Freeze the last settled rate scale exactly during holdover.
 *   4. Continue the synthetic oscillator/divider/clock by integration only.
 *   5. Fresh Jovian evidence returns.
 *   6. Gate-5A derives a new exact rate-scale candidate.
 *   7. Gate-5B resumes bounded rate-only slew from the held rate.
 *
 * Holdover rule:
 *   NO fresh evidence -> NO new candidate -> NO rate retarget.
 *
 * Continuity rule:
 *   Observation loss and reacquisition never set/reset/snap clock phase.
 *
 * All counts are abstract experiment iterations only.
 */

const {
  JovianSlowDisciplineCandidate,
} = require('../observer/a8-jovian-slow-discipline-candidate');

const {
  BoundedRateSlewSimulator,
} = require('../observer/a8-bounded-rate-slew-simulator');

const {
  SyntheticRateContinuityPlant,
} = require('../observer/a8-synthetic-rate-continuity-plant');

function parsePositiveCount(value, name) {
  const text = String(value ?? '');

  if (!/^[1-9][0-9]*$/.test(text)) {
    throw new Error(`${name} must be a positive integer`);
  }

  const n = Number(text);

  if (!Number.isSafeInteger(n)) {
    throw new Error(`${name} is too large`);
  }

  return n;
}

function compareRational(a, b) {
  const left = BigInt(a.numerator) * BigInt(b.denominator);
  const right = BigInt(b.numerator) * BigInt(a.denominator);

  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function runSyntheticJovianHoldoverReacquisition({
  divider = { numerator: '8', denominator: '1' },
  settledRateScale,
  startingPhase = { numerator: '0', denominator: '1' },
  holdoverAdvances,
  baselineJovianSample,
  freshJovianSample,
  maxRateScaleStep,
}) {
  const holdCount = parsePositiveCount(
    holdoverAdvances,
    'holdoverAdvances'
  );

  const plant = new SyntheticRateContinuityPlant({ divider });

  /*
   * Reconstruct the supplied starting phase only by integrating an explicit
   * experiment-owned preload oscillator progress equal to phase * divider.
   *
   * Gate 5F does not add a phase setter to the Gate-5C plant. Instead, the
   * experiment uses a local derived-state wrapper below so the persistent
   * phase history can start from the exact prior settled Gate-5E result.
   */
  function multiplyRational(a, b) {
    const n = BigInt(a.numerator) * BigInt(b.numerator);
    const d = BigInt(a.denominator) * BigInt(b.denominator);

    function abs(x) { return x < 0n ? -x : x; }
    function gcd(x, y) {
      x = abs(x); y = abs(y);
      while (y !== 0n) {
        const t = x % y;
        x = y;
        y = t;
      }
      return x;
    }

    const g = gcd(n, d);

    return {
      numerator: (n / g).toString(),
      denominator: (d / g).toString(),
    };
  }

  function addRational(a, b) {
    let n =
      BigInt(a.numerator) * BigInt(b.denominator) +
      BigInt(b.numerator) * BigInt(a.denominator);

    let d =
      BigInt(a.denominator) * BigInt(b.denominator);

    function abs(x) { return x < 0n ? -x : x; }
    function gcd(x, y) {
      x = abs(x); y = abs(y);
      while (y !== 0n) {
        const t = x % y;
        x = y;
        y = t;
      }
      return x;
    }

    const g = gcd(n, d);

    return {
      numerator: (n / g).toString(),
      denominator: (d / g).toString(),
    };
  }

  function subtractRational(a, b) {
    return addRational(a, {
      numerator: (-BigInt(b.numerator)).toString(),
      denominator: String(b.denominator),
    });
  }

  function divideRational(a, b) {
    if (BigInt(b.numerator) === 0n) {
      throw new Error('cannot divide by zero rational');
    }

    return multiplyRational(a, {
      numerator: String(b.denominator),
      denominator: String(b.numerator),
    });
  }

  /*
   * localPhaseOffset is immutable prior history.
   * Gate-5C synthetic plant still integrates only NEW oscillator progress.
   */
  const localPhaseOffset = startingPhase;

  const trace = [];

  function effectivePhase() {
    return addRational(
      localPhaseOffset,
      plant.snapshot().clockPhase
    );
  }

  const heldRate = settledRateScale;

  for (let i = 0; i < holdCount; i++) {
    const phaseBefore = effectivePhase();

    const plantAfter = plant.advance(heldRate);

    const phaseAfter = effectivePhase();

    trace.push({
      stage: 'HOLDOVER',
      holdoverAdvance: i + 1,
      globalPlantAdvance: plantAfter.advanceCount,
      rateScale: plantAfter.lastRateScale,
      phaseBefore,
      phaseAfter,
      phaseIncrement: subtractRational(
        phaseAfter,
        phaseBefore
      ),
    });
  }

  const phaseAtReacquisitionEvidence = effectivePhase();

  const advisor = new JovianSlowDisciplineCandidate();
  advisor.establishBaseline(baselineJovianSample);
  const candidate = advisor.evaluate(freshJovianSample);

  const phaseAfterCandidate = effectivePhase();

  if (
    compareRational(
      phaseAtReacquisitionEvidence,
      phaseAfterCandidate
    ) !== 0
  ) {
    throw new Error('fresh Jovian reacquisition evidence moved phase');
  }

  const slew = new BoundedRateSlewSimulator({
    initialScale: heldRate,
    maxStep: maxRateScaleStep,
  });

  slew.loadCandidate(candidate);

  const recovery = [];

  while (!slew.snapshot().targetReached) {
    const slewBefore = slew.snapshot();
    const phaseBefore = effectivePhase();

    const slewAfter = slew.step();
    plant.advance(slewAfter.currentRateScale);

    const phaseAfter = effectivePhase();

    const item = {
      stage: 'REACQUISITION_SLEW',
      updateInRecovery: slewAfter.updateCount,
      globalPlantAdvance: plant.snapshot().advanceCount,

      rateBefore: slewBefore.currentRateScale,
      rateAfter: slewAfter.currentRateScale,
      rateDelta: slewAfter.lastAppliedDelta,

      phaseBefore,
      phaseAfter,
      phaseIncrement: subtractRational(
        phaseAfter,
        phaseBefore
      ),
    };

    if (
      compareRational(
        item.phaseAfter,
        item.phaseBefore
      ) <= 0
    ) {
      throw new Error(
        `phase failed strict continuity during recovery update ${slewAfter.updateCount}`
      );
    }

    trace.push(item);
    recovery.push(item);

    if (recovery.length > 100000) {
      throw new Error('holdover reacquisition recovery failed to converge');
    }
  }

  for (let i = 1; i < trace.length; i++) {
    if (
      compareRational(
        trace[i].phaseBefore,
        trace[i - 1].phaseAfter
      ) !== 0
    ) {
      throw new Error(
        `phase discontinuity between trace steps ${i} and ${i + 1}`
      );
    }
  }

  return {
    schema: 'A8-SYNTHETIC-JOVIAN-HOLDOVER-REACQUISITION-V1',
    role: 'EXPERIMENT_OWNED_HOLDOVER_REACQUISITION_CONTINUITY',
    mode: 'DISCONNECTED_FROM_A8CORE',

    writesA8Core: false,
    writesRealOscillator: false,
    writesRealDivider: false,
    writesRealClock: false,
    writesClockPhase: false,
    writesAuthority: false,

    usesHostTime: false,
    usesTimedCadence: false,
    acceptsExternalPhaseControl: false,

    inventsCandidateDuringLoss: false,
    changesRateDuringLoss: false,
    reacquisitionChangesPhase: false,

    heldRateScale: heldRate,
    holdoverAdvances: holdCount,

    startingPhase: localPhaseOffset,
    phaseAtReacquisitionEvidence,

    candidate,

    recoveryUpdates: recovery.length,
    finalRateScale: slew.snapshot().currentRateScale,
    finalClockPhase: effectivePhase(),

    totalPlantAdvances: plant.snapshot().advanceCount,

    holdoverPhaseAdvance:
      subtractRational(
        phaseAtReacquisitionEvidence,
        localPhaseOffset
      ),

    recoveryPhaseAdvance:
      subtractRational(
        effectivePhase(),
        phaseAtReacquisitionEvidence
      ),

    trace,
  };
}

module.exports = {
  parsePositiveCount,
  compareRational,
  runSyntheticJovianHoldoverReacquisition,
};
