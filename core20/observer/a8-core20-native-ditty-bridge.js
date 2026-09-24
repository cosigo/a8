'use strict';

const {
  A8Core20NativeDitty,
} = require('./a8-core20-native-ditty');

/*
 * CORE20 NATIVE DITTY BRIDGE
 *
 * Downstream observer only.
 *
 * Reads:
 *   selected raw
 *   source epoch
 *   recovered Sun-return rational
 *
 * Emits:
 *   native score start
 *   native note changes
 *   native score completion
 *
 * It cannot pace, trim, align, or write Core20.
 */

class A8Core20NativeDittyBridge {
  constructor({
    getRaw,
    getSourceEpoch,
    getRecurrenceText,
  } = {}) {
    for (
      const [name, fn] of Object.entries({
        getRaw,
        getSourceEpoch,
        getRecurrenceText,
      })
    ) {
      if (typeof fn !== 'function') {
        throw new Error(`${name} callback required`);
      }
    }

    this.getRaw = getRaw;
    this.getSourceEpoch = getSourceEpoch;
    this.getRecurrenceText = getRecurrenceText;

    this.ditty =
      new A8Core20NativeDitty();

    this.listeners =
      new Set();

    this.status =
      'DISARMED';

    this.currentState =
      null;

    this.sequence =
      0;
  }

  onEvent(listener) {
    if (typeof listener !== 'function') {
      throw new Error(
        'native ditty listener must be a function'
      );
    }

    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  _emit(event) {
    this.sequence += 1;

    const payload = {
      schema:
        'A8-CORE20-NATIVE-DITTY-EVENT-V1',

      sequence:
        this.sequence,

      ...event,

      definingPathTouched:
        false,
    };

    for (
      const listener of
      Array.from(this.listeners)
    ) {
      try {
        listener(payload);
      } catch (_) {
        /*
         * Downstream observer failure
         * cannot affect Core20.
         */
      }
    }

    return payload;
  }

  arm() {
    const state =
      this.ditty.arm({
        sourceEpoch:
          String(
            this.getSourceEpoch()
          ),

        rawPulse:
          String(
            this.getRaw()
          ),

        rawPerSunReturn:
          String(
            this.getRecurrenceText()
          ),
      });

    this.status =
      'RUNNING';

    this.currentState =
      state;

    return this._emit({
      type:
        'DITTY_START',

      state,
    });
  }

  observeCurrentRaw() {
    if (this.status !== 'RUNNING') {
      return {
        status:
          this.status,

        state:
          this.currentState,

        events:
          [],
      };
    }

    const result =
      this.ditty.observe({
        sourceEpoch:
          String(
            this.getSourceEpoch()
          ),

        rawPulse:
          String(
            this.getRaw()
          ),
      });

    this.currentState =
      result.state;

    const events = [];

    for (
      const transition of
      result.transitions
    ) {
      if (
        transition.status ===
        'COMPLETE'
      ) {
        events.push(
          this._emit({
            type:
              'DITTY_COMPLETE',

            transition,

            state:
              result.state,
          })
        );

        continue;
      }

      events.push(
        this._emit({
          type:
            'NOTE_CHANGE',

          transition,

          state:
            result.state,
        })
      );
    }

    if (
      result.state.status ===
      'COMPLETE'
    ) {
      this.status =
        'COMPLETE';
    }

    return {
      status:
        this.status,

      state:
        result.state,

      events,
    };
  }

  reset() {
    this.ditty.reset();

    this.status =
      'DISARMED';

    this.currentState =
      null;

    return this.snapshot();
  }

  snapshot() {
    return {
      schema:
        'A8-CORE20-NATIVE-DITTY-BRIDGE-V1',

      status:
        this.status,

      sequence:
        this.sequence,

      currentState:
        this.currentState,

      definingPathTouched:
        false,
    };
  }

  scoreSnapshot() {
    return this.ditty.snapshot();
  }
}

module.exports = {
  A8Core20NativeDittyBridge,
};
