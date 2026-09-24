'use strict';

const {
  SAMPLE_SCHEMA,
  SAMPLE_SOURCE,
  ExternalPulseRigObserver,
} = require(
  './transplant1/a8-external-pulse-rig-contract'
);

const {
  Core20RecoveryInputBridge,
} = require(
  './transplant1/a8-core20-recovery-input-bridge'
);

const {
  Core20JovianRecoveryWrapper,
} = require(
  './transplant1/a8-jovian-recovery-wrapper'
);

const {
  JovianPhaseTimekeeper,
} = require(
  './transplant1/a8-jovian-phase-timekeeper'
);

const SELECTOR_SCHEMA =
  'A8-PULSE-SOURCE-EPOCH-SELECTOR-V1';

const RIG =
  'SHADOW_555_PULSE_BOX';

class ShadowJovianEngine {
  constructor() {
    this.sourceEpoch = null;
    this.lastRawPulse = null;

    this.rearmCount = 0;
    this.observationCount = 0;

    this.gate6a = null;
    this.bridge = null;
    this.jovian = null;
    this.timekeeper = null;

    this.bridgeSnapshot = null;
    this.jovianSnapshot = null;
    this.timekeeperSnapshot = null;
  }

  rearm(epoch) {
    if (this.sourceEpoch !== null) {
      this.rearmCount += 1;
    }

    this.sourceEpoch = epoch;
    this.lastRawPulse = null;

    this.gate6a =
      new ExternalPulseRigObserver();

    this.bridge =
      new Core20RecoveryInputBridge();

    this.jovian =
      new Core20JovianRecoveryWrapper();

    this.timekeeper =
      new JovianPhaseTimekeeper();

    this.bridgeSnapshot = null;
    this.jovianSnapshot = null;
    this.timekeeperSnapshot = null;
  }

  selectorSnapshot() {
    const gate6a =
      this.gate6a.snapshot();

    return {
      schema: SELECTOR_SCHEMA,

      role:
        'SHADOW_PHYSICAL_SOURCE_EPOCH_ADAPTER',

      mode: 'REAL',

      sourceEpoch:
        this.sourceEpoch,

      activeRig:
        gate6a.rig,

      gate6a,

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

  validatePhysical(physical) {
    if (
      !physical ||
      physical.STATUS !== 'ACTIVE'
    ) {
      throw new Error(
        'physical source must be ACTIVE'
      );
    }

    const epoch =
      Number(physical.SOURCE_EPOCH);

    if (
      !Number.isSafeInteger(epoch) ||
      epoch < 1
    ) {
      throw new Error(
        'invalid physical SOURCE_EPOCH'
      );
    }

    const rawText =
      String(physical.RAW_COUNT);

    if (
      !/^(0|[1-9][0-9]*)$/.test(rawText)
    ) {
      throw new Error(
        'invalid physical RAW_COUNT'
      );
    }

    return {
      epoch,
      rawText,
      raw: BigInt(rawText),
    };
  }

  ingestPhysical(physical) {
    const parsed =
      this.validatePhysical(physical);

    if (
      this.sourceEpoch === null ||
      this.sourceEpoch !== parsed.epoch
    ) {
      this.rearm(parsed.epoch);
    }

    if (
      this.lastRawPulse !== null &&
      parsed.raw < this.lastRawPulse
    ) {
      throw new Error(
        'physical raw count moved backward inside source epoch'
      );
    }

    if (
      this.lastRawPulse === null ||
      parsed.raw > this.lastRawPulse
    ) {
      this.gate6a.observe({
        schema: SAMPLE_SCHEMA,
        source: SAMPLE_SOURCE,
        rig: RIG,
        rawPulse: parsed.rawText,
      });

      this.lastRawPulse =
        parsed.raw;
    }

    this.bridgeSnapshot =
      this.bridge.sync(
        this.selectorSnapshot()
      );

    this.jovian.syncRecoveryInput(
      this.bridgeSnapshot
    );

    this.jovianSnapshot =
      this.jovian.snapshot(
        parsed.rawText
      );

    this.timekeeperSnapshot =
      this.timekeeper.sync(
        this.bridgeSnapshot,
        this.jovianSnapshot
      );

    return this.snapshot();
  }

  observeJovian(physical, event) {
    this.ingestPhysical(physical);

    this.jovianSnapshot =
      this.jovian.observe(
        this.bridgeSnapshot,
        event
      );

    this.timekeeperSnapshot =
      this.timekeeper.sync(
        this.bridgeSnapshot,
        this.jovianSnapshot
      );

    this.observationCount += 1;

    return this.snapshot();
  }

  snapshot() {
    return {
      schema:
        'A8-SHADOW-JOVIAN-ENGINE-V1',

      role:
        'INDEPENDENT_SHADOW_JOVIAN_RECOVERY',

      sourceEpoch:
        this.sourceEpoch,

      rig: RIG,

      rearmCount:
        this.rearmCount,

      observationCount:
        this.observationCount,

      bridge:
        this.bridgeSnapshot,

      jovian:
        this.jovianSnapshot,

      timekeeper:
        this.timekeeperSnapshot,

      core20RuntimeInput:
        false,

      core20ClockInput:
        false,

      core20RecoveredRulerInput:
        false,

      writesCore20:
        false,

      writesArduino:
        false,
    };
  }
}

module.exports = {
  ShadowJovianEngine,
};
