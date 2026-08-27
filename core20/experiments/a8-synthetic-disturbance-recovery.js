'use strict';

/*
 * AUSPICIOUS 8 · v5.4.20
 * GATE 5D · SYNTHETIC DISTURBANCE / JOVIAN RECOVERY EXPERIMENT
 *
 * Entirely experiment-owned. Real A8Core remains disconnected.
 *
 * Sequence:
 *   1. Run synthetic continuity plant at an explicit pre-recovery rate scale
 *      for an explicit number of abstract plant advances.
 *   2. Introduce explicit earlier + fresh recovered Jovian recurrence samples.
 *   3. Gate-5A derives an exact advisory correction candidate.
 *   4. Gate-5B bounded slew moves only the synthetic rate scale.
 *   5. Gate-5C plant integrates that changing rate through its synthetic divider.
 *
 * Continuity rule:
 *   The synthetic phase is NEVER reset when fresh recovery evidence arrives.
 *   Rate recovery cannot erase the phase history accumulated during disturbance.
 *
 * There is intentionally:
 *   - no phase setter
 *   - no phase alignment
 *   - no snap to reference
 *   - no host-time timing
 *   - no real oscillator/divider/clock actuator
 *
 * One disturbance advance, rate-slew update, or recovery advance is an abstract
 * experiment iteration only. None is a second, A8 second, browser timer, or
 * real oscillator edge.
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

function subtractRational(a, b) {
  const numerator =
    BigInt(a.numerator) * BigInt(b.denominator) -
    BigInt(b.numerator) * BigInt(a.denominator);

  const denominator =
    BigInt(a.denominator) * BigInt(b.denominator);

  function abs(x) {
    return x < 0n ? -x : x;
  }

  function gcd(x, y) {
    x = abs(x);
    y = abs(y);

    while (y !== 0n) {
      const t = x % y;
      x = y;
      y = t;
    }

    return x;
  }

  const g = gcd(numerator, denominator);

  return {
    numerator: (numerator / g).toString(),
    denominator: (denominator / g).toString(),
  };
}

function runSyntheticDisturbanceRecovery({
  divider = { numerator: '8', denominator: '1' },
  preRecoveryRateScale = { numerator: '1', denominator: '1' },
  disturbanceAdvances,
  baselineJovianSample,
  freshJovianSample,
  maxRateScaleStep,
}) {
  const holdCount = parsePositiveCount(
    disturbanceAdvances,
    'disturbanceAdvances'
  );

  const plant = new SyntheticRateContinuityPlant({ divider });

  const trace = [];

  for (let i = 0; i < holdCount; i++) {
    const before = plant.snapshot();

    const after = plant.advance(preRecoveryRateScale);

    trace.push({
      stage: 'DISTURBANCE_HOLD',
      plantAdvance: after.advanceCount,
      rateScale: after.lastRateScale,
      phaseBefore: before.clockPhase,
      phaseAfter: after.clockPhase,
      phaseIncrement: after.lastClockPhaseIncrement,
    });
  }

  const phaseAtFreshRecoveryEvidence = plant.snapshot().clockPhase;

  const advisor = new JovianSlowDisciplineCandidate();
  advisor.establishBaseline(baselineJovianSample);
  const candidate = advisor.evaluate(freshJovianSample);

  const slew = new BoundedRateSlewSimulator({
    initialScale: preRecoveryRateScale,
    maxStep: maxRateScaleStep,
  });

  slew.loadCandidate(candidate);

  let recoveryAdvances = 0;

  while (!slew.snapshot().targetReached) {
    const slewBefore = slew.snapshot();
    const slewAfter = slew.step();

    const plantBefore = plant.snapshot();
    const plantAfter = plant.advance(slewAfter.currentRateScale);

    recoveryAdvances += 1;

    trace.push({
      stage: 'RECOVERY_SLEW',
      slewUpdate: slewAfter.updateCount,
      plantAdvance: plantAfter.advanceCount,

      rateBefore: slewBefore.currentRateScale,
      rateAfter: slewAfter.currentRateScale,
      rateDelta: slewAfter.lastAppliedDelta,

      phaseBefore: plantBefore.clockPhase,
      phaseAfter: plantAfter.clockPhase,
      phaseIncrement: plantAfter.lastClockPhaseIncrement,
    });

    if (recoveryAdvances > 100000) {
      throw new Error('synthetic recovery failed to converge');
    }
  }

  const finalPlant = plant.snapshot();
  const finalSlew = slew.snapshot();

  // Internal continuity assertion: every phase after must be strictly greater
  // than the immediately preceding phase before.
  for (const item of trace) {
    if (compareRational(item.phaseAfter, item.phaseBefore) <= 0) {
      throw new Error(
        `synthetic phase failed strict continuity at plant advance ${item.plantAdvance}`
      );
    }
  }

  // Fresh evidence must not itself mutate phase. The first recovery plant
  // advance begins exactly from the disturbance phase already accumulated.
  const firstRecovery = trace.find(item => item.stage === 'RECOVERY_SLEW');

  if (firstRecovery &&
      compareRational(
        firstRecovery.phaseBefore,
        phaseAtFreshRecoveryEvidence
      ) !== 0) {
    throw new Error('fresh Jovian evidence caused a synthetic phase discontinuity');
  }

  return {
    schema: 'A8-SYNTHETIC-DISTURBANCE-RECOVERY-EXPERIMENT-V1',
    role: 'EXPERIMENT_OWNED_RATE_DISTURBANCE_RECOVERY',
    mode: 'DISCONNECTED_FROM_A8CORE',

    writesA8Core: false,
    writesRealOscillator: false,
    writesRealDivider: false,
    writesRealClock: false,
    writesClockPhase: false,
    writesAuthority: false,

    usesHostTime: false,
    usesTimedCadence: false,
    acceptsExternalPhase: false,
    erasesAccumulatedPhaseHistory: false,

    disturbanceAdvances: holdCount,
    recoveryAdvances,

    preRecoveryRateScale,
    phaseAtFreshRecoveryEvidence,

    candidate,

    finalRateScale: finalSlew.currentRateScale,
    finalClockPhase: finalPlant.clockPhase,

    totalPlantAdvances: finalPlant.advanceCount,

    phaseAdvanceDuringRecovery:
      subtractRational(
        finalPlant.clockPhase,
        phaseAtFreshRecoveryEvidence
      ),

    trace,
  };
}

module.exports = {
  parsePositiveCount,
  compareRational,
  subtractRational,
  runSyntheticDisturbanceRecovery,
};
