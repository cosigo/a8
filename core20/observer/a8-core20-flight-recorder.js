'use strict';

/*
 * A8 CORE20 NATIVE FLIGHT RECORDER V1
 *
 * Diagnostic observer only.
 *
 * This module:
 *   - does not define or advance time
 *   - does not write Core20 plant state
 *   - does not use UTC / Date.now()
 *   - does not use browser time
 *   - does not infer elapsed outage time
 *
 * Events are ordered only by a native recorder sequence number.
 */

class A8Core20FlightRecorder {
  constructor(options = {}) {
    const requestedMax = Number(options.maxEvents ?? 512);

    this.schema = 'A8-CORE20-FLIGHT-RECORDER-V1';
    this.maxEvents =
      Number.isInteger(requestedMax) && requestedMax > 0
        ? requestedMax
        : 512;

    this.sequence = 0n;
    this.events = [];
  }

  _stringOrNull(value) {
    if (value === undefined || value === null) return null;
    if (typeof value === 'bigint') return value.toString();
    return String(value);
  }

  _numberOrNull(value) {
    if (value === undefined || value === null) return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  _extractState(state) {
    const s =
      state && typeof state === 'object'
        ? state
        : {};

    const clock =
      s.clock && typeof s.clock === 'object'
        ? s.clock
        : {};

    const calendar =
      s.calendar && typeof s.calendar === 'object'
        ? s.calendar
        : {};

    const runtime =
      s.runtime && typeof s.runtime === 'object'
        ? s.runtime
        : {};

    return {
      sourceEpoch:
        this._stringOrNull(
          s.sourceEpoch ??
          runtime.sourceEpoch ??
          clock.sourceEpoch ??
          calendar.sourceEpoch
        ),

      rawPulse:
        this._stringOrNull(
          s.rawPulse ??
          runtime.rawPulse ??
          clock.rawPulse
        ),

      dayPhase17:
        this._stringOrNull(
          s.dayPhase17 ??
          s.DAY_PHASE17 ??
          clock.dayPhase17 ??
          clock.DAY_PHASE17
        ),

      dayCount:
        this._stringOrNull(
          s.dayCount ??
          clock.dayCount ??
          calendar.coreDayCount
        ),

      clockStatus:
        this._stringOrNull(
          clock.status ??
          s.clockStatus
        ),

      calendarStatus:
        this._stringOrNull(
          calendar.status ??
          s.calendarStatus
        ),

      yearDay:
        this._numberOrNull(
          calendar.yearDay ??
          s.yearDay
        )
    };
  }

  record(type, message, state = null, details = null) {
    this.sequence += 1n;

    const event = {
      sequence: this.sequence.toString(),
      type: this._stringOrNull(type) || 'EVENT',
      message: this._stringOrNull(message) || '',
      ...this._extractState(state),
      details:
        details && typeof details === 'object'
          ? details
          : null
    };

    this.events.push(event);

    if (this.events.length > this.maxEvents) {
      this.events.splice(
        0,
        this.events.length - this.maxEvents
      );
    }

    return event;
  }

  clear() {
    this.events = [];

    return this.record(
      'RECORDER',
      'FLIGHT RECORDER CLEARED',
      null,
      { diagnosticOnly: true }
    );
  }

  snapshot(limit = 80) {
    let n = Number(limit);

    if (!Number.isInteger(n) || n < 1) n = 80;
    if (n > this.maxEvents) n = this.maxEvents;

    return {
      schema: this.schema,
      status: 'OBSERVATIONAL_ONLY',
      authority: 'NONE',
      count: this.events.length,
      maxEvents: this.maxEvents,
      latestSequence: this.sequence.toString(),

      usesUTC: false,
      usesHostTime: false,
      usesBrowserTime: false,
      usesLegacySeconds: false,
      outageInference: false,

      mayWritePlant: false,
      mayWriteClock: false,
      mayWriteCalendar: false,

      events:
        this.events
          .slice(-n)
          .reverse()
    };
  }
}

module.exports = {
  A8Core20FlightRecorder
};
