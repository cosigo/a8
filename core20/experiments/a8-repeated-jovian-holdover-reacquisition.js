'use strict';

/*
 * AUSPICIOUS 8 · v5.4.20
 * GATE 5G · REPEATED JOVIAN HOLDOVER / REACQUISITION CONTINUITY
 *
 * Entirely synthetic and experiment-owned.
 * Real A8Core remains disconnected.
 *
 * One persistent bounded rate-slew simulator and one persistent synthetic
 * oscillator/divider/clock plant are carried across multiple episodes.
 *
 * Per episode:
 *   1. Fresh Jovian evidence is absent.
 *   2. Freeze the last settled rate exactly for an explicit holdover count.
 *   3. Continue synthetic phase by integration only.
 *   4. Fresh Jovian evidence returns.
 *   5. Derive a new exact Gate-5A rate candidate.
 *   6. Candidate loading changes neither current rate nor phase.
 *   7. Resume bounded Gate-5B rate-only slew.
 *   8. Settle exactly before the next holdover/reacquisition episode begins.
 *
 * No candidate is invented during observation loss.
 * No phase correction/reset/snap exists.
 * No host-time cadence exists.
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

function rationalSign(value) {
  const n = BigInt(value.numerator);
  return n < 0n ? -1 : n > 0n ? 1 : 0;
}

function addRational(a, b) {
  let numerator =
    BigInt(a.numerator) * BigInt(b.denominator) +
    BigInt(b.numerator) * BigInt(a.denominator);

  let denominator =
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

function subtractRational(a, b) {
  return addRational(a, {
    numerator: (-BigInt(b.numerator)).toString(),
    denominator: String(b.denominator),
  });
}

function runRepeatedJovianHoldoverReacquisition({
  divider = { numerator: '8', denominator: '1' },
  initialSettledRateScale,
  startingPhase = { numerator: '0', denominator: '1' },
  maxRateScaleStep,
  episodes,
}) {
  if (!Array.isArray(episodes) || episodes.length < 2) {
    throw new Error('at least two holdover/reacquisition episodes are required');
  }

  const plant = new SyntheticRateContinuityPlant({ divider });

  const slew = new BoundedRateSlewSimulator({
    initialScale: initialSettledRateScale,
    maxStep: maxRateScaleStep,
  });

  const phaseOffset = startingPhase;

  function effectivePhase() {
    return addRational(
      phaseOffset,
      plant.snapshot().clockPhase
    );
  }

  const trace = [];
  const episodeResults = [];

  let previousErrorSign = null;
  let previousSlewDirection = null;

  for (let index = 0; index < episodes.length; index++) {
    const episode = episodes[index];

    if (!episode || typeof episode !== 'object' || Array.isArray(episode)) {
      throw new Error(`episode ${index + 1} must be an object`);
    }

    const holdCount = parsePositiveCount(
      episode.holdoverAdvances,
      `episode ${index + 1} holdoverAdvances`
    );

    if (!episode.baselineJovianSample || !episode.freshJovianSample) {
      throw new Error(
        `episode ${index + 1} requires baseline and fresh Jovian samples`
      );
    }

    const entrySlew = slew.snapshot();

    if (
      entrySlew.targetRateScale !== null &&
      !entrySlew.targetReached
    ) {
      throw new Error(
        `episode ${index + 1} cannot enter holdover before prior slew settles`
      );
    }

    const heldRate = entrySlew.currentRateScale;
    const phaseAtHoldoverStart = effectivePhase();

    const holdTrace = [];

    for (let h = 0; h < holdCount; h++) {
      const phaseBefore = effectivePhase();
      const plantAfter = plant.advance(heldRate);
      const phaseAfter = effectivePhase();

      const item = {
        episodeIndex: index + 1,
        stage: 'HOLDOVER',
        holdoverAdvance: h + 1,
        globalPlantAdvance: plantAfter.advanceCount,

        rateScale: plantAfter.lastRateScale,

        phaseBefore,
        phaseAfter,
        phaseIncrement: subtractRational(
          phaseAfter,
          phaseBefore
        ),
      };

      if (
        compareRational(
          item.rateScale,
          heldRate
        ) !== 0
      ) {
        throw new Error(
          `episode ${index + 1} changed rate during observation loss`
        );
      }

      if (
        compareRational(
          item.phaseAfter,
          item.phaseBefore
        ) <= 0
      ) {
        throw new Error(
          `episode ${index + 1} lost phase continuity during holdover`
        );
      }

      trace.push(item);
      holdTrace.push(item);
    }

    const phaseAtReacquisitionEvidence = effectivePhase();
    const rateAtReacquisitionEvidence = slew.snapshot().currentRateScale;

    const advisor = new JovianSlowDisciplineCandidate();
    advisor.establishBaseline(episode.baselineJovianSample);
    const candidate = advisor.evaluate(episode.freshJovianSample);

    const errorSign = rationalSign(
      candidate.signedFractionalRateError
    );

    if (errorSign === 0) {
      throw new Error(
        `episode ${index + 1} must contain a non-zero fresh rate error`
      );
    }

    const loaded = slew.loadCandidate(candidate);

    const phaseAfterCandidateLoad = effectivePhase();

    if (
      compareRational(
        phaseAfterCandidateLoad,
        phaseAtReacquisitionEvidence
      ) !== 0
    ) {
      throw new Error(
        `episode ${index + 1} candidate load changed phase`
      );
    }

    if (
      compareRational(
        loaded.currentRateScale,
        rateAtReacquisitionEvidence
      ) !== 0
    ) {
      throw new Error(
        `episode ${index + 1} candidate load changed current rate`
      );
    }

    const target = loaded.targetRateScale;
    const direction = compareRational(
      target,
      loaded.currentRateScale
    );

    if (direction === 0) {
      throw new Error(
        `episode ${index + 1} candidate target equals held rate; no recovery slew to prove`
      );
    }

    const recoveryTrace = [];

    while (!slew.snapshot().targetReached) {
      const slewBefore = slew.snapshot();
      const phaseBefore = effectivePhase();

      const slewAfter = slew.step();
      plant.advance(slewAfter.currentRateScale);

      const phaseAfter = effectivePhase();

      const item = {
        episodeIndex: index + 1,
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
          `episode ${index + 1} lost phase continuity during recovery`
        );
      }

      trace.push(item);
      recoveryTrace.push(item);

      if (recoveryTrace.length > 100000) {
        throw new Error(
          `episode ${index + 1} recovery failed to converge`
        );
      }
    }

    const settled = slew.snapshot();

    episodeResults.push({
      episodeIndex: index + 1,
      label: episode.label ?? `EPISODE_${index + 1}`,

      holdoverAdvances: holdCount,
      heldRateScale: heldRate,

      phaseAtHoldoverStart,
      phaseAtReacquisitionEvidence,

      holdoverPhaseAdvance:
        subtractRational(
          phaseAtReacquisitionEvidence,
          phaseAtHoldoverStart
        ),

      candidate,
      errorSign,

      errorSignChangedFromPrior:
        previousErrorSign === null
          ? null
          : errorSign !== previousErrorSign,

      slewDirection:
        direction < 0 ? 'DOWN' : 'UP',

      slewDirectionChangedFromPrior:
        previousSlewDirection === null
          ? null
          : direction !== previousSlewDirection,

      candidateLoadPhaseMovement:
        subtractRational(
          phaseAfterCandidateLoad,
          phaseAtReacquisitionEvidence
        ),

      candidateLoadRateBefore:
        rateAtReacquisitionEvidence,

      candidateLoadRateAfter:
        loaded.currentRateScale,

      targetRateScale: settled.targetRateScale,
      recoveryUpdates: recoveryTrace.length,

      phaseAtSettlement: effectivePhase(),

      holdTrace,
      recoveryTrace,
    });

    previousErrorSign = errorSign;
    previousSlewDirection = direction;
  }

  for (let i = 1; i < trace.length; i++) {
    if (
      compareRational(
        trace[i].phaseBefore,
        trace[i - 1].phaseAfter
      ) !== 0
    ) {
      throw new Error(
        `global phase discontinuity between plant advances ${i} and ${i + 1}`
      );
    }
  }

  return {
    schema: 'A8-REPEATED-JOVIAN-HOLDOVER-REACQUISITION-V1',
    role: 'EXPERIMENT_OWNED_REPEATED_HOLDOVER_REACQUISITION_CONTINUITY',
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
    requiresPriorSlewSettlement: true,

    episodeCount: episodes.length,
    totalPlantAdvances: plant.snapshot().advanceCount,

    startingPhase: phaseOffset,
    initialSettledRateScale,

    finalRateScale: slew.snapshot().currentRateScale,
    finalClockPhase: effectivePhase(),

    episodes: episodeResults,
    trace,
  };
}

module.exports = {
  parsePositiveCount,
  compareRational,
  rationalSign,
  addRational,
  subtractRational,
  runRepeatedJovianHoldoverReacquisition,
};
