'use strict';

const fs = require('fs');
const path = require('path');

const LEDGER_SCHEMA =
  'A8-PHYSICAL-EARTH-EVIDENCE-LEDGER-V1';

const RECORD_SCHEMA =
  'A8-PHYSICAL-EARTH-OBSERVATION-V1';

function integerText(value, label) {
  const text = String(value ?? '');

  if (!/^(0|[1-9][0-9]*)$/.test(text)) {
    throw new Error(`${label} must be a non-negative integer`);
  }

  return text;
}

function safeEpoch(value, label) {
  const text = integerText(value, label);
  const n = Number(text);

  if (!Number.isSafeInteger(n) || n < 1) {
    throw new Error(`${label} must be a positive safe integer`);
  }

  return {
    number: n,
    text,
  };
}

function exactAllowedKeys(value, allowed, label) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    throw new Error(`${label} must be an object`);
  }

  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new Error(
        `unsupported ${label} field: ${key}`
      );
    }
  }
}

class PhysicalEarthEvidenceLedger {
  constructor({
    directory,
    expectedSourceEpoch,
  } = {}) {
    if (!directory) {
      throw new Error(
        'physical Earth evidence directory required'
      );
    }

    this.directory = directory;

    this.expectedEpoch =
      safeEpoch(
        expectedSourceEpoch,
        'expected physical SOURCE_EPOCH'
      );

    this.file =
      path.join(
        this.directory,
        `epoch-${this.expectedEpoch.text}.jsonl`
      );

    this.currentSample = null;
    this.recordCount = 0;
    this.lastRecord = null;

    fs.mkdirSync(
      this.directory,
      {
        recursive: true,
        mode: 0o750,
      }
    );

    this._loadExisting();
  }

  _loadExisting() {
    if (!fs.existsSync(this.file)) {
      return;
    }

    const text =
      fs.readFileSync(
        this.file,
        'utf8'
      );

    const lines =
      text
        .split('\n')
        .filter(Boolean);

    for (const line of lines) {
      const record =
        JSON.parse(line);

      if (
        record.schema !== RECORD_SCHEMA
      ) {
        throw new Error(
          'physical Earth evidence record schema mismatch'
        );
      }

      if (
        String(
          record.physicalSourceEpoch
        ) !==
        this.expectedEpoch.text
      ) {
        throw new Error(
          'physical Earth evidence epoch mismatch'
        );
      }

      this.recordCount += 1;
      this.lastRecord = record;
    }
  }

  notePhysicalSample(sample) {
    if (
      !sample ||
      typeof sample !== 'object' ||
      Array.isArray(sample)
    ) {
      throw new Error(
        'physical sample must be an object'
      );
    }

    const epoch =
      safeEpoch(
        sample.SOURCE_EPOCH,
        'physical SOURCE_EPOCH'
      );

    if (
      epoch.text !==
      this.expectedEpoch.text
    ) {
      throw new Error(
        'physical evidence SOURCE_EPOCH changed'
      );
    }

    if (sample.STATUS !== 'ACTIVE') {
      throw new Error(
        'physical evidence source is not ACTIVE'
      );
    }

    const rawCount =
      integerText(
        sample.RAW_COUNT,
        'physical RAW_COUNT'
      );

    const reportSequence =
      sample.REPORT_SEQUENCE === null ||
      sample.REPORT_SEQUENCE === undefined
        ? null
        : integerText(
            sample.REPORT_SEQUENCE,
            'physical REPORT_SEQUENCE'
          );

    if (
      this.currentSample &&
      BigInt(rawCount) <
        BigInt(
          this.currentSample.rawCount
        )
    ) {
      throw new Error(
        'physical evidence RAW_COUNT regressed inside one SOURCE_EPOCH'
      );
    }

    this.currentSample = {
      sourceEpoch:
        epoch.text,

      rawCount,

      reportSequence,

      status:
        'ACTIVE',

      rawAuthority:
        'ARDUINO_B_TIMER1_D5_PHYSICAL_COUNTER',

      coreMappedRawAuthority:
        false,

      hostTimeAuthority:
        false,
    };

    return this.snapshot();
  }

  requireCurrentSample() {
    if (!this.currentSample) {
      throw new Error(
        'physical Earth evidence waiting for Arduino-B sample'
      );
    }

    return {
      ...this.currentSample,
    };
  }

  _append(record) {
    const signature =
      JSON.stringify({
        eventType:
          record.eventType,
        witness:
          record.witness,
        angle512:
          record.angle512 ?? null,
        physicalSourceEpoch:
          record.physicalSourceEpoch,
        physicalRawCount:
          record.physicalRawCount,
      });

    const priorSignature =
      this.lastRecord
        ? JSON.stringify({
            eventType:
              this.lastRecord.eventType,
            witness:
              this.lastRecord.witness,
            angle512:
              this.lastRecord.angle512 ??
                null,
            physicalSourceEpoch:
              this.lastRecord
                .physicalSourceEpoch,
            physicalRawCount:
              this.lastRecord
                .physicalRawCount,
          })
        : null;

    if (
      priorSignature !== null &&
      signature === priorSignature
    ) {
      return {
        ...this.lastRecord,
        duplicateSuppressed:
          true,
      };
    }

    const fd =
      fs.openSync(
        this.file,
        'a',
        0o600
      );

    try {
      fs.writeSync(
        fd,
        JSON.stringify(record) + '\n',
        null,
        'utf8'
      );

      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }

    this.recordCount += 1;
    this.lastRecord = record;

    return {
      ...record,
      duplicateSuppressed:
        false,
    };
  }

  recordMintaka(observation) {
    exactAllowedKeys(
      observation,
      new Set([
        'type',
        'witness',
      ]),
      'Mintaka physical observation'
    );

    if (
      observation.type !==
      'STELLAR_MERIDIAN'
    ) {
      throw new Error(
        'Mintaka physical observation type must be STELLAR_MERIDIAN'
      );
    }

    if (
      observation.witness !==
      'MINTAKA'
    ) {
      throw new Error(
        'Mintaka physical witness must be MINTAKA'
      );
    }

    const sample =
      this.requireCurrentSample();

    return this._append({
      schema:
        RECORD_SCHEMA,

      evidenceDomain:
        'EXTERNAL_PHYSICAL',

      eventType:
        'STELLAR_MERIDIAN',

      witness:
        'MINTAKA',

      physicalSourceEpoch:
        sample.sourceEpoch,

      physicalRawCount:
        sample.rawCount,

      physicalReportSequence:
        sample.reportSequence,

      rawAuthority:
        sample.rawAuthority,

      coreMappedRawUsed:
        false,

      hostTimeUsed:
        false,

      utcUsed:
        false,

      legacySecondsUsed:
        false,
    });
  }

  recordSol(observation) {
    exactAllowedKeys(
      observation,
      new Set([
        'type',
        'witness',
        'angle512',
      ]),
      'Sol physical observation'
    );

    if (
      observation.type !==
      'SOL_CELESTIAL_DIRECTION'
    ) {
      throw new Error(
        'Sol physical observation type must be SOL_CELESTIAL_DIRECTION'
      );
    }

    if (
      observation.witness !==
      'SOL'
    ) {
      throw new Error(
        'Sol physical witness must be SOL'
      );
    }

    if (
      !Object.prototype
        .hasOwnProperty.call(
          observation,
          'angle512'
        )
    ) {
      throw new Error(
        'Sol physical observation requires exact angle512'
      );
    }

    const sample =
      this.requireCurrentSample();

    return this._append({
      schema:
        RECORD_SCHEMA,

      evidenceDomain:
        'EXTERNAL_PHYSICAL',

      eventType:
        'SOL_CELESTIAL_DIRECTION',

      witness:
        'SOL',

      angle512:
        observation.angle512,

      physicalSourceEpoch:
        sample.sourceEpoch,

      physicalRawCount:
        sample.rawCount,

      physicalReportSequence:
        sample.reportSequence,

      rawAuthority:
        sample.rawAuthority,

      coreMappedRawUsed:
        false,

      hostTimeUsed:
        false,

      utcUsed:
        false,

      legacySecondsUsed:
        false,
    });
  }

  snapshot() {
    return {
      schema:
        LEDGER_SCHEMA,

      status:
        this.currentSample
          ? 'PHYSICAL_EVIDENCE_READY'
          : 'WAITING_FOR_PHYSICAL_SAMPLE',

      expectedPhysicalSourceEpoch:
        this.expectedEpoch.text,

      rawAuthority:
        'ARDUINO_B_TIMER1_D5_PHYSICAL_COUNTER',

      mappedCoreRawDefinesEvidence:
        false,

      hostTimeDefinesEvidence:
        false,

      currentPhysicalSample:
        this.currentSample
          ? {
              ...this.currentSample,
            }
          : null,

      journalPath:
        this.file,

      recordCount:
        this.recordCount,

      lastRecord:
        this.lastRecord,
    };
  }
}

module.exports = {
  LEDGER_SCHEMA,
  RECORD_SCHEMA,
  PhysicalEarthEvidenceLedger,
};
