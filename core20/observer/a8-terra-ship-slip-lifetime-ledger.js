'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LEDGER_SCHEMA =
  'A8-TERRA-SHIP-SLIP-LIFETIME-LEDGER-V1';

const REPORT_SCHEMA =
  'A8-TERRA-SHIP-SLIP-A8-BIWEEKLY-REPORT-V1';

const DAY_STATES = 131072n;
const CHECKPOINT_STATES = 512n;
const REPORT_DAYS = 10n;

function bi(v, name, positive = false) {
  const s = String(v ?? '');

  if (!/^-?(0|[1-9][0-9]*)$/.test(s)) {
    throw new Error(`${name} must be integer`);
  }

  const n = BigInt(s);

  if (positive && n <= 0n) {
    throw new Error(`${name} must be >0`);
  }

  return n;
}

function abs(n) {
  return n < 0n ? -n : n;
}

function gcd(a, b) {
  a = abs(a);
  b = abs(b);

  while (b) {
    const t = a % b;
    a = b;
    b = t;
  }

  return a;
}

function rat(n, d) {
  n = BigInt(n);
  d = BigInt(d);

  if (!d) {
    throw new Error('zero denominator');
  }

  if (d < 0n) {
    n = -n;
    d = -d;
  }

  const g = gcd(n, d);

  return {
    n: n / g,
    d: d / g,
  };
}

function parseRat(x, name) {
  if (!x || typeof x !== 'object') {
    throw new Error(`${name} missing`);
  }

  return rat(
    bi(
      x.numerator,
      `${name}.numerator`
    ),
    bi(
      x.denominator,
      `${name}.denominator`,
      true
    )
  );
}

function add(a, b) {
  return rat(
    a.n * b.d + b.n * a.d,
    a.d * b.d
  );
}

function ser(a) {
  a = rat(a.n, a.d);

  return {
    numerator: String(a.n),
    denominator: String(a.d),
    text: `${a.n}/${a.d}`,
  };
}

function mkdir(d) {
  fs.mkdirSync(
    d,
    {
      recursive: true,
      mode: 0o750,
    }
  );
}

function writeText(file, text) {
  mkdir(path.dirname(file));

  const tmp =
    `${file}.tmp-${process.pid}`;

  const fd =
    fs.openSync(
      tmp,
      'wx',
      0o600
    );

  try {
    fs.writeFileSync(
      fd,
      text,
      'utf8'
    );

    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }

  fs.renameSync(
    tmp,
    file
  );
}

function writeJson(file, x) {
  writeText(
    file,
    JSON.stringify(
      x,
      null,
      2
    ) + '\n'
  );
}

function sha(file) {
  return crypto
    .createHash('sha256')
    .update(
      fs.readFileSync(file)
    )
    .digest('hex');
}

function clock(phase) {
  const p =
    bi(
      phase,
      'phase'
    );

  if (
    p < 0n ||
    p >= DAY_STATES
  ) {
    throw new Error(
      'phase out of range'
    );
  }

  const h = p / 4096n;
  const r = p % 4096n;
  const m = r / 64n;
  const s = r % 64n;

  const z =
    v =>
      String(v)
        .padStart(2, '0');

  return {
    decimal:
      `${z(h)}:${z(m)}:${z(s)}`,

    octal:
      `${z(h.toString(8))}:` +
      `${z(m.toString(8))}:` +
      `${z(s.toString(8))}₈`,
  };
}

function cal(c) {
  if (
    !c ||
    typeof c !== 'object'
  ) {
    throw new Error(
      'calendar required'
    );
  }

  const out = {
    yearCycle4:
      Number(
        bi(
          c.yearCycle4,
          'yearCycle4'
        )
      ),

    yearCycleLabel:
      String(
        c.yearCycleLabel ?? ''
      ),

    yearDay:
      Number(
        bi(
          c.yearDay,
          'yearDay',
          true
        )
      ),

    yearDayOctal:
      String(
        c.yearDayOctal ?? ''
      ),

    yearLength:
      Number(
        bi(
          c.yearLength,
          'yearLength',
          true
        )
      ),

    isLeapYear:
      c.isLeapYear === true,

    calendarRegion:
      c.calendarRegion ?? null,

    coreDayCount:
      c.coreDayCount == null
        ? null
        : String(
            c.coreDayCount
          ),
  };

  if (
    out.yearCycle4 < 0 ||
    out.yearCycle4 > 3 ||
    out.yearDay >
      out.yearLength
  ) {
    throw new Error(
      'calendar out of range'
    );
  }

  return out;
}

function sameDate(a, b) {
  return (
    a.yearCycle4 ===
      b.yearCycle4 &&
    a.yearDay ===
      b.yearDay
  );
}

function nextDate(a, b) {
  return (
    a.yearDay <
      a.yearLength
      ? (
          b.yearCycle4 ===
            a.yearCycle4 &&
          b.yearDay ===
            a.yearDay + 1
        )
      : (
          b.yearCycle4 ===
            (
              (
                a.yearCycle4 +
                1
              ) % 4
            ) &&
          b.yearDay === 1
        )
  );
}

class TerraShipSlipLifetimeLedger {
  constructor({
    checkpointDirectory,
    sourceRunGeneration,
    inceptionPath,
  } = {}) {
    if (
      !checkpointDirectory ||
      !inceptionPath
    ) {
      throw new Error(
        'ledger paths required'
      );
    }

    this.dir =
      checkpointDirectory;

    this.file =
      path.join(
        this.dir,
        'lifetime-ledger.json'
      );

    this.reports =
      path.join(
        this.dir,
        'a8-biweekly'
      );

    this.segments =
      path.join(
        this.dir,
        'segments'
      );

    mkdir(this.dir);
    mkdir(this.reports);
    mkdir(this.segments);

    this.run =
      String(
        bi(
          sourceRunGeneration,
          'sourceRunGeneration',
          true
        )
      );

    this.inc =
      JSON.parse(
        fs.readFileSync(
          inceptionPath,
          'utf8'
        )
      );

    if (
      this.inc.status !==
        'INCEPTION_FULLY_SEALED'
    ) {
      throw new Error(
        'inception not fully sealed'
      );
    }

    const n =
      this.inc
        .nativeA8EventReference ||
      {};

    this.birth = {
      sourceRunGeneration:
        String(
          this.inc
            .sourceRunGeneration
        ),

      sourceEpoch:
        String(
          this.inc.sourceEpoch
        ),

      rawContinuityIdentity:
        String(
          this.inc
            .rawContinuityIdentity
        ),

      originRawPulse:
        String(
          this.inc.originRawPulse
        ),

      a8: {
        yearCycle4:
          Number(n.yearCycle4),

        yearCycleLabel:
          String(
            n.yearCycleLabel
          ),

        yearDay:
          Number(n.yearDay),

        yearDayOctal:
          String(
            n.yearDayOctal
          ),

        dayPhase17:
          String(
            n.dayPhase17
          ),

        dayPhase17Octal:
          String(
            n.dayPhase17Octal
          ),

        meridian0Decimal:
          String(
            n.clockDecimal
          ),

        meridian0Octal:
          String(
            n.clockOctal
          ),
      },
    };

    this.carry =
      rat(0, 1);

    this.total =
      rat(0, 1);

    /*
     * Gate-4C remains process-local and unchanged.
     *
     * These are lifetime downstream carries around Gate-4C:
     * prior completed rotations + current-run Gate-4C rotations.
     * No missing rotation is fabricated.
     */
    this.rotationCarry = 0n;

    this.completedSlipCarry =
      rat(0, 1);

    this.lifetimeCompletedRotations =
      0n;

    this.lifetimeCompletedSlip =
      rat(0, 1);

    this.segment = null;

    this.days = 0n;

    this.lastDate = {
      yearCycle4:
        this.birth.a8
          .yearCycle4,

      yearCycleLabel:
        this.birth.a8
          .yearCycleLabel,

      yearDay:
        this.birth.a8
          .yearDay,

      yearDayOctal:
        this.birth.a8
          .yearDayOctal,

      yearLength: null,
      isLeapYear: null,
      calendarRegion: null,
      coreDayCount: null,
    };

    this.reportSeq = 0n;
    this.prevReportHash = null;
    this.gapCount = 0;
    this.lastBucket = null;
    this.lastWriteReason =
      'UNWRITTEN';

    this._restore();
    this._recoverReportTail();
  }

  _boundary() {
    return {
      changesAuthority: false,
      usesUTC: false,
      usesHostTime: false,
      usesLegacyTime: false,
      usesFrequencyHz: false,
      usesExpectedPeriod: false,
      usesExternalAstronomyConstant:
        false,
      infersOutageElapsedTime:
        false,
      manufacturesRawContinuity:
        false,
    };
  }

  _restore() {
    if (
      !fs.existsSync(
        this.file
      )
    ) {
      if (
        this.run !==
          this.birth
            .sourceRunGeneration
      ) {
        throw new Error(
          'lifetime ledger missing after birth run'
        );
      }

      return;
    }

    const x =
      JSON.parse(
        fs.readFileSync(
          this.file,
          'utf8'
        )
      );

    if (
      x.schema !==
        LEDGER_SCHEMA
    ) {
      throw new Error(
        'ledger schema mismatch'
      );
    }

    if (
      !x.birth ||
      x.birth
        .rawContinuityIdentity !==
        this.birth
          .rawContinuityIdentity
    ) {
      throw new Error(
        'birth mismatch'
      );
    }

    this.days =
      bi(
        x.observedCalendarDaysSinceBirth ??
          0,
        'days'
      );

    this.lastDate =
      x.lastObservedCalendarDate ||
      this.lastDate;

    this.reportSeq =
      bi(
        x.reportSequence ?? 0,
        'reportSequence'
      );

    this.prevReportHash =
      x.previousReportSha256 ||
      null;

    this.gapCount =
      Number(
        x.unobservedGapCount ||
        0
      );

    const saved =
      parseRat(
        x.lifetimeTerraShipSlip512,
        'saved total'
      );

    const savedCompletedRotations =
      bi(
        x.lifetimeCompletedRotations ??
          0,
        'saved completed rotations'
      );

    if (
      savedCompletedRotations < 0n
    ) {
      throw new Error(
        'saved completed rotations must be non-negative'
      );
    }

    const savedCompletedSlip =
      parseRat(
        x.lifetimeCompletedTerraShipSlip512 ??
          {
            numerator: '0',
            denominator: '1',
          },
        'saved completed slip'
      );

    const seg =
      x.currentSegment ||
      null;

    if (
      seg &&
      String(
        seg.sourceRunGeneration
      ) === this.run
    ) {
      this.carry =
        parseRat(
          seg
            .carryAtRunStartTerraShipSlip512,
          'saved carry'
        );

      this.rotationCarry =
        bi(
          seg.completedRotationCarryAtRunStart ??
            0,
          'saved completed-rotation carry'
        );

      this.completedSlipCarry =
        parseRat(
          seg.completedTerraShipSlipCarryAtRunStart512 ??
            {
              numerator: '0',
              denominator: '1',
            },
          'saved completed-slip carry'
        );

      this.total = saved;

      this.lifetimeCompletedRotations =
        savedCompletedRotations;

      this.lifetimeCompletedSlip =
        savedCompletedSlip;

      this.segment = seg;

      this.lastBucket =
        x.lastNativeCheckpointBucket ==
          null
          ? null
          : String(
              x.lastNativeCheckpointBucket
            );
    } else {
      this.carry = saved;
      this.total = saved;

      this.rotationCarry =
        savedCompletedRotations;

      this.completedSlipCarry =
        savedCompletedSlip;

      this.lifetimeCompletedRotations =
        savedCompletedRotations;

      this.lifetimeCompletedSlip =
        savedCompletedSlip;

      if (
        seg &&
        seg.cleanShutdown !== true
      ) {
        this.gapCount += 1;
      }
    }
  }

  _recoverReportTail() {
    const names =
      fs
        .readdirSync(
          this.reports
        )
        .filter(
          n =>
            /^report-[0-9]{6}\.json$/
              .test(n)
        )
        .sort();

    if (!names.length) {
      return;
    }

    const file =
      path.join(
        this.reports,
        names[
          names.length - 1
        ]
      );

    const r =
      JSON.parse(
        fs.readFileSync(
          file,
          'utf8'
        )
      );

    if (
      r.schema !==
        REPORT_SCHEMA
    ) {
      throw new Error(
        'report schema mismatch'
      );
    }

    const seq =
      bi(
        r.reportSequence,
        'reportSequence',
        true
      );

    if (
      seq >
      this.reportSeq
    ) {
      this.reportSeq = seq;
      this.prevReportHash =
        sha(file);

      this.days =
        bi(
          r.cadence
            .observedCalendarDaysSinceBirth,
          'report days'
        );

      this.lastDate =
        r.a8Stamp.calendar;
    }

    const side =
      `${file}.sha256`;

    if (
      !fs.existsSync(side)
    ) {
      writeText(
        side,
        `${sha(file)}  ` +
        `${path.basename(file)}\n`
      );
    }
  }

  _payload() {
    return {
      schema:
        LEDGER_SCHEMA,

      status:
        this.segment
          ? 'LIFETIME_ACCUMULATING'
          : 'LIFETIME_AWAITING_CURRENT_SEGMENT',

      role:
        'PERSISTENT_DOWNSTREAM_TERRA_SHIP_SLIP_LIFETIME_LEDGER',

      birth:
        this.birth,

      sourceRunGeneration:
        this.run,

      carryAtRunStartTerraShipSlip512:
        ser(this.carry),

      currentSegment:
        this.segment,

      lifetimeTerraShipSlip512:
        ser(this.total),

      completedRotationCarryAtRunStart:
        String(this.rotationCarry),

      completedTerraShipSlipCarryAtRunStart512:
        ser(this.completedSlipCarry),

      lifetimeCompletedRotations:
        String(
          this.lifetimeCompletedRotations
        ),

      lifetimeCompletedTerraShipSlip512:
        ser(
          this.lifetimeCompletedSlip
        ),

      observedCalendarDaysSinceBirth:
        String(this.days),

      reportCadenceDays:
        String(REPORT_DAYS),

      reportSequence:
        String(this.reportSeq),

      previousReportSha256:
        this.prevReportHash,

      lastObservedCalendarDate:
        this.lastDate,

      unobservedGapEver:
        this.gapCount > 0,

      unobservedGapCount:
        this.gapCount,

      nativeCheckpointStates:
        String(
          CHECKPOINT_STATES
        ),

      lastNativeCheckpointBucket:
        this.lastBucket,

      lastWriteReason:
        this.lastWriteReason,

      authorityBoundary:
        this._boundary(),
    };
  }

  _write(reason) {
    this.lastWriteReason =
      reason;

    writeJson(
      this.file,
      this._payload()
    );
  }

  _sealSegment() {
    if (!this.segment) {
      return;
    }

    writeJson(
      path.join(
        this.segments,
        'run-' +
        this.segment
          .rawContinuityIdentity
          .replace(
            ':',
            '-epoch-'
          ) +
        '.json'
      ),
      {
        schema:
          'A8-TERRA-SHIP-SLIP-OBSERVED-SEGMENT-V1',

        birth:
          this.birth,

        segment:
          this.segment,

        lifetimeTerraShipSlip512:
          ser(this.total),

        lifetimeCompletedRotations:
          String(
            this.lifetimeCompletedRotations
          ),

        lifetimeCompletedTerraShipSlip512:
          ser(
            this.lifetimeCompletedSlip
          ),

        unobservedGapEver:
          this.gapCount > 0,

        unobservedGapCount:
          this.gapCount,

        authorityBoundary:
          this._boundary(),
      }
    );
  }

  _observeCompletedAccumulator(
    accumulator
  ) {
    if (!accumulator) {
      return;
    }

    if (
      accumulator.schema !==
        'A8-TERRA-SHIP-SLIP-ACCUMULATOR-V1'
    ) {
      throw new Error(
        'unexpected Gate-4C accumulator schema'
      );
    }

    const rotations =
      bi(
        accumulator.accumulatedRotations,
        'Gate-4C accumulated rotations'
      );

    if (rotations < 0n) {
      throw new Error(
        'Gate-4C accumulated rotations moved negative'
      );
    }

    const slip =
      parseRat(
        accumulator
          .accumulatedTerraShipSlip512,
        'Gate-4C accumulated slip'
      );

    if (
      this.segment &&
      this.segment
        .segmentCompletedRotations !==
        undefined &&
      rotations <
        bi(
          this.segment
            .segmentCompletedRotations,
          'prior segment completed rotations'
        )
    ) {
      throw new Error(
        'Gate-4C completed rotations regressed within current run'
      );
    }

    this.lifetimeCompletedRotations =
      this.rotationCarry +
      rotations;

    this.lifetimeCompletedSlip =
      add(
        this.completedSlipCarry,
        slip
      );

    if (this.segment) {
      this.segment
        .segmentCompletedRotations =
          String(rotations);

      this.segment
        .segmentCompletedTerraShipSlip512 =
          ser(slip);

      this.segment
        .lifetimeCompletedRotations =
          String(
            this.lifetimeCompletedRotations
          );

      this.segment
        .lifetimeCompletedTerraShipSlip512 =
          ser(
            this.lifetimeCompletedSlip
          );
    }
  }

  _calendar(c) {
    const now = cal(c);

    if (
      this.lastDate
        .yearLength == null
    ) {
      if (
        !sameDate(
          this.lastDate,
          now
        )
      ) {
        throw new Error(
          'first calendar observation differs from birth date'
        );
      }

      this.lastDate = now;
      return false;
    }

    if (
      sameDate(
        this.lastDate,
        now
      )
    ) {
      this.lastDate = now;
      return false;
    }

    if (
      !nextDate(
        this.lastDate,
        now
      )
    ) {
      this.gapCount += 1;
      this.lastDate = now;
      return false;
    }

    this.days += 1n;
    this.lastDate = now;

    return true;
  }

  _report(
    edge,
    d,
    calendar,
    accumulator
  ) {
    this.reportSeq += 1n;

    const seq =
      String(
        this.reportSeq
      ).padStart(
        6,
        '0'
      );

    const file =
      path.join(
        this.reports,
        `report-${seq}.json`
      );

    const stamp =
      cal(calendar);

    const clk =
      clock(
        edge.dayPhase17
      );

    const r = {
      schema:
        REPORT_SCHEMA,

      role:
        'IMMUTABLE_NATIVE_A8_ARCHAEOLOGY_REPORT',

      reportSequence:
        String(
          this.reportSeq
        ),

      cadence: {
        name:
          'A8_BIWEEKLY',

        daysPerReport:
          String(
            REPORT_DAYS
          ),

        observedCalendarDaysSinceBirth:
          String(
            this.days
          ),

        usesCron: false,
        usesUTC: false,
        usesHostTime: false,
      },

      a8Stamp: {
        calendar:
          stamp,

        dayPhase17:
          String(
            edge.dayPhase17
          ),

        dayPhase17Octal:
          `${bi(
            edge.dayPhase17,
            'phase'
          ).toString(8)}₈`,

        meridian0Decimal:
          clk.decimal,

        meridian0Octal:
          clk.octal,
      },

      birth:
        this.birth,

      source: {
        sourceRunGeneration:
          this.run,

        sourceEpoch:
          String(
            d.sourceEpoch
          ),

        rawContinuityIdentity:
          String(
            d.rawContinuityIdentity
          ),

        originRawPulse:
          String(
            d.anchorRawPulse
          ),

        currentRawPulse:
          String(
            d.selectedRawPulse
          ),
      },

      lifetimeTerraShipSlip512:
        ser(this.total),

      currentSegmentTerraShipSlip512:
        this.segment
          ? this.segment
              .segmentTerraShipSlip512
          : null,

      completedRotationAccumulator: {
        currentRun:
          accumulator ||
          null,

        lifetimeCompletedRotations:
          String(
            this.lifetimeCompletedRotations
          ),

        lifetimeCompletedTerraShipSlip512:
          ser(
            this.lifetimeCompletedSlip
          ),
      },

      unobservedGapEver:
        this.gapCount > 0,

      unobservedGapCount:
        this.gapCount,

      previousReportSha256:
        this.prevReportHash,

      authorityBoundary:
        this._boundary(),
    };

    writeJson(
      file,
      r
    );

    const h =
      sha(file);

    writeText(
      `${file}.sha256`,
      `${h}  ` +
      `${path.basename(file)}\n`
    );

    this.prevReportHash = h;

    return {
      file,
      sha256: h,
    };
  }

  observe({
    edge,
    discrepancy,
    calendar,
    accumulator = null,
    reason = 'CLOCK_EDGE',
    forceWrite = false,
    cleanShutdown = false,
  } = {}) {
    if (
      !edge ||
      !discrepancy ||
      discrepancy.ready !== true
    ) {
      throw new Error(
        'ready native observation required'
      );
    }

    if (
      String(
        discrepancy
          .sourceRunGeneration
      ) !== this.run
    ) {
      throw new Error(
        'run mismatch'
      );
    }

    const id =
      String(
        discrepancy
          .rawContinuityIdentity ||
        ''
      );

    if (
      !id.startsWith(
        `${this.run}:`
      )
    ) {
      throw new Error(
        'continuity identity mismatch'
      );
    }

    /*
     * NATIVE A8 CALENDAR FIREWALL
     *
     * null means no qualified native A8 calendar observation
     * is available for this edge.
     *
     * Slip persistence MUST continue from native RAW /
     * run:epoch / recovered relationships.
     *
     * A non-null calendar MUST satisfy the native A8
     * calendar contract BEFORE any ledger state mutates.
     *
     * No fallback date is synthesized here.
     */
    const hasNativeCalendar =
      calendar !== null &&
      calendar !== undefined;

    if (hasNativeCalendar) {
      cal(calendar);
    }

    const slip =
      parseRat(
        discrepancy
          .accumulated &&
        discrepancy
          .accumulated
          .unwrappedDiscrepancyAngle512,
        'segment slip'
      );

    if (!this.segment) {
      this.segment = {
        sourceRunGeneration:
          this.run,

        sourceEpoch:
          String(
            discrepancy
              .sourceEpoch
          ),

        rawContinuityIdentity:
          id,

        originRawPulse:
          String(
            discrepancy
              .anchorRawPulse
          ),

        currentRawPulse:
          String(
            discrepancy
              .selectedRawPulse
          ),

        carryAtRunStartTerraShipSlip512:
          ser(this.carry),

        completedRotationCarryAtRunStart:
          String(this.rotationCarry),

        completedTerraShipSlipCarryAtRunStart512:
          ser(this.completedSlipCarry),

        segmentTerraShipSlip512:
          ser(slip),

        lifetimeTerraShipSlip512:
          ser(
            add(
              this.carry,
              slip
            )
          ),

        firstObservedTotalState:
          String(
            edge.totalState
          ),

        lastObservedTotalState:
          String(
            edge.totalState
          ),

        lastObservedDayCount:
          String(
            edge.dayCount
          ),

        lastObservedDayPhase17:
          String(
            edge.dayPhase17
          ),

        cleanShutdown:
          cleanShutdown === true,

        lastObservationReason:
          reason,
      };

      forceWrite = true;
    } else if (
      this.segment
        .rawContinuityIdentity !==
      id
    ) {
      this.carry =
        this.total;

      this.gapCount += 1;

      this._sealSegment();

      this.segment = {
        sourceRunGeneration:
          this.run,

        sourceEpoch:
          String(
            discrepancy
              .sourceEpoch
          ),

        rawContinuityIdentity:
          id,

        originRawPulse:
          String(
            discrepancy
              .anchorRawPulse
          ),

        currentRawPulse:
          String(
            discrepancy
              .selectedRawPulse
          ),

        carryAtRunStartTerraShipSlip512:
          ser(this.carry),

        completedRotationCarryAtRunStart:
          String(this.rotationCarry),

        completedTerraShipSlipCarryAtRunStart512:
          ser(this.completedSlipCarry),

        segmentTerraShipSlip512:
          ser(slip),

        lifetimeTerraShipSlip512:
          ser(
            add(
              this.carry,
              slip
            )
          ),

        firstObservedTotalState:
          String(
            edge.totalState
          ),

        lastObservedTotalState:
          String(
            edge.totalState
          ),

        lastObservedDayCount:
          String(
            edge.dayCount
          ),

        lastObservedDayPhase17:
          String(
            edge.dayPhase17
          ),

        cleanShutdown:
          cleanShutdown === true,

        lastObservationReason:
          'SOURCE_IDENTITY_CHANGE',
      };

      reason =
        'SOURCE_IDENTITY_CHANGE';

      forceWrite = true;
    }

    this.total =
      add(
        this.carry,
        slip
      );

    this._observeCompletedAccumulator(
      accumulator
    );

    Object.assign(
      this.segment,
      {
        currentRawPulse:
          String(
            discrepancy
              .selectedRawPulse
          ),

        segmentTerraShipSlip512:
          ser(slip),

        lifetimeTerraShipSlip512:
          ser(this.total),

        lastObservedTotalState:
          String(
            edge.totalState
          ),

        lastObservedDayCount:
          String(
            edge.dayCount
          ),

        lastObservedDayPhase17:
          String(
            edge.dayPhase17
          ),

        cleanShutdown:
          cleanShutdown === true,

        lastObservationReason:
          reason,
      }
    );

    const dayAdvanced =
      hasNativeCalendar
        ? this._calendar(
            calendar
          )
        : false;

    let report = null;

    if (
      dayAdvanced &&
      this.days > 0n &&
      this.days %
        REPORT_DAYS ===
        0n
    ) {
      report =
        this._report(
          edge,
          discrepancy,
          calendar,
          accumulator
        );

      reason =
        'A8_BIWEEKLY_REPORT';

      forceWrite = true;
    }

    const bucket =
      String(
        bi(
          edge.totalState,
          'totalState'
        ) /
        CHECKPOINT_STATES
      );

    const due =
      bucket !==
      this.lastBucket;

    this.lastBucket =
      bucket;

    if (
      forceWrite ||
      due ||
      dayAdvanced
    ) {
      this._write(
        reason
      );
    }

    if (
      cleanShutdown
    ) {
      this._sealSegment();
      this._write(
        'CLEAN_SHUTDOWN'
      );
    }

    return {
      ...this.snapshot(),
      report,
    };
  }

  snapshot() {
    return {
      ...this._payload(),

      persistence: {
        ledgerPath:
          this.file,

        segmentDirectory:
          this.segments,

        reportDirectory:
          this.reports,

        checkpointLoaded:
          fs.existsSync(
            this.file
          ),
      },
    };
  }
}

module.exports = {
  LEDGER_SCHEMA,
  REPORT_SCHEMA,
  DAY_STATES,
  CHECKPOINT_STATES,
  REPORT_DAYS,
  TerraShipSlipLifetimeLedger,
};
