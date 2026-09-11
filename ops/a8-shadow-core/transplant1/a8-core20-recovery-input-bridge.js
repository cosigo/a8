'use strict';

/*
 * AUSPICIOUS 8 · POST-SEAL HARDWARE BRANCH
 * GATE 6F · CORE-20 RAW-OSCILLATOR RECOVERY-INPUT BRIDGE
 *
 * Input:
 *   Gate-6E selector snapshot only.
 *
 * Output:
 *   qualified current raw-oscillator state for a future post-seal Core-20
 *   recovery wrapper.
 *
 * This module DOES NOT mutate core/a8-core.js and DOES NOT advance a clock.
 *
 * Source-epoch rule:
 *   any new sourceEpoch immediately re-arms the bridge.
 *   The first raw count in that epoch establishes a fresh baseline.
 *   No raw count or phase continuity is carried across source epochs.
 */

const BRIDGE_SCHEMA =
  'A8-CORE20-RECOVERY-INPUT-BRIDGE-V1';

const INPUT_SCHEMA =
  'A8-CORE20-RAW-OSCILLATOR-INPUT-V1';

const SELECTOR_SCHEMA =
  'A8-PULSE-SOURCE-EPOCH-SELECTOR-V1';

const GATE6A_OBSERVER_SCHEMA =
  'A8-EXTERNAL-PULSE-RIG-OBSERVER-V1';

const STATUS_UNARMED =
  'UNARMED';

const STATUS_WAITING_BASELINE =
  'REARMED_WAITING_RAW_BASELINE';

const STATUS_BASELINE =
  'RAW_BASELINE_ESTABLISHED';

const STATUS_ACTIVE =
  'RAW_OSCILLATOR_INPUT_ACTIVE';

function parseNonNegativeInteger(value, label) {
  const text = String(value ?? '');

  if (!/^(0|[1-9][0-9]*)$/.test(text)) {
    throw new Error(
      `${label} must be a non-negative integer`
    );
  }

  return BigInt(text);
}

function validateSelectorSnapshot(snapshot) {
  if (
    !snapshot ||
    typeof snapshot !== 'object' ||
    Array.isArray(snapshot)
  ) {
    throw new Error(
      'selector snapshot must be an object'
    );
  }

  if (snapshot.schema !== SELECTOR_SCHEMA) {
    throw new Error(
      `selector schema must be ${SELECTOR_SCHEMA}`
    );
  }

  if (
    snapshot.mode !== 'VIRTUAL' &&
    snapshot.mode !== 'REAL'
  ) {
    throw new Error(
      'selector mode must be VIRTUAL or REAL'
    );
  }

  if (
    !Number.isSafeInteger(snapshot.sourceEpoch) ||
    snapshot.sourceEpoch < 1
  ) {
    throw new Error(
      'selector sourceEpoch must be a positive safe integer'
    );
  }

  const gate6a = snapshot.gate6a;

  if (
    !gate6a ||
    gate6a.schema !== GATE6A_OBSERVER_SCHEMA
  ) {
    throw new Error(
      `selector gate6a schema must be ${GATE6A_OBSERVER_SCHEMA}`
    );
  }

  return snapshot;
}

class Core20RecoveryInputBridge {
  constructor() {
    this.sourceEpoch = null;
    this.mode = null;
    this.rig = null;

    this.baselineRawPulse = null;
    this.lastRawPulse = null;

    this.acceptedRawStates = 0;
    this.rearmCount = 0;

    this.status =
      STATUS_UNARMED;
  }

  sync(selectorSnapshot) {
    const snapshot =
      validateSelectorSnapshot(
        selectorSnapshot
      );

    const epochChanged =
      this.sourceEpoch !==
      snapshot.sourceEpoch;

    if (epochChanged) {
      if (this.sourceEpoch !== null) {
        this.rearmCount += 1;
      }

      this.sourceEpoch =
        snapshot.sourceEpoch;

      this.mode =
        snapshot.mode;

      this.rig = null;

      this.baselineRawPulse = null;
      this.lastRawPulse = null;

      this.acceptedRawStates = 0;

      this.status =
        STATUS_WAITING_BASELINE;
    } else {
      if (snapshot.mode !== this.mode) {
        throw new Error(
          'selector mode changed without sourceEpoch change'
        );
      }
    }

    const gate6a =
      snapshot.gate6a;

    if (
      gate6a.sampleCount === 0 ||
      gate6a.lastRawPulse === null
    ) {
      if (
        gate6a.sampleCount !== 0 ||
        gate6a.firstRawPulse !== null ||
        gate6a.lastRawPulse !== null ||
        gate6a.rig !== null
      ) {
        throw new Error(
          'empty Gate-6A state is internally inconsistent'
        );
      }

      return this.snapshot();
    }

    if (
      !Number.isSafeInteger(
        gate6a.sampleCount
      ) ||
      gate6a.sampleCount < 1
    ) {
      throw new Error(
        'Gate-6A sampleCount must be a positive safe integer'
      );
    }

    if (
      typeof gate6a.rig !== 'string' ||
      gate6a.rig.length === 0
    ) {
      throw new Error(
        'qualified Gate-6A state requires rig identity'
      );
    }

    const rawPulse =
      parseNonNegativeInteger(
        gate6a.lastRawPulse,
        'Gate-6A lastRawPulse'
      );

    if (this.lastRawPulse !== null) {
      if (rawPulse < this.lastRawPulse) {
        throw new Error(
          'rawPulse moved backward inside one source epoch'
        );
      }

      if (rawPulse === this.lastRawPulse) {
        return this.snapshot();
      }
    }

    if (this.rig === null) {
      this.rig = gate6a.rig;
    } else if (gate6a.rig !== this.rig) {
      throw new Error(
        'rig identity changed without sourceEpoch change'
      );
    }

    if (this.baselineRawPulse === null) {
      this.baselineRawPulse =
        rawPulse;

      this.lastRawPulse =
        rawPulse;

      this.acceptedRawStates = 1;

      this.status =
        STATUS_BASELINE;

      return this.snapshot();
    }

    this.lastRawPulse =
      rawPulse;

    this.acceptedRawStates += 1;

    this.status =
      STATUS_ACTIVE;

    return this.snapshot();
  }

  snapshot() {
    const epochRawAdvance =
      this.baselineRawPulse === null ||
      this.lastRawPulse === null
        ? null
        : this.lastRawPulse -
          this.baselineRawPulse;

    const recoveryInput =
      this.lastRawPulse === null ||
      this.rig === null
        ? null
        : {
            schema:
              INPUT_SCHEMA,

            source:
              'SELECTED_EXTERNAL_PULSE_RIG',

            sourceEpoch:
              this.sourceEpoch,

            mode:
              this.mode,

            rig:
              this.rig,

            rawPulse:
              this.lastRawPulse.toString(),

            epochBaselineRawPulse:
              this.baselineRawPulse.toString(),

            epochRawAdvance:
              epochRawAdvance.toString(),
          };

    return {
      schema:
        BRIDGE_SCHEMA,

      role:
        'POSTSEAL_CORE20_RAW_OSCILLATOR_RECOVERY_INPUT',

      status:
        this.status,

      sourceEpoch:
        this.sourceEpoch,

      mode:
        this.mode,

      rig:
        this.rig,

      baselineRawPulse:
        this.baselineRawPulse === null
          ? null
          : this.baselineRawPulse.toString(),

      lastRawPulse:
        this.lastRawPulse === null
          ? null
          : this.lastRawPulse.toString(),

      epochRawAdvance:
        epochRawAdvance === null
          ? null
          : epochRawAdvance.toString(),

      acceptedRawStates:
        this.acceptedRawStates,

      rearmCount:
        this.rearmCount,

      recoveryInput,

      sourceEpochChangeForcesRearm:
        true,

      carriesCounterContinuityAcrossEpoch:
        false,

      manufacturesPhaseContinuity:
        false,

      writesA8Core:
        false,

      writesClock:
        false,

      writesPhase:
        false,

      writesAuthority:
        false,

      usesHostTime:
        false,

      usesLegacyTime:
        false,

      usesFrequencyHz:
        false,

      acceptsTimestamp:
        false,
    };
  }
}

module.exports = {
  BRIDGE_SCHEMA,
  INPUT_SCHEMA,
  SELECTOR_SCHEMA,
  GATE6A_OBSERVER_SCHEMA,
  STATUS_UNARMED,
  STATUS_WAITING_BASELINE,
  STATUS_BASELINE,
  STATUS_ACTIVE,
  parseNonNegativeInteger,
  validateSelectorSnapshot,
  Core20RecoveryInputBridge,
};
