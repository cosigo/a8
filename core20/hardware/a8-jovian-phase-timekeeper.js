'use strict';

/*
 * AUSPICIOUS 8 · POST-SEAL HARDWARE BRANCH
 * GATE 6H · CONTINUOUS JOVIAN A8 PHASE TIMEKEEPER
 *
 * Inputs:
 *   Gate-6F qualified raw oscillator state
 *   Gate-6G qualified recovered Jovian raw ruler
 *
 * Output:
 *   continuous elapsed native A8 PHASE9 from raw-pulse progress only
 *
 * IMPORTANT:
 *   This is NOT DAY_PHASE17.
 *   No Earth-day divisor is invented here.
 *
 * Lock rule:
 *   once a source epoch qualifies a Jovian raw ruler, Gate 6H locks that
 *   exact rational ruler for the epoch. Later contradictory recovery evidence
 *   does not silently retune or jump phase.
 *
 * Source-epoch rule:
 *   a VIRTUAL <-> REAL source change re-arms the timekeeper.
 *
 * Authority exclusions:
 *   no Date/performance/hrtime
 *   no setTimeout/setInterval
 *   no seconds/Hz
 *   no UTC/NTP/GPS
 *   no browser time
 *   no A8Core clock/phase write
 */

const TIMEKEEPER_SCHEMA =
  'A8-JOVIAN-PHASE-TIMEKEEPER-V1';

const BRIDGE_SCHEMA =
  'A8-CORE20-RECOVERY-INPUT-BRIDGE-V1';

const JOVIAN_SCHEMA =
  'A8-CORE20-JOVIAN-RECOVERY-WRAPPER-V1';

function gcdBigInt(a, b) {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;

  while (b !== 0n) {
    const t = a % b;
    a = b;
    b = t;
  }

  return a;
}

function parseFraction(text, label) {
  const s = String(text ?? '');

  let n;
  let d;

  if (/^(0|[1-9][0-9]*)$/.test(s)) {
    n = BigInt(s);
    d = 1n;
  } else {
    const m =
      s.match(
        /^([1-9][0-9]*)\/([1-9][0-9]*)$/
      );

    if (!m) {
      throw new Error(
        `${label} must be a positive exact integer or fraction`
      );
    }

    n = BigInt(m[1]);
    d = BigInt(m[2]);
  }

  if (n <= 0n || d <= 0n) {
    throw new Error(
      `${label} must be positive`
    );
  }

  const g =
    gcdBigInt(n, d);

  return {
    n: n / g,
    d: d / g,
  };
}

function fractionText(f) {
  return f.d === 1n
    ? f.n.toString()
    : `${f.n.toString()}/${f.d.toString()}`;
}

function fractionEqual(a, b) {
  return (
    a.n * b.d ===
    b.n * a.d
  );
}

function parseRawPulse(text) {
  const s =
    String(text ?? '');

  if (!/^(0|[1-9][0-9]*)$/.test(s)) {
    throw new Error(
      'rawPulse must be a non-negative integer'
    );
  }

  return BigInt(s);
}

class JovianPhaseTimekeeper {
  constructor() {
    this.sourceEpoch = null;
    this.mode = null;
    this.rig = null;

    this.lockedRuler = null;
    this.lockRawPulse = null;
    this.lastRawPulse = null;

    this.rearmCount = 0;
    this.lockCount = 0;

    this.rulerMismatch = false;
    this.observedContradictoryRuler = null;

    this.status =
      'WAITING_FOR_SOURCE_EPOCH';
  }

  rearmForEpoch(
    sourceEpoch,
    mode,
    rig
  ) {
    if (
      this.sourceEpoch !== null
    ) {
      this.rearmCount += 1;
    }

    this.sourceEpoch =
      sourceEpoch;

    this.mode =
      mode;

    this.rig =
      rig;

    this.lockedRuler = null;
    this.lockRawPulse = null;
    this.lastRawPulse = null;

    this.rulerMismatch = false;
    this.observedContradictoryRuler = null;

    this.status =
      'WAITING_FOR_JOVIAN_QUALIFICATION';
  }

  forgetLock() {
    if (
      this.sourceEpoch !== null
    ) {
      this.rearmCount += 1;
    }

    this.lockedRuler = null;
    this.lockRawPulse = null;
    this.lastRawPulse = null;

    this.rulerMismatch = false;
    this.observedContradictoryRuler = null;

    this.status =
      this.sourceEpoch === null
        ? 'WAITING_FOR_SOURCE_EPOCH'
        : 'WAITING_FOR_JOVIAN_QUALIFICATION';

    return this.snapshot();
  }

  sync(
    bridgeSnapshot,
    jovianSnapshot
  ) {
    if (
      !bridgeSnapshot ||
      bridgeSnapshot.schema !==
        BRIDGE_SCHEMA
    ) {
      throw new Error(
        `Gate-6F bridge snapshot schema must be ${BRIDGE_SCHEMA}`
      );
    }

    if (
      !jovianSnapshot ||
      jovianSnapshot.schema !==
        JOVIAN_SCHEMA
    ) {
      throw new Error(
        `Gate-6G Jovian snapshot schema must be ${JOVIAN_SCHEMA}`
      );
    }

    const epoch =
      bridgeSnapshot.sourceEpoch;

    if (
      epoch === null ||
      epoch === undefined
    ) {
      this.status =
        'WAITING_FOR_SOURCE_EPOCH';

      return this.snapshot();
    }

    if (
      !Number.isSafeInteger(epoch) ||
      epoch < 1
    ) {
      throw new Error(
        'sourceEpoch must be a positive safe integer'
      );
    }

    if (
      this.sourceEpoch !== epoch
    ) {
      this.rearmForEpoch(
        epoch,
        bridgeSnapshot.mode,
        bridgeSnapshot.rig
      );
    }

    if (
      jovianSnapshot.sourceEpoch !==
      epoch
    ) {
      throw new Error(
        'Gate-6F and Gate-6G sourceEpoch disagree'
      );
    }

    const rawText =
      bridgeSnapshot.lastRawPulse;

    if (rawText === null) {
      this.lastRawPulse = null;

      if (
        this.lockedRuler === null
      ) {
        this.status =
          'WAITING_FOR_RAW_BASELINE';
      }

      return this.snapshot();
    }

    const raw =
      parseRawPulse(
        rawText
      );

    if (
      this.lastRawPulse !== null &&
      raw < this.lastRawPulse
    ) {
      throw new Error(
        'rawPulse moved backward inside one source epoch'
      );
    }

    this.lastRawPulse =
      raw;

    const qualified =
      jovianSnapshot.comparator &&
      jovianSnapshot.comparator.qualified ===
        true &&
      jovianSnapshot.recoveredJovianRawRuler !==
        null;

    if (
      this.lockedRuler === null
    ) {
      if (!qualified) {
        this.status =
          'WAITING_FOR_JOVIAN_QUALIFICATION';

        return this.snapshot();
      }

      const ruler =
        parseFraction(
          jovianSnapshot.recoveredJovianRawRuler,
          'recovered Jovian raw ruler'
        );

      this.lockedRuler =
        ruler;

      this.lockRawPulse =
        raw;

      this.lockCount += 1;

      this.status =
        'JOVIAN_PHASE_LOCKED';

      return this.snapshot();
    }

    if (qualified) {
      const observed =
        parseFraction(
          jovianSnapshot.recoveredJovianRawRuler,
          'recovered Jovian raw ruler'
        );

      if (
        !fractionEqual(
          observed,
          this.lockedRuler
        )
      ) {
        this.rulerMismatch = true;
        this.observedContradictoryRuler =
          observed;

        this.status =
          'LOCKED_RULER_MISMATCH_HELD';

        return this.snapshot();
      }
    }

    this.status =
      this.rulerMismatch
        ? 'LOCKED_RULER_MISMATCH_HELD'
        : 'JOVIAN_PHASE_RUNNING';

    return this.snapshot();
  }

  phaseState() {
    if (
      this.lockedRuler === null ||
      this.lockRawPulse === null ||
      this.lastRawPulse === null
    ) {
      return null;
    }

    if (
      this.lastRawPulse <
      this.lockRawPulse
    ) {
      throw new Error(
        'lastRawPulse precedes lockRawPulse'
      );
    }

    const elapsedRaw =
      this.lastRawPulse -
      this.lockRawPulse;

    /*
     * lockedRuler = n/d raw pulses per full 512-state Jovian recurrence.
     *
     * total A8 phase states:
     *   elapsedRaw * 512 / (n/d)
     * = elapsedRaw * 512 * d / n
     */
    const totalPhaseNumerator =
      elapsedRaw *
      512n *
      this.lockedRuler.d;

    const phaseDenominator =
      this.lockedRuler.n;

    const wholePhaseStates =
      totalPhaseNumerator /
      phaseDenominator;

    const subphaseNumerator =
      totalPhaseNumerator %
      phaseDenominator;

    const completedRecurrences =
      wholePhaseStates /
      512n;

    const phase9 =
      wholePhaseStates %
      512n;

    const exactPhaseGcd =
      gcdBigInt(
        totalPhaseNumerator,
        phaseDenominator
      );

    const exactPhase =
      {
        n:
          totalPhaseNumerator /
          exactPhaseGcd,
        d:
          phaseDenominator /
          exactPhaseGcd,
      };

    const subphaseGcd =
      subphaseNumerator === 0n
        ? 1n
        : gcdBigInt(
            subphaseNumerator,
            phaseDenominator
          );

    return {
      elapsedRaw:
        elapsedRaw.toString(),

      exactTotalPhase:
        exactPhase.d === 1n
          ? exactPhase.n.toString()
          : `${exactPhase.n.toString()}/${exactPhase.d.toString()}`,

      wholePhaseStates:
        wholePhaseStates.toString(),

      subphase:
        subphaseNumerator === 0n
          ? '0'
          : `${(subphaseNumerator / subphaseGcd).toString()}/${(phaseDenominator / subphaseGcd).toString()}`,

      completedRecurrences:
        completedRecurrences.toString(),

      phase9:
        Number(phase9),

      phase9Octal:
        phase9
          .toString(8)
          .padStart(3, '0') +
        '₈',

      recurrenceOctal:
        completedRecurrences
          .toString(8) +
        '₈',
    };
  }

  snapshot() {
    const phase =
      this.phaseState();

    return {
      schema:
        TIMEKEEPER_SCHEMA,

      role:
        'CONTINUOUS_JOVIAN_A8_PHASE_FROM_RECOVERED_RAW_RULER',

      status:
        this.status,

      sourceEpoch:
        this.sourceEpoch,

      mode:
        this.mode,

      rig:
        this.rig,

      lockedRulerRawPer512:
        this.lockedRuler === null
          ? null
          : fractionText(
              this.lockedRuler
            ),

      lockRawPulse:
        this.lockRawPulse === null
          ? null
          : this.lockRawPulse.toString(),

      lastRawPulse:
        this.lastRawPulse === null
          ? null
          : this.lastRawPulse.toString(),

      phase,

      rearmCount:
        this.rearmCount,

      lockCount:
        this.lockCount,

      rulerMismatch:
        this.rulerMismatch,

      observedContradictoryRuler:
        this.observedContradictoryRuler ===
          null
          ? null
          : fractionText(
              this.observedContradictoryRuler
            ),

      lockPolicy:
        'LOCK_RECOVERED_RULER_FOR_SOURCE_EPOCH_NO_SILENT_RETUNE',

      sourceEpochChangeForcesRearm:
        true,

      dayPhase17Driven:
        false,

      dayPhase17Status:
        'WAITING_FOR_RECOVERED_EARTH_DAY_SCALE',

      phase20Driven:
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

      usesUTC:
        false,

      usesNTP:
        false,

      usesGPS:
        false,
    };
  }
}

module.exports = {
  TIMEKEEPER_SCHEMA,
  BRIDGE_SCHEMA,
  JOVIAN_SCHEMA,
  gcdBigInt,
  parseFraction,
  fractionText,
  fractionEqual,
  parseRawPulse,
  JovianPhaseTimekeeper,
};
