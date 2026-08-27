'use strict';

/*
 * AUSPICIOUS 8 · POST-SEAL HARDWARE BRANCH
 * GATE 6G · JOVIAN RECOVERY WRAPPER
 *
 * Defining inputs:
 *   - qualified Gate-6F raw-oscillator input
 *   - explicit Jovian turn observation: moon + WEST/EAST
 *
 * rawPulse is NEVER accepted from the Jovian observation body. The wrapper
 * obtains it only from Gate-6F recoveryInput.
 *
 * Recovery:
 *   Io       native WEST→WEST span ×4
 *   Europa   native WEST→WEST span ×2
 *   Ganymede native WEST→WEST span ×1
 *
 * Equal-duration qualification:
 *   Io       8 native spans
 *   Europa   4 native spans
 *   Ganymede 2 native spans
 *
 * Exact rational evidence is preserved. No floating point is required for
 * authority comparison.
 *
 * Gate 6G does NOT write sealed core/a8-core.js and does NOT yet advance
 * DAY_PHASE17. It reconstructs the natural Jovian pulse ruler beside the
 * sealed core so the next gate can connect continuous A8 clock operation.
 */

const WRAPPER_SCHEMA =
  'A8-CORE20-JOVIAN-RECOVERY-WRAPPER-V1';

const INPUT_SCHEMA =
  'A8-CORE20-RAW-OSCILLATOR-INPUT-V1';

const MOON_DEF = Object.freeze({
  io: Object.freeze({
    id: 'io',
    name: 'IO',
    normalize: 4n,
    qualificationTarget: 8,
  }),
  eu: Object.freeze({
    id: 'eu',
    name: 'EUROPA',
    normalize: 2n,
    qualificationTarget: 4,
  }),
  ga: Object.freeze({
    id: 'ga',
    name: 'GANYMEDE',
    normalize: 1n,
    qualificationTarget: 2,
  }),
});

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

function fraction(n, d = 1n) {
  if (d === 0n) {
    throw new Error('fraction denominator may not be zero');
  }

  if (d < 0n) {
    n = -n;
    d = -d;
  }

  const g = gcdBigInt(n, d);

  return {
    n: n / g,
    d: d / g,
  };
}

function fractionEqual(a, b) {
  return (
    a !== null &&
    b !== null &&
    a.n * b.d === b.n * a.d
  );
}

function fractionText(f) {
  if (f === null) return null;
  return f.d === 1n
    ? f.n.toString()
    : `${f.n.toString()}/${f.d.toString()}`;
}

function parseRawPulse(text) {
  const s = String(text ?? '');

  if (!/^(0|[1-9][0-9]*)$/.test(s)) {
    throw new Error('recoveryInput rawPulse must be a non-negative integer');
  }

  return BigInt(s);
}

function normalizeMoon(value) {
  const key = String(value || '').toLowerCase();

  if (key === 'io' || key === '1') return 'io';
  if (
    key === 'eu' ||
    key === 'europa' ||
    key === '2'
  ) return 'eu';
  if (
    key === 'ga' ||
    key === 'ganymede' ||
    key === '3'
  ) return 'ga';

  throw new Error(
    'moon must be Io, Europa, or Ganymede'
  );
}

function normalizeTurn(value) {
  const turn =
    String(value || '').toUpperCase();

  if (
    turn !== 'WEST' &&
    turn !== 'EAST'
  ) {
    throw new Error(
      'turn must be WEST or EAST'
    );
  }

  return turn;
}

function makeChannel(def) {
  return {
    id: def.id,
    name: def.name,
    normalize: def.normalize,
    qualificationTarget:
      def.qualificationTarget,

    firstWestRaw: null,
    lastWestRaw: null,
    previousWestRaw: null,

    westEventCount: 0,
    eastEventCount: 0,

    spanCount: 0,
    totalNativeSpanRaw: 0n,
    latestNativeSpanRaw: null,

    lastTurn: null,
    lastTurnRaw: null,
  };
}

class Core20JovianRecoveryWrapper {
  constructor() {
    this.sourceEpoch = null;
    this.mode = null;
    this.rig = null;

    this.rearmCount = 0;
    this.observationCount = 0;

    this.channels = {
      io: makeChannel(MOON_DEF.io),
      eu: makeChannel(MOON_DEF.eu),
      ga: makeChannel(MOON_DEF.ga),
    };

    this.status =
      'WAITING_FOR_RECOVERY_INPUT';
  }

  resetChannels() {
    this.channels = {
      io: makeChannel(MOON_DEF.io),
      eu: makeChannel(MOON_DEF.eu),
      ga: makeChannel(MOON_DEF.ga),
    };

    this.observationCount = 0;
  }

  rearmFromInput(recoveryInput) {
    this.sourceEpoch =
      recoveryInput.sourceEpoch;

    this.mode =
      recoveryInput.mode;

    this.rig =
      recoveryInput.rig;

    this.resetChannels();

    this.status =
      'SEEKING_JOVIAN_TURNS';
  }

  forgetRecovery() {
    if (this.sourceEpoch !== null) {
      this.rearmCount += 1;
    }

    this.resetChannels();

    this.status =
      this.sourceEpoch === null
        ? 'WAITING_FOR_RECOVERY_INPUT'
        : 'SEEKING_JOVIAN_TURNS';

    return this.snapshot();
  }

  syncRecoveryInput(bridgeSnapshot) {
    if (
      !bridgeSnapshot ||
      typeof bridgeSnapshot !== 'object'
    ) {
      throw new Error(
        'Gate-6F bridge snapshot required'
      );
    }

    const recoveryInput =
      bridgeSnapshot.recoveryInput;

    if (recoveryInput === null) {
      if (
        bridgeSnapshot.sourceEpoch !==
        this.sourceEpoch
      ) {
        if (this.sourceEpoch !== null) {
          this.rearmCount += 1;
        }

        this.sourceEpoch =
          bridgeSnapshot.sourceEpoch;

        this.mode =
          bridgeSnapshot.mode;

        this.rig = null;

        this.resetChannels();

        this.status =
          'WAITING_FOR_RAW_BASELINE';
      }

      return this.snapshot();
    }

    if (
      recoveryInput.schema !==
      INPUT_SCHEMA
    ) {
      throw new Error(
        `recovery input schema must be ${INPUT_SCHEMA}`
      );
    }

    if (
      !Number.isSafeInteger(
        recoveryInput.sourceEpoch
      ) ||
      recoveryInput.sourceEpoch < 1
    ) {
      throw new Error(
        'recovery input sourceEpoch invalid'
      );
    }

    if (
      this.sourceEpoch !==
      recoveryInput.sourceEpoch
    ) {
      if (this.sourceEpoch !== null) {
        this.rearmCount += 1;
      }

      this.rearmFromInput(
        recoveryInput
      );
    } else {
      if (
        recoveryInput.mode !== this.mode
      ) {
        throw new Error(
          'mode changed without sourceEpoch change'
        );
      }

      if (this.rig === null) {
        // First qualified Gate-6F baseline in this already-selected epoch.
        // Bind the rig once; this is not a source change and not a re-arm.
        this.rig = recoveryInput.rig;
      } else if (
        recoveryInput.rig !== this.rig
      ) {
        throw new Error(
          'rig changed without sourceEpoch change'
        );
      }
    }

    return this.snapshot(
      recoveryInput.rawPulse
    );
  }

  observe(bridgeSnapshot, event) {
    this.syncRecoveryInput(
      bridgeSnapshot
    );

    const recoveryInput =
      bridgeSnapshot.recoveryInput;

    if (recoveryInput === null) {
      throw new Error(
        'Jovian observation requires qualified Gate-6F raw input'
      );
    }

    if (
      !event ||
      typeof event !== 'object' ||
      Array.isArray(event)
    ) {
      throw new Error(
        'Jovian observation must be an object'
      );
    }

    const allowed =
      new Set([
        'moon',
        'turn',
      ]);

    for (
      const key of
      Object.keys(event)
    ) {
      if (!allowed.has(key)) {
        throw new Error(
          `unsupported Jovian observation field: ${key}`
        );
      }
    }

    const moon =
      normalizeMoon(event.moon);

    const turn =
      normalizeTurn(event.turn);

    const raw =
      parseRawPulse(
        recoveryInput.rawPulse
      );

    const ch =
      this.channels[moon];

    if (
      ch.lastTurnRaw !== null &&
      raw < ch.lastTurnRaw
    ) {
      throw new Error(
        'Jovian observation rawPulse moved backward inside source epoch'
      );
    }

    if (
      ch.lastTurnRaw !== null &&
      raw === ch.lastTurnRaw &&
      ch.lastTurn === turn
    ) {
      throw new Error(
        'duplicate same-turn Jovian observation at identical rawPulse'
      );
    }

    ch.lastTurn = turn;
    ch.lastTurnRaw = raw;

    if (turn === 'EAST') {
      ch.eastEventCount += 1;
      this.observationCount += 1;

      this.status =
        this.qualifiedComparator() !== null
          ? 'JOVIAN_RULER_QUALIFIED'
          : 'RECOVERING';

      return this.snapshot(
        recoveryInput.rawPulse
      );
    }

    ch.westEventCount += 1;

    if (ch.firstWestRaw === null) {
      ch.firstWestRaw = raw;
      ch.lastWestRaw = raw;
      ch.previousWestRaw = null;
    } else {
      if (raw <= ch.lastWestRaw) {
        throw new Error(
          'WEST recurrence rawPulse must increase strictly'
        );
      }

      ch.previousWestRaw =
        ch.lastWestRaw;

      const span =
        raw -
        ch.lastWestRaw;

      ch.lastWestRaw = raw;

      ch.latestNativeSpanRaw =
        span;

      ch.totalNativeSpanRaw +=
        span;

      ch.spanCount += 1;
    }

    this.observationCount += 1;

    this.status =
      this.qualifiedComparator() !== null
        ? 'JOVIAN_RULER_QUALIFIED'
        : 'RECOVERING';

    return this.snapshot(
      recoveryInput.rawPulse
    );
  }

  normalizedAverage(channel) {
    if (channel.spanCount < 1) {
      return null;
    }

    return fraction(
      channel.totalNativeSpanRaw *
        channel.normalize,
      BigInt(channel.spanCount)
    );
  }

  nativeAverage(channel) {
    if (channel.spanCount < 1) {
      return null;
    }

    return fraction(
      channel.totalNativeSpanRaw,
      BigInt(channel.spanCount)
    );
  }

  channelQualified(channel) {
    return (
      channel.spanCount >=
      channel.qualificationTarget
    );
  }

  qualifiedComparator() {
    const io = this.channels.io;
    const eu = this.channels.eu;
    const ga = this.channels.ga;

    if (
      !this.channelQualified(io) ||
      !this.channelQualified(eu) ||
      !this.channelQualified(ga)
    ) {
      return null;
    }

    const a =
      this.normalizedAverage(io);

    const b =
      this.normalizedAverage(eu);

    const c =
      this.normalizedAverage(ga);

    if (
      !fractionEqual(a, b) ||
      !fractionEqual(b, c)
    ) {
      return {
        qualified: false,
        reference: null,
        reason:
          'FULL_8_4_2_WINDOW_DISAGREES',
      };
    }

    return {
      qualified: true,
      reference: a,
      reason:
        'FULL_8_4_2_EXACT_AGREEMENT',
    };
  }

  phase9ForChannel(
    channel,
    currentRawPulse
  ) {
    if (
      channel.latestNativeSpanRaw ===
        null ||
      channel.lastWestRaw === null ||
      currentRawPulse === null
    ) {
      return null;
    }

    const raw =
      parseRawPulse(
        currentRawPulse
      );

    if (raw < channel.lastWestRaw) {
      return null;
    }

    const native =
      channel.latestNativeSpanRaw;

    const ratio =
      channel.normalize;

    const recurrenceIndex =
      BigInt(
        Math.max(
          0,
          channel.westEventCount - 1
        )
      );

    const segment =
      recurrenceIndex % ratio;

    const within =
      raw -
      channel.lastWestRaw;

    const clampedWithin =
      within > native
        ? native
        : within;

    const numerator =
      segment * native +
      clampedWithin;

    const denominator =
      native * ratio;

    const phase =
      (
        numerator *
        512n
      ) /
      denominator;

    return Number(
      phase & 511n
    );
  }

  channelSnapshot(
    channel,
    currentRawPulse
  ) {
    const nativeAverage =
      this.nativeAverage(
        channel
      );

    const normalizedAverage =
      this.normalizedAverage(
        channel
      );

    const qualified =
      this.channelQualified(
        channel
      );

    const phase9 =
      this.phase9ForChannel(
        channel,
        currentRawPulse
      );

    return {
      moon:
        channel.name,

      normalization:
        `×${channel.normalize.toString()}`,

      status:
        qualified
          ? 'QUALIFICATION_WINDOW_COMPLETE'
          : channel.spanCount > 0
            ? 'RECOVERED_EARLY'
            : channel.firstWestRaw !== null
              ? 'BASELINE_WEST_CAPTURED'
              : 'SEEKING_FIRST_WEST',

      westEventCount:
        channel.westEventCount,

      eastEventCount:
        channel.eastEventCount,

      spanCount:
        channel.spanCount,

      qualificationTarget:
        channel.qualificationTarget,

      latestNativeSpanRaw:
        channel.latestNativeSpanRaw === null
          ? null
          : channel.latestNativeSpanRaw.toString(),

      nativeAverageRaw:
        fractionText(
          nativeAverage
        ),

      normalizedAverageRaw:
        fractionText(
          normalizedAverage
        ),

      phase9:
        phase9,

      phase9Octal:
        phase9 === null
          ? null
          : phase9
              .toString(8)
              .padStart(3, '0') +
            '₈',

      lastTurn:
        channel.lastTurn,

      lastTurnRaw:
        channel.lastTurnRaw === null
          ? null
          : channel.lastTurnRaw.toString(),
    };
  }

  snapshot(
    currentRawPulse = null
  ) {
    const comparator =
      this.qualifiedComparator();

    const reference =
      comparator &&
      comparator.qualified
        ? fractionText(
            comparator.reference
          )
        : null;

    return {
      schema:
        WRAPPER_SCHEMA,

      role:
        'POSTSEAL_JOVIAN_NATURAL_TIME_RECOVERY',

      status:
        comparator &&
        comparator.qualified
          ? 'JOVIAN_RULER_QUALIFIED'
          : this.status,

      sourceEpoch:
        this.sourceEpoch,

      mode:
        this.mode,

      rig:
        this.rig,

      currentRawPulse:
        currentRawPulse === null
          ? null
          : String(
              currentRawPulse
            ),

      observationCount:
        this.observationCount,

      rearmCount:
        this.rearmCount,

      channels: {
        io:
          this.channelSnapshot(
            this.channels.io,
            currentRawPulse
          ),

        eu:
          this.channelSnapshot(
            this.channels.eu,
            currentRawPulse
          ),

        ga:
          this.channelSnapshot(
            this.channels.ga,
            currentRawPulse
          ),
      },

      comparator: {
        requiredWindow:
          'IO 8 · EUROPA 4 · GANYMEDE 2',

        mode:
          'EXACT_RATIONAL_EQUAL_DURATION_8_4_2',

        qualified:
          !!(
            comparator &&
            comparator.qualified
          ),

        referenceNormalizedRaw:
          reference,

        reason:
          comparator
            ? comparator.reason
            : 'WAITING_FOR_FULL_8_4_2_WINDOW',
      },

      recoveredJovianRawRuler:
        reference,

      definingInput:
        'Gate-6F rawPulse + moon + WEST/EAST turn witness',

      acceptsObservationRawPulse:
        false,

      usesPublishedMoonPeriods:
        false,

      usesHostTime:
        false,

      usesLegacyTime:
        false,

      usesFrequencyHz:
        false,

      writesA8Core:
        false,

      writesClock:
        false,

      writesPhase:
        false,

      writesAuthority:
        false,

      sourceEpochChangeForcesRearm:
        true,
    };
  }
}

module.exports = {
  WRAPPER_SCHEMA,
  INPUT_SCHEMA,
  MOON_DEF,
  gcdBigInt,
  fraction,
  fractionEqual,
  fractionText,
  normalizeMoon,
  normalizeTurn,
  Core20JovianRecoveryWrapper,
};
