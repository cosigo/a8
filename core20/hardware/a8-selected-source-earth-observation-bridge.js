'use strict';

/*
 * AUSPICIOUS 8 · POST-SEAL HARDWARE BRANCH
 * GATE 6I · SELECTED-SOURCE EARTH-OBSERVATION BRIDGE
 *
 * One selected raw counter now serves all defining observations:
 *
 *   Gate-6E source selector
 *           ↓
 *   Gate-6F selected raw oscillator input
 *           ├── Gate-6G / 6H Jovian recovery + continuous Jovian phase
 *           ├── Mintaka Earth-rotation observation
 *           └── Sol celestial-direction observation
 *
 * External Earth-observation payloads MUST NOT contain rawPulse.
 * This bridge inserts the current Gate-6F rawPulse itself.
 *
 * Source-epoch rule:
 *   VIRTUAL ↔ REAL switch re-arms BOTH Earth observers.
 *   Evidence from unrelated counters is never spliced.
 *
 * No clock, phase, divider, authority, host-time, UTC, NTP, GPS, Hz,
 * expected Mintaka period, expected Sol rate, solar day, or year constant
 * exists in this bridge.
 */

const {
  MintakaRotationObserver,
} = require(
  '../observer/a8-mintaka-observer'
);

const {
  SolCelestialObserver,
} = require(
  '../observer/a8-sol-observer'
);

const EARTH_BRIDGE_SCHEMA =
  'A8-SELECTED-SOURCE-EARTH-OBSERVATION-BRIDGE-V1';

const RECOVERY_BRIDGE_SCHEMA =
  'A8-CORE20-RECOVERY-INPUT-BRIDGE-V1';

const RECOVERY_INPUT_SCHEMA =
  'A8-CORE20-RAW-OSCILLATOR-INPUT-V1';

const MINTAKA_EVENT_TYPE =
  'STELLAR_MERIDIAN';

const MINTAKA_WITNESS =
  'MINTAKA';

const SOL_EVENT_TYPE =
  'SOL_CELESTIAL_DIRECTION';

const SOL_WITNESS =
  'SOL';

const MINTAKA_ALLOWED_KEYS =
  new Set([
    'type',
    'witness',
  ]);

const SOL_ALLOWED_KEYS =
  new Set([
    'type',
    'witness',
    'angle512',
  ]);

function validateObject(
  value,
  label
) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    throw new Error(
      `${label} must be an object`
    );
  }

  return value;
}

function validateAllowedKeys(
  value,
  allowed,
  label
) {
  validateObject(
    value,
    label
  );

  for (
    const key of
    Object.keys(value)
  ) {
    if (!allowed.has(key)) {
      throw new Error(
        `unsupported ${label} field: ${key}`
      );
    }
  }

  return value;
}

function validateRecoveryBridgeSnapshot(
  snapshot
) {
  validateObject(
    snapshot,
    'Gate-6F recovery bridge snapshot'
  );

  if (
    snapshot.schema !==
    RECOVERY_BRIDGE_SCHEMA
  ) {
    throw new Error(
      `Gate-6F recovery bridge schema must be ${RECOVERY_BRIDGE_SCHEMA}`
    );
  }

  if (
    !Number.isSafeInteger(
      snapshot.sourceEpoch
    ) ||
    snapshot.sourceEpoch < 1
  ) {
    throw new Error(
      'Gate-6F sourceEpoch must be a positive safe integer'
    );
  }

  if (
    snapshot.mode !== 'VIRTUAL' &&
    snapshot.mode !== 'REAL'
  ) {
    throw new Error(
      'Gate-6F mode must be VIRTUAL or REAL'
    );
  }

  if (
    snapshot.recoveryInput !== null
  ) {
    validateObject(
      snapshot.recoveryInput,
      'Gate-6F recoveryInput'
    );

    if (
      snapshot.recoveryInput.schema !==
      RECOVERY_INPUT_SCHEMA
    ) {
      throw new Error(
        `Gate-6F recoveryInput schema must be ${RECOVERY_INPUT_SCHEMA}`
      );
    }

    if (
      snapshot.recoveryInput.sourceEpoch !==
      snapshot.sourceEpoch
    ) {
      throw new Error(
        'Gate-6F recoveryInput sourceEpoch mismatch'
      );
    }

    if (
      String(
        snapshot.recoveryInput.rawPulse
      ) !==
      String(
        snapshot.lastRawPulse
      )
    ) {
      throw new Error(
        'Gate-6F recoveryInput rawPulse mismatch'
      );
    }
  }

  return snapshot;
}

class SelectedSourceEarthObservationBridge {
  constructor({
    mintakaFactory =
      () =>
        new MintakaRotationObserver(),

    solFactory =
      () =>
        new SolCelestialObserver(),
  } = {}) {
    this.mintakaFactory =
      mintakaFactory;

    this.solFactory =
      solFactory;

    this.sourceEpoch = null;
    this.mode = null;
    this.rig = null;
    this.currentRawPulse = null;

    this.rearmCount = 0;
    this.acceptedMintakaObservations = 0;
    this.acceptedSolObservations = 0;

    this.mintakaObserver =
      this.mintakaFactory();

    this.solObserver =
      this.solFactory();

    this.status =
      'WAITING_FOR_SELECTED_SOURCE';
  }

  resetObserversForEpoch(
    snapshot
  ) {
    if (
      this.sourceEpoch !== null
    ) {
      this.rearmCount += 1;
    }

    this.sourceEpoch =
      snapshot.sourceEpoch;

    this.mode =
      snapshot.mode;

    this.rig =
      snapshot.rig;

    this.currentRawPulse = null;

    this.acceptedMintakaObservations = 0;
    this.acceptedSolObservations = 0;

    this.mintakaObserver =
      this.mintakaFactory();

    this.solObserver =
      this.solFactory();

    this.status =
      'REARMED_WAITING_SELECTED_RAW_BASELINE';
  }

  sync(
    recoveryBridgeSnapshot
  ) {
    const snapshot =
      validateRecoveryBridgeSnapshot(
        recoveryBridgeSnapshot
      );

    if (
      this.sourceEpoch !==
      snapshot.sourceEpoch
    ) {
      this.resetObserversForEpoch(
        snapshot
      );
    } else {
      if (
        this.mode !==
        snapshot.mode
      ) {
        throw new Error(
          'Gate-6F mode changed without sourceEpoch change'
        );
      }

      if (
        this.rig !== null &&
        snapshot.rig !== null &&
        this.rig !==
          snapshot.rig
      ) {
        throw new Error(
          'Gate-6F rig changed without sourceEpoch change'
        );
      }

      if (
        this.rig === null &&
        snapshot.rig !== null
      ) {
        this.rig =
          snapshot.rig;
      }
    }

    if (
      snapshot.recoveryInput ===
      null
    ) {
      this.currentRawPulse =
        null;

      this.status =
        'WAITING_SELECTED_RAW_BASELINE';

      return this.snapshot();
    }

    this.rig =
      snapshot.recoveryInput.rig;

    this.currentRawPulse =
      String(
        snapshot.recoveryInput.rawPulse
      );

    this.status =
      'SELECTED_RAW_READY';

    return this.snapshot();
  }

  requireSelectedRaw(
    recoveryBridgeSnapshot
  ) {
    this.sync(
      recoveryBridgeSnapshot
    );

    if (
      this.currentRawPulse ===
      null
    ) {
      throw new Error(
        'selected Gate-6F rawPulse is not established'
      );
    }

    return this.currentRawPulse;
  }

  observeMintaka(
    recoveryBridgeSnapshot,
    observation
  ) {
    validateAllowedKeys(
      observation,
      MINTAKA_ALLOWED_KEYS,
      'Mintaka observation'
    );

    if (
      observation.type !==
      MINTAKA_EVENT_TYPE
    ) {
      throw new Error(
        `Mintaka observation type must be ${MINTAKA_EVENT_TYPE}`
      );
    }

    if (
      observation.witness !==
      MINTAKA_WITNESS
    ) {
      throw new Error(
        `Mintaka witness must be ${MINTAKA_WITNESS}`
      );
    }

    const rawPulse =
      this.requireSelectedRaw(
        recoveryBridgeSnapshot
      );

    const observer =
      this.mintakaObserver.observe({
        type:
          MINTAKA_EVENT_TYPE,

        rawPulse,

        witness:
          MINTAKA_WITNESS,
      });

    this.acceptedMintakaObservations +=
      1;

    this.status =
      'EARTH_OBSERVATION_ACTIVE';

    return {
      bridge:
        this.snapshot(),

      observer,
    };
  }

  observeSol(
    recoveryBridgeSnapshot,
    observation
  ) {
    validateAllowedKeys(
      observation,
      SOL_ALLOWED_KEYS,
      'Sol observation'
    );

    if (
      observation.type !==
      SOL_EVENT_TYPE
    ) {
      throw new Error(
        `Sol observation type must be ${SOL_EVENT_TYPE}`
      );
    }

    if (
      observation.witness !==
      SOL_WITNESS
    ) {
      throw new Error(
        `Sol witness must be ${SOL_WITNESS}`
      );
    }

    if (
      !Object.prototype.hasOwnProperty.call(
        observation,
        'angle512'
      )
    ) {
      throw new Error(
        'Sol observation requires exact angle512'
      );
    }

    const rawPulse =
      this.requireSelectedRaw(
        recoveryBridgeSnapshot
      );

    const observer =
      this.solObserver.observe({
        type:
          SOL_EVENT_TYPE,

        rawPulse,

        witness:
          SOL_WITNESS,

        angle512:
          observation.angle512,
      });

    this.acceptedSolObservations +=
      1;

    this.status =
      'EARTH_OBSERVATION_ACTIVE';

    return {
      bridge:
        this.snapshot(),

      observer,
    };
  }

  snapshot() {
    return {
      schema:
        EARTH_BRIDGE_SCHEMA,

      role:
        'EARTH_OBSERVERS_USE_GATE6F_SELECTED_RAW_COUNTER',

      status:
        this.status,

      sourceEpoch:
        this.sourceEpoch,

      mode:
        this.mode,

      rig:
        this.rig,

      selectedRawPulse:
        this.currentRawPulse,

      rawPulseAuthority:
        'GATE6F_SELECTED_RAW_OSCILLATOR_INPUT',

      externalMintakaInput:
        'type + witness ONLY',

      externalSolInput:
        'type + witness + exact native angle512 ONLY',

      externalObservationAcceptsRawPulse:
        false,

      sourceEpochChangeRearmsEarthObservers:
        true,

      carriesEarthEvidenceAcrossSourceEpoch:
        false,

      rearmCount:
        this.rearmCount,

      acceptedMintakaObservations:
        this.acceptedMintakaObservations,

      acceptedSolObservations:
        this.acceptedSolObservations,

      mintaka:
        this.mintakaObserver.snapshot(),

      sol:
        this.solObserver.snapshot(),

      writesA8Core:
        false,

      writesClock:
        false,

      writesPhase:
        false,

      writesDivider:
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

      acceptsExternalRawPulse:
        false,

      dayPhase17Driven:
        false,

      phase20Driven:
        false,
    };
  }
}

module.exports = {
  EARTH_BRIDGE_SCHEMA,
  RECOVERY_BRIDGE_SCHEMA,
  RECOVERY_INPUT_SCHEMA,
  MINTAKA_EVENT_TYPE,
  MINTAKA_WITNESS,
  SOL_EVENT_TYPE,
  SOL_WITNESS,
  MINTAKA_ALLOWED_KEYS,
  SOL_ALLOWED_KEYS,
  validateObject,
  validateAllowedKeys,
  validateRecoveryBridgeSnapshot,
  SelectedSourceEarthObservationBridge,
};
