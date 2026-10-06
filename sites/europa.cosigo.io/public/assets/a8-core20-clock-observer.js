/*
 * A8 CORE20 CIVIL CLOCK OBSERVER
 * ==============================
 *
 * Canonical browser-side presentation observer.
 *
 * AUTHORITY
 * ---------
 * Core20 owns:
 *   - dayCount
 *   - DAY_PHASE17
 *   - exactSubstate
 *   - running state
 *   - sourceEpoch
 *
 * Browser performance.now() fills visible motion only between
 * authoritative Core20 lifecycle anchors.
 *
 * Ordinary transport arrival is NOT the beat source.
 *
 * This module:
 *   - performs no fetch
 *   - opens no EventSource
 *   - creates no timer
 *   - starts no animation frame
 *   - writes no DOM
 *   - writes nothing to Core20
 *
 * Pages supply Core20 clock snapshots and consume the resulting
 * continuous coordinate.
 */

(function(root, factory) {
  'use strict';

  const api = factory();

  if (
    typeof module === 'object' &&
    module.exports
  ) {
    module.exports = api;
  }

  if (root) {
    root.A8Core20ClockObserver = api;
  }

})(
  typeof globalThis !== 'undefined'
    ? globalThis
    : this,

  function() {
    'use strict';

    const SCHEMA =
      'A8-CORE20-CIVIL-OBSERVER-V1';

    const DAY_STATES =
      131072;

    /*
     * DISPLAY PACING ONLY.
     *
     * Same existing A8 civil-state duration:
     * 675 / 1024 conventional seconds.
     */
    const A8_STATE_MS =
      675000 / 1024;


    function serverContinuousTotal(clock) {
      if (!clock) {
        return NaN;
      }

      const sub =
        clock.exactSubstate || {};

      const numerator =
        Number(
          sub.numerator || 0
        );

      const denominator =
        Number(
          sub.denominator || 1
        );

      const fraction =
        Number.isFinite(numerator) &&
        Number.isFinite(denominator) &&
        denominator > 0
          ? numerator / denominator
          : 0;

      const dayCount =
        Number(
          clock.dayCount || 0
        );

      const dayPhase17 =
        Number(
          clock.dayPhase17
        );

      if (
        !Number.isFinite(dayCount) ||
        !Number.isFinite(dayPhase17)
      ) {
        return NaN;
      }

      return (
        dayCount *
          DAY_STATES +
        dayPhase17 +
        fraction
      );
    }


    function wrapDayPhase(value) {
      const whole =
        Math.floor(value);

      return (
        (whole % DAY_STATES) +
        DAY_STATES
      ) % DAY_STATES;
    }


    function fieldsFromPhase(phase) {
      return {
        second:
          phase & 63,

        minute:
          (phase >> 6) & 63,

        hour:
          (phase >> 12) & 31,
      };
    }


    function decimalFromPhase(phase) {
      const fields =
        fieldsFromPhase(
          wrapDayPhase(phase)
        );

      return (
        String(fields.hour)
          .padStart(2, '0') +
        ':' +
        String(fields.minute)
          .padStart(2, '0') +
        ':' +
        String(fields.second)
          .padStart(2, '0')
      );
    }


    class Core20CivilObserver {

      constructor() {
        this.ready = false;
        this.connected = false;
        this.running = false;

        this.anchorTotal = 0;
        this.anchorPerf =
          performance.now();

        this.sourceEpoch = null;
      }


      /*
       * Feed one authoritative Core20 clock snapshot.
       *
       * Hard presentation anchors occur only at:
       *   - initial bootstrap
       *   - explicit force
       *   - sourceEpoch change
       *   - run/reconnect transition
       *
       * Ordinary packet arrival never snaps the clock.
       */
      observe(
        clock,
        {
          force = false,
        } = {}
      ) {
        if (!clock) {
          this.connected = false;
          this.running = false;
          return false;
        }

        this.connected = true;

        if (
          clock.status !==
          'CORE20_CLOCK_RUNNING'
        ) {
          this.running = false;
          return false;
        }

        const serverTotal =
          serverContinuousTotal(
            clock
          );

        if (
          !Number.isFinite(
            serverTotal
          )
        ) {
          return false;
        }

        const now =
          performance.now();

        const nextEpoch =
          String(
            clock.sourceEpoch ??
            ''
          );

        if (
          !this.ready ||
          force ||
          nextEpoch !==
            this.sourceEpoch ||
          !this.running
        ) {
          this.anchorTotal =
            serverTotal;

          this.anchorPerf =
            now;

          this.sourceEpoch =
            nextEpoch;

          this.ready = true;
          this.running = true;

          return true;
        }

        /*
         * UNIVERSAL DISPLAY-OBSERVER RULE:
         *
         * Ordinary transport refresh is evidence/status only.
         * Arrival time is never a civil phase-comparison instant.
         */
        this.sourceEpoch =
          nextEpoch;

        this.running =
          true;

        return true;
      }


      /*
       * Stop browser continuation immediately.
       *
       * Do not rewrite the last authoritative anchor.
       * Reconnect/resume establishes the next presentation anchor
       * from a valid Core20 observation.
       */
      disconnect() {
        /*
         * Match the proven Lab observer lifecycle exactly:
         * disconnect stops browser continuation only.
         *
         * It does NOT manufacture a new anchor at disconnect time.
         * The next legitimate reconnect/resume snapshot establishes
         * the next authoritative presentation anchor.
         */
        this.connected =
          false;

        this.running =
          false;
      }


      reset() {
        this.ready = false;
        this.connected = false;
        this.running = false;

        this.anchorTotal = 0;
        this.anchorPerf =
          performance.now();

        this.sourceEpoch = null;
      }


      currentTotal(
        nowPerf =
          performance.now()
      ) {
        if (!this.ready) {
          return NaN;
        }

        const elapsedStates =
          this.running
            ? (
                nowPerf -
                this.anchorPerf
              ) /
              A8_STATE_MS
            : 0;

        return (
          this.anchorTotal +
          elapsedStates
        );
      }


      currentPhase(
        nowPerf =
          performance.now()
      ) {
        const total =
          this.currentTotal(
            nowPerf
          );

        if (
          !Number.isFinite(total)
        ) {
          return NaN;
        }

        return wrapDayPhase(
          total
        );
      }


      currentFields(
        nowPerf =
          performance.now()
      ) {
        const phase =
          this.currentPhase(
            nowPerf
          );

        if (
          !Number.isFinite(phase)
        ) {
          return null;
        }

        return fieldsFromPhase(
          phase
        );
      }


      decimal(
        nowPerf =
          performance.now()
      ) {
        const phase =
          this.currentPhase(
            nowPerf
          );

        if (
          !Number.isFinite(phase)
        ) {
          return null;
        }

        return decimalFromPhase(
          phase
        );
      }


      state() {
        return {
          schema: SCHEMA,
          ready: this.ready,
          connected: this.connected,
          running: this.running,
          sourceEpoch:
            this.sourceEpoch,
        };
      }
    }


    return Object.freeze({
      schema: SCHEMA,

      DAY_STATES,
      A8_STATE_MS,

      serverContinuousTotal,
      wrapDayPhase,
      fieldsFromPhase,
      decimalFromPhase,

      create() {
        return new Core20CivilObserver();
      },
    });
  }
);
