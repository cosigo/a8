'use strict';

/*
 * AUSPICIOUS 8 · POST-SEAL HARDWARE BRANCH
 * GATE 6A · EXTERNAL PULSE-RIG READ-ONLY CONTRACT
 *
 * This is the first interface defined AFTER the immutable Gate-5J v5.4.20 seal.
 *
 * Purpose:
 *   Let an external Arduino-class / pulse-counter rig present raw counted
 *   oscillator edges to the laboratory as exact integers.
 *
 * Accepted event:
 *
 *   {
 *     schema:   'A8-EXTERNAL-PULSE-RIG-SAMPLE-V1',
 *     source:   'EXTERNAL_PULSE_RIG',
 *     rig:      '<fixed non-empty rig identifier>',
 *     rawPulse: '<monotonic non-negative integer>'
 *   }
 *
 * Deliberately absent:
 *   - seconds
 *   - A8 seconds
 *   - Hz / frequency
 *   - timestamps
 *   - host time
 *   - clock phase
 *   - divider ratio
 *   - expected oscillator rate
 *   - hardware commands
 *   - serial / USB transport
 *   - A8Core writes
 *
 * Gate 6A defines only the observation contract. Transport comes later.
 */

const SAMPLE_SCHEMA = 'A8-EXTERNAL-PULSE-RIG-SAMPLE-V1';
const SAMPLE_SOURCE = 'EXTERNAL_PULSE_RIG';

function parseRawPulse(value) {
  const text = String(value ?? '');

  if (!/^(0|[1-9][0-9]*)$/.test(text)) {
    throw new Error('rawPulse must be a non-negative integer');
  }

  return BigInt(text);
}

function validateRigId(value) {
  if (typeof value !== 'string') {
    throw new Error('rig must be a string');
  }

  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(value)) {
    throw new Error(
      'rig must be 1-64 characters using A-Z a-z 0-9 . _ : -'
    );
  }

  return value;
}

class ExternalPulseRigObserver {
  constructor() {
    this.rig = null;
    this.firstRawPulse = null;
    this.lastRawPulse = null;
    this.lastDeltaRawPulse = null;
    this.sampleCount = 0;
  }

  observe(sample) {
    if (!sample || typeof sample !== 'object' || Array.isArray(sample)) {
      throw new Error('sample must be an object');
    }

    const allowed = new Set([
      'schema',
      'source',
      'rig',
      'rawPulse',
    ]);

    for (const key of Object.keys(sample)) {
      if (!allowed.has(key)) {
        throw new Error(`unsupported sample field: ${key}`);
      }
    }

    if (sample.schema !== SAMPLE_SCHEMA) {
      throw new Error(`schema must be ${SAMPLE_SCHEMA}`);
    }

    if (sample.source !== SAMPLE_SOURCE) {
      throw new Error(`source must be ${SAMPLE_SOURCE}`);
    }

    const rig = validateRigId(sample.rig);
    const rawPulse = parseRawPulse(sample.rawPulse);

    if (this.rig === null) {
      this.rig = rig;
    } else if (rig !== this.rig) {
      throw new Error(
        `observer is bound to rig ${this.rig}; received ${rig}`
      );
    }

    if (this.lastRawPulse !== null && rawPulse <= this.lastRawPulse) {
      throw new Error(
        'rawPulse must increase strictly for each accepted pulse-rig event'
      );
    }

    if (this.firstRawPulse === null) {
      this.firstRawPulse = rawPulse;
      this.lastDeltaRawPulse = null;
    } else {
      this.lastDeltaRawPulse = rawPulse - this.lastRawPulse;
    }

    this.lastRawPulse = rawPulse;
    this.sampleCount += 1;

    return this.snapshot();
  }

  snapshot() {
    const totalAdvance =
      this.firstRawPulse === null || this.lastRawPulse === null
        ? null
        : this.lastRawPulse - this.firstRawPulse;

    return {
      schema: 'A8-EXTERNAL-PULSE-RIG-OBSERVER-V1',
      role: 'EXTERNAL_RAW_PULSE_WITNESS',
      mode: 'READ_ONLY_OBSERVATION_CONTRACT',

      source: SAMPLE_SOURCE,
      rig: this.rig,

      sampleCount: this.sampleCount,

      firstRawPulse:
        this.firstRawPulse === null
          ? null
          : this.firstRawPulse.toString(),

      lastRawPulse:
        this.lastRawPulse === null
          ? null
          : this.lastRawPulse.toString(),

      lastDeltaRawPulse:
        this.lastDeltaRawPulse === null
          ? null
          : this.lastDeltaRawPulse.toString(),

      totalObservedRawPulseAdvance:
        totalAdvance === null
          ? null
          : totalAdvance.toString(),

      writesA8Core: false,
      writesClock: false,
      writesOscillator: false,
      writesDivider: false,
      writesAuthority: false,

      commandsHardware: false,
      usesSerialTransport: false,
      usesNetworkTransport: false,

      usesHostTime: false,
      usesLegacyTime: false,
      usesFrequencyHz: false,
      usesExpectedOscillatorRate: false,
      acceptsClockPhase: false,
      acceptsDividerRatio: false,
    };
  }
}

module.exports = {
  SAMPLE_SCHEMA,
  SAMPLE_SOURCE,
  parseRawPulse,
  validateRigId,
  ExternalPulseRigObserver,
};
