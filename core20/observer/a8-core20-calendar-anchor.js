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

const COMMON_YEAR_DAYS = 365;
const LEAP_YEAR_DAYS = 366;
const FOUR_YEAR_CYCLE_DAYS = 1461n;

const LEAP_YEAR_CYCLE4 = 3;

/*
 * ONE-TIME CURRENT DEPLOYMENT MIGRATION
 *
 * Current A8 year is Cycle B / index 1.
 *
 * This aligns:
 *   current 2026 A8 year -> B -> 365
 *   next    2027 A8 year -> C -> 365
 *   next    2028 A8 year -> D -> 366
 *   next    2029 A8 year -> A -> 365
 *
 * After migration the native cycle advances only from
 * Core20 integer civil-day rollover.
 *
 * Gregorian / UTC / host time do not advance this register.
 */
const LEGACY_V1_MIGRATION_YEAR_CYCLE4 = 1;

const YEAR_CYCLE_LABELS =
  Object.freeze([
    'A',
    'B',
    'C',
    'D',
  ]);

const DEFAULT_CHECKPOINT_PATH =
  '/var/lib/a8-core20/calendar-checkpoint.json';

function validYearCycle4(value) {
  return (
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= 3
  );
}

function yearCycleLabel(yearCycle4) {
  if (!validYearCycle4(yearCycle4)) {
    throw new Error(
      `invalid native A8 yearCycle4 · ${yearCycle4}`
    );
  }

  return YEAR_CYCLE_LABELS[yearCycle4];
}

function yearLengthForCycle(yearCycle4) {
  if (!validYearCycle4(yearCycle4)) {
    throw new Error(
      `invalid native A8 yearCycle4 · ${yearCycle4}`
    );
  }

  return yearCycle4 === LEAP_YEAR_CYCLE4
    ? LEAP_YEAR_DAYS
    : COMMON_YEAR_DAYS;
}

function validYearDay(value, yearCycle4) {
  if (!validYearCycle4(yearCycle4)) {
    return false;
  }

  return (
    Number.isSafeInteger(value) &&
    value >= 1 &&
    value <=
      yearLengthForCycle(yearCycle4)
  );
}

function calendarRegionForYearDay(yearDay) {
  return yearDay <= 360
    ? 'STRUCTURED'
    : 'WILSON';
}

function wilsonDayForYearDay(yearDay) {
  return yearDay <= 360
    ? null
    : yearDay - 360;
}

function advanceCalendarPosition(
  anchorYearDay,
  anchorYearCycle4,
  delta
) {
  if (
    !validYearDay(
      anchorYearDay,
      anchorYearCycle4
    )
  ) {
    throw new Error(
      'native A8 anchor calendar position invalid'
    );
  }

  let remaining =
    BigInt(delta);

  if (remaining < 0n) {
    throw new Error(
      'native A8 calendar delta may not be negative'
    );
  }

  /*
   * 365 + 365 + 365 + 366 = 1461.
   *
   * The complete four-year register is periodic,
   * so complete 1461-day rotations may be removed
   * without changing year/day position.
   */
  remaining %=
    FOUR_YEAR_CYCLE_DAYS;

  let yearDay =
    BigInt(anchorYearDay);

  let yearCycle4 =
    anchorYearCycle4;

  while (remaining > 0n) {
    const yearLength =
      BigInt(
        yearLengthForCycle(
          yearCycle4
        )
      );

    const incrementsToYearEnd =
      yearLength - yearDay;

    if (
      remaining <=
      incrementsToYearEnd
    ) {
      yearDay +=
        remaining;

      remaining = 0n;
      break;
    }

    remaining -=
      incrementsToYearEnd + 1n;

    yearDay = 1n;

    yearCycle4 =
      (yearCycle4 + 1) % 4;
  }

  const numericYearDay =
    Number(yearDay);

  const yearLength =
    yearLengthForCycle(
      yearCycle4
    );

  return {
    yearDay:
      numericYearDay,

    yearCycle4,

    yearCycleLabel:
      yearCycleLabel(
        yearCycle4
      ),

    yearLength,

    isLeapYear:
      yearCycle4 ===
        LEAP_YEAR_CYCLE4,

    calendarRegion:
      calendarRegionForYearDay(
        numericYearDay
      ),

    wilsonDay:
      wilsonDayForYearDay(
        numericYearDay
      ),
  };
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
    this.checkpointMigration = null;
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
    this.checkpointMigration = null;

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

      const checkpointSchema =
        String(
          parsed &&
          parsed.schema
            ? parsed.schema
            : ''
        );

      const legacyV1 =
        checkpointSchema ===
          'A8-CORE20-CALENDAR-CHECKPOINT-V1';

      const nativeV2 =
        checkpointSchema ===
          'A8-CORE20-CALENDAR-CHECKPOINT-V2';

      if (
        !parsed ||
        (!legacyV1 && !nativeV2)
      ) {
        throw new Error(
          'unsupported calendar checkpoint schema'
        );
      }

      const yearCycle4 =
        legacyV1
          ? LEGACY_V1_MIGRATION_YEAR_CYCLE4
          : Number(
              parsed.yearCycle4
            );

      if (
        !validYearCycle4(
          yearCycle4
        )
      ) {
        throw new Error(
          'calendar checkpoint yearCycle4 invalid'
        );
      }

      const yearDay =
        Number(
          parsed.yearDay
        );

      if (
        !validYearDay(
          yearDay,
          yearCycle4
        )
      ) {
        throw new Error(
          'calendar checkpoint yearDay invalid for native year cycle'
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

      this.checkpointMigration =
        legacyV1
          ? 'LEGACY_V1_CURRENT_2026_A8_YEAR_SEEDED_CYCLE_B_INDEX_1'
          : (
              parsed.checkpointMigration ??
              null
            );

      this.persistedCheckpoint = {
        ...parsed,

        sourceEpoch,

        yearDay,

        yearCycle4,

        yearCycleLabel:
          yearCycleLabel(
            yearCycle4
          ),

        yearLength:
          yearLengthForCycle(
            yearCycle4
          ),

        isLeapYear:
          yearCycle4 ===
            LEAP_YEAR_CYCLE4,

        calendarRegion:
          calendarRegionForYearDay(
            yearDay
          ),

        wilsonDay:
          wilsonDayForYearDay(
            yearDay
          ),

        observedCoreDayCount,

        checkpointMigration:
          this.checkpointMigration,
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
    yearCycle4,
    observedCoreDayCount,
    observedDayPhase17 = null,
    observedRawPulse = null,
    checkpointMigration = null,
    reason,
  }) {
    if (
      !validYearDay(
        yearDay,
        yearCycle4
      )
    ) {
      throw new Error(
        'cannot persist invalid native A8 calendar position'
      );
    }

    const yearLength =
      yearLengthForCycle(
        yearCycle4
      );

    const migration =
      checkpointMigration ??
      this.checkpointMigration ??
      null;

    return {
      schema:
        'A8-CORE20-CALENDAR-CHECKPOINT-V2',

      sourceEpoch:
        String(sourceEpoch),

      yearDay,

      yearDayOctal:
        `${yearDay.toString(8)}₈`,

      yearCycle4,

      yearCycleLabel:
        yearCycleLabel(
          yearCycle4
        ),

      yearLength,

      isLeapYear:
        yearCycle4 ===
          LEAP_YEAR_CYCLE4,

      calendarRegion:
        calendarRegionForYearDay(
          yearDay
        ),

      wilsonDay:
        wilsonDayForYearDay(
          yearDay
        ),

      observedCoreDayCount:
        String(
          observedCoreDayCount
        ),

      observedDayPhase17:
        observedDayPhase17 === null ||
        observedDayPhase17 === undefined
          ? null
          : String(
              observedDayPhase17
            ),

      observedRawPulse:
        observedRawPulse === null ||
        observedRawPulse === undefined
          ? null
          : String(
              observedRawPulse
            ),

      checkpointMigration:
        migration,

      checkpointReason:
        String(reason),

      authority:
        'PERSISTED_NATIVE_A8_INTEGER_CALENDAR_STATE',

      runningAdvance:
        'CORE20_INTEGER_CIVIL_DAY_COUNT_ONLY',

      leapAdvance:
        'NATIVE_A8_YEAR_CYCLE4_ONLY_AT_YEAR_ROLLOVER',

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
    yearCycle4,
    currentCoreDayCount,
  }) {
    if (
      !validYearDay(
        yearDay,
        yearCycle4
      )
    ) {
      throw new Error(
        'restored native A8 calendar position invalid'
      );
    }

    const diag =
      this._yearAngleDiagnostic();

    return {
      schema:
        'A8-CORE20-CALENDAR-ANCHOR-V2',

      sourceEpoch:
        String(sourceEpoch),

      yearDay,

      yearDayOctal:
        `${yearDay.toString(8)}₈`,

      yearCycle4,

      yearCycleLabel:
        yearCycleLabel(
          yearCycle4
        ),

      yearLength:
        yearLengthForCycle(
          yearCycle4
        ),

      isLeapYear:
        yearCycle4 ===
          LEAP_YEAR_CYCLE4,

      /*
       * A restarted Core20 clock establishes a new local dayCount origin.
       * Persisted native calendar position is rebased to the current
       * Core20 dayCount. No elapsed outage time is inferred.
       */
      anchorCoreDayCount:
        String(
          currentCoreDayCount
        ),

      yearAnglePhase27AtAnchor:
        diag.phase27,

      yearAnglePhase27OctalAtAnchor:
        diag.phase27Octal,

      authority:
        'RESTORED_NATIVE_A8_INTEGER_CALENDAR_CHECKPOINT',

      runningAdvance:
        'CORE20_INTEGER_CIVIL_DAY_COUNT_ONLY',

      restoredFromCheckpoint:
        true,

      checkpointMigration:
        this.checkpointMigration,

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

    const yearCycle4 =
      Number(
        this.persistedCheckpoint
          .yearCycle4
      );

    this.anchor =
      this._makeRestoredAnchor({
        sourceEpoch:
          epoch,

        yearDay,

        yearCycle4,

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

        yearCycle4,

        observedCoreDayCount:
          dayCount,

        observedDayPhase17:
          edge.dayPhase17 ?? null,

        observedRawPulse:
          edge.rawPulse ?? null,

        checkpointMigration:
          this.checkpointMigration,

        reason:
          'RESTART_REBASE_TO_CURRENT_CORE20_DAYCOUNT',
      });

    this._persistCheckpoint(
      payload
    );

    return true;
  }

  establish(
    yearDay,
    yearCycle4 = null
  ) {
    let resolvedYearCycle4;

    if (
      yearCycle4 !== null &&
      yearCycle4 !== undefined
    ) {
      resolvedYearCycle4 =
        Number(yearCycle4);
    } else if (
      this.persistedCheckpoint &&
      validYearCycle4(
        Number(
          this.persistedCheckpoint
            .yearCycle4
        )
      )
    ) {
      resolvedYearCycle4 =
        Number(
          this.persistedCheckpoint
            .yearCycle4
        );
    } else {
      /*
       * Current deployment migration seed only.
       *
       * Existing callers historically supplied yearDay only.
       * The deployed 2026 A8 year is Cycle B / index 1.
       */
      resolvedYearCycle4 =
        LEGACY_V1_MIGRATION_YEAR_CYCLE4;

      this.checkpointMigration =
        'CURRENT_2026_A8_YEAR_SEEDED_CYCLE_B_INDEX_1';
    }

    if (
      !validYearCycle4(
        resolvedYearCycle4
      )
    ) {
      throw new Error(
        'native A8 yearCycle4 must be an integer 0..3'
      );
    }

    if (
      !validYearDay(
        yearDay,
        resolvedYearCycle4
      )
    ) {
      throw new Error(
        `native A8 yearDay must be an integer 1..${
          yearLengthForCycle(
            resolvedYearCycle4
          )
        } for yearCycle4 ${
          resolvedYearCycle4
        }`
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
          yearDay &&
        this.anchor.yearCycle4 ===
          resolvedYearCycle4
      ) {
        return {
          applied:
            false,

          reason:
            'ALREADY_LOCKED_SAME_NATIVE_CALENDAR_POSITION',

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
        'A8-CORE20-CALENDAR-ANCHOR-V2',

      sourceEpoch:
        q.sourceEpoch,

      yearDay,

      yearDayOctal:
        `${yearDay.toString(8)}₈`,

      yearCycle4:
        resolvedYearCycle4,

      yearCycleLabel:
        yearCycleLabel(
          resolvedYearCycle4
        ),

      yearLength:
        yearLengthForCycle(
          resolvedYearCycle4
        ),

      isLeapYear:
        resolvedYearCycle4 ===
          LEAP_YEAR_CYCLE4,

      anchorCoreDayCount:
        q.coreDayCount.toString(),

      yearAnglePhase27AtAnchor:
        diag.phase27,

      yearAnglePhase27OctalAtAnchor:
        diag.phase27Octal,

      authority:
        'NATIVE_A8_INTEGER_CALENDAR_POSITION_ONE_SHOT',

      runningAdvance:
        'CORE20_INTEGER_CIVIL_DAY_COUNT_ONLY',

      restoredFromCheckpoint:
        false,

      checkpointMigration:
        this.checkpointMigration,

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

        yearCycle4:
          resolvedYearCycle4,

        observedCoreDayCount:
          q.coreDayCount.toString(),

        observedDayPhase17:
          clock.dayPhase17 ??
          null,

        observedRawPulse:
          clock.currentSelectedRawPulse ??
          null,

        checkpointMigration:
          this.checkpointMigration,

        reason:
          'NATIVE_CALENDAR_POSITION_ANCHOR_ESTABLISHED',
      })
    );

    return {
      applied:
        true,

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
          observed:
            false,

          reason:
            'EDGE_MISSING_CALENDAR_FIELDS',
        };
      }

      this._tryRestoreFromEdge(
        edge
      );

      if (!this.anchor) {
        return {
          observed:
            false,

          reason:
            this.persistedCheckpoint
              ? this.restorationStatus
              : 'NO_NATIVE_CALENDAR_ANCHOR_OR_CHECKPOINT',
        };
      }

      const epoch =
        String(
          edge.sourceEpoch
        );

      if (
        this.anchor.sourceEpoch !==
          epoch
      ) {
        this.restorationStatus =
          'CALENDAR_REANCHOR_REQUIRED_SOURCE_EPOCH_MISMATCH';

        return {
          observed:
            false,

          reason:
            this.restorationStatus,
        };
      }

      const edgeDayCount =
        BigInt(
          edge.dayCount
        );

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
          observed:
            false,

          reason:
            'CORE20_DAYCOUNT_REGRESSION',
        };
      }

      const position =
        advanceCalendarPosition(
          this.anchor.yearDay,
          this.anchor.yearCycle4,
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

            yearDay:
              position.yearDay,

            yearCycle4:
              position.yearCycle4,

            observedCoreDayCount:
              edgeDayText,

            observedDayPhase17:
              edge.dayPhase17 ??
              null,

            observedRawPulse:
              edge.rawPulse ??
              null,

            checkpointMigration:
              this.checkpointMigration,

            reason:
              'CORE20_INTEGER_DAYCOUNT_CHANGED',
          })
        );
      }

      return {
        observed:
          true,

        yearDay:
          position.yearDay,

        yearCycle4:
          position.yearCycle4,

        yearCycleLabel:
          position.yearCycleLabel,

        yearLength:
          position.yearLength,

        isLeapYear:
          position.isLeapYear,

        calendarRegion:
          position.calendarRegion,

        wilsonDay:
          position.wilsonDay,

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
        observed:
          false,

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
        'A8-CORE20-CALENDAR-PERSISTENCE-V2',

      mode:
        'DEBUG_RESTART_LAST_KNOWN_INTEGER_CALENDAR_POSITION',

      checkpointLoaded:
        !!cp,

      checkpointStorageSchema:
        cp
          ? cp.schema
          : null,

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

      checkpointYearCycle4:
        cp
          ? cp.yearCycle4
          : null,

      checkpointYearCycleLabel:
        cp
          ? cp.yearCycleLabel
          : null,

      checkpointYearLength:
        cp
          ? cp.yearLength
          : null,

      checkpointIsLeapYear:
        cp
          ? cp.isLeapYear
          : null,

      checkpointCalendarRegion:
        cp
          ? cp.calendarRegion
          : null,

      checkpointWilsonDay:
        cp
          ? cp.wilsonDay
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

      checkpointMigration:
        cp
          ? cp.checkpointMigration
          : this.checkpointMigration,

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
          'A8-CORE20-CALENDAR-V2',

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
        'CALENDAR_AWAITING_NATIVE_CALENDAR_POSITION_ANCHOR';

      if (
        this.persistedCheckpoint
      ) {
        status =
          this.persistedCheckpoint
            .sourceEpoch ===
              q.sourceEpoch
            ? 'CALENDAR_CHECKPOINT_READY_FOR_EDGE_RESTORE'
            : 'CALENDAR_REANCHOR_REQUIRED_SOURCE_EPOCH_MISMATCH';
      }

      return {
        schema:
          'A8-CORE20-CALENDAR-V2',

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
            : 'NATIVE_A8_YEAR_DAY_PLUS_YEAR_CYCLE4',

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
          'A8-CORE20-CALENDAR-V2',

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
          'A8-CORE20-CALENDAR-V2',

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

    const position =
      advanceCalendarPosition(
        this.anchor.yearDay,
        this.anchor.yearCycle4,
        delta
      );

    return {
      schema:
        'A8-CORE20-CALENDAR-V2',

      status:
        'CALENDAR_RUNNING_FROM_CORE20_COUNT',

      anchored:
        true,

      sourceEpoch:
        q.sourceEpoch,

      yearDay:
        position.yearDay,

      yearDayOctal:
        `${position.yearDay.toString(8)}₈`,

      yearCycle4:
        position.yearCycle4,

      yearCycleLabel:
        position.yearCycleLabel,

      yearLength:
        position.yearLength,

      isLeapYear:
        position.isLeapYear,

      calendarRegion:
        position.calendarRegion,

      wilsonDay:
        position.wilsonDay,

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

      leapAdvance:
        'NATIVE_A8_YEAR_CYCLE4_ONLY_AT_YEAR_ROLLOVER',

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
