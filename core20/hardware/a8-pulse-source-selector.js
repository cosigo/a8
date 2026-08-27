'use strict';

/*
 * AUSPICIOUS 8 · POST-SEAL HARDWARE BRANCH
 * GATE 6E · VIRTUAL / REAL PULSE-SOURCE EPOCH SELECTOR
 *
 * One downstream contract:
 *   Gate 6A · EXTERNAL_PULSE_RIG + rig + rawPulse
 *
 * Two source modes:
 *   VIRTUAL · explicit laboratory raw-edge advances
 *   REAL    · future Gate-6C physical device observations
 *
 * Critical rule:
 *   A source switch NEVER splices counters.
 *
 *   VIRTUAL -> REAL or REAL -> VIRTUAL:
 *     - increment source epoch
 *     - create a fresh Gate-6A observer
 *     - clear the accepted raw-count baseline
 *     - require the newly selected rig to establish fresh raw counts
 *
 * No clock/phase continuity is manufactured across source epochs.
 * No host time, seconds, Hz, timestamps, or expected oscillator rate.
 */

const {
  SAMPLE_SCHEMA,
  SAMPLE_SOURCE,
  ExternalPulseRigObserver,
} = require('./a8-external-pulse-rig-contract');

const SELECTOR_SCHEMA =
  'A8-PULSE-SOURCE-EPOCH-SELECTOR-V1';

const MODE_NONE = 'NONE';
const MODE_VIRTUAL = 'VIRTUAL';
const MODE_REAL = 'REAL';

const VIRTUAL_RIG_ID = 'VIRTUAL_RIG_A';

function parsePositiveInteger(value, label) {
  const text = String(value ?? '');

  if (!/^[1-9][0-9]*$/.test(text)) {
    throw new Error(
      `${label} must be a positive integer`
    );
  }

  return BigInt(text);
}

class A8PulseSourceEpochSelector {
  constructor() {
    this.mode = MODE_NONE;
    this.sourceEpoch = 0;

    this.observer =
      new ExternalPulseRigObserver();

    this.virtualRawPulse = 0n;

    this.lastSwitch = {
      from: null,
      to: MODE_NONE,
      epoch: 0,
      baselineCleared: true,
      counterContinuityCarried: false,
    };
  }

  select(mode) {
    if (
      mode !== MODE_VIRTUAL &&
      mode !== MODE_REAL
    ) {
      throw new Error(
        'mode must be VIRTUAL or REAL'
      );
    }

    if (mode === this.mode) {
      return this.snapshot();
    }

    const from = this.mode;

    this.mode = mode;
    this.sourceEpoch += 1;

    this.observer =
      new ExternalPulseRigObserver();

    this.virtualRawPulse = 0n;

    this.lastSwitch = {
      from,
      to: mode,
      epoch: this.sourceEpoch,
      baselineCleared: true,
      counterContinuityCarried: false,
    };

    return this.snapshot();
  }

  advanceVirtual(rawAdvance) {
    if (this.mode !== MODE_VIRTUAL) {
      throw new Error(
        'virtual advance requires VIRTUAL source mode'
      );
    }

    const advance =
      parsePositiveInteger(
        rawAdvance,
        'rawAdvance'
      );

    this.virtualRawPulse += advance;

    return this.observer.observe({
      schema: SAMPLE_SCHEMA,
      source: SAMPLE_SOURCE,
      rig: VIRTUAL_RIG_ID,
      rawPulse:
        this.virtualRawPulse.toString(),
    });
  }

  ingestRealSample(sample) {
    if (this.mode !== MODE_REAL) {
      throw new Error(
        'real sample requires REAL source mode'
      );
    }

    if (
      sample &&
      sample.rig === VIRTUAL_RIG_ID
    ) {
      throw new Error(
        'REAL source mode rejects virtual rig identity'
      );
    }

    return this.observer.observe(sample);
  }

  snapshot() {
    const gate6a =
      this.observer.snapshot();

    return {
      schema: SELECTOR_SCHEMA,
      role: 'VIRTUAL_REAL_PULSE_SOURCE_EPOCH_SELECTOR',

      mode: this.mode,
      sourceEpoch: this.sourceEpoch,

      activeRig:
        gate6a.rig,

      gate6a,

      virtualRig:
        this.mode === MODE_VIRTUAL
          ? {
              rig: VIRTUAL_RIG_ID,
              rawPulse:
                this.virtualRawPulse.toString(),
              advanceMethod:
                'EXPLICIT_RAW_EDGE_INCREMENT',
              usesTimer: false,
              usesHostTime: false,
              usesFrequencyHz: false,
            }
          : null,

      lastSwitch: {
        ...this.lastSwitch,
      },

      counterContinuityAcrossSourceSwitch:
        false,

      phaseContinuityManufacturedAcrossSourceSwitch:
        false,

      switchRequiresFreshRawBaseline:
        true,

      definingPayload:
        'EXTERNAL_PULSE_RIG + rig + rawPulse',

      writesA8Core: false,
      writesClock: false,
      writesPhase: false,
      writesOscillator: false,
      writesDivider: false,
      writesAuthority: false,

      usesHostTime: false,
      usesLegacyTime: false,
      usesFrequencyHz: false,
      acceptsTimestamp: false,
    };
  }
}

module.exports = {
  SELECTOR_SCHEMA,
  MODE_NONE,
  MODE_VIRTUAL,
  MODE_REAL,
  VIRTUAL_RIG_ID,
  parsePositiveInteger,
  A8PulseSourceEpochSelector,
};
