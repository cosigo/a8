/* A8 Time Lab v5.4.18 — Unified authoritative core
 *
 * Porting rule:
 * - WEST/EAST detection, raw BigInt pulse accumulation, initial WEST→WEST lock,
 *   AUTO clean-span recalibration, and 1:2:4 normalization preserve v0.6.20 behavior.
 * - Browser/UI timing does not define or own any core state.
 * - Node's scheduler only controls simulation execution pace.
 */

'use strict';

const TICK_DEN = 512n;
const PLANT_G_STEPS = 4096;
const DAY_STATES = 131072n; // 2^17
const DAY_NS = 86400n * 1000000000n;
const A8_TOL = 1 / 512;

const MOONS = Object.freeze({
  // Full-qualification windows deliberately equalize physical observation baseline:
  // 8 Io recurrences ≈ 4 Europa recurrences ≈ 2 Ganymede recurrences.
  // One clean recurrence remains enough for EARLY recovery/use.
  io: { id: 'io', name: 'Io',       plantPeriod: PLANT_G_STEPS / 4, offset: 0.00, ratio: 4, qualificationSpans: 8 },
  eu: { id: 'eu', name: 'Europa',   plantPeriod: PLANT_G_STEPS / 2, offset: 0.25, ratio: 2, qualificationSpans: 4 },
  ga: { id: 'ga', name: 'Ganymede', plantPeriod: PLANT_G_STEPS,     offset: 0.00, ratio: 1, qualificationSpans: 2 },
  ca: { id: 'ca', name: 'Callisto', plantPeriod: (PLANT_G_STEPS / 4) * (28 / 3), offset: 0.12, ratio: 3/7, qualificationSpans: null },
});

function wrap01(x) {
  x %= 1;
  return x < 0 ? x + 1 : x;
}
function signedCycleError(x) {
  x = wrap01(x);
  return x > 0.5 ? x - 1 : x;
}
function phaseAddr(ph) {
  if (ph === null || ph === undefined || !Number.isFinite(ph)) return '---';
  const n = Math.floor(wrap01(ph) * 512) & 511;
  return n.toString(8).padStart(3, '0') + '₈';
}
function median(values) {
  if (!values.length) return null;
  const a = [...values].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
function cloneSerializable(v) {
  return JSON.parse(JSON.stringify(v));
}

class RecoveryChannel {
  constructor(def) {
    this.def = def;
    this.reset();
  }

  reset() {
    this.history = [];
    this.observedCounts = { W: 0, E: 0 };
    this.westCycleCount = 0;
    this.lockedSpan = null;
    this.lockAnchorTick = null;
    this.lockAnchorCycle = 0;
    this.lastWestTick = null;
    this.lastObservedSpan = null;
    this.lastPhaseError = null;
    this.recalibrationMode = 'AUTO';
    this.manualArmed = false;
    this.calibrationActive = true;
    this.calibrationSource = 'AUTO';
    this.calibrationMessage = `AUTO · WAITING FOR FIRST WEST · 0/${this.def.qualificationSpans} SPANS`;
    this.driftWasChangedAfterLock = false;
    this.calibrationEpoch = null;

    // Equal-duration-baseline qualification evidence for the CURRENT oscillator epoch.
    // The window contains WEST timestamps; N+1 WEST captures provide N complete
    // WEST→WEST recurrence spans. It becomes a rolling N-span window once full.
    this.evidenceEpoch = null;
    this.evidenceWestTicks = [];
    this.qualificationSpanCount = 0;
    this.qualificationTargetSpans = this.def.qualificationSpans;
    this.qualificationComplete = false;
    this.qualificationEpoch = null;
    this.qualificationWindowRaw = null;
  }

  forgetRecovery() {
    this.reset();
  }

  clearCurrentEvidence() {
    this.evidenceEpoch = null;
    this.evidenceWestTicks = [];
    this.qualificationSpanCount = 0;
    this.qualificationComplete = false;
    this.qualificationEpoch = null;
    this.qualificationWindowRaw = null;
  }

  setRecalibrationMode(mode, observationBlocked) {
    const next = String(mode || '').toUpperCase();
    if (!['AUTO','MANUAL'].includes(next)) throw new Error('recalibration mode must be AUTO or MANUAL');
    const previous = this.recalibrationMode;
    this.recalibrationMode = next;
    this.manualArmed = false;

    if (next === 'AUTO') {
      // Never let AUTO form a WEST→WEST span across time intentionally frozen
      // in MANUAL. Start a fresh observational evidence window on transition.
      if (previous !== 'AUTO') {
        this.lastWestTick = null;
        this.lastObservedSpan = null;
        this.clearCurrentEvidence();
      }
      this.calibrationSource = 'AUTO';
      this.calibrationActive = !observationBlocked;
      if (observationBlocked) this.calibrationMessage = 'AUTO · SENSOR BLOCKED';
      else this.calibrationMessage = `AUTO · WAITING FOR FRESH WEST · 0/${this.qualificationTargetSpans} SPANS`;
      return;
    }

    this.calibrationSource = 'MANUAL';
    // Preserve automatic bootstrap if the channel has never recovered at all.
    if (this.lockedSpan === null) {
      this.calibrationActive = !observationBlocked;
      this.calibrationMessage = observationBlocked
        ? 'MANUAL · BOOTSTRAP SENSOR BLOCKED'
        : `MANUAL · BOOTSTRAP · WAITING FOR FIRST WEST · 0/${this.qualificationTargetSpans} SPANS`;
    } else {
      this.calibrationActive = false;
      this.calibrationMessage = 'MANUAL · FROZEN · ARM FOR FRESH WEST→WEST';
    }
  }

  armManualCalibration(observationBlocked, oscillatorEpoch) {
    this.recalibrationMode = 'MANUAL';
    this.manualArmed = true;
    this.calibrationSource = 'MANUAL';
    this.lastWestTick = null;
    this.lastObservedSpan = null;
    this.clearCurrentEvidence();
    this.calibrationActive = !observationBlocked;
    this.calibrationMessage = observationBlocked
      ? 'MANUAL · ARMED · SENSOR BLOCKED'
      : `MANUAL · ARMED · WAITING FOR FIRST WEST · E${oscillatorEpoch}`;
  }

  oscillatorChanged(observationBlocked, newEpoch) {
    if (this.lockedSpan === null) {
      this.clearCurrentEvidence();
      this.calibrationActive = !observationBlocked;
      const prefix = this.recalibrationMode === 'MANUAL' ? 'MANUAL · BOOTSTRAP' : 'AUTO';
      this.calibrationMessage = observationBlocked
        ? `${prefix} · SENSOR BLOCKED`
        : `${prefix} · OSCILLATOR CHANGED · WAITING FOR FIRST WEST · 0/${this.qualificationTargetSpans} SPANS`;
      return;
    }

    this.driftWasChangedAfterLock = true;
    // Retain the old lockedSpan/calibrationEpoch for holdover, but destroy any
    // partially collected new-window evidence so no span can straddle an
    // oscillator adjustment.
    this.requiredEpoch = newEpoch;
    this.lastWestTick = null;
    this.lastObservedSpan = null;
    this.clearCurrentEvidence();
    if (this.recalibrationMode === 'MANUAL') {
      this.calibrationSource = 'MANUAL';
      this.calibrationActive = this.manualArmed && !observationBlocked;
      this.calibrationMessage = observationBlocked
        ? 'MANUAL · SENSOR BLOCKED'
        : (this.manualArmed ? 'MANUAL · OSCILLATOR CHANGED · WAITING FOR FIRST WEST' : 'MANUAL · OSCILLATOR CHANGED · ARM FOR RECALIBRATION');
    } else {
      this.calibrationSource = 'AUTO';
      this.calibrationActive = !observationBlocked;
      this.calibrationMessage = observationBlocked
        ? 'AUTO · SENSOR BLOCKED'
        : `AUTO · OSCILLATOR CHANGED · WAITING FOR FIRST WEST · 0/${this.qualificationTargetSpans} SPANS`;
    }
  }

  observationRestored() {
    this.clearCurrentEvidence();
    if (this.recalibrationMode === 'MANUAL' && this.lockedSpan !== null && !this.manualArmed) {
      this.calibrationActive = false;
      this.calibrationSource = 'MANUAL';
      this.calibrationMessage = 'MANUAL · RESTORED · FROZEN · ARM FOR RECALIBRATION';
    } else {
      this.calibrationActive = true;
      this.calibrationSource = this.recalibrationMode === 'MANUAL' ? 'MANUAL' : 'AUTO';
      this.calibrationMessage =
        `${this.calibrationSource} · RESTORED · WAITING FOR FIRST WEST · 0/${this.qualificationTargetSpans} SPANS`;
    }
  }

  observationBlockedNow() {
    this.history.length = 0;
    this.clearCurrentEvidence();
    this.calibrationActive = false;
    this.calibrationMessage = `${this.recalibrationMode} · SENSOR BLOCKED`;
  }

  detect(observedX, rawTicks, observationBlocked, oscillatorEpoch) {
    if (observationBlocked) {
      this.history.length = 0;
      return;
    }

    this.history.push({ x: observedX, tick: rawTicks });
    if (this.history.length < 3) return;
    if (this.history.length > 3) this.history.shift();

    const [a, b, c] = this.history;
    const eps = 1e-10;
    if ((b.x - a.x) > eps && (b.x - c.x) > eps) this.recordTurn('E', b.tick, oscillatorEpoch);
    if ((a.x - b.x) > eps && (c.x - b.x) > eps) this.recordTurn('W', b.tick, oscillatorEpoch);
  }

  beginEvidenceWindow(tick, oscillatorEpoch) {
    this.evidenceEpoch = oscillatorEpoch;
    this.evidenceWestTicks = [tick];
    this.qualificationSpanCount = 0;
    this.qualificationComplete = false;
    this.qualificationEpoch = null;
    this.qualificationWindowRaw = null;
    this.calibrationActive = true;
    this.calibrationMessage =
      `${this.calibrationSource} · FIRST WEST CAPTURED · 0/${this.qualificationTargetSpans} SPANS`;
  }

  ingestEvidenceWest(tick, oscillatorEpoch, anchorCycle) {
    if (!this.calibrationActive) return;

    if (this.evidenceEpoch !== oscillatorEpoch || this.evidenceWestTicks.length === 0) {
      this.beginEvidenceWindow(tick, oscillatorEpoch);
      return;
    }

    const previous = this.evidenceWestTicks[this.evidenceWestTicks.length - 1];
    const oneSpan = Number(tick - previous);
    if (!(oneSpan > 0)) return;

    this.evidenceWestTicks.push(tick);

    // Once full, keep exactly N complete recurrences in a rolling window.
    const maxWestTicks = this.qualificationTargetSpans + 1;
    if (this.evidenceWestTicks.length > maxWestTicks) {
      this.evidenceWestTicks.shift();
    }

    this.qualificationSpanCount = this.evidenceWestTicks.length - 1;
    const first = this.evidenceWestTicks[0];
    const totalRaw = Number(tick - first);
    const averageSpan = totalRaw / this.qualificationSpanCount;

    const continuityCycle =
      (this.lockAnchorTick !== null && this.lockedSpan > 0)
        ? Math.round(
            this.lockAnchorCycle +
            Number(tick - this.lockAnchorTick) / this.lockedSpan
          )
        : anchorCycle;

    // EARLY RECOVERY: after the first clean recurrence this channel is current
    // and may be explicitly used as authority. As more spans arrive, lockedSpan
    // is refined by the equal-duration-baseline average.
    this.lockedSpan = averageSpan;
    this.lockAnchorTick = tick;
    this.lockAnchorCycle = continuityCycle;
    this.lastObservedSpan = oneSpan;
    this.lastPhaseError = 0;
    this.driftWasChangedAfterLock = false;
    this.calibrationEpoch = oscillatorEpoch;

    this.qualificationWindowRaw = totalRaw;
    this.qualificationComplete =
      this.qualificationSpanCount >= this.qualificationTargetSpans;
    this.qualificationEpoch =
      this.qualificationComplete ? oscillatorEpoch : null;

    if (this.recalibrationMode === 'MANUAL') {
      const wasArmed = this.manualArmed;
      this.manualArmed = false;
      this.calibrationActive = false;
      this.calibrationMessage = wasArmed
        ? `MANUAL · CALIBRATED · FRESH WEST→WEST ${oneSpan.toFixed(2)} · FROZEN`
        : `MANUAL · INITIAL LOCK · ${oneSpan.toFixed(2)} · FROZEN · ARM FOR RECALIBRATION`;
    } else if (this.qualificationComplete) {
      this.calibrationMessage =
        `AUTO · FULL EQUAL-DURATION BASELINE · ${this.qualificationSpanCount}/${this.qualificationTargetSpans} SPANS · AVG ${averageSpan.toFixed(2)}`;
    } else {
      this.calibrationMessage =
        `AUTO · EARLY RECOVERED · ${this.qualificationSpanCount}/${this.qualificationTargetSpans} SPANS · AVG ${averageSpan.toFixed(2)}`;
    }
  }

  recordTurn(kind, tick, oscillatorEpoch) {
    this.observedCounts[kind]++;

    if (kind !== 'W') return;

    const anchorCycle = this.westCycleCount;
    this.westCycleCount++;

    if (this.lastWestTick !== null) {
      this.lastObservedSpan = Number(tick - this.lastWestTick);
    }

    // Maintain phase-error evidence against the previous accepted ruler before
    // the current WEST is used to refine that ruler.
    if (this.lockedSpan !== null && this.lockAnchorTick !== null) {
      this.lastPhaseError = signedCycleError(
        Number(tick - this.lockAnchorTick) / this.lockedSpan
      );
    }

    this.ingestEvidenceWest(tick, oscillatorEpoch, anchorCycle);
    this.lastWestTick = tick;
  }

  recoveredPhase(rawTicks) {
    if (this.lockedSpan === null || this.lockAnchorTick === null || this.lockedSpan <= 0) {
      return null;
    }
    return wrap01(Number(rawTicks - this.lockAnchorTick) / this.lockedSpan);
  }

  snapshot(rawTicks) {
    const ph = this.recoveredPhase(rawTicks);
    return {
      id: this.def.id,
      name: this.def.name,
      ratio: this.def.ratio,
      recovery: this.lockedSpan === null ? 'SEEKING' : 'LOCKED',
      locked: this.lockedSpan !== null,
      lockedSpan: this.lockedSpan,
      normalizedSpan: this.lockedSpan === null ? null : this.lockedSpan * this.def.ratio,
      phase: ph,
      phaseOctal: phaseAddr(ph),
      observed: { ...this.observedCounts },
      lastObservedSpan: this.lastObservedSpan,
      lastPhaseError: this.lastPhaseError,
      calibrationMessage: this.calibrationMessage,
      recalibrationMode: this.recalibrationMode,
      manualArmed: this.manualArmed,
      driftWasChangedAfterLock: this.driftWasChangedAfterLock,
      calibrationEpoch: this.calibrationEpoch,
      qualification: {
        spanCount: this.qualificationSpanCount,
        targetSpans: this.qualificationTargetSpans,
        complete: this.qualificationComplete,
        epoch: this.qualificationEpoch,
        windowRaw: this.qualificationWindowRaw,
        westCaptures: this.evidenceWestTicks.length,
      },
    };
  }
}

class A8Core {
  constructor(opts = {}) {
    this.schedulerHz = opts.schedulerHz || 50;
    this.running = false;
    this.benchSteps = opts.benchSteps || 8;

    this.naturalStep = 0;
    this.rawTicks = 0n;
    this.rawTickRemainder = 0n;
    this.oscillator = BigInt(opts.oscillator || 73);
    this.drift = BigInt(opts.drift || 0);

    this.observationBlocked = false;
    this.oscillatorEpoch = 0;

    // Generalized v0.6.20 fault-injection mechanism. Default all nominal.
    this.rateFactor = { io: 1, eu: 1, ga: 1, ca: 1 };
    this.phaseContinuity = { io: 0, eu: 0, ga: 0, ca: 0 };
    this.faultCommandPct = { io: 0, eu: 0, ga: 0 };
    this.callistoDetunePct = 0;
    this.recalibrationMode = 'AUTO';

    this.channels = {
      io: new RecoveryChannel(MOONS.io),
      eu: new RecoveryChannel(MOONS.eu),
      ga: new RecoveryChannel(MOONS.ga),
    };

    this.selectedAuthority = opts.selectedAuthority || 'ga';

    // Comparator/qualifier state.
    this.comparator = null;
    this.lastQualified = null;

    // Frozen same-oscillator-epoch three-channel consensus reference.
    // It is established only after all three CURRENT channels agree.
    // It is never moved merely because two channels later agree with each other.
    this.epochReference = null;
    this.epochReferenceEpoch = null;

    // Provisional Earth-day divider bridge.
    this.earthDayRawSpan = BigInt(opts.earthDayRawSpan || 131072);
    this.dividerRemainder = 0n;
    this.dividerTotalTicks = 0n;
    this.dayPhase17 = 0n;
    this.dayCount = 0n;

    // Clock presentation pace is deliberately decoupled from the accelerated
    // Jovian simulation. In v5.3 the raw divider still counts accelerated lab
    // output, but the visible 17-bit clock advances at one conventional Earth-day
    // pace solely as a development/demo pacer. This is not the native definition.
    this.clockPaceMode = 'REALTIME_DEMO';
    this.clockPaceNumerator = 0n;

    // Diagnostic flight recorder. Uses only internal sequence/raw/plant state.
    // No conventional timestamp is needed for causal reconstruction.
    this.eventLog = [];
    this.eventSeq = 0;
    this.lastStateSignature = null;
    this.lastAlign = null;

    // Observation source ownership.
    this.sourceMode = 'SIMULATED_PLANT';
    this.replayRecordCount = 0;
    this.lastReplayRecord = null;

    this.updateComparatorAndQualifier();
    this.recordEvent('BOOT', 'CORE INITIALIZED');

  }

  recordEvent(type, message, details = {}) {
    if (!this.eventLog) return;
    const event = {
      seq: ++this.eventSeq,
      type,
      message,
      rawCount: this.rawTicks.toString(),
      naturalStep: this.naturalStep,
      oscillatorEpoch: this.oscillatorEpoch,
      dayPhase17: this.dayPhase17.toString(),
      authority: this.selectedAuthority,
      details: cloneSerializable(details),
    };
    this.eventLog.push(event);
    if (this.eventLog.length > 512) this.eventLog.splice(0, this.eventLog.length - 512);
  }

  clearEventLog() {
    this.eventLog = [];
    this.eventSeq = 0;
    this.lastStateSignature = null;
    this.recordEvent('RECORDER', 'FLIGHT RECORDER CLEARED');
  }

  setClockPhase(value, source = 'MANUAL') {
    const v = BigInt(value);
    if (v < 0n || v >= DAY_STATES) throw new Error('clock phase must be 0..131071');
    const before = this.dayPhase17;
    this.dayPhase17 = v;
    this.clockPaceNumerator = 0n;
    this.recordEvent('CLOCK', `DAY_PHASE17 ${before.toString()} → ${v.toString()}`, { source });
  }

  adjustClockTicks(delta) {
    const d = BigInt(delta);
    let v = (this.dayPhase17 + d) % DAY_STATES;
    if (v < 0n) v += DAY_STATES;
    this.setClockPhase(v, `ADJUST ${d.toString()} TICKS`);
  }

  resetClockTime() {
    this.setClockPhase(0n, 'RESET CLOCK TIME');
  }

  resetClockDayCount() {
    const before = this.dayCount;
    this.dayCount = 0n;
    this.recordEvent('CLOCK', `DAY_COUNT ${before.toString()} → 0`, { source: 'RESET DAY COUNT' });
  }

  alignClockToUtcMilliseconds(utcMillisecondsSinceMidnight, source = 'SERVER UTC BRIDGE · EXTERNAL CONVENTIONAL REFERENCE · NON-DEFINING') {
    const ms = Number(utcMillisecondsSinceMidnight);
    if (!Number.isFinite(ms) || ms < 0 || ms >= 86400000) {
      throw new Error('UTC milliseconds since midnight must be 0..86399999.999');
    }
    const wholeMicro = BigInt(Math.floor(ms * 1000));
    const DAY_US = 86400000n * 1000n;
    const phase = (wholeMicro * DAY_STATES) / DAY_US;
    const before = this.dayPhase17;
    this.dayPhase17 = phase;
    this.clockPaceNumerator = 0n;
    this.lastAlign = {
      source,
      phase17: phase.toString(),
      utcMillisecondsSinceMidnight: ms,
      eventSeq: this.eventSeq + 1,
    };
    this.recordEvent(
      'ALIGN',
      `ONE-SHOT ALIGN · SERVER UTC BRIDGE · DAY_PHASE17 ${before.toString()} → ${phase.toString()}`,
      {
        source,
        utcMillisecondsSinceMidnight: ms,
        definingPathTouched: false,
      }
    );
    return phase;
  }

  reset() {
    this.running = false;
    this.naturalStep = 0;
    this.rawTicks = 0n;
    this.rawTickRemainder = 0n;
    this.oscillator = 73n;
    this.drift = 0n;
    this.benchSteps = 8;
    this.observationBlocked = false;
    this.oscillatorEpoch = 0;
    this.rateFactor = { io: 1, eu: 1, ga: 1, ca: 1 };
    this.phaseContinuity = { io: 0, eu: 0, ga: 0, ca: 0 };
    this.faultCommandPct = { io: 0, eu: 0, ga: 0 };
    this.callistoDetunePct = 0;
    this.recalibrationMode = 'AUTO';
    for (const ch of Object.values(this.channels)) ch.reset();
    this.selectedAuthority = 'ga';
    this.lastQualified = null;
    this.epochReference = null;
    this.epochReferenceEpoch = null;
    this.earthDayRawSpan = 131072n;
    this.dividerRemainder = 0n;
    this.dividerTotalTicks = 0n;
    this.dayPhase17 = 0n;
    this.dayCount = 0n;
    this.clockPaceMode = 'REALTIME_DEMO';
    this.clockPaceNumerator = 0n;
    this.lastAlign = null;
    this.sourceMode = 'SIMULATED_PLANT';
    this.replayRecordCount = 0;
    this.lastReplayRecord = null;
    this.updateComparatorAndQualifier();
    this.recordEvent('CONTROL', 'RESET ENTIRE LAB');
  }

  forgetRecovery() {
    for (const ch of Object.values(this.channels)) ch.forgetRecovery();
    this.lastQualified = null;
    this.updateComparatorAndQualifier();
  }

  setRecalibrationMode(mode) {
    const next = String(mode || '').toUpperCase();
    if (!['AUTO','MANUAL'].includes(next)) throw new Error('recalibration mode must be AUTO or MANUAL');
    const before = this.recalibrationMode;
    this.recalibrationMode = next;
    for (const ch of Object.values(this.channels)) ch.setRecalibrationMode(next, this.observationBlocked);
    this.recordEvent('CONTROL', `RECALIBRATION MODE ${before} → ${next}`);
    this.updateComparatorAndQualifier();
  }

  armManualCalibration() {
    this.recalibrationMode = 'MANUAL';
    for (const ch of Object.values(this.channels)) ch.armManualCalibration(this.observationBlocked, this.oscillatorEpoch);
    this.recordEvent('CONTROL', 'MANUAL RECALIBRATION ARMED · THREE INDEPENDENT FRESH WEST→WEST CAPTURES');
    this.updateComparatorAndQualifier();
  }

  setCallistoDetune(percent) {
    const p = Number(percent);
    if (!Number.isFinite(p) || p < -1 || p > 1) throw new Error('Callisto detune percent must be between -1 and +1');
    const newFactor = 1 + p / 100;
    const baseCycles = this.naturalStep / MOONS.ca.plantPeriod;
    this.phaseContinuity.ca += baseCycles * (this.rateFactor.ca - newFactor);
    const before = this.callistoDetunePct;
    this.rateFactor.ca = newFactor;
    this.callistoDetunePct = p;
    this.recordEvent('CONTROL', `CALLISTO SECONDARY DETUNE ${before.toFixed(2)}% → ${p.toFixed(2)}%`, { fromPercent: before, toPercent: p, definingPathTouched:false });
  }

  plantState(id) {
    const m = MOONS[id];
    const factor = this.rateFactor[id] || 1;
    const continuity = this.phaseContinuity[id] || 0;
    const ph = wrap01((this.naturalStep / m.plantPeriod) * factor + m.offset + continuity);
    const x = Math.sin(2 * Math.PI * ph);
    const dx = Math.cos(2 * Math.PI * ph);
    const phase9 = Math.floor(wrap01(ph) * 512) & 511;
    return {
      // Native A8 presentation values. The continuous normalized ph below
      // remains simulator/reference math and is not the primary display ruler.
      phase9,
      phase9Octal: phase9.toString(8).padStart(3, '0') + '₈',
      phase9Binary: phase9.toString(2).padStart(9, '0'),
      ph,
      x,
      dx,
      dir: dx >= 0 ? 'eastbound →' : '← westbound',
      radial: (1 - Math.cos(2 * Math.PI * ph)) / 2,
    };
  }

  setMoonFault(id, percent) {
    if (!['io', 'eu', 'ga'].includes(id)) throw new Error('invalid moon');
    const p = Number(percent);
    if (!Number.isFinite(p) || p < -1 || p > 1) {
      throw new Error('fault percent must be between -1 and +1');
    }

    // Exact extension of the original Io continuity method:
    // preserve present phase; change future rate only.
    const newFactor = 1 + p / 100;
    const baseCycles = this.naturalStep / MOONS[id].plantPeriod;
    this.phaseContinuity[id] += baseCycles * (this.rateFactor[id] - newFactor);
    const oldCommand = this.faultCommandPct[id];
    this.rateFactor[id] = newFactor;
    this.faultCommandPct[id] = p;
    this.channels[id].history = []; // fresh observational samples after rate change
    this.recordEvent('CONTROL', `${MOONS[id].name.toUpperCase()} RATE FAULT ${oldCommand.toFixed(2)}% → ${p.toFixed(2)}%`, { moon: id, fromPercent: oldCommand, toPercent: p });
    this.updateComparatorAndQualifier();
  }

  clearMoonFaults() {
    for (const id of ['io', 'eu', 'ga']) this.setMoonFault(id, 0);
  }

  setOscillator(value) {
    const v = BigInt(value);
    if (v < 1n || v > 1000000n) throw new Error('oscillator out of range');
    if (v === this.oscillator) return;
    const before = this.oscillator;
    this.oscillator = v;
    this.oscillatorEpoch += 1;
    this.recordEvent('CONTROL', `OSCILLATOR ${before.toString()} → ${v.toString()} · EPOCH ${this.oscillatorEpoch}`, { from: before.toString(), to: v.toString() });
    this.epochReference = null;
    this.epochReferenceEpoch = null;
    for (const ch of Object.values(this.channels)) {
      ch.oscillatorChanged(this.observationBlocked, this.oscillatorEpoch);
    }
    this.updateComparatorAndQualifier();
  }

  setDrift(value) {
    const v = BigInt(value);
    if (v < -256n || v > 256n) throw new Error('drift out of range');
    if (v === this.drift) return;
    const before = this.drift;
    this.drift = v;
    this.oscillatorEpoch += 1;
    this.recordEvent('CONTROL', `Δ ${before.toString()}/512 → ${v.toString()}/512 · EPOCH ${this.oscillatorEpoch}`, { from: before.toString(), to: v.toString() });
    this.epochReference = null;
    this.epochReferenceEpoch = null;
    for (const ch of Object.values(this.channels)) {
      ch.oscillatorChanged(this.observationBlocked, this.oscillatorEpoch);
    }
    this.updateComparatorAndQualifier();
  }

  setObservationBlocked(blocked) {
    const next = !!blocked;
    if (next === this.observationBlocked) return;
    this.observationBlocked = next;
    this.recordEvent('CONTROL', next ? 'JOVIAN OBSERVATION BLOCKED' : 'JOVIAN OBSERVATION RESTORED');

    if (next) {
      for (const ch of Object.values(this.channels)) ch.observationBlockedNow();
    } else {
      for (const ch of Object.values(this.channels)) ch.observationRestored();
    }
    this.updateComparatorAndQualifier();
  }

  setAuthority(id) {
    if (!['io', 'eu', 'ga'].includes(id)) throw new Error('invalid authority');
    const before = this.selectedAuthority;
    this.selectedAuthority = id;
    this.recordEvent('CONTROL', `AUTHORITY ${before.toUpperCase()} → ${id.toUpperCase()}`, { from: before, to: id });
    this.updateComparatorAndQualifier();
  }

  setEarthDayRawSpan(value) {
    const v = BigInt(value);
    if (v <= 0n) throw new Error('earth-day raw span must be positive');
    const before = this.earthDayRawSpan;
    this.earthDayRawSpan = v;
    this.dividerRemainder = 0n;
    this.recordEvent('CONTROL', `PROVISIONAL EARTH-DAY RAW SPAN ${before.toString()} → ${v.toString()}`);
  }

  beginObservationReplay() {
    // Never mix plant evidence and real-replay evidence.
    this.running = false;
    this.sourceMode = 'REAL_OBSERVATION_REPLAY';
    this.rawTicks = 0n;
    this.rawTickRemainder = 0n;
    this.naturalStep = 0;
    this.dividerRemainder = 0n;
    this.dividerTotalTicks = 0n;
    this.replayRecordCount = 0;
    this.lastReplayRecord = null;
    this.lastQualified = null;
    this.epochReference = null;
    this.epochReferenceEpoch = null;
    this.recalibrationMode = 'AUTO';
    for (const ch of Object.values(this.channels)) ch.reset();
    this.updateComparatorAndQualifier();
    this.recordEvent('REPLAY', 'REAL OBSERVATION REPLAY STARTED', {
      definingInput: 'rawPulse + moon + signed Jupiter-relative displacement',
      prohibited: ['UTC in recovery math', 'published period injection', 'ephemeris-derived turn timing'],
    });
  }

  endObservationReplay() {
    this.running = false;
    this.sourceMode = 'SIMULATED_PLANT';
    this.recordEvent('REPLAY', 'REAL OBSERVATION REPLAY ENDED');
  }

  ingestObservationRecord(record) {
    if (this.sourceMode !== 'REAL_OBSERVATION_REPLAY') {
      throw new Error('core is not in REAL_OBSERVATION_REPLAY mode');
    }

    const moonMap = {
      io:'io', IO:'io', Io:'io', '1':'io',
      eu:'eu', EU:'eu', Europa:'eu', europa:'eu', '2':'eu',
      ga:'ga', GA:'ga', Ganymede:'ga', ganymede:'ga', '3':'ga',
    };
    const id=moonMap[String(record.moon)];
    if (!id) throw new Error('replay moon must be Io, Europa, or Ganymede');

    let raw;
    try { raw=BigInt(record.rawPulse); }
    catch { throw new Error('replay rawPulse must be integer-compatible'); }
    if (raw < this.rawTicks) throw new Error('replay rawPulse must be monotonic nondecreasing');

    const x=Number(record.x);
    if (!Number.isFinite(x)) throw new Error('replay x must be finite');

    const visible=record.visible===undefined ? true : !!record.visible;
    const before=this.rawTicks;
    this.rawTicks=raw;
    const deltaRaw=this.rawTicks-before;

    if (visible) {
      this.channels[id].detect(x,this.rawTicks,false,this.oscillatorEpoch);
    } else {
      // Missing observation is not x=0; break the three-sample reversal window.
      this.channels[id].history.length=0;
    }

    this.replayRecordCount += 1;
    this.lastReplayRecord={
      seq:this.replayRecordCount,
      rawPulse:this.rawTicks.toString(),
      moon:id,
      x,
      visible,
      uncertaintyX:record.uncertaintyX==null?null:Number(record.uncertaintyX),
      sourceOrdinal:record.sourceOrdinal==null?null:Number(record.sourceOrdinal),
    };

    this.updateComparatorAndQualifier();
    this.feedDivider(deltaRaw);
    return this.lastReplayRecord;
  }

  advance(n = 1) {
    if (this.sourceMode !== 'SIMULATED_PLANT') {
      throw new Error('plant advance disabled during REAL_OBSERVATION_REPLAY');
    }
    n = Math.max(1, Math.floor(Number(n)));
    const before = this.rawTicks;

    const perPlantStep = this.oscillator * (TICK_DEN + this.drift);

    for (let i = 0; i < n; i++) {
      this.naturalStep += 1;

      const numerator = perPlantStep + this.rawTickRemainder;
      this.rawTicks += numerator / TICK_DEN;
      this.rawTickRemainder = numerator % TICK_DEN;

      for (const id of ['io', 'eu', 'ga']) {
        const s = this.plantState(id);
        this.channels[id].detect(s.x, this.rawTicks, this.observationBlocked, this.oscillatorEpoch);
      }
    }

    const deltaRaw = this.rawTicks - before;
    this.updateComparatorAndQualifier();
    this.feedDivider(deltaRaw);
  }

  feedDivider(deltaRaw) {
    if (deltaRaw <= 0n) return;
    const numerator = this.dividerRemainder + deltaRaw * DAY_STATES;
    const clockTicks = numerator / this.earthDayRawSpan;
    this.dividerRemainder = numerator % this.earthDayRawSpan;

    if (clockTicks <= 0n) return;

    // Preserve the accelerated raw-divider accounting as an engineering signal.
    // It no longer drives the visible clock in REALTIME_DEMO mode.
    this.dividerTotalTicks += clockTicks;

    if (this.clockPaceMode === 'RAW_DIVIDER_TEST') {
      this.applyClockTicks(clockTicks);
    }
  }

  applyClockTicks(clockTicks) {
    if (clockTicks <= 0n) return;
    const totalPhase = this.dayPhase17 + clockTicks;
    this.dayCount += totalPhase / DAY_STATES;
    this.dayPhase17 = totalPhase % DAY_STATES;
  }

  advanceRealtimeClock(elapsedNs) {
    // Development/demo pacing only:
    // exactly 131072 A8 states per conventional 86400-second Earth day.
    // Integer accumulation avoids timer-jitter loss.
    if (this.clockPaceMode !== 'REALTIME_DEMO') return;
    const ns = BigInt(elapsedNs);
    if (ns <= 0n) return;

    const numerator = this.clockPaceNumerator + ns * DAY_STATES;
    const ticks = numerator / DAY_NS;
    this.clockPaceNumerator = numerator % DAY_NS;
    this.applyClockTicks(ticks);
  }


  updateComparatorAndQualifier() {
    const ids = ['io', 'eu', 'ga'];
    const normalized = {};
    const current = [];
    const stale = [];
    const fullCurrent = [];

    for (const id of ids) {
      const ch = this.channels[id];
      normalized[id] = ch.lockedSpan === null ? null : ch.lockedSpan * MOONS[id].ratio;
      if (ch.lockedSpan !== null) {
        if (ch.calibrationEpoch === this.oscillatorEpoch) {
          current.push(id);
          if (ch.qualificationComplete && ch.qualificationEpoch === this.oscillatorEpoch) {
            fullCurrent.push(id);
          }
        } else {
          stale.push(id);
        }
      }
    }

    const quality = { io: 'SEEKING', eu: 'SEEKING', ga: 'SEEKING' };
    const deviation = { io: null, eu: null, ga: null };
    for (const id of stale) quality[id] = 'RECALIBRATING';

    let reference = null;
    let liveMedian = null;
    let spread = null;
    let verdict = stale.length ? 'RECALIBRATION IN PROGRESS' : 'WAITING';
    let referenceMode = 'NONE';

    const currentVals = current.map(id => normalized[id]);
    const allThreeFull = fullCurrent.length === 3;

    if (current.length === 1) {
      const id = current[0];
      liveMedian = normalized[id];
      reference = normalized[id];
      referenceMode = 'SINGLE_CURRENT_CHANNEL';
      quality[id] = 'SINGLE_CURRENT';
      verdict = stale.length
        ? `ONE CURRENT CHANNEL · ${MOONS[id].name.toUpperCase()} · EQUAL-DURATION ${this.channels[id].qualificationSpanCount}/${this.channels[id].qualificationTargetSpans}`
        : `ONE CURRENT CHANNEL · ${MOONS[id].name.toUpperCase()} · NO CROSS-CHECK YET`;

    } else if (current.length === 2) {
      liveMedian = median(currentVals);
      spread = liveMedian
        ? (Math.max(...currentVals) - Math.min(...currentVals)) / liveMedian
        : 0;

      if (this.epochReferenceEpoch === this.oscillatorEpoch && this.epochReference !== null) {
        reference = this.epochReference;
        referenceMode = 'QUALIFIED_EQUAL_BASELINE';
        for (const id of current) {
          deviation[id] = reference ? (normalized[id] - reference) / reference : 0;
          quality[id] = Math.abs(deviation[id]) <= A8_TOL ? 'HEALTHY' : 'FAULT';
        }
        const bad = current.filter(id => quality[id] === 'FAULT');
        if (bad.length) {
          verdict = `BASELINE DEVIATION · ${bad.map(id => MOONS[id].name.toUpperCase()).join(' + ')}`;
        } else {
          verdict = stale.length
            ? 'TWO CURRENT CHANNELS MATCH EQUAL-DURATION BASELINE · THIRD RECALIBRATING'
            : 'TWO CURRENT CHANNELS MATCH QUALIFIED EQUAL-DURATION BASELINE';
        }
      } else if (spread <= A8_TOL) {
        for (const id of current) quality[id] = 'CORROBORATED';
        reference = liveMedian;
        referenceMode = 'TWO_CHANNEL_CORROBORATION';
        verdict = stale.length
          ? `TWO CURRENT CHANNELS CORROBORATED · ${current.map(id => MOONS[id].name.toUpperCase()).join(' + ')} · EQUAL-DURATION BASELINE BUILDING`
          : 'TWO-CHANNEL CORROBORATION / NO FULL EQUAL-DURATION BASELINE YET';
      } else {
        for (const id of current) quality[id] = 'CONFLICT';
        reference = liveMedian;
        referenceMode = 'LIVE_MEDIAN_DIAGNOSTIC_ONLY';
        verdict = 'TWO-CURRENT-CHANNEL CONFLICT / UNRESOLVED';
      }

    } else if (current.length === 3) {
      liveMedian = median(currentVals);
      spread = liveMedian
        ? (Math.max(...currentVals) - Math.min(...currentVals)) / liveMedian
        : 0;

      // New rule: a frozen epoch baseline may be established only after each
      // independent channel has completed its equal-duration qualification:
      // Io 8 spans, Europa 4 spans, Ganymede 2 spans.
      if (
        allThreeFull &&
        (this.epochReferenceEpoch !== this.oscillatorEpoch || this.epochReference === null) &&
        spread <= A8_TOL
      ) {
        this.epochReference = liveMedian;
        this.epochReferenceEpoch = this.oscillatorEpoch;
      }

      if (this.epochReferenceEpoch === this.oscillatorEpoch && this.epochReference !== null) {
        reference = this.epochReference;
        referenceMode = 'QUALIFIED_EQUAL_BASELINE';

        for (const id of current) {
          deviation[id] = reference ? (normalized[id] - reference) / reference : 0;
          quality[id] = Math.abs(deviation[id]) <= A8_TOL ? 'HEALTHY' : 'FAULT';
        }

        const bad = current.filter(id => quality[id] === 'FAULT');

        if (bad.length === 0) {
          verdict = 'THREE-CHANNEL EQUAL-DURATION BASELINE AGREEMENT · 8:4:2';
        } else if (bad.length === 1) {
          verdict = `SINGLE-CHANNEL DEVIATION · ${MOONS[bad[0]].name.toUpperCase()}`;
        } else if (bad.length === 2) {
          verdict = `TWO-CHANNEL CORRELATED DEVIATION · ${bad.map(id => MOONS[id].name.toUpperCase()).join(' + ')}`;
        } else {
          verdict = 'ALL THREE DEVIATE FROM QUALIFIED EQUAL-DURATION BASELINE / COMMON-CAUSE SUSPECTED';
        }
      } else if (spread <= A8_TOL) {
        // All three have early current estimates that agree, but the equal
        // observation-duration evidence window is not complete yet.
        for (const id of current) quality[id] = 'CORROBORATED';
        reference = liveMedian;
        referenceMode = 'THREE_CHANNEL_EARLY_CORROBORATION';
        verdict = `THREE CURRENT CHANNELS AGREE · BUILDING 8:4:2 EQUAL-DURATION BASELINE · IO ${this.channels.io.qualificationSpanCount}/8 · EU ${this.channels.eu.qualificationSpanCount}/4 · GA ${this.channels.ga.qualificationSpanCount}/2`;
      } else {
        reference = liveMedian;
        referenceMode = 'LIVE_MEDIAN_DIAGNOSTIC_ONLY';
        for (const id of current) {
          deviation[id] = liveMedian ? (normalized[id] - liveMedian) / liveMedian : 0;
          quality[id] = 'CONFLICT';
        }
        verdict = allThreeFull
          ? 'THREE-CHANNEL SPLIT / FULL EQUAL-DURATION BASELINE / UNRESOLVED'
          : 'THREE-CHANNEL SPLIT / EARLY EVIDENCE / UNRESOLVED';
      }
    }

    const selected = this.selectedAuthority;
    const selectedCh = this.channels[selected];
    const q = quality[selected];

    let authorityQualification;

    if (selectedCh.lockedSpan === null) {
      authorityQualification = this.lastQualified ? 'HOLDOVER' : 'UNQUALIFIED';

    } else if (selectedCh.calibrationEpoch !== this.oscillatorEpoch) {
      authorityQualification = this.lastQualified ? 'HOLDOVER' : 'UNQUALIFIED';

    } else if (q === 'SINGLE_CURRENT') {
      authorityQualification = 'SINGLE_REFRESH';
      this.lastQualified = {
        source: selected,
        normalizedSpan: normalized[selected],
        rawTick: this.rawTicks.toString(),
        oscillatorEpoch: this.oscillatorEpoch,
        evidence: 'SINGLE_CURRENT_EARLY',
        qualification: cloneSerializable(selectedCh.snapshot(this.rawTicks).qualification),
        epochReference: this.epochReference,
      };

    } else if (q === 'CORROBORATED') {
      authorityQualification = current.length === 3 ? 'CORROBORATED_3_EARLY' : 'CORROBORATED_2';
      this.lastQualified = {
        source: selected,
        normalizedSpan: normalized[selected],
        rawTick: this.rawTicks.toString(),
        oscillatorEpoch: this.oscillatorEpoch,
        evidence: current.length === 3 ? 'THREE_CHANNEL_EARLY_CORROBORATION' : 'TWO_CHANNEL_CORROBORATION',
        qualification: cloneSerializable(selectedCh.snapshot(this.rawTicks).qualification),
        epochReference: this.epochReference,
      };

    } else if (q === 'HEALTHY') {
      authorityQualification = 'QUALIFIED_3';
      this.lastQualified = {
        source: selected,
        normalizedSpan: normalized[selected],
        rawTick: this.rawTicks.toString(),
        oscillatorEpoch: this.oscillatorEpoch,
        evidence: 'THREE_CHANNEL_EQUAL_BASELINE_8_4_2',
        qualification: cloneSerializable(selectedCh.snapshot(this.rawTicks).qualification),
        epochReference: this.epochReference,
      };

    } else {
      authorityQualification = this.lastQualified ? 'HOLDOVER' : 'REJECTED';
    }

    this.comparator = {
      tolerance: A8_TOL,
      oscillatorEpoch: this.oscillatorEpoch,
      currentCount: current.length,
      staleCount: stale.length,
      fullQualifiedCount: fullCurrent.length,
      current,
      stale,
      fullCurrent,
      lockedCount: ids.filter(id => this.channels[id].lockedSpan !== null).length,
      reference,
      referenceMode,
      epochReference: this.epochReference,
      liveMedian,
      spread,
      quality,
      deviation,
      verdict,
      authority: selected,
      authorityQualification,
      equalBaseline: {
        io: {
          spans: this.channels.io.qualificationSpanCount,
          target: this.channels.io.qualificationTargetSpans,
          complete: this.channels.io.qualificationComplete,
        },
        eu: {
          spans: this.channels.eu.qualificationSpanCount,
          target: this.channels.eu.qualificationTargetSpans,
          complete: this.channels.eu.qualificationComplete,
        },
        ga: {
          spans: this.channels.ga.qualificationSpanCount,
          target: this.channels.ga.qualificationTargetSpans,
          complete: this.channels.ga.qualificationComplete,
        },
      },
      availableAuthorities: current.filter(id => !['CONFLICT','FAULT'].includes(quality[id])),
      lastQualified: this.lastQualified ? { ...this.lastQualified } : null,
    };

    const stateSignature = JSON.stringify({
      e: this.oscillatorEpoch,
      current,
      stale,
      fullCurrent,
      quality,
      verdict,
      selected,
      authorityQualification,
      equalBaseline: this.comparator.equalBaseline,
    });
    if (this.lastStateSignature !== null && stateSignature !== this.lastStateSignature) {
      this.recordEvent('STATE', verdict, {
        current: [...current],
        stale: [...stale],
        fullCurrent: [...fullCurrent],
        quality: { ...quality },
        authorityQualification,
        equalBaseline: cloneSerializable(this.comparator.equalBaseline),
        normalized: {
          io: normalized.io,
          eu: normalized.eu,
          ga: normalized.ga,
        },
        reference,
        referenceMode,
        spread,
      });
    }
    this.lastStateSignature = stateSignature;
  }

  clockFields() {
    const p = Number(this.dayPhase17);
    const h = Math.floor(p / 4096);
    const rem = p % 4096;
    const m = Math.floor(rem / 64);
    const s = rem % 64;
    return {
      hour: h,
      minute: m,
      second: s,
      decimal: `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`,
      octal: `${h.toString(8).padStart(2,'0')}:${m.toString(8).padStart(2,'0')}:${s.toString(8).padStart(2,'0')}₈`,
      binary: this.dayPhase17.toString(2).padStart(17, '0'),
    };
  }

  dividerStatus() {
    const q = this.comparator.authorityQualification;
    let calibration;
    let output;

    if (q === 'QUALIFIED_3') {
      calibration = 'FULLY VERIFIED · 8:4:2 EQUAL-DURATION BASELINE';
      output = 'RUNNING / FULLY VERIFIED';
    } else if (q === 'CORROBORATED_3_EARLY') {
      calibration = 'EARLY CORROBORATION · 3 CHANNELS · BUILDING 8:4:2';
      output = 'RUNNING / EARLY 3-CHANNEL CORROBORATION';
    } else if (q === 'CORROBORATED_2') {
      calibration = 'CORROBORATED · 2 CHANNELS';
      output = 'RUNNING / CORROBORATED';
    } else if (q === 'SINGLE_REFRESH') {
      calibration = 'SINGLE-CHANNEL REFRESH';
      output = 'RUNNING / SINGLE SOURCE · AWAITING CROSS-CHECK';
    } else if (q === 'HOLDOVER') {
      calibration = 'HOLDOVER';
      output = 'COASTING / LAST ACCEPTED CALIBRATION';
    } else {
      calibration = q;
      output = 'LAB BRIDGE / NOT ACCEPTED';
    }

    return {
      rawInput: 'ACTIVE',
      authority: this.selectedAuthority,
      authorityQuality: this.comparator.quality[this.selectedAuthority],
      calibration,
      output,
      availableAuthorities: this.comparator.availableAuthorities,
      earthDayRawSpan: this.earthDayRawSpan.toString(),
      remainder: this.dividerRemainder.toString(),
      totalTicks: this.dividerTotalTicks.toString(),
      clockPaceMode: this.clockPaceMode,
      clockPaceText: this.clockPaceMode === 'REALTIME_DEMO'
        ? 'NORMAL DEMO PACE · 131072 states per conventional Earth day'
        : 'ACCELERATED RAW-DIVIDER TEST',
      note: this.clockPaceMode === 'REALTIME_DEMO'
        ? 'Visible clock pace is development-only and uses elapsed monotonic host time. The accelerated Jovian/raw divider remains independent and does not define the clock rate.'
        : 'Earth-day raw span is provisional laboratory input.',
    };
  }

  plantDiagnostics() {
    // Restored from the original v0.6.20 Chief Engineer bench diagnostic.
    // This is deliberately OUTSIDE the recovery path.
    //
    // Use unwrapped model cycles so a phase residual cannot appear to heal
    // merely by crossing a whole-cycle seam.
    const unwrapped = {};
    for (const id of ['io', 'eu', 'ga']) {
      const m = MOONS[id];
      const factor = this.rateFactor[id] || 1;
      const continuity = this.phaseContinuity[id] || 0;
      unwrapped[id] =
        (this.naturalStep / m.plantPeriod) * factor +
        m.offset +
        continuity;
    }

    const base =
      MOONS.io.offset -
      3 * MOONS.eu.offset +
      2 * MOONS.ga.offset;

    const innerLaplaceResidual =
      unwrapped.io -
      3 * unwrapped.eu +
      2 * unwrapped.ga -
      base;

    const absLap = Math.abs(innerLaplaceResidual);
    const faultCommandActive =
      Math.abs(this.faultCommandPct.io) > 0 ||
      Math.abs(this.faultCommandPct.eu) > 0 ||
      Math.abs(this.faultCommandPct.ga) > 0;
    const oneA8State = 1 / 512;

    let innerIntegrityState;
    let innerIntegrityLabel;
    if (absLap < 1e-9 && !faultCommandActive) {
      innerIntegrityState = 'nominal';
      innerIntegrityLabel = 'INNER SYSTEM NOMINAL';
    } else if (absLap < oneA8State) {
      innerIntegrityState = 'deviating';
      innerIntegrityLabel = 'INNER SYSTEM DEVIATING';
    } else {
      innerIntegrityState = 'fault';
      innerIntegrityLabel = '⚠ INNER SYSTEM FAULT';
    }

    return {
      innerLaplaceResidual,
      innerIntegrityState,
      innerIntegrityLabel,
      oneA8State,
      faultCommandActive,
    };
  }

  recorderSnapshot() {
    return {
      count: this.eventLog.length,
      events: this.eventLog.slice(-80).reverse(),
    };
  }

  observerPhaseIndex(subdivisions = 1n) {
    const div = BigInt(subdivisions);
    if (div < 1n) throw new Error('observer subdivisions must be >= 1');

    // Observer resolution only.
    // The native A8 SECOND remains one integer DAY_PHASE17 state.
    // clockPaceNumerator locates the observer within that native state.
    const subphase = (this.clockPaceNumerator * div) / DAY_NS;

    return this.dayPhase17 * div + subphase;
  }

  snapshot() {
    const moons = {};
    for (const id of ['io', 'eu', 'ga']) {
      moons[id] = this.channels[id].snapshot(this.rawTicks);
      moons[id].quality = this.comparator.quality[id];
      moons[id].deviation = this.comparator.deviation[id];
      moons[id].faultInjectionPct = this.faultCommandPct[id];
      moons[id].plant = this.plantState(id);
      moons[id].authority = id === this.selectedAuthority;
      moons[id].freshness = moons[id].calibrationEpoch === this.oscillatorEpoch
        ? 'CURRENT'
        : (moons[id].locked ? 'RECALIBRATING' : 'SEEKING');
    }

    const ca = this.plantState('ca');
    const ga = this.plantState('ga');
    const callistoPsi = wrap01(3 * ga.ph - 7 * ca.ph);

    return {
      version: '5.4.18',
      running: this.running,
      source: {
        mode: this.sourceMode,
        replayRecordCount: this.replayRecordCount,
        lastReplayRecord: this.lastReplayRecord ? { ...this.lastReplayRecord } : null,
        definingInput: this.sourceMode === 'REAL_OBSERVATION_REPLAY'
          ? 'EXTERNAL rawPulse + moon + signed Jupiter-relative displacement'
          : 'SIMULATED hidden plant',
      },
      benchSteps: this.benchSteps,
      bench: {
        schedulerHz: this.schedulerHz,
        stepsPerPass: this.benchSteps,
        observerResolutionSteps: 1,
        // Development/reference-only acceleration against the historical 7.155-day
        // Ganymede comparison used by the legacy engineering bench.
        approximateNaturalGanymedeRateMultiple: (7.155 * 86400 * this.schedulerHz / PLANT_G_STEPS) * this.benchSteps,
      },
      recalibration: {
        mode: this.recalibrationMode,
        manualArmed: Object.values(this.channels).some(ch => ch.manualArmed),
      },
      raw: {
        count: this.rawTicks.toString(),
        oscillator: this.oscillator.toString(),
        driftOver512: this.drift.toString(),
        naturalStep: this.naturalStep,
        oscillatorEpoch: this.oscillatorEpoch,
      },
      observation: this.observationBlocked ? 'BLOCKED' : 'ACTIVE',
      moons,
      comparator: cloneSerializable(this.comparator),
      divider: this.dividerStatus(),
      clock: {
        phase17: this.dayPhase17.toString(),
        dayCount: this.dayCount.toString(),
        // Observer-only sub-state phase. This lets a remote display interpolate
        // smoothly between authoritative integer DAY_PHASE17 states without
        // allowing browser/network packet timing to become clock timing.
        paceFractionNumerator: this.clockPaceNumerator.toString(),
        paceFractionDenominator: DAY_NS.toString(),
        demoStatePeriodMs: 86400000 / Number(DAY_STATES),
        lastAlign: this.lastAlign ? { ...this.lastAlign } : null,
        ...this.clockFields(),
      },
      diagnostics: this.plantDiagnostics(),
      secondary: {
        callistoPsi,
        callistoPlant: ca,
        callistoDetunePct: this.callistoDetunePct,
        ganymedePlant: ga,
        callistoNote: 'Secondary slow-envelope diagnostic only; not used in primary 1:2:4 recovery.',
      },
    };
  }
}

module.exports = {
  A8Core,
  RecoveryChannel,
  MOONS,
  TICK_DEN,
  PLANT_G_STEPS,
  DAY_STATES,
  A8_TOL,
  phaseAddr,
};
