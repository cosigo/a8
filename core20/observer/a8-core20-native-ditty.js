'use strict';

/*
 * AUSPICIOUS 8 · CORE20 NATIVE DITTY
 *
 * Native input:
 *   selected integer raw count
 *   source epoch
 *   recovered raw-per-Sun-return rational
 *
 * Native rhythm:
 *   1 · 1/2 · 1/4 · 1/8 · 1/16 A8 second
 *
 * Native pitch:
 *   cycles / A8 second
 *
 * Downstream observer only.
 */

const DAY_PHASE17_STATES = 131072n;
const DIVISIONS_PER_A8_SECOND = 16n;

const BAR_SLOTS = 64n;
const BAR_COUNT = 8n;
const SCORE_SLOTS = BAR_SLOTS * BAR_COUNT;

const NOTE_SCALE = Object.freeze({
  A: 290,
  'A#': 307,
  B: 325,
  C: 345,
  'C#': 365,
  D: 387,
  'D#': 410,
  E: 435,
  F: 460,
  'F#': 487,
  G: 516,
  'G#': 548,
});

const DURATION_LABEL = Object.freeze({
  16: '1',
  8: '1/2',
  4: '1/4',
  2: '1/8',
  1: '1/16',
});

/*
 * Eight improvised bars.
 * Each bar = 64 × 1/16-A8-second slots
 *          = 4 A8 seconds.
 */

const BAR_DEFINITIONS = Object.freeze([
  Object.freeze([
    ['A',8], ['C',8], ['E',4], ['G',4],
    ['F#',2], ['G',2], ['G#',1], ['G',1],
    ['E',2], ['C',4], ['B',4], ['A',8],
    ['E',16],
  ]),

  Object.freeze([
    ['C',4], ['D',4], ['E',4], ['G',4],
    ['E',8], ['D',8],
    ['C#',2], ['D',2], ['E',2], ['F',2],
    ['G',8], ['C',16],
  ]),

  Object.freeze([
    ['E',16], ['G',8], ['G#',4],
    ['G',2], ['F#',1], ['G',1], ['E',2],
    ['D',4], ['C',8], ['B',8],
    ['C',4], ['D',2], ['E',2], ['G',2],
  ]),

  Object.freeze([
    ['G',8], ['E',4], ['C',4], ['D',8],
    ['E',2], ['F',2], ['F#',1], ['G',1],
    ['E',2], ['D',4], ['C',4], ['B',8],
    ['A',16],
  ]),

  Object.freeze([
    ['A',4], ['A#',2], ['B',2], ['C',4],
    ['E',8], ['G',4], ['F',2],
    ['F#',1], ['G',1], ['E',4],
    ['D',8], ['C',8], ['A',16],
  ]),

  Object.freeze([
    ['C',8], ['E',8], ['G',8], ['G#',4],
    ['G',4], ['F',2], ['E',2],
    ['D#',1], ['E',1], ['G',2],
    ['F',4], ['D',4], ['C',16],
  ]),

  Object.freeze([
    ['A',16], ['E',4], ['F',4],
    ['F#',2], ['G',2], ['G#',1], ['G',1],
    ['E',2], ['C',4], ['D',8], ['E',8],
    ['G',4], ['A',4], ['B',4],
  ]),

  Object.freeze([
    ['G',4], ['F',4], ['E',2], ['D',2],
    ['C',1], ['B',1], ['A',2], ['C',4],
    ['E',8], ['G',4], ['F',4], ['E',8],
    ['C',16], ['A',4],
  ]),
]);

function parsePositiveRational(text) {
  const match =
    String(text || '')
      .trim()
      .match(/^([0-9]+)\/([0-9]+)$/);

  if (!match) {
    throw new Error(
      'raw-per-Sun-return must be an exact positive rational'
    );
  }

  const numerator = BigInt(match[1]);
  const denominator = BigInt(match[2]);

  if (numerator <= 0n || denominator <= 0n) {
    throw new Error(
      'raw-per-Sun-return rational must be positive'
    );
  }

  return { numerator, denominator };
}

function buildScore() {
  if (BigInt(BAR_DEFINITIONS.length) !== BAR_COUNT) {
    throw new Error('ditty must contain exactly 8 bars');
  }

  const score = [];
  let absoluteSlot = 0n;

  BAR_DEFINITIONS.forEach((bar, barIndex) => {
    let barSlots = 0n;

    bar.forEach(([note, durationSlots], noteIndex) => {
      if (
        !Object.prototype.hasOwnProperty.call(
          NOTE_SCALE,
          note
        )
      ) {
        throw new Error(`unknown native note ${note}`);
      }

      if (
        !Object.prototype.hasOwnProperty.call(
          DURATION_LABEL,
          String(durationSlots)
        )
      ) {
        throw new Error(
          `invalid native duration ${durationSlots}`
        );
      }

      const slots = BigInt(durationSlots);

      score.push(Object.freeze({
        bar: barIndex + 1,
        noteIndex: noteIndex + 1,
        note,
        cyclesPerA8Second: NOTE_SCALE[note],
        startSlot: absoluteSlot,
        durationSlots: slots,
        durationA8: DURATION_LABEL[String(durationSlots)],
      }));

      absoluteSlot += slots;
      barSlots += slots;
    });

    if (barSlots !== BAR_SLOTS) {
      throw new Error(
        `bar ${barIndex + 1} totals ${barSlots} slots`
      );
    }
  });

  if (absoluteSlot !== SCORE_SLOTS) {
    throw new Error(
      `score totals ${absoluteSlot} slots`
    );
  }

  return Object.freeze(score);
}

const SCORE = buildScore();

function eventForSlot(value) {
  const slot = BigInt(value);

  if (slot < 0n || slot >= SCORE_SLOTS) {
    return null;
  }

  return SCORE.find(
    event =>
      slot >= event.startSlot &&
      slot < event.startSlot + event.durationSlots
  ) || null;
}

class A8Core20NativeDitty {
  constructor() {
    this.reset();
  }

  reset() {
    this.status = 'DISARMED';
    this.sourceEpoch = null;
    this.anchorRaw = null;
    this.rawPerSunReturnNumerator = null;
    this.rawPerSunReturnDenominator = null;
    this.lastSlot = null;
  }

  arm({
    sourceEpoch,
    rawPulse,
    rawPerSunReturn,
  }) {
    const rational =
      parsePositiveRational(rawPerSunReturn);

    this.status = 'RUNNING';
    this.sourceEpoch = String(sourceEpoch);
    this.anchorRaw = BigInt(rawPulse);

    this.rawPerSunReturnNumerator =
      rational.numerator;

    this.rawPerSunReturnDenominator =
      rational.denominator;

    this.lastSlot = 0n;

    return this._stateAtRaw(this.anchorRaw);
  }

  _slotCoordinate(rawValue) {
    if (this.status === 'DISARMED') {
      throw new Error('native ditty is not armed');
    }

    const raw = BigInt(rawValue);

    if (raw < this.anchorRaw) {
      throw new Error(
        'selected raw count regressed during native ditty'
      );
    }

    const deltaRaw =
      raw - this.anchorRaw;

    /*
     * Exact native divider coordinate:
     *
     * selected raw
     * × recovered Sun-return rational
     * × 2^17 A8 seconds / Sun return
     * × 16 divider positions / A8 second
     */

    const numerator =
      deltaRaw *
      this.rawPerSunReturnDenominator *
      DAY_PHASE17_STATES *
      DIVISIONS_PER_A8_SECOND;

    const denominator =
      this.rawPerSunReturnNumerator;

    return {
      slot:
        numerator / denominator,

      remainderNumerator:
        numerator % denominator,

      remainderDenominator:
        denominator,
    };
  }

  _stateAtRaw(rawValue) {
    const raw = BigInt(rawValue);
    const coordinate =
      this._slotCoordinate(raw);

    if (coordinate.slot >= SCORE_SLOTS) {
      return {
        schema: 'A8-CORE20-NATIVE-DITTY-V1',
        status: 'COMPLETE',
        sourceEpoch: this.sourceEpoch,
        rawPulse: raw.toString(),
        totalDividerSlot: coordinate.slot.toString(),
        scoreSlots: SCORE_SLOTS.toString(),
        barCount: BAR_COUNT.toString(),
        nativeSubdivision: '1/16 A8 second',
        definingPathTouched: false,
      };
    }

    const event =
      eventForSlot(coordinate.slot);

    return {
      schema: 'A8-CORE20-NATIVE-DITTY-V1',
      status: 'PLAYING',
      sourceEpoch: this.sourceEpoch,
      rawPulse: raw.toString(),

      totalDividerSlot:
        coordinate.slot.toString(),

      scoreSlots:
        SCORE_SLOTS.toString(),

      bar:
        Number(
          coordinate.slot / BAR_SLOTS
        ) + 1,

      slotInBar:
        (
          coordinate.slot % BAR_SLOTS
        ).toString(),

      nativeSubdivision:
        '1/16 A8 second',

      exactSubslot: {
        numerator:
          coordinate.remainderNumerator.toString(),

        denominator:
          coordinate.remainderDenominator.toString(),
      },

      note:
        event.note,

      cyclesPerA8Second:
        String(event.cyclesPerA8Second),

      noteDurationA8:
        event.durationA8,

      noteDurationDividerSlots:
        event.durationSlots.toString(),

      definingPathTouched:
        false,
    };
  }

  observe({
    sourceEpoch,
    rawPulse,
  }) {
    if (this.status === 'DISARMED') {
      throw new Error(
        'native ditty is not armed'
      );
    }

    if (String(sourceEpoch) !== this.sourceEpoch) {
      throw new Error(
        'source epoch changed during native ditty'
      );
    }

    const state =
      this._stateAtRaw(rawPulse);

    const currentSlot =
      BigInt(state.totalDividerSlot);

    const transitions = [];

    if (
      this.lastSlot !== null &&
      currentSlot > this.lastSlot
    ) {
      const stop =
        currentSlot < SCORE_SLOTS
          ? currentSlot
          : SCORE_SLOTS;

      for (
        let slot = this.lastSlot + 1n;
        slot <= stop;
        slot += 1n
      ) {
        if (slot >= SCORE_SLOTS) {
          transitions.push({
            slot: SCORE_SLOTS.toString(),
            status: 'COMPLETE',
          });

          break;
        }

        const event =
          eventForSlot(slot);

        const previous =
          eventForSlot(slot - 1n);

        if (event !== previous) {
          transitions.push({
            slot: slot.toString(),

            bar:
              Number(
                slot / BAR_SLOTS
              ) + 1,

            note:
              event.note,

            cyclesPerA8Second:
              String(event.cyclesPerA8Second),

            noteDurationA8:
              event.durationA8,
          });
        }
      }
    }

    this.lastSlot = currentSlot;

    if (state.status === 'COMPLETE') {
      this.status = 'COMPLETE';
    }

    return {
      state,
      transitions,
    };
  }

  snapshot() {
    return {
      schema:
        'A8-CORE20-NATIVE-DITTY-SCORE-V1',

      bars:
        BAR_COUNT.toString(),

      slotsPerBar:
        BAR_SLOTS.toString(),

      scoreSlots:
        SCORE_SLOTS.toString(),

      nativeSubdivision:
        '1/16 A8 second',

      nativePitchUnit:
        'cycles / A8 second',

      scale:
        { ...NOTE_SCALE },

      score:
        SCORE.map(event => ({
          bar: event.bar,
          note: event.note,

          cyclesPerA8Second:
            String(event.cyclesPerA8Second),

          startSlot:
            event.startSlot.toString(),

          durationSlots:
            event.durationSlots.toString(),

          durationA8:
            event.durationA8,
        })),
    };
  }
}

module.exports = {
  A8Core20NativeDitty,
  NOTE_SCALE,
  SCORE,
  DAY_PHASE17_STATES,
  DIVISIONS_PER_A8_SECOND,
  BAR_SLOTS,
  BAR_COUNT,
  SCORE_SLOTS,
};
