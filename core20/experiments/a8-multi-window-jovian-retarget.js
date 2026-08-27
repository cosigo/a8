'use strict';

/*
 * AUSPICIOUS 8 · v5.4.20
 * GATE 5E · MULTI-WINDOW JOVIAN RETARGET CONTINUITY EXPERIMENT
 *
 * Entirely synthetic and experiment-owned.
 * Real A8Core remains disconnected.
 *
 * Purpose:
 *   Apply multiple fresh Jovian recovery windows with changing rate-error signs
 *   to one persistent Gate-5B rate-slew simulator and one persistent Gate-5C
 *   synthetic oscillator/divider/clock plant.
 *
 * Retarget discipline:
 *   - a new candidate may be loaded only after the prior slew target is exact
 *   - candidate loading itself never advances or rewrites phase
 *   - each slew step changes rate only
 *   - plant phase advances only by integration
 *
 * One experiment update/plant advance is abstract and timeless.
 * It is not a second, A8 second, browser timer, scheduler interval,
 * conventional timestamp, or real oscillator edge.
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

function runMultiWindowJovianRetargetExperiment({
  divider = { numerator: '8', denominator: '1' },
  initialRateScale = { numerator: '1', denominator: '1' },
  maxRateScaleStep,
  windows,
}) {
  if (!Array.isArray(windows) || windows.length < 2) {
    throw new Error('at least two Jovian recovery windows are required');
  }

  const slew = new BoundedRateSlewSimulator({
    initialScale: initialRateScale,
    maxStep: maxRateScaleStep,
  });

  const plant = new SyntheticRateContinuityPlant({ divider });

  const trace = [];
  const windowResults = [];

  let previousErrorSign = null;

  for (let index = 0; index < windows.length; index++) {
    const window = windows[index];

    if (!window || typeof window !== 'object' || Array.isArray(window)) {
      throw new Error(`window ${index + 1} must be an object`);
    }

    if (!window.baselineJovianSample || !window.freshJovianSample) {
      throw new Error(`window ${index + 1} requires baseline and fresh Jovian samples`);
    }

    if (index > 0 && !slew.snapshot().targetReached) {
      throw new Error(
        `window ${index + 1} cannot retarget before prior slew settles`
      );
    }

    const advisor = new JovianSlowDisciplineCandidate();
    advisor.establishBaseline(window.baselineJovianSample);
    const candidate = advisor.evaluate(window.freshJovianSample);

    const errorSign = rationalSign(
      candidate.signedFractionalRateError
    );

    if (errorSign === 0) {
      throw new Error(`window ${index + 1} must contain a non-zero rate error`);
    }

    const phaseBeforeCandidate = plant.snapshot().clockPhase;
    const scaleBeforeCandidate = slew.snapshot().currentRateScale;

    const loaded = slew.loadCandidate(candidate);

    const phaseAfterCandidate = plant.snapshot().clockPhase;
    const scaleAfterCandidate = loaded.currentRateScale;

    if (compareRational(phaseBeforeCandidate, phaseAfterCandidate) !== 0) {
      throw new Error(`window ${index + 1} candidate load changed phase`);
    }

    if (compareRational(scaleBeforeCandidate, scaleAfterCandidate) !== 0) {
      throw new Error(`window ${index + 1} candidate load changed current rate`);
    }

    const updates = [];
    let updateCount = 0;

    while (!slew.snapshot().targetReached) {
      const beforeSlew = slew.snapshot();
      const beforePlant = plant.snapshot();

      const afterSlew = slew.step();
      const afterPlant = plant.advance(afterSlew.currentRateScale);

      updateCount += 1;

      const item = {
        windowIndex: index + 1,
        stage: 'RATE_SLEW',
        updateInWindow: updateCount,
        globalPlantAdvance: afterPlant.advanceCount,

        rateBefore: beforeSlew.currentRateScale,
        rateAfter: afterSlew.currentRateScale,
        rateDelta: afterSlew.lastAppliedDelta,

        phaseBefore: beforePlant.clockPhase,
        phaseAfter: afterPlant.clockPhase,
        phaseIncrement: afterPlant.lastClockPhaseIncrement,
      };

      if (compareRational(item.phaseAfter, item.phaseBefore) <= 0) {
        throw new Error(
          `window ${index + 1} lost strict phase continuity`
        );
      }

      updates.push(item);
      trace.push(item);

      if (updateCount > 100000) {
        throw new Error(`window ${index + 1} failed to converge`);
      }
    }

    const settled = slew.snapshot();

    if (!settled.targetReached) {
      throw new Error(`window ${index + 1} did not settle exactly`);
    }

    windowResults.push({
      windowIndex: index + 1,
      label: window.label ?? `WINDOW_${index + 1}`,

      errorSign,
      signChangedFromPrior:
        previousErrorSign === null
          ? null
          : errorSign !== previousErrorSign,

      phaseBeforeCandidate,
      phaseAfterCandidate,

      rateBeforeCandidate: scaleBeforeCandidate,
      rateAfterCandidateLoad: scaleAfterCandidate,

      candidate,
      targetRateScale: settled.targetRateScale,

      slewUpdates: updateCount,
      phaseAtSettlement: plant.snapshot().clockPhase,

      updates,
    });

    previousErrorSign = errorSign;
  }

  // One global continuous phase history across every window.
  for (let i = 1; i < trace.length; i++) {
    if (
      compareRational(
        trace[i].phaseBefore,
        trace[i - 1].phaseAfter
      ) !== 0
    ) {
      throw new Error(
        `phase history discontinuity between global advances ${i} and ${i + 1}`
      );
    }
  }

  return {
    schema: 'A8-MULTI-WINDOW-JOVIAN-RETARGET-EXPERIMENT-V1',
    role: 'EXPERIMENT_OWNED_MULTI_WINDOW_RATE_RETARGET_CONTINUITY',
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
    allowsMidSlewRetarget: false,

    windowCount: windows.length,
    totalPlantAdvances: plant.snapshot().advanceCount,

    initialRateScale,
    maxRateScaleStep,
    finalRateScale: slew.snapshot().currentRateScale,
    finalClockPhase: plant.snapshot().clockPhase,

    windows: windowResults,
    trace,
  };
}

module.exports = {
  parsePositiveCount,
  compareRational,
  rationalSign,
  runMultiWindowJovianRetargetExperiment,
};
