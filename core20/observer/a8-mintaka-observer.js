'use strict';

/*
 * AUSPICIOUS 8 · v5.4.20
 * MINTAKA READ-ONLY CELESTIAL OBSERVER · GATE 2A
 *
 * Boundary:
 *   Jupiter-derived A8 time remains upstream.
 *   Mintaka is a distant-direction witness used to observe Earth axial rotation.
 *   This object receives observation events only.
 *   It owns no clock, divider, authority selector, plant, or host-time source.
 *
 * Defining observation contract:
 *   {
 *     type:     'STELLAR_MERIDIAN',
 *     rawPulse: non-negative monotonic integer,
 *     witness:  'MINTAKA'
 *   }
 *
 * No expected recurrence value is embedded here.
 */

const EVENT_TYPE = 'STELLAR_MERIDIAN';
const WITNESS = 'MINTAKA';
const ALLOWED_KEYS = new Set(['type', 'rawPulse', 'witness']);

function gcd(a, b) {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b !== 0n) {
    const t = a % b;
    a = b;
    b = t;
  }
  return a;
}

function toRawPulse(value) {
  if (typeof value === 'bigint') {
    if (value < 0n) throw new Error('rawPulse must be non-negative');
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error('rawPulse number must be a non-negative safe integer');
    }
    return BigInt(value);
  }

  if (typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value)) {
    return BigInt(value);
  }

  throw new Error('rawPulse must be a non-negative integer');
}

class MintakaRotationObserver {
  constructor() {
    this.events = [];
    this.spans = [];
  }

  observe(event) {
    if (!event || typeof event !== 'object' || Array.isArray(event)) {
      throw new Error('Mintaka observation must be an object');
    }

    for (const key of Object.keys(event)) {
      if (!ALLOWED_KEYS.has(key)) {
        throw new Error(`unsupported defining observation field: ${key}`);
      }
    }

    if (event.type !== EVENT_TYPE) {
      throw new Error(`Mintaka observer accepts only ${EVENT_TYPE}`);
    }

    if (event.witness !== WITNESS) {
      throw new Error(`Mintaka observer accepts only witness ${WITNESS}`);
    }

    const raw = toRawPulse(event.rawPulse);
    const previous = this.events.length
      ? BigInt(this.events[this.events.length - 1].rawPulse)
      : null;

    if (previous !== null && raw <= previous) {
      throw new Error('rawPulse must increase monotonically');
    }

    if (previous !== null) {
      this.spans.push((raw - previous).toString());
    }

    this.events.push({
      type: EVENT_TYPE,
      rawPulse: raw.toString(),
      witness: WITNESS,
    });

    return this.snapshot();
  }

  snapshot() {
    const eventCount = this.events.length;
    const cycleCount = eventCount > 0 ? eventCount - 1 : 0;

    const firstRaw = eventCount ? BigInt(this.events[0].rawPulse) : null;
    const lastRaw = eventCount ? BigInt(this.events[eventCount - 1].rawPulse) : null;

    const rawNumerator =
      cycleCount > 0 ? (lastRaw - firstRaw) : null;

    let reducedNumerator = null;
    let reducedDenominator = null;

    if (rawNumerator !== null) {
      const den = BigInt(cycleCount);
      const d = gcd(rawNumerator, den);
      reducedNumerator = rawNumerator / d;
      reducedDenominator = den / d;
    }

    return {
      schema: 'A8-MINTAKA-ROTATION-OBSERVER-V1',
      role: 'EARTH_AXIAL_ROTATION_WITNESS',
      mode: 'READ_ONLY',
      witness: WITNESS,
      eventType: EVENT_TYPE,
      definingInput: 'event type + raw pulse + witness',

      writesClock: false,
      changesAuthority: false,
      usesLegacyTime: false,
      usesExpectedPeriod: false,

      status:
        eventCount === 0
          ? 'SEEKING_FIRST_EVENT'
          : eventCount === 1
            ? 'SEEKING_SECOND_EVENT'
            : 'RECOVERED',

      eventCount,
      cycleCount,
      firstRawPulse: firstRaw === null ? null : firstRaw.toString(),
      lastRawPulse: lastRaw === null ? null : lastRaw.toString(),
      latestSpanRaw:
        this.spans.length ? this.spans[this.spans.length - 1] : null,

      recurrence: rawNumerator === null
        ? null
        : {
            rawNumerator: rawNumerator.toString(),
            cycleDenominator: String(cycleCount),
            reducedNumerator: reducedNumerator.toString(),
            reducedDenominator: reducedDenominator.toString(),
          },

      spansRaw: this.spans.slice(),
      events: this.events.slice(),
    };
  }
}

module.exports = {
  EVENT_TYPE,
  WITNESS,
  MintakaRotationObserver,
};
