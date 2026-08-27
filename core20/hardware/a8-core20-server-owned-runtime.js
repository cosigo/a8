'use strict';

const DAY_STATES = 131072n;
const HOST_DAY_NS = 86400000000000n;
const HOST_DAY_MS = 86400000n;

function parsePositiveRationalText(text) {
  const m = /^([1-9][0-9]*)\/([1-9][0-9]*)$/.exec(String(text || ''));
  if (!m) throw new Error(`invalid positive rational: ${text}`);
  return { numerator: BigInt(m[1]), denominator: BigInt(m[2]) };
}

function utcMillisecondsSinceMidnight(date) {
  const d = date instanceof Date ? date : new Date(date);
  return BigInt(
    d.getUTCHours() * 3600000 +
    d.getUTCMinutes() * 60000 +
    d.getUTCSeconds() * 1000 +
    d.getUTCMilliseconds()
  );
}

function clockFields(phase) {
  const p = BigInt(phase);
  const h = p / 4096n;
  const r = p % 4096n;
  const m = r / 64n;
  const s = r % 64n;
  const d2 = v => v.toString().padStart(2, '0');
  const o2 = v => v.toString(8).padStart(2, '0');
  return {
    hourDecimal: h.toString(),
    minuteDecimal: m.toString(),
    secondDecimal: s.toString(),
    decimal: `${d2(h)}:${d2(m)}:${d2(s)}`,
    hourOctal: o2(h),
    minuteOctal: o2(m),
    secondOctal: o2(s),
    octal: `${o2(h)}:${o2(m)}:${o2(s)}₈`,
    binary17: p.toString(2).padStart(17, '0'),
  };
}

class Core20ServerOwnedRuntime {
  constructor({
    prepareVirtual,
    advanceRaw,
    getRaw,
    getSourceEpoch,
    getRecurrenceText,
    monotonicNowNs = () => process.hrtime.bigint(),
    utcNow = () => new Date(),
    setIntervalFn = setInterval,
    clearIntervalFn = clearInterval,
    setTimeoutFn = setTimeout,
    intervalMs = 2,
    qualificationPresentationMs = 0,
  } = {}) {
    for (const [name, fn] of Object.entries({
      prepareVirtual, advanceRaw, getRaw, getSourceEpoch, getRecurrenceText
    })) {
      if (typeof fn !== 'function') throw new Error(`${name} callback required`);
    }

    this.prepareVirtual = prepareVirtual;
    this.advanceRaw = advanceRaw;
    this.getRaw = getRaw;
    this.getSourceEpoch = getSourceEpoch;
    this.getRecurrenceText = getRecurrenceText;
    this.monotonicNowNs = monotonicNowNs;
    this.utcNow = utcNow;
    this.setIntervalFn = setIntervalFn;
    this.clearIntervalFn = clearIntervalFn;
    this.setTimeoutFn = setTimeoutFn;
    this.intervalMs = Number(intervalMs);
    this.qualificationPresentationMs =
      Number(qualificationPresentationMs);

    this.status = 'STOPPED';
    this.lastError = null;
    this.timer = null;
    this.lastPaceNs = 0n;
    this.paceRemainder = 0n;
    this.rawPerDayNumerator = null;
    this.rawPerDayDenominator = null;
    this.alignment = null;
    this.alignmentSeq = 0;
    this.startPromise = null;

    /*
     * Authoritative downstream A8 state-edge publication.
     * Listeners receive completed Core20 DAY_PHASE17 edges only.
     * They can observe; they cannot pace or write Core20.
     */
    this.clockEdgeListeners = new Set();
    this.clockEdgeSeq = 0;
  }

  _qualificationPresentationPause() {
    const ms =
      Number(this.qualificationPresentationMs);

    if (
      !Number.isFinite(ms) ||
      ms <= 0
    ) {
      return Promise.resolve();
    }

    /*
     * SIMULATION PRESENTATION PACE ONLY.
     *
     * This delay is not measured, counted, or used by recovery.
     * It merely lets an observer see genuine intermediate
     * qualification states that otherwise occur in one JS burst.
     */
    return new Promise(resolve => {
      this.setTimeoutFn(resolve, ms);
    });
  }

  async start({ restart = false } = {}) {
    if (this.status === 'RUNNING' && !restart) return this.snapshot();
    if (this.startPromise && !restart) {
      await this.startPromise;
      return this.snapshot();
    }
    if (restart) this.stop();

    this.startPromise = this._startFresh();
    try {
      await this.startPromise;
    } finally {
      this.startPromise = null;
    }
    return this.snapshot();
  }

  async _startFresh() {
    this.status = 'QUALIFYING';
    this.lastError = null;
    this.alignment = null;

    try {
      await this.prepareVirtual({
        qualificationPause:
          () => this._qualificationPresentationPause(),
      });

      const q = parsePositiveRationalText(this.getRecurrenceText());
      this.rawPerDayNumerator = q.numerator;
      this.rawPerDayDenominator = q.denominator;
      this.paceRemainder = 0n;
      this.lastPaceNs = BigInt(this.monotonicNowNs());
      this.status = 'RUNNING';

      this.timer = this.setIntervalFn(() => {
        try {
          this.tick();
        } catch (err) {
          this.lastError = err && err.message ? err.message : String(err);
          this.status = 'ERROR';
          this._clearTimer();
        }
      }, this.intervalMs);
    } catch (err) {
      this.lastError = err && err.message ? err.message : String(err);
      this.status = 'ERROR';
      this._clearTimer();
      throw err;
    }
  }

  _clearTimer() {
    if (this.timer !== null) {
      this.clearIntervalFn(this.timer);
      this.timer = null;
    }
  }

  stop() {
    this._clearTimer();
    this.status = 'STOPPED';
    this.lastError = null;
    return this.snapshot();
  }

  resumeDiagnostic() {
    if (this.status === 'RUNNING') {
      return this.snapshot();
    }

    if (this.status !== 'STOPPED') {
      throw new Error(
        `diagnostic resume requires STOPPED runtime; current=${this.status}`
      );
    }

    if (
      this.rawPerDayNumerator === null ||
      this.rawPerDayDenominator === null
    ) {
      throw new Error(
        'diagnostic resume unavailable before completed qualification'
      );
    }

    const epoch =
      String(
        this.getSourceEpoch()
      );

    if (
      this.alignment &&
      this.alignment.sourceEpoch !== epoch
    ) {
      throw new Error(
        'diagnostic resume refused: source epoch changed during hold'
      );
    }

    /*
     * DIAGNOSTIC HOLD / RESUME CONTRACT
     *
     * Raw state remains frozen through HOLD.
     *
     * We intentionally reset ONLY the server execution pacing
     * anchor here. Therefore elapsed external time during HOLD
     * is discarded. There is no catch-up.
     *
     * NO prepareVirtual()
     * NO source epoch change
     * NO Jovian reacquisition
     * NO UTC sample
     * NO alignIfNeeded()
     */
    this.lastPaceNs =
      BigInt(
        this.monotonicNowNs()
      );

    this.lastError = null;
    this.status = 'RUNNING';

    this.timer =
      this.setIntervalFn(
        () => {
          try {
            this.tick();
          } catch (err) {
            this.lastError =
              err && err.message
                ? err.message
                : String(err);

            this.status = 'ERROR';
            this._clearTimer();
          }
        },
        this.intervalMs
      );

    return this.snapshot();
  }

  onClockEdge(listener) {
    if (typeof listener !== 'function') {
      throw new Error('clock edge listener must be a function');
    }

    this.clockEdgeListeners.add(listener);

    return () => {
      this.clockEdgeListeners.delete(listener);
    };
  }

  _clockCoordinate() {
    if (this.status !== 'RUNNING') return null;

    const epoch = String(this.getSourceEpoch());

    if (
      !this.alignment ||
      this.alignment.sourceEpoch !== epoch
    ) {
      return null;
    }

    const rawNow = BigInt(this.getRaw());
    const rawAtAlign =
      BigInt(this.alignment.serverStampedRawPulse);

    if (rawNow < rawAtAlign) {
      throw new Error(
        'selected raw count regressed after alignment'
      );
    }

    const elapsedRaw =
      rawNow - rawAtAlign;

    const exactNumerator =
      elapsedRaw *
      this.rawPerDayDenominator *
      DAY_STATES;

    const completedStates =
      exactNumerator /
      this.rawPerDayNumerator;

    const total =
      BigInt(
        this.alignment.targetDayPhase17
      ) +
      completedStates;

    return {
      sourceEpoch: epoch,
      rawPulse: rawNow,
      totalState: total,
      dayCount: total / DAY_STATES,
      dayPhase17: total % DAY_STATES,
    };
  }

  _emitClockEdge(before, after) {
    if (!before || !after) return;

    if (
      before.sourceEpoch !==
      after.sourceEpoch
    ) {
      return;
    }

    const delta =
      after.totalState -
      before.totalState;

    if (delta <= 0n) return;

    this.clockEdgeSeq += 1;

    const edge = {
      schema: 'A8-CORE20-CLOCK-EDGE-V1',
      sequence: this.clockEdgeSeq,
      sourceEpoch: after.sourceEpoch,
      deltaStates: delta.toString(),
      rawPulse: after.rawPulse.toString(),
      totalState: after.totalState.toString(),
      dayCount: after.dayCount.toString(),
      dayPhase17: after.dayPhase17.toString(),
      clockAuthority:
        'RECOVERED_JOVIAN_MINTAKA_SOL_SUN_RETURN',
      definingPathTouched: false,
      browserTimingAuthority: false,
    };

    for (
      const listener of
      Array.from(this.clockEdgeListeners)
    ) {
      try {
        listener(edge);
      } catch (_) {
        // Downstream observer failure cannot affect Core20.
      }
    }
  }

  tick(nowNs = this.monotonicNowNs()) {
    if (this.status !== 'RUNNING') return 0n;

    const now = BigInt(nowNs);
    const elapsed = now - this.lastPaceNs;
    this.lastPaceNs = now;
    if (elapsed <= 0n) return 0n;

    const denominator = HOST_DAY_NS * this.rawPerDayDenominator;
    const numerator =
      this.paceRemainder + elapsed * this.rawPerDayNumerator;

    const due = numerator / denominator;
    this.paceRemainder = numerator % denominator;

    if (due > 0n) {
      const before =
        this._clockCoordinate();

      this.advanceRaw(due);

      const after =
        this._clockCoordinate();

      this._emitClockEdge(
        before,
        after
      );
    }

    return due;
  }

  alignIfNeeded() {
    if (this.status !== 'RUNNING') {
      throw new Error(`Core20 runtime is not running: ${this.status}`);
    }

    const epoch = String(this.getSourceEpoch());

    if (this.alignment && this.alignment.sourceEpoch === epoch) {
      return {
        applied: false,
        alignment: { ...this.alignment },
        clock: this.clockSnapshot(),
      };
    }

    const utcMs = utcMillisecondsSinceMidnight(this.utcNow());
    const targetPhase = (utcMs * DAY_STATES) / HOST_DAY_MS;
    const raw = BigInt(this.getRaw());

    this.alignmentSeq += 1;
    this.alignment = {
      source: 'SERVER UTC BRIDGE · EXTERNAL CONVENTIONAL REFERENCE · NON-DEFINING',
      role: 'MOMENTARY_CONNECT_ALIGNMENT_ONLY',
      sourceEpoch: epoch,
      serverStampedRawPulse: raw.toString(),
      targetDayPhase17: targetPhase.toString(),
      utcMillisecondsSinceMidnight: utcMs.toString(),
      sequence: this.alignmentSeq,
      definingPathTouched: false,
      ongoingUtcFeed: false,
    };

    return {
      applied: true,
      alignment: { ...this.alignment },
      clock: this.clockSnapshot(),
    };
  }

  clockSnapshot() {
    const runtime = this.snapshot();

    if (this.status !== 'RUNNING') {
      return {
        schema: 'A8-CORE20-SERVER-CLOCK-V1',
        status: 'CORE20_CLOCK_NOT_RUNNING',
        runtime,
      };
    }

    const epoch = String(this.getSourceEpoch());

    if (!this.alignment || this.alignment.sourceEpoch !== epoch) {
      return {
        schema: 'A8-CORE20-SERVER-CLOCK-V1',
        status: 'AWAITING_MOMENTARY_CONNECT_ALIGNMENT',
        sourceEpoch: epoch,
        currentSelectedRawPulse: String(this.getRaw()),
        recoveredRawPerSunReturn: this.getRecurrenceText(),
        clockAuthority: 'RECOVERED_JOVIAN_MINTAKA_SOL_SUN_RETURN',
        runtime,
      };
    }

    const rawNow = BigInt(this.getRaw());
    const rawAtAlign = BigInt(this.alignment.serverStampedRawPulse);
    if (rawNow < rawAtAlign) throw new Error('selected raw count regressed after alignment');

    const elapsedRaw = rawNow - rawAtAlign;
    const exactNumerator =
      elapsedRaw * this.rawPerDayDenominator * DAY_STATES;
    const exactDenominator = this.rawPerDayNumerator;
    const completedStates = exactNumerator / exactDenominator;
    const substateNumerator = exactNumerator % exactDenominator;

    const total =
      BigInt(this.alignment.targetDayPhase17) + completedStates;
    const dayCount = total / DAY_STATES;
    const phase = total % DAY_STATES;
    const fields = clockFields(phase);

    return {
      schema: 'A8-CORE20-SERVER-CLOCK-V1',
      status: 'CORE20_CLOCK_RUNNING',
      sourceEpoch: epoch,
      currentSelectedRawPulse: rawNow.toString(),
      recoveredRawPerSunReturn: this.getRecurrenceText(),
      clockAuthority: 'RECOVERED_JOVIAN_MINTAKA_SOL_SUN_RETURN',
      alignment: { ...this.alignment },
      elapsedRawSinceAlignment: elapsedRaw.toString(),
      dayCount: dayCount.toString(),
      dayPhase17: phase.toString(),
      dayPhase17Binary: fields.binary17,
      exactSubstate: {
        numerator: substateNumerator.toString(),
        denominator: exactDenominator.toString(),
      },
      clock: {
        hourDecimal: fields.hourDecimal,
        minuteDecimal: fields.minuteDecimal,
        secondDecimal: fields.secondDecimal,
        decimal: fields.decimal,
        hourOctal: fields.hourOctal,
        minuteOctal: fields.minuteOctal,
        secondOctal: fields.secondOctal,
        octal: fields.octal,
      },
      ongoingReference: {
        usesUTC: false,
        usesBrowserTime: false,
        usesNetworkPacketTiming: false,
        usesNTP: false,
        usesGPS: false,
        usesLegacySeconds: false,
        source: 'RECOVERED RAW / SUN-RETURN SCALE ONLY',
      },
      runtime,
    };
  }

  snapshot() {
    return {
      schema: 'A8-CORE20-SERVER-RUNTIME-V1',
      status: this.status,
      lastError: this.lastError,
      intervalMs: this.intervalMs,
      edgeObserverIntervalMs: this.intervalMs,
      clockEdgePublisher: 'NODE_SERVER_AUTHORITATIVE_DAY_PHASE17_EDGE',
      pulseGeneratorOwner: 'NODE_SERVER',
      browserPulseGenerator: false,
      browserVisibilityAffectsClock: false,
      browserPacketTimingAffectsClock: false,
      monotonicExecutionPace: 'SERVER_PROCESS_HRTIME_ONLY',
      recoveredRawPerSunReturn:
        this.rawPerDayNumerator === null
          ? null
          : `${this.rawPerDayNumerator}/${this.rawPerDayDenominator}`,
      alignmentEstablished: !!this.alignment,
      alignment: this.alignment ? { ...this.alignment } : null,
    };
  }
}

module.exports = {
  DAY_STATES,
  HOST_DAY_NS,
  HOST_DAY_MS,
  parsePositiveRationalText,
  utcMillisecondsSinceMidnight,
  clockFields,
  Core20ServerOwnedRuntime,
};
