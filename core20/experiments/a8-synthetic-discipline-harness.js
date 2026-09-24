'use strict';

/*
 * AUSPICIOUS 8 · v5.4.20
 * GATE 5H · SYNTHETIC DISCIPLINE STATE-MACHINE HARNESS
 *
 * Consolidates the already-proven Gate-5A / 5B / 5C primitives into one
 * experiment-owned scripted state machine.
 *
 * Script states:
 *   RECOVERED
 *   LOSS
 *   REACQUIRED
 *
 * Legal flow:
 *
 *   UNINITIALIZED
 *        |
 *        v
 *   RECOVERED
 *        |
 *        v
 *      LOSS
 *        |
 *        v
 *   REACQUIRED
 *        |
 *        v
 *   RECOVERED
 *
 * After REACQUIRED, bounded rate-only recovery runs to exact settlement and
 * the machine returns to RECOVERED. The cycle may then repeat.
 *
 * Boundaries:
 *   - real A8Core is not imported
 *   - no real oscillator/divider/clock actuator
 *   - no phase setter/reset/snap/alignment
 *   - no host time
 *   - no timer/scheduler cadence
 *   - no Mintaka/Sol/Terra Ship Slip input
 *
 * LOSS:
 *   - freezes the last settled rate exactly
 *   - invents no candidate
 *   - advances synthetic phase only by plant integration
 *
 * REACQUIRED:
 *   - derives fresh exact Gate-5A Jovian candidate
 *   - loading candidate changes current rate by zero
 *   - loading candidate changes phase by zero
 *   - Gate-5B bounded slew changes rate only
 *   - Gate-5C plant integrates phase only
 *
 * All counts are abstract experiment iterations.
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

const STATES = Object.freeze({
  UNINITIALIZED: 'UNINITIALIZED',
  RECOVERED: 'RECOVERED',
  LOSS: 'LOSS',
  REACQUIRED: 'REACQUIRED',
});

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

function subtractRational(a, b) {
  let numerator =
    BigInt(a.numerator) * BigInt(b.denominator) -
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

function assertAllowedKeys(event, allowed, label) {
  for (const key of Object.keys(event)) {
    if (!allowed.has(key)) {
      throw new Error(`${label} contains unsupported field: ${key}`);
    }
  }
}

function validateScript(script) {
  if (!Array.isArray(script) || script.length < 3) {
    throw new Error('discipline script must contain at least three state events');
  }

  for (let i = 0; i < script.length; i++) {
    const event = script[i];

    if (!event || typeof event !== 'object' || Array.isArray(event)) {
      throw new Error(`script event ${i + 1} must be an object`);
    }

    if (!Object.values(STATES).includes(event.state) ||
        event.state === STATES.UNINITIALIZED) {
      throw new Error(`script event ${i + 1} has unsupported state`);
    }
  }
}

function runSyntheticDisciplineHarness({
  divider = { numerator: '8', denominator: '1' },
  initialSettledRateScale = { numerator: '1', denominator: '1' },
  maxRateScaleStep,
  script,
}) {
  validateScript(script);

  const plant = new SyntheticRateContinuityPlant({ divider });

  const slew = new BoundedRateSlewSimulator({
    initialScale: initialSettledRateScale,
    maxStep: maxRateScaleStep,
  });

  let machineState = STATES.UNINITIALIZED;

  const eventResults = [];
  const plantTrace = [];
  const stateTransitions = [];

  function transition(to, eventIndex, reason) {
    const from = machineState;
    machineState = to;

    stateTransitions.push({
      eventIndex,
      from,
      to,
      reason,
      phase: plant.snapshot().clockPhase,
      currentRateScale: slew.snapshot().currentRateScale,
    });
  }

  for (let i = 0; i < script.length; i++) {
    const event = script[i];
    const eventIndex = i + 1;

    if (event.state === STATES.RECOVERED) {
      assertAllowedKeys(
        event,
        new Set(['state', 'label']),
        `RECOVERED event ${eventIndex}`
      );

      if (machineState !== STATES.UNINITIALIZED) {
        throw new Error(
          `RECOVERED event ${eventIndex} is only legal as the initial state declaration`
        );
      }

      const phaseBefore = plant.snapshot().clockPhase;
      const rateBefore = slew.snapshot().currentRateScale;

      transition(
        STATES.RECOVERED,
        eventIndex,
        'INITIAL_RECOVERED_STATE_DECLARED'
      );

      const phaseAfter = plant.snapshot().clockPhase;
      const rateAfter = slew.snapshot().currentRateScale;

      if (compareRational(phaseBefore, phaseAfter) !== 0) {
        throw new Error('initial RECOVERED declaration changed phase');
      }

      if (compareRational(rateBefore, rateAfter) !== 0) {
        throw new Error('initial RECOVERED declaration changed rate');
      }

      eventResults.push({
        eventIndex,
        state: STATES.RECOVERED,
        label: event.label ?? 'INITIAL_RECOVERED',

        phaseBefore,
        phaseAfter,
        rateBefore,
        rateAfter,

        phaseMovement: subtractRational(
          phaseAfter,
          phaseBefore
        ),

        rateMovement: subtractRational(
          rateAfter,
          rateBefore
        ),
      });

      continue;
    }

    if (event.state === STATES.LOSS) {
      assertAllowedKeys(
        event,
        new Set(['state', 'label', 'advances']),
        `LOSS event ${eventIndex}`
      );

      if (machineState !== STATES.RECOVERED) {
        throw new Error(
          `LOSS event ${eventIndex} requires RECOVERED state`
        );
      }

      const advances = parsePositiveCount(
        event.advances,
        `LOSS event ${eventIndex} advances`
      );

      const slewState = slew.snapshot();

      if (
        slewState.targetRateScale !== null &&
        !slewState.targetReached
      ) {
        throw new Error(
          `LOSS event ${eventIndex} cannot begin before prior slew settles`
        );
      }

      const heldRate = slewState.currentRateScale;
      const phaseAtLossStart = plant.snapshot().clockPhase;

      transition(
        STATES.LOSS,
        eventIndex,
        'FRESH_JOVIAN_EVIDENCE_ABSENT'
      );

      const lossTrace = [];

      for (let n = 0; n < advances; n++) {
        const phaseBefore = plant.snapshot().clockPhase;
        const plantAfter = plant.advance(heldRate);
        const phaseAfter = plantAfter.clockPhase;

        const item = {
          eventIndex,
          stage: 'LOSS_HOLDOVER',
          advanceInLoss: n + 1,
          globalPlantAdvance: plantAfter.advanceCount,

          rateScale: plantAfter.lastRateScale,

          phaseBefore,
          phaseAfter,
          phaseIncrement: plantAfter.lastClockPhaseIncrement,
        };

        if (compareRational(item.rateScale, heldRate) !== 0) {
          throw new Error(
            `LOSS event ${eventIndex} changed held rate`
          );
        }

        if (
          compareRational(
            item.phaseAfter,
            item.phaseBefore
          ) <= 0
        ) {
          throw new Error(
            `LOSS event ${eventIndex} failed strict phase continuity`
          );
        }

        plantTrace.push(item);
        lossTrace.push(item);
      }

      const phaseAtLossEnd = plant.snapshot().clockPhase;
      const rateAtLossEnd = slew.snapshot().currentRateScale;

      if (compareRational(rateAtLossEnd, heldRate) !== 0) {
        throw new Error(
          `LOSS event ${eventIndex} changed slew rate`
        );
      }

      eventResults.push({
        eventIndex,
        state: STATES.LOSS,
        label: event.label ?? `LOSS_${eventIndex}`,

        advances,
        heldRateScale: heldRate,

        phaseAtLossStart,
        phaseAtLossEnd,
        phaseAdvance: subtractRational(
          phaseAtLossEnd,
          phaseAtLossStart
        ),

        rateAtLossEnd,
        candidateInvented: false,
        lossTrace,
      });

      continue;
    }

    if (event.state === STATES.REACQUIRED) {
      assertAllowedKeys(
        event,
        new Set([
          'state',
          'label',
          'baselineJovianSample',
          'freshJovianSample',
        ]),
        `REACQUIRED event ${eventIndex}`
      );

      if (machineState !== STATES.LOSS) {
        throw new Error(
          `REACQUIRED event ${eventIndex} requires LOSS state`
        );
      }

      if (!event.baselineJovianSample ||
          !event.freshJovianSample) {
        throw new Error(
          `REACQUIRED event ${eventIndex} requires baseline and fresh Jovian samples`
        );
      }

      const phaseBeforeCandidateLoad = plant.snapshot().clockPhase;
      const rateBeforeCandidateLoad = slew.snapshot().currentRateScale;

      const advisor = new JovianSlowDisciplineCandidate();
      advisor.establishBaseline(event.baselineJovianSample);
      const candidate = advisor.evaluate(event.freshJovianSample);

      transition(
        STATES.REACQUIRED,
        eventIndex,
        'FRESH_JOVIAN_EVIDENCE_RETURNED'
      );

      const loaded = slew.loadCandidate(candidate);

      const phaseAfterCandidateLoad = plant.snapshot().clockPhase;
      const rateAfterCandidateLoad = loaded.currentRateScale;

      if (
        compareRational(
          phaseAfterCandidateLoad,
          phaseBeforeCandidateLoad
        ) !== 0
      ) {
        throw new Error(
          `REACQUIRED event ${eventIndex} candidate load changed phase`
        );
      }

      if (
        compareRational(
          rateAfterCandidateLoad,
          rateBeforeCandidateLoad
        ) !== 0
      ) {
        throw new Error(
          `REACQUIRED event ${eventIndex} candidate load changed current rate`
        );
      }

      const targetRateScale = loaded.targetRateScale;
      const direction = compareRational(
        targetRateScale,
        rateBeforeCandidateLoad
      );

      const recoveryTrace = [];
      let localRecoveryUpdate = 0;

      while (!slew.snapshot().targetReached) {
        const beforeSlew = slew.snapshot();
        const phaseBefore = plant.snapshot().clockPhase;

        const afterSlew = slew.step();
        const plantAfter = plant.advance(
          afterSlew.currentRateScale
        );

        localRecoveryUpdate += 1;

        const item = {
          eventIndex,
          stage: 'REACQUIRED_RATE_SLEW',
          updateInRecovery: localRecoveryUpdate,
          globalPlantAdvance: plantAfter.advanceCount,

          rateBefore: beforeSlew.currentRateScale,
          rateAfter: afterSlew.currentRateScale,
          rateDelta: afterSlew.lastAppliedDelta,

          phaseBefore,
          phaseAfter: plantAfter.clockPhase,
          phaseIncrement: plantAfter.lastClockPhaseIncrement,
        };

        if (
          compareRational(
            item.phaseAfter,
            item.phaseBefore
          ) <= 0
        ) {
          throw new Error(
            `REACQUIRED event ${eventIndex} failed strict phase continuity`
          );
        }

        plantTrace.push(item);
        recoveryTrace.push(item);

        if (localRecoveryUpdate > 100000) {
          throw new Error(
            `REACQUIRED event ${eventIndex} failed to settle`
          );
        }
      }

      const settled = slew.snapshot();

      transition(
        STATES.RECOVERED,
        eventIndex,
        'BOUNDED_RATE_RECOVERY_SETTLED'
      );

      eventResults.push({
        eventIndex,
        state: STATES.REACQUIRED,
        label: event.label ?? `REACQUIRED_${eventIndex}`,

        candidate,
        errorSign: rationalSign(
          candidate.signedFractionalRateError
        ),

        rateBeforeCandidateLoad,
        rateAfterCandidateLoad,

        candidateLoadRateMovement:
          subtractRational(
            rateAfterCandidateLoad,
            rateBeforeCandidateLoad
          ),

        phaseBeforeCandidateLoad,
        phaseAfterCandidateLoad,

        candidateLoadPhaseMovement:
          subtractRational(
            phaseAfterCandidateLoad,
            phaseBeforeCandidateLoad
          ),

        slewDirection:
          direction < 0
            ? 'DOWN'
            : direction > 0
              ? 'UP'
              : 'NONE',

        targetRateScale,
        recoveryUpdates: localRecoveryUpdate,

        settledRateScale: settled.currentRateScale,
        phaseAtSettlement: plant.snapshot().clockPhase,

        recoveryTrace,
      });

      continue;
    }
  }

  if (machineState !== STATES.RECOVERED) {
    throw new Error(
      `discipline script ended in ${machineState}; complete harness script must end RECOVERED`
    );
  }

  for (let i = 1; i < plantTrace.length; i++) {
    if (
      compareRational(
        plantTrace[i].phaseBefore,
        plantTrace[i - 1].phaseAfter
      ) !== 0
    ) {
      throw new Error(
        `global phase discontinuity between plant advances ${i} and ${i + 1}`
      );
    }
  }

  return {
    schema: 'A8-SYNTHETIC-DISCIPLINE-HARNESS-V1',
    role: 'EXPERIMENT_OWNED_SCRIPTED_DISCIPLINE_STATE_MACHINE',
    mode: 'DISCONNECTED_FROM_A8CORE',

    supportedStates: [
      STATES.RECOVERED,
      STATES.LOSS,
      STATES.REACQUIRED,
    ],

    finalState: machineState,

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
    candidateLoadChangesRate: false,
    candidateLoadChangesPhase: false,
    requiresSettlementBeforeLoss: true,
    requiresLossBeforeReacquisition: true,

    scriptEventCount: script.length,
    totalPlantAdvances: plant.snapshot().advanceCount,

    initialSettledRateScale,
    maxRateScaleStep,

    finalRateScale: slew.snapshot().currentRateScale,
    finalClockPhase: plant.snapshot().clockPhase,

    stateTransitions,
    events: eventResults,
    plantTrace,
  };
}

module.exports = {
  STATES,
  parsePositiveCount,
  compareRational,
  rationalSign,
  subtractRational,
  validateScript,
  runSyntheticDisciplineHarness,
};
