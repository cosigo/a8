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
    getNaturalRecurrenceText = null,
    monotonicNowNs = () => process.hrtime.bigint(),
    utcNow = () => new Date(),
    setIntervalFn = setInterval,
    clearIntervalFn = clearInterval,
    setTimeoutFn = setTimeout,
    intervalMs = 2,
    qualificationPresentationMs = 0,
    externalPhysicalPrimary = false,
    legacyEmergencyEnabled = false,
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

    if (
      getNaturalRecurrenceText !== null &&
      typeof getNaturalRecurrenceText !== 'function'
    ) {
      throw new Error(
        'getNaturalRecurrenceText must be a function when supplied'
      );
    }

    this.getNaturalRecurrenceText =
      getNaturalRecurrenceText;

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

    /*
     * Defining civil-clock coordinate while PRIMARY physical
     * mode is active.
     *
     * This is Europa-disciplined natural/model RAW.
     * It is deliberately separate from selected Core RAW.
     */
    this.externalClockRaw = null;

    /*
     * PRIMARY EXTERNAL PHYSICAL PACE
     *
     * When true, selected RAW advances only from qualified
     * external physical RAW deltas. Host monotonic time is
     * not sampled for pacing.
     */
    this.externalPhysicalPrimary =
      externalPhysicalPrimary === true;

    /*
     * LEGACY EMERGENCY RESERVE
     *
     * Explicit break-glass opt-in only. Merely losing PRIMARY
     * may never activate host-monotonic pacing or UTC alignment.
     */
    this.legacyEmergencyEnabled =
      legacyEmergencyEnabled === true;

    if (
      this.externalPhysicalPrimary &&
      this.legacyEmergencyEnabled
    ) {
      throw new Error(
        'PRIMARY physical pace and LEGACY emergency reserve cannot be active simultaneously'
      );
    }

    this.rawPerDayNumerator = null;
    this.rawPerDayDenominator = null;
    this.alignment = null;
    this.alignmentSeq = 0;

    /*
     * Diagnostic state only.
     * True after HOLD / RESUME preserved an old civil alignment
     * while intentionally discarding held elapsed time.
     */
    this.civilRealignRecommended = false;

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
    this.civilRealignRecommended = false;

    try {
      await this.prepareVirtual({
        qualificationPause:
          () => this._qualificationPresentationPause(),
      });

      const recurrenceText =
        (
          this.externalPhysicalPrimary &&
          this.getNaturalRecurrenceText
        )
          ? this.getNaturalRecurrenceText()
          : this.getRecurrenceText();

      const q =
        parsePositiveRationalText(
          recurrenceText
        );

      this.rawPerDayNumerator = q.numerator;
      this.rawPerDayDenominator = q.denominator;
      this.paceRemainder = 0n;

      this.lastPaceNs =
        this.legacyEmergencyEnabled
          ? BigInt(this.monotonicNowNs())
          : 0n;

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

  _requireLegacyEmergencyReserve(action) {
    if (!this.legacyEmergencyEnabled) {
      throw new Error(
        `LEGACY EMERGENCY RESERVE DISCONNECTED · ${action}`
      );
    }

    if (this.externalPhysicalPrimary) {
      throw new Error(
        `LEGACY EMERGENCY RESERVE REFUSED WHILE PRIMARY ACTIVE · ${action}`
      );
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

    this._requireLegacyEmergencyReserve(
      'diagnostic resume'
    );

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

    /*
     * Held elapsed time remains lost.
     * If an alignment exists, Chief Engineer may explicitly
     * restore current civil within-day phase afterward.
     */
    this.civilRealignRecommended =
      !!this.alignment;

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

  _clockRawNow() {
    if (
      this.externalPhysicalPrimary &&
      this.getNaturalRecurrenceText
    ) {
      return this.externalClockRaw;
    }

    return BigInt(this.getRaw());
  }

  _activeRecurrenceText() {
    if (
      this.rawPerDayNumerator === null ||
      this.rawPerDayDenominator === null
    ) {
      return null;
    }

    return (
      `${this.rawPerDayNumerator}/` +
      `${this.rawPerDayDenominator}`
    );
  }

  /*
   * Historical / museum recurrence.
   *
   * Compatibility output only. Legacy recurrence machinery may
   * temporarily be unavailable. Its absence must never stop the
   * PRIMARY Europa-natural clock.
   */
  _historicalRecurrenceText() {
    try {
      const text =
        this.getRecurrenceText();

      return (
        text === null ||
        text === undefined
      )
        ? null
        : String(text);
    } catch (_) {
      return null;
    }
  }

  _clockRawDomain() {
    return (
      this.externalPhysicalPrimary &&
      this.getNaturalRecurrenceText
    )
      ? 'EUROPA_NATURAL_MODEL_RAW'
      : 'SELECTED_CORE_RAW';
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

    const rawNow =
      this._clockRawNow();

    if (rawNow === null) {
      return null;
    }

    const rawAtAlign =
      BigInt(
        this.alignment.clockAnchorRawPulse ??
        this.alignment.serverStampedRawPulse
      );

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

    const alignmentDayCount =
      this.alignment.targetDayCount !==
        undefined &&
      this.alignment.targetDayCount !==
        null
        ? BigInt(
            this.alignment.targetDayCount
          )
        : 0n;

    const total =
      alignmentDayCount *
        DAY_STATES +
      BigInt(
        this.alignment.targetDayPhase17
      ) +
      completedStates;

    return {
      sourceEpoch: epoch,

      /*
       * Preserve historical rawPulse semantics for downstream
       * consumers: this remains selected Core RAW.
       */
      rawPulse:
        BigInt(this.getRaw()),

      clockRawPulse:
        rawNow,

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
      rawPulse:
        after.rawPulse.toString(),

      clockRawPulse:
        after.clockRawPulse.toString(),

      clockRawDomain:
        this._clockRawDomain(),

      totalState: after.totalState.toString(),
      dayCount: after.dayCount.toString(),
      dayPhase17: after.dayPhase17.toString(),
      clockAuthority:
        this.alignment &&
        this.alignment.role ===
          'TEMPORARY_EXTERNAL_PHYSICAL_HOLDOVER'
          ? 'TEMPORARY_EXTERNAL_PHYSICAL_HOLDOVER · NATIVE_AUTHORITY_FALSE'
          : 'RECOVERED_JOVIAN_MINTAKA_SOL_SUN_RETURN',
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

  tick(nowNs = null) {
    if (this.status !== 'RUNNING') return 0n;

    /*
     * PRIMARY:
     * scheduler cadence is execution only.
     * No host-monotonic value is sampled or used for RAW pace.
     */
    if (this.externalPhysicalPrimary) {
      return 0n;
    }

    /*
     * No silent fallback.
     * Host-monotonic pacing exists only behind explicit
     * LEGACY emergency promotion.
     */
    this._requireLegacyEmergencyReserve(
      'host monotonic RAW pacing'
    );

    const now =
      BigInt(
        nowNs === null
          ? this.monotonicNowNs()
          : nowNs
      );
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

  advanceExternalPhysicalToTarget(
    targetRawPulse,
    targetClockRawPulse = null
  ) {
    if (!this.externalPhysicalPrimary) {
      throw new Error(
        'external physical RAW advance requires PRIMARY physical mode'
      );
    }

    if (this.status !== 'RUNNING') {
      throw new Error(
        `external physical RAW advance requires RUNNING Core20; current=${this.status}`
      );
    }

    const target =
      BigInt(targetRawPulse);

    const current =
      BigInt(this.getRaw());

    if (target < current) {
      throw new Error(
        `external physical RAW target regressed: target=${target} current=${current}`
      );
    }

    const naturalClockActive =
      this.getNaturalRecurrenceText !== null;

    let clockTarget = null;

    if (naturalClockActive) {
      if (
        targetClockRawPulse === null ||
        targetClockRawPulse === undefined
      ) {
        throw new Error(
          'natural clock target required while PRIMARY natural clock lane is active'
        );
      }

      clockTarget =
        BigInt(targetClockRawPulse);

      if (
        this.externalClockRaw !== null &&
        clockTarget < this.externalClockRaw
      ) {
        throw new Error(
          `natural clock RAW target regressed: target=${clockTarget} current=${this.externalClockRaw}`
        );
      }
    }

    const due =
      target - current;

    const before =
      this._clockCoordinate();

    /*
     * Legacy/internal Core coordinate remains alive.
     * It is no longer the defining civil-clock coordinate.
     */
    if (due > 0n) {
      this.advanceRaw(due);
    }

    /*
     * Advance the defining natural clock coordinate inside
     * the same transaction so before/after edge publication
     * observes the genuine natural RAW movement.
     */
    if (naturalClockActive) {
      this.externalClockRaw =
        clockTarget;
    }

    const after =
      this._clockCoordinate();

    if (before && after) {
      this._emitClockEdge(
        before,
        after
      );
    }

    return due;
  }

  installExternalPhysicalAlignment({
    anchorRawPulse,
    clockAnchorRawPulse = null,
    targetDayPhase17,
    targetDayCount = '0',
    externalPhysicalSourceEpoch,
  }) {
    if (!this.externalPhysicalPrimary) {
      throw new Error(
        'external physical alignment requires PRIMARY physical mode'
      );
    }

    if (this.status !== 'RUNNING') {
      throw new Error(
        `external physical alignment requires RUNNING Core20; current=${this.status}`
      );
    }

    const epoch =
      String(this.getSourceEpoch());

    const anchorRaw =
      BigInt(anchorRawPulse);

    const naturalClockActive =
      (
        this.externalPhysicalPrimary &&
        this.getNaturalRecurrenceText
      );

    const clockRawNow =
      this._clockRawNow();

    if (
      naturalClockActive &&
      clockRawNow === null
    ) {
      throw new Error(
        'natural clock RAW unavailable at external alignment'
      );
    }

    const clockAnchorRaw =
      naturalClockActive
        ? BigInt(clockAnchorRawPulse)
        : anchorRaw;

    const phase =
      BigInt(targetDayPhase17);

    const dayCount =
      BigInt(targetDayCount);

    const rawNow =
      BigInt(this.getRaw());

    if (anchorRaw > rawNow) {
      throw new Error(
        'external physical historical RAW anchor is ahead of current RAW'
      );
    }

    if (
      naturalClockActive &&
      clockAnchorRaw > clockRawNow
    ) {
      throw new Error(
        'natural clock historical RAW anchor is ahead of current natural RAW'
      );
    }

    if (
      phase < 0n ||
      phase >= DAY_STATES
    ) {
      throw new Error(
        'external physical DAY_PHASE17 anchor out of range'
      );
    }

    if (dayCount < 0n) {
      throw new Error(
        'external physical dayCount anchor cannot be negative'
      );
    }

    if (String(externalPhysicalSourceEpoch) !== String(process.env.A8_CORE20_EXTERNAL_PHYSICAL_EPOCH || '')) {
      throw new Error(
        'external physical SOURCE_EPOCH does not match configured source'
      );
    }

    if (this.alignment) {
      if (
        this.alignment.role ===
          'TEMPORARY_EXTERNAL_PHYSICAL_HOLDOVER' &&
        this.alignment.externalPhysicalSourceEpoch === String(process.env.A8_CORE20_EXTERNAL_PHYSICAL_EPOCH || '')
      ) {
        return {
          applied: false,
          alignment: { ...this.alignment },
          clock: this.clockSnapshot(),
        };
      }

      throw new Error(
        'refusing to overwrite existing alignment'
      );
    }

    this.alignmentSeq += 1;

    this.alignment = {
      source:
        `ARDUINO A TIMER2/D11 → ARDUINO B TIMER1/D5 → PI REPORTER · SOURCE_EPOCH ${process.env.A8_CORE20_EXTERNAL_PHYSICAL_EPOCH}`,

      role:
        process.env.A8_CORE20_EXTERNAL_JOVIAN_QUALIFIED === '1'
          ? 'QUALIFIED_EXTERNAL_PHYSICAL_PRIMARY'
          : 'TEMPORARY_EXTERNAL_PHYSICAL_HOLDOVER',

      sourceEpoch:
        epoch,

      serverStampedRawPulse:
        anchorRaw.toString(),

      /*
       * Defining civil-clock anchor.
       * serverStampedRawPulse above remains the historical
       * Core coordinate for legacy/internal provenance.
       */
      clockAnchorRawPulse:
        clockAnchorRaw.toString(),

      clockRawDomain:
        this._clockRawDomain(),

      targetDayCount:
        dayCount.toString(),

      targetDayPhase17:
        phase.toString(),

      externalPhysicalSourceEpoch:
        String(process.env.A8_CORE20_EXTERNAL_PHYSICAL_EPOCH),

      physicalAnchorRaw:
        String(process.env.A8_CORE20_EXTERNAL_PHYSICAL_ANCHOR),

      coreAnchorRaw:
        String(process.env.A8_CORE20_EXTERNAL_CORE_ANCHOR),

      civilCoreAnchorRaw:
        String(
          process.env.A8_CORE20_EXTERNAL_CIVIL_CORE_ANCHOR ||
          process.env.A8_CORE20_EXTERNAL_CORE_ANCHOR
        ),

      ratioCoreRawPerPhysicalEdge:
        `${process.env.A8_CORE20_EXTERNAL_RATIO_NUMERATOR}/${process.env.A8_CORE20_EXTERNAL_RATIO_DENOMINATOR}`,

      observedRatioLower:
        null,

      observedRatioUpper:
        null,

      inheritsPreviousCore20Pace:
        false,

      nativeAuthority:
        false,

      temporaryEmergency:
        process.env.A8_CORE20_EXTERNAL_JOVIAN_QUALIFIED !== '1',

      engineeredPhysicalSource:
        true,

      jovianQualified:
        process.env.A8_CORE20_EXTERNAL_JOVIAN_QUALIFIED === '1',

      rateBootstrapProvenance:
        process.env.A8_CORE20_EXTERNAL_RATE_PROVENANCE || null,

      phaseBootstrapProvenance:
        process.env.A8_CORE20_EXTERNAL_PHASE_PROVENANCE || null,

      usesUTC:
        false,

      usesHostTime:
        false,

      usesBrowserTime:
        false,

      usesNTP:
        false,

      usesGPS:
        false,

      ongoingUtcFeed:
        false,

      outageElapsedFromHostTime:
        false,

      definingPathTouched:
        true,

      sequence:
        this.alignmentSeq,
    };

    this.civilRealignRecommended =
      false;

    return {
      applied: true,
      alignment: { ...this.alignment },
      clock: this.clockSnapshot(),
    };
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

    this._requireLegacyEmergencyReserve(
      'momentary UTC alignment'
    );

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

    this.civilRealignRecommended =
      false;

    return {
      applied: true,
      alignment: { ...this.alignment },
      clock: this.clockSnapshot(),
    };
  }

  /*
   * CHIEF ENGINEER · MOMENTARY CIVIL RE-ALIGN
   *
   * After diagnostic HOLD / RESUME:
   * - preserve native integer dayCount
   * - sample UTC once for DAY_PHASE17
   * - no outage inference
   * - no ongoing UTC feed
   * - UTC cannot advance YEAR DAY
   */
  realignCivilPhase() {
    this._requireLegacyEmergencyReserve(
      'UTC civil re-alignment'
    );

    if (this.status !== 'RUNNING') {
      throw new Error(
        `civil re-align requires RUNNING Core20; current=${this.status}`
      );
    }

    if (!this.civilRealignRecommended) {
      throw new Error(
        'civil re-align is available only after diagnostic resume'
      );
    }

    const epoch =
      String(
        this.getSourceEpoch()
      );

    if (
      !this.alignment ||
      this.alignment.sourceEpoch !== epoch
    ) {
      throw new Error(
        'civil re-align requires existing same-epoch alignment'
      );
    }

    const before =
      this._clockCoordinate();

    if (!before) {
      throw new Error(
        'civil re-align could not obtain current Core20 coordinate'
      );
    }

    const preservedDayCount =
      before.dayCount;

    const utcMs =
      utcMillisecondsSinceMidnight(
        this.utcNow()
      );

    const targetPhase =
      (utcMs * DAY_STATES) /
      HOST_DAY_MS;

    const raw =
      BigInt(
        this.getRaw()
      );

    this.alignmentSeq += 1;

    this.alignment = {
      source:
        'SERVER UTC BRIDGE · EXTERNAL CONVENTIONAL REFERENCE · NON-DEFINING',

      role:
        'MOMENTARY_CIVIL_REALIGN_AFTER_DIAGNOSTIC_HOLD',

      sourceEpoch:
        epoch,

      serverStampedRawPulse:
        raw.toString(),

      targetDayCount:
        preservedDayCount.toString(),

      targetDayPhase17:
        targetPhase.toString(),

      utcMillisecondsSinceMidnight:
        utcMs.toString(),

      sequence:
        this.alignmentSeq,

      definingPathTouched:
        false,

      ongoingUtcFeed:
        false,

      preservesNativeDayCount:
        true,

      lostElapsedTimeRecovered:
        false,

      outageDayInference:
        false,

      utcMayAdvanceCalendarDay:
        false,
    };

    this.civilRealignRecommended =
      false;

    return {
      applied:
        true,

      preservedDayCount:
        preservedDayCount.toString(),

      alignment:
        { ...this.alignment },

      clock:
        this.clockSnapshot(),
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
        currentSelectedRawPulse:
          String(this.getRaw()),

        currentClockRawPulse:
          this._clockRawNow() === null
            ? null
            : this._clockRawNow().toString(),

        clockRawDomain:
          this._clockRawDomain(),

        recoveredRawPerSunReturn:
          this._historicalRecurrenceText(),

        naturalRawPerSunReturn:
          (
            this.externalPhysicalPrimary &&
            this.getNaturalRecurrenceText
          )
            ? this._activeRecurrenceText()
            : null,

        clockAuthority: 'CLOCK_AUTHORITY_UNESTABLISHED · ABSOLUTE_PHASE_UNALIGNED',
        runtime,
      };
    }

    const selectedRawNow =
      BigInt(this.getRaw());

    const selectedRawAtAlign =
      BigInt(
        this.alignment.serverStampedRawPulse
      );

    if (selectedRawNow < selectedRawAtAlign) {
      throw new Error(
        'selected Core RAW count regressed after alignment'
      );
    }

    const rawNow =
      this._clockRawNow();

    if (rawNow === null) {
      throw new Error(
        'defining clock RAW unavailable after alignment'
      );
    }

    const rawAtAlign =
      BigInt(
        this.alignment.clockAnchorRawPulse ??
        this.alignment.serverStampedRawPulse
      );

    if (rawNow < rawAtAlign) {
      throw new Error(
        'defining clock RAW count regressed after alignment'
      );
    }

    const elapsedSelectedRaw =
      selectedRawNow -
      selectedRawAtAlign;

    const elapsedRaw =
      rawNow -
      rawAtAlign;

    const exactNumerator =
      elapsedRaw *
      this.rawPerDayDenominator *
      DAY_STATES;
    const exactDenominator = this.rawPerDayNumerator;
    const completedStates = exactNumerator / exactDenominator;
    const substateNumerator = exactNumerator % exactDenominator;

    const alignmentDayCount =
      this.alignment.targetDayCount !==
        undefined &&
      this.alignment.targetDayCount !==
        null
        ? BigInt(
            this.alignment.targetDayCount
          )
        : 0n;

    const total =
      alignmentDayCount *
        DAY_STATES +
      BigInt(
        this.alignment.targetDayPhase17
      ) +
      completedStates;
    const dayCount = total / DAY_STATES;
    const phase = total % DAY_STATES;
    const fields = clockFields(phase);

    return {
      schema: 'A8-CORE20-SERVER-CLOCK-V1',
      status: 'CORE20_CLOCK_RUNNING',
      sourceEpoch: epoch,
      currentSelectedRawPulse:
        selectedRawNow.toString(),

      currentClockRawPulse:
        rawNow.toString(),

      clockRawDomain:
        this._clockRawDomain(),

      /*
       * Historical compatibility field.
       * Units remain selected Core RAW / Sun return.
       */
      recoveredRawPerSunReturn:
        this._historicalRecurrenceText(),

      /*
       * PRIMARY defining clock relationship.
       * Units are Europa natural/model RAW / Sun return.
       */
      naturalRawPerSunReturn:
        (
          this.externalPhysicalPrimary &&
          this.getNaturalRecurrenceText
        )
          ? this._activeRecurrenceText()
          : null,

      clockAuthority:
        this.alignment &&
        this.alignment.role ===
          'TEMPORARY_EXTERNAL_PHYSICAL_HOLDOVER'
          ? 'TEMPORARY_EXTERNAL_PHYSICAL_HOLDOVER · NATIVE_AUTHORITY_FALSE'
          : 'RECOVERED_JOVIAN_MINTAKA_SOL_SUN_RETURN',
      alignment: { ...this.alignment },
      /*
       * Historical field preserved in historical Core RAW.
       */
      elapsedRawSinceAlignment:
        elapsedSelectedRaw.toString(),

      /*
       * Defining clock elapsed coordinate.
       */
      elapsedClockRawSinceAlignment:
        elapsedRaw.toString(),

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
        source:
        this.alignment &&
        this.alignment.role ===
          'QUALIFIED_EXTERNAL_PHYSICAL_PRIMARY'
          ? 'EXTERNAL PHYSICAL RAW · RECOVERED NATURAL RATE · MERIDIAN-0 PHASE'
          : this.alignment &&
            this.alignment.role ===
              'TEMPORARY_EXTERNAL_PHYSICAL_HOLDOVER'
            ? 'EXTERNAL PHYSICAL RAW · TEMPORARY MAPPED HOLDOVER'
            : 'RECOVERED RAW / SUN-RETURN SCALE ONLY',
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
      pulseGeneratorOwner:
        this.externalPhysicalPrimary
          ? 'EXTERNAL_PHYSICAL_SOURCE'
          : this.legacyEmergencyEnabled
            ? 'LEGACY_HOST_MONOTONIC_RESERVE'
            : 'NONE_FAIL_CLOSED',

      pathStatus: {
        primary:
          this.externalPhysicalPrimary
            ? 'ACTIVE'
            : 'INACTIVE',

        ghost:
          'STANDBY_NOT_BUILT',

        legacyEmergency:
          this.legacyEmergencyEnabled
            ? 'ACTIVE_BREAK_GLASS'
            : 'STANDBY_DISCONNECTED',
      },

      externalPhysicalPrimary:
        this.externalPhysicalPrimary,

      legacyEmergencyEnabled:
        this.legacyEmergencyEnabled,

      browserPulseGenerator: false,
      browserVisibilityAffectsClock: false,
      browserPacketTimingAffectsClock: false,

      monotonicExecutionPace:
        this.externalPhysicalPrimary
          ? 'EXTERNAL_PHYSICAL_RAW_DELTA_ONLY'
          : this.legacyEmergencyEnabled
            ? 'LEGACY_SERVER_PROCESS_HRTIME_BREAK_GLASS'
            : 'NONE_FAIL_CLOSED',

      /*
       * Historical Core-domain recurrence retained for
       * museum / compatibility consumers.
       */
      recoveredRawPerSunReturn:
        this._historicalRecurrenceText(),

      /*
       * PRIMARY Europa-natural recurrence used by the
       * defining civil clock.
       */
      naturalRawPerSunReturn:
        (
          this.externalPhysicalPrimary &&
          this.getNaturalRecurrenceText &&
          this.rawPerDayNumerator !== null
        )
          ? `${this.rawPerDayNumerator}/${this.rawPerDayDenominator}`
          : null,

      recurrenceRawDomain:
        this._clockRawDomain(),

      alignmentEstablished:
        !!this.alignment,

      civilRealignRecommended:
        this.civilRealignRecommended,

      alignment:
        this.alignment
          ? { ...this.alignment }
          : null,
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
