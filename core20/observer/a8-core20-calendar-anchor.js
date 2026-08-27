'use strict';

/*
 * AUSPICIOUS 8 · CORE20 SERVER-OWNED CALENDAR ANCHOR · RESTART PERSISTENCE
 *
 * Calendar authority:
 *   native integer YEAR DAY anchor
 *   + Core20 integer dayCount only
 *
 * Persistence role:
 *   preserve the last known integer calendar state across ordinary/debug
 *   Core20 process restarts.
 *
 * Persistence does NOT recover elapsed time while Core20 was down.
 * It never uses UTC, JPL, browser time, host time, legacy seconds,
 * orbital angle, or network cadence to increment/decrement YEAR DAY.
 */

const fs = require('fs');
const path = require('path');

const CALENDAR_DAYS = 365n;
const DEFAULT_CHECKPOINT_PATH =
  '/var/lib/a8-core20/calendar-checkpoint.json';

function wrapYearDay(zeroBased) {
  const q =
    ((zeroBased % CALENDAR_DAYS) + CALENDAR_DAYS) %
    CALENDAR_DAYS;

  return Number(q) + 1;
}

function validYearDay(value) {
  return (
    Number.isSafeInteger(value) &&
    value >= 1 &&
    value <= Number(CALENDAR_DAYS)
  );
}

class A8Core20CalendarAnchor {
  constructor({
    getClock,
    getYearAngle,
    checkpointPath = DEFAULT_CHECKPOINT_PATH,
  } = {}) {
    if (typeof getClock !== 'function') {
      throw new TypeError(
        'getClock function required'
      );
    }

    if (typeof getYearAngle !== 'function') {
      throw new TypeError(
        'getYearAngle function required'
      );
    }

    this.getClock = getClock;
    this.getYearAngle = getYearAngle;
    this.checkpointPath = checkpointPath;

    this.anchor = null;
    this.persistedCheckpoint = null;
    this.lastCheckpointDayCount = null;
    this.lastPersistenceError = null;
    this.lastWriteReason = null;
    this.restorationStatus =
      'CALENDAR_NOT_RESTORED_THIS_PROCESS';

    this._loadCheckpoint();
  }

  _clockInputs() {
    const clock =
      this.getClock() || {};

    if (
      clock.status !==
        'CORE20_CLOCK_RUNNING' ||
      clock.dayCount === undefined ||
      clock.dayCount === null
    ) {
      throw new Error(
        `Core20 counted civil day unavailable · ${
          clock.status ||
          'unknown clock state'
        }`
      );
    }

    const sourceEpoch =
      String(
        clock.sourceEpoch ?? ''
      );

    if (!sourceEpoch) {
      throw new Error(
        'Core20 clock source epoch unavailable'
      );
    }

    return {
      sourceEpoch,
      clock,
      coreDayCount:
        BigInt(clock.dayCount),
    };
  }

  _qualifiedManualAnchorInputs() {
    const q =
      this._clockInputs();

    const yearAngle =
      this.getYearAngle() || {};

    if (
      yearAngle.status !==
        'YEAR_ANGLE_RUNNING_FROM_RECOVERED_SOL' ||
      yearAngle.aligned !== true
    ) {
      throw new Error(
        `qualified Core20 absolute year orientation unavailable · ${
          yearAngle.status ||
          'unknown year-angle state'
        }`
      );
    }

    const yearEpoch =
      String(
        yearAngle.sourceEpoch ?? ''
      );

    if (
      !yearEpoch ||
      yearEpoch !== q.sourceEpoch
    ) {
      throw new Error(
        'Core20 year-angle / civil-clock source epoch mismatch'
      );
    }

    return {
      ...q,
      yearAngle,
    };
  }

  _yearAngleDiagnostic() {
    try {
      const y =
        this.getYearAngle() || {};

      if (
        y.status ===
          'YEAR_ANGLE_RUNNING_FROM_RECOVERED_SOL' &&
        y.aligned === true
      ) {
        return {
          phase27:
            y.phase27 === undefined ||
            y.phase27 === null
              ? null
              : String(y.phase27),

          phase27Octal:
            y.phase27Octal ||
            null,
        };
      }
    } catch (_) {
      /* read-only diagnostic only */
    }

    return {
      phase27: null,
      phase27Octal: null,
    };
  }

  _loadCheckpoint() {
    this.persistedCheckpoint = null;
    this.lastCheckpointDayCount = null;

    if (
      !this.checkpointPath ||
      !fs.existsSync(
        this.checkpointPath
      )
    ) {
      return;
    }

    try {
      const parsed =
        JSON.parse(
          fs.readFileSync(
            this.checkpointPath,
            'utf8'
          )
        );

      if (
        !parsed ||
        parsed.schema !==
          'A8-CORE20-CALENDAR-CHECKPOINT-V1'
      ) {
        throw new Error(
          'unsupported calendar checkpoint schema'
        );
      }

      const yearDay =
        Number(parsed.yearDay);

      if (!validYearDay(yearDay)) {
        throw new Error(
          'calendar checkpoint yearDay invalid'
        );
      }

      const sourceEpoch =
        String(
          parsed.sourceEpoch ?? ''
        );

      if (!sourceEpoch) {
        throw new Error(
          'calendar checkpoint sourceEpoch missing'
        );
      }

      const observedCoreDayCount =
        String(
          parsed.observedCoreDayCount ??
          ''
        );

      if (
        !/^-?\d+$/.test(
          observedCoreDayCount
        )
      ) {
        throw new Error(
          'calendar checkpoint Core20 dayCount invalid'
        );
      }

      this.persistedCheckpoint = {
        ...parsed,
        sourceEpoch,
        yearDay,
        observedCoreDayCount,
      };

      this.lastCheckpointDayCount =
        observedCoreDayCount;

      this.lastPersistenceError =
        null;
    } catch (err) {
      this.lastPersistenceError =
        `CHECKPOINT_LOAD_FAILED · ${
          err && err.message
            ? err.message
            : String(err)
        }`;
    }
  }

  _checkpointPayload({
    sourceEpoch,
    yearDay,
    observedCoreDayCount,
    observedDayPhase17 = null,
    observedRawPulse = null,
    reason,
  }) {
    return {
      schema:
        'A8-CORE20-CALENDAR-CHECKPOINT-V1',

      sourceEpoch:
        String(sourceEpoch),

      yearDay,

      yearDayOctal:
        `${yearDay.toString(8)}₈`,

      observedCoreDayCount:
        String(observedCoreDayCount),

      observedDayPhase17:
        observedDayPhase17 === null ||
        observedDayPhase17 === undefined
          ? null
          : String(observedDayPhase17),

      observedRawPulse:
        observedRawPulse === null ||
        observedRawPulse === undefined
          ? null
          : String(observedRawPulse),

      checkpointReason:
        String(reason),

      authority:
        'PERSISTED_NATIVE_A8_INTEGER_CALENDAR_STATE',

      runningAdvance:
        'CORE20_INTEGER_CIVIL_DAY_COUNT_ONLY',

      lostElapsedTimeRecovered:
        false,

      outageDayInference:
        false,

      usesUTC:
        false,

      usesJPL:
        false,

      usesYearAngle:
        false,

      usesBrowserTime:
        false,

      usesHostTime:
        false,

      usesLegacySeconds:
        false,

      usesNetworkCadence:
        false,
    };
  }

  _persistCheckpoint(payload) {
    if (!this.checkpointPath) {
      return false;
    }

    try {
      const dir =
        path.dirname(
          this.checkpointPath
        );

      fs.mkdirSync(
        dir,
        { recursive: true }
      );

      const tmp =
        `${this.checkpointPath}.tmp-${process.pid}`;

      const fd =
        fs.openSync(
          tmp,
          'w',
          0o600
        );

      try {
        fs.writeFileSync(
          fd,
          JSON.stringify(
            payload,
            null,
            2
          ) + '\n',
          'utf8'
        );

        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }

      fs.renameSync(
        tmp,
        this.checkpointPath
      );

      this.persistedCheckpoint = {
        ...payload,
      };

      this.lastCheckpointDayCount =
        String(
          payload.observedCoreDayCount
        );

      this.lastWriteReason =
        payload.checkpointReason;

      this.lastPersistenceError =
        null;

      return true;
    } catch (err) {
      this.lastPersistenceError =
        `CHECKPOINT_WRITE_FAILED · ${
          err && err.message
            ? err.message
            : String(err)
        }`;

      return false;
    }
  }

  _makeRestoredAnchor({
    sourceEpoch,
    yearDay,
    currentCoreDayCount,
  }) {
    const diag =
      this._yearAngleDiagnostic();

    return {
      schema:
        'A8-CORE20-CALENDAR-ANCHOR-V1',

      sourceEpoch:
        String(sourceEpoch),

      yearDay,

      yearDayOctal:
        `${yearDay.toString(8)}₈`,

      /*
       * A restarted Core20 clock establishes a new local dayCount origin.
       * The persisted integer YEAR DAY is therefore rebased to the current
       * Core20 dayCount. No elapsed outage time is inferred.
       */
      anchorCoreDayCount:
        String(currentCoreDayCount),

      yearAnglePhase27AtAnchor:
        diag.phase27,

      yearAnglePhase27OctalAtAnchor:
        diag.phase27Octal,

      authority:
        'RESTORED_NATIVE_A8_INTEGER_YEAR_DAY_CHECKPOINT',

      runningAdvance:
        'CORE20_INTEGER_CIVIL_DAY_COUNT_ONLY',

      restoredFromCheckpoint:
        true,

      lostElapsedTimeRecovered:
        false,

      outageDayInference:
        false,

      angleMayAdvanceCalendarDay:
        false,

      jplMayAdvanceCalendarDay:
        false,

      utcMayAdvanceCalendarDay:
        false,

      browserMayAdvanceCalendarDay:
        false,
    };
  }

  _tryRestoreFromEdge(edge) {
    if (
      this.anchor ||
      !this.persistedCheckpoint
    ) {
      return false;
    }

    const epoch =
      String(
        edge &&
        edge.sourceEpoch !== undefined
          ? edge.sourceEpoch
          : ''
      );

    if (!epoch) {
      return false;
    }

    if (
      this.persistedCheckpoint
        .sourceEpoch !== epoch
    ) {
      this.restorationStatus =
        'CALENDAR_REANCHOR_REQUIRED_SOURCE_EPOCH_MISMATCH';

      return false;
    }

    const dayCount =
      String(
        edge.dayCount ?? ''
      );

    if (!/^-?\d+$/.test(dayCount)) {
      return false;
    }

    const yearDay =
      Number(
        this.persistedCheckpoint
          .yearDay
      );

    this.anchor =
      this._makeRestoredAnchor({
        sourceEpoch: epoch,
        yearDay,
        currentCoreDayCount:
          dayCount,
      });

    this.restorationStatus =
      'CALENDAR_RESTORED_FROM_NATIVE_CHECKPOINT';

    const payload =
      this._checkpointPayload({
        sourceEpoch:
          epoch,

        yearDay,

        observedCoreDayCount:
          dayCount,

        observedDayPhase17:
          edge.dayPhase17 ?? null,

        observedRawPulse:
          edge.rawPulse ?? null,

        reason:
          'RESTART_REBASE_TO_CURRENT_CORE20_DAYCOUNT',
      });

    this._persistCheckpoint(
      payload
    );

    return true;
  }

  establish(yearDay) {
    if (!validYearDay(yearDay)) {
      throw new Error(
        'native A8 yearDay must be an integer 1..365'
      );
    }

    const q =
      this._qualifiedManualAnchorInputs();

    if (
      this.anchor &&
      this.anchor.sourceEpoch ===
        q.sourceEpoch
    ) {
      if (
        this.anchor.yearDay ===
        yearDay
      ) {
        return {
          applied: false,

          reason:
            'ALREADY_LOCKED_SAME_NATIVE_YEAR_DAY',

          anchor:
            { ...this.anchor },

          calendar:
            this.snapshot(),
        };
      }

      throw new Error(
        'native calendar anchor already locked for this source epoch; sourceEpoch change required before retarget'
      );
    }

    const diag = {
      phase27:
        q.yearAngle.phase27 === undefined ||
        q.yearAngle.phase27 === null
          ? null
          : String(
              q.yearAngle.phase27
            ),

      phase27Octal:
        q.yearAngle.phase27Octal ||
        null,
    };

    this.anchor = {
      schema:
        'A8-CORE20-CALENDAR-ANCHOR-V1',

      sourceEpoch:
        q.sourceEpoch,

      yearDay,

      yearDayOctal:
        `${yearDay.toString(8)}₈`,

      anchorCoreDayCount:
        q.coreDayCount.toString(),

      yearAnglePhase27AtAnchor:
        diag.phase27,

      yearAnglePhase27OctalAtAnchor:
        diag.phase27Octal,

      authority:
        'NATIVE_A8_INTEGER_YEAR_DAY_ONE_SHOT',

      runningAdvance:
        'CORE20_INTEGER_CIVIL_DAY_COUNT_ONLY',

      restoredFromCheckpoint:
        false,

      lostElapsedTimeRecovered:
        false,

      outageDayInference:
        false,

      angleMayAdvanceCalendarDay:
        false,

      jplMayAdvanceCalendarDay:
        false,

      utcMayAdvanceCalendarDay:
        false,

      browserMayAdvanceCalendarDay:
        false,
    };

    this.restorationStatus =
      'CALENDAR_NATIVE_ANCHOR_ESTABLISHED_THIS_PROCESS';

    const clock =
      q.clock || {};

    this._persistCheckpoint(
      this._checkpointPayload({
        sourceEpoch:
          q.sourceEpoch,

        yearDay,

        observedCoreDayCount:
          q.coreDayCount.toString(),

        observedDayPhase17:
          clock.dayPhase17 ?? null,

        observedRawPulse:
          clock.currentSelectedRawPulse ??
          null,

        reason:
          'NATIVE_YEAR_DAY_ANCHOR_ESTABLISHED',
      })
    );

    return {
      applied: true,

      anchor:
        { ...this.anchor },

      calendar:
        this.snapshot(),
    };
  }

  observeClockEdge(edge) {
    try {
      if (
        !edge ||
        edge.dayCount === undefined ||
        edge.sourceEpoch === undefined
      ) {
        return {
          observed: false,
          reason:
            'EDGE_MISSING_CALENDAR_FIELDS',
        };
      }

      this._tryRestoreFromEdge(
        edge
      );

      if (!this.anchor) {
        return {
          observed: false,
          reason:
            this.persistedCheckpoint
              ? this.restorationStatus
              : 'NO_NATIVE_CALENDAR_ANCHOR_OR_CHECKPOINT',
        };
      }

      const epoch =
        String(edge.sourceEpoch);

      if (
        this.anchor.sourceEpoch !==
        epoch
      ) {
        this.restorationStatus =
          'CALENDAR_REANCHOR_REQUIRED_SOURCE_EPOCH_MISMATCH';

        return {
          observed: false,
          reason:
            this.restorationStatus,
        };
      }

      const edgeDayCount =
        BigInt(edge.dayCount);

      const anchorCount =
        BigInt(
          this.anchor
            .anchorCoreDayCount
        );

      const delta =
        edgeDayCount -
        anchorCount;

      if (delta < 0n) {
        return {
          observed: false,
          reason:
            'CORE20_DAYCOUNT_REGRESSION',
        };
      }

      const yearDay =
        wrapYearDay(
          BigInt(
            this.anchor.yearDay - 1
          ) +
          delta
        );

      const edgeDayText =
        edgeDayCount.toString();

      if (
        this.lastCheckpointDayCount !==
        edgeDayText
      ) {
        this._persistCheckpoint(
          this._checkpointPayload({
            sourceEpoch:
              epoch,

            yearDay,

            observedCoreDayCount:
              edgeDayText,

            observedDayPhase17:
              edge.dayPhase17 ?? null,

            observedRawPulse:
              edge.rawPulse ?? null,

            reason:
              'CORE20_INTEGER_DAYCOUNT_CHANGED',
          })
        );
      }

      return {
        observed: true,
        yearDay,
        coreDayCount:
          edgeDayText,
      };
    } catch (err) {
      this.lastPersistenceError =
        `CLOCK_EDGE_OBSERVER_FAILED · ${
          err && err.message
            ? err.message
            : String(err)
        }`;

      return {
        observed: false,
        reason:
          this.lastPersistenceError,
      };
    }
  }

  _persistenceView() {
    const cp =
      this.persistedCheckpoint;

    return {
      schema:
        'A8-CORE20-CALENDAR-PERSISTENCE-V1',

      mode:
        'DEBUG_RESTART_LAST_KNOWN_INTEGER_DAY',

      checkpointLoaded:
        !!cp,

      checkpointSourceEpoch:
        cp
          ? cp.sourceEpoch
          : null,

      checkpointYearDay:
        cp
          ? cp.yearDay
          : null,

      checkpointYearDayOctal:
        cp
          ? cp.yearDayOctal
          : null,

      checkpointObservedCoreDayCount:
        cp
          ? cp.observedCoreDayCount
          : null,

      checkpointObservedDayPhase17:
        cp
          ? cp.observedDayPhase17
          : null,

      checkpointReason:
        cp
          ? cp.checkpointReason
          : null,

      restorationStatus:
        this.restorationStatus,

      lastWriteReason:
        this.lastWriteReason,

      lastPersistenceError:
        this.lastPersistenceError,

      lostElapsedTimeRecovered:
        false,

      outageDayInference:
        false,

      usesUTC:
        false,

      usesJPL:
        false,

      usesYearAngle:
        false,

      usesBrowserTime:
        false,

      usesHostTime:
        false,

      usesLegacySeconds:
        false,

      usesNetworkCadence:
        false,
    };
  }

  snapshot() {
    let q;

    try {
      q =
        this._clockInputs();
    } catch (err) {
      return {
        schema:
          'A8-CORE20-CALENDAR-V1',

        status:
          'CALENDAR_AWAITING_QUALIFIED_CORE20',

        anchored:
          false,

        error:
          err.message,

        authority:
          'CORE20_INTEGER_CIVIL_DAY_COUNT_ONLY_AFTER_NATIVE_ANCHOR',

        persistence:
          this._persistenceView(),

        angleMayAdvanceCalendarDay:
          false,

        jplMayAdvanceCalendarDay:
          false,

        utcMayAdvanceCalendarDay:
          false,

        browserMayAdvanceCalendarDay:
          false,
      };
    }

    if (!this.anchor) {
      let status =
        'CALENDAR_AWAITING_NATIVE_YEAR_DAY_ANCHOR';

      if (this.persistedCheckpoint) {
        status =
          this.persistedCheckpoint
            .sourceEpoch ===
              q.sourceEpoch
            ? 'CALENDAR_CHECKPOINT_READY_FOR_EDGE_RESTORE'
            : 'CALENDAR_REANCHOR_REQUIRED_SOURCE_EPOCH_MISMATCH';
      }

      return {
        schema:
          'A8-CORE20-CALENDAR-V1',

        status,

        anchored:
          false,

        sourceEpoch:
          q.sourceEpoch,

        coreDayCount:
          q.coreDayCount.toString(),

        authority:
          'CORE20_INTEGER_CIVIL_DAY_COUNT_ONLY_AFTER_NATIVE_ANCHOR',

        requiredOneShot:
          this.persistedCheckpoint
            ? null
            : 'NATIVE_A8_INTEGER_YEAR_DAY_1_TO_365',

        persistence:
          this._persistenceView(),

        angleMayAdvanceCalendarDay:
          false,

        jplMayAdvanceCalendarDay:
          false,

        utcMayAdvanceCalendarDay:
          false,

        browserMayAdvanceCalendarDay:
          false,
      };
    }

    if (
      this.anchor.sourceEpoch !==
      q.sourceEpoch
    ) {
      return {
        schema:
          'A8-CORE20-CALENDAR-V1',

        status:
          'CALENDAR_ANCHOR_STALE_SOURCE_EPOCH',

        anchored:
          false,

        sourceEpoch:
          q.sourceEpoch,

        previousAnchor:
          { ...this.anchor },

        coreDayCount:
          q.coreDayCount.toString(),

        authority:
          'CORE20_INTEGER_CIVIL_DAY_COUNT_ONLY_AFTER_NATIVE_ANCHOR',

        sourceEpochChangeForcesReanchor:
          true,

        persistence:
          this._persistenceView(),

        angleMayAdvanceCalendarDay:
          false,

        jplMayAdvanceCalendarDay:
          false,

        utcMayAdvanceCalendarDay:
          false,

        browserMayAdvanceCalendarDay:
          false,
      };
    }

    const anchorCount =
      BigInt(
        this.anchor
          .anchorCoreDayCount
      );

    const delta =
      q.coreDayCount -
      anchorCount;

    if (delta < 0n) {
      return {
        schema:
          'A8-CORE20-CALENDAR-V1',

        status:
          'CALENDAR_CORE20_DAYCOUNT_REGRESSION',

        anchored:
          false,

        sourceEpoch:
          q.sourceEpoch,

        anchor:
          { ...this.anchor },

        coreDayCount:
          q.coreDayCount.toString(),

        error:
          'Core20 civil day count regressed within one source epoch',

        persistence:
          this._persistenceView(),

        angleMayAdvanceCalendarDay:
          false,

        jplMayAdvanceCalendarDay:
          false,

        utcMayAdvanceCalendarDay:
          false,

        browserMayAdvanceCalendarDay:
          false,
      };
    }

    const yearDay =
      wrapYearDay(
        BigInt(
          this.anchor.yearDay - 1
        ) +
        delta
      );

    return {
      schema:
        'A8-CORE20-CALENDAR-V1',

      status:
        'CALENDAR_RUNNING_FROM_CORE20_COUNT',

      anchored:
        true,

      sourceEpoch:
        q.sourceEpoch,

      yearDay,

      yearDayOctal:
        `${yearDay.toString(8)}₈`,

      coreDayCount:
        q.coreDayCount.toString(),

      countedDaysSinceAnchor:
        delta.toString(),

      anchor:
        { ...this.anchor },

      authority:
        'NATIVE_A8_ANCHOR_PLUS_CORE20_INTEGER_CIVIL_DAY_COUNT',

      runningAdvance:
        'CORE20_INTEGER_CIVIL_DAY_COUNT_ONLY',

      yearAngleRole:
        'READ_ONLY_ORIENTATION_AND_SEASONAL_DIAGNOSTIC',

      persistence:
        this._persistenceView(),

      angleMayAdvanceCalendarDay:
        false,

      jplMayAdvanceCalendarDay:
        false,

      utcMayAdvanceCalendarDay:
        false,

      browserMayAdvanceCalendarDay:
        false,
    };
  }
}

module.exports = {
  A8Core20CalendarAnchor,
};
