(() => {
  'use strict';

  /*
   * A8 MUSIC PLAYER V1
   *
   * SCORE AUTHORITY:
   *   native A8 fractions
   *   cycles / A8 second
   *
   * CREATIVE EXPRESSION:
   *   waveform
   *   gain
   *   motion envelope
   *
   * WebAudio currentTime exists ONLY inside this
   * final browser / DAC preview adapter.
   */

  const DAC_SECONDS_PER_A8_SECOND =
    675 / 1024;

  const ALLOWED_WAVEFORMS =
    new Set([
      'sine',
      'triangle',
      'square',
      'sawtooth'
    ]);

  const ALLOWED_MOTIONS =
    new Set([
      'steady',
      'rise',
      'fall',
      'whoosh'
    ]);

  function parseA8Fraction(value) {
    const s =
      String(value ?? '').trim();

    if (!s) {
      throw new Error(
        'EMPTY A8 FRACTION'
      );
    }

    if (s.includes('/')) {
      const parts =
        s.split('/');

      if (parts.length !== 2) {
        throw new Error(
          'INVALID A8 FRACTION: ' + s
        );
      }

      const n =
        Number(parts[0]);

      const d =
        Number(parts[1]);

      if (
        !Number.isFinite(n) ||
        !Number.isFinite(d) ||
        d === 0
      ) {
        throw new Error(
          'INVALID A8 FRACTION: ' + s
        );
      }

      return n / d;
    }

    const n =
      Number(s);

    if (!Number.isFinite(n)) {
      throw new Error(
        'INVALID A8 NUMBER: ' + s
      );
    }

    return n;
  }


  function normalizeEvent(
    event,
    index
  ) {
    if (
      !event ||
      typeof event !== 'object'
    ) {
      throw new Error(
        'INVALID EVENT ' + index
      );
    }

    const type =
      String(
        event.type || 'note'
      ).toLowerCase();

    if (
      type !== 'note' &&
      type !== 'rest'
    ) {
      throw new Error(
        'EVENT TYPE MUST BE NOTE OR REST'
      );
    }

    const startA8 =
      parseA8Fraction(
        event.startA8
      );

    const durationA8 =
      parseA8Fraction(
        event.durationA8
      );

    /*
     * REST is real score time.
     * It intentionally has no pitch.
     */
    const pitch =
      type === 'note'
        ? parseA8Fraction(
            event.cyclesPerA8Second
          )
        : null;

    const gain =
      type === 'note'
        ? Number(
            event.gain ?? 0.6
          )
        : 0;

    const waveform =
      type === 'note'
        ? String(
            event.waveform || 'sine'
          ).toLowerCase()
        : 'sine';

    const motion =
      type === 'note'
        ? String(
            event.motion || 'steady'
          ).toLowerCase()
        : 'steady';

    if (!(startA8 >= 0)) {
      throw new Error(
        'EVENT START MUST BE >= 0'
      );
    }

    if (!(durationA8 > 0)) {
      throw new Error(
        'EVENT DURATION MUST BE > 0'
      );
    }

    if (
      type === 'note' &&
      (
        !(pitch > 0) ||
        !Number.isFinite(pitch)
      )
    ) {
      throw new Error(
        'NOTE PITCH MUST BE > 0'
      );
    }

    if (
      type === 'note' &&
      (
        !Number.isFinite(gain) ||
        gain < 0 ||
        gain > 1
      )
    ) {
      throw new Error(
        'EVENT GAIN MUST BE 0..1'
      );
    }

    if (
      type === 'note' &&
      !ALLOWED_WAVEFORMS.has(
        waveform
      )
    ) {
      throw new Error(
        'UNSUPPORTED WAVEFORM: ' +
        waveform
      );
    }

    if (
      type === 'note' &&
      !ALLOWED_MOTIONS.has(
        motion
      )
    ) {
      throw new Error(
        'UNSUPPORTED MOTION: ' +
        motion
      );
    }

    return {
      ...event,

      _index:
        index,

      _type:
        type,

      _startA8:
        startA8,

      _durationA8:
        durationA8,

      _endA8:
        startA8 +
        durationA8,

      _pitch:
        pitch,

      _gain:
        gain,

      _waveform:
        waveform,

      _motion:
        motion
    };
  }

  function validateScore(
    score
  ) {
    if (
      !score ||
      typeof score !== 'object'
    ) {
      throw new Error(
        'A8M SCORE REQUIRED'
      );
    }

    if (
      score.format !==
      'A8M-1'
    ) {
      throw new Error(
        'UNSUPPORTED A8M FORMAT'
      );
    }

    if (
      !Array.isArray(
        score.events
      )
    ) {
      throw new Error(
        'A8M EVENTS REQUIRED'
      );
    }

    const events =
      score.events.map(
        normalizeEvent
      );


    validateExplicitTies(
      events
    );

    let totalA8 = 0;

    for (
      const event
      of events
    ) {
      totalA8 =
        Math.max(
          totalA8,
          event._endA8
        );
    }

    return {
      score,
      events,
      totalA8
    };
  }


  function tieClose(
    a,
    b
  ) {
    return (
      Math.abs(
        a - b
      ) <
      1e-12
    );
  }


  function sameTieVoice(
    a,
    b
  ) {
    return (
      tieClose(
        a._pitch,
        b._pitch
      ) &&
      a._waveform ===
        b._waveform &&
      a._motion ===
        b._motion &&
      tieClose(
        a._gain,
        b._gain
      )
    );
  }


  function validateExplicitTies(
    events
  ) {
    for (
      let i = 0;
      i < events.length;
      i++
    ) {
      const event =
        events[
          i
        ];


      const tieId =
        event.tieId
          ? String(
              event.tieId
            )
          : '';


      const tiePrev =
        event.tiePrev ===
          true;

      const tieNext =
        event.tieNext ===
          true;


      if (
        !tieId &&
        !tiePrev &&
        !tieNext
      ) {
        continue;
      }


      if (
        event._type !==
          'note' ||
        !tieId
      ) {
        throw new Error(
          'INVALID EXPLICIT NOTE TIE'
        );
      }


      if (tiePrev) {
        const previous =
          events[
            i - 1
          ];


        if (
          !previous ||
          previous._type !==
            'note' ||
          previous.tieNext !==
            true ||
          String(
            previous.tieId ||
            ''
          ) !==
            tieId ||
          !tieClose(
            previous._endA8,
            event._startA8
          ) ||
          !sameTieVoice(
            previous,
            event
          )
        ) {
          throw new Error(
            'INVALID TIED NOTE PREDECESSOR'
          );
        }
      }


      if (tieNext) {
        const next =
          events[
            i + 1
          ];


        if (
          !next ||
          next._type !==
            'note' ||
          next.tiePrev !==
            true ||
          String(
            next.tieId ||
            ''
          ) !==
            tieId ||
          !tieClose(
            event._endA8,
            next._startA8
          ) ||
          !sameTieVoice(
            event,
            next
          )
        ) {
          throw new Error(
            'INVALID TIED NOTE SUCCESSOR'
          );
        }
      }
    }
  }


  /*
   * Score accounting stays as separate events.
   * Only the final DAC scheduling representation
   * merges an explicit tied chain.
   */
  function audibleTieEvents(
    events
  ) {
    const output =
      [];


    for (
      let i = 0;
      i < events.length;
      i++
    ) {
      const first =
        events[
          i
        ];


      if (
        first._type !==
          'note' ||
        first.tieNext !==
          true
      ) {
        output.push(
          first
        );

        continue;
      }


      const merged = {
        ...first
      };


      let current =
        first;


      while (
        current.tieNext ===
          true
      ) {
        const next =
          events[
            i + 1
          ];


        merged._endA8 =
          next._endA8;

        merged._durationA8 =
          merged._endA8 -
          merged._startA8;


        i++;

        current =
          next;
      }


      merged.tiePrev =
        false;

      merged.tieNext =
        false;


      output.push(
        merged
      );
    }


    return output;
  }


  class A8MusicPlayerV1 {

    constructor(
      options = {}
    ) {
      this.onState =
        typeof options.onState ===
        'function'
          ? options.onState
          : () => {};

      this.onEvent =
        typeof options.onEvent ===
        'function'
          ? options.onEvent
          : () => {};

      this.context = null;
      this.voices = [];
      this.frame = 0;

      this.anchorTime = 0;
      this.totalA8 = 0;
      this.events = [];

      this.activeIndex = -1;

      this.coreReady = false;
      this.playing = false;

      window.addEventListener(
        'pagehide',
        () => {
          this.stop(
            'PAGE HIDDEN'
          );
        }
      );

      document.addEventListener(
        'visibilitychange',
        () => {
          if (
            document.hidden &&
            this.playing
          ) {
            this.stop(
              'TAB HIDDEN · PREVIEW STOPPED'
            );
          }
        }
      );
    }


    static get
    DAC_SECONDS_PER_A8_SECOND() {
      return (
        DAC_SECONDS_PER_A8_SECOND
      );
    }


    static parseA8Fraction(
      value
    ) {
      return parseA8Fraction(
        value
      );
    }


    static validateScore(
      score
    ) {
      return validateScore(
        score
      );
    }


    async connectCore() {
      const response =
        await fetch(
          '/api/core20/clock',
          {
            cache:
              'no-store'
          }
        );

      const payload =
        await response
          .json()
          .catch(
            () => null
          );

      if (
        !response.ok ||
        !payload ||
        payload.ok === false
      ) {
        throw new Error(
          'CORE20 CLOCK CONNECTION FAILED'
        );
      }

      this.coreReady =
        true;

      this.onState({
        type:
          'CORE_READY',

        payload
      });

      return payload;
    }


    ensureContext() {
      if (!this.context) {
        this.context =
          new (
            window.AudioContext ||
            window.webkitAudioContext
          )();
      }

      return this.context;
    }


    setMotion(
      oscillator,
      hz,
      startAt,
      endAt,
      motion
    ) {
      const p =
        oscillator.frequency;

      const safe =
        value =>
          Math.max(
            1,
            value
          );

      p.cancelScheduledValues(
        startAt
      );

      if (
        motion === 'rise'
      ) {
        p.setValueAtTime(
          safe(
            hz * 0.72
          ),
          startAt
        );

        p.exponentialRampToValueAtTime(
          safe(
            hz * 1.28
          ),
          endAt
        );

        return;
      }

      if (
        motion === 'fall'
      ) {
        p.setValueAtTime(
          safe(
            hz * 1.28
          ),
          startAt
        );

        p.exponentialRampToValueAtTime(
          safe(
            hz * 0.72
          ),
          endAt
        );

        return;
      }

      if (
        motion === 'whoosh'
      ) {
        const middle =
          startAt +
          (
            endAt -
            startAt
          ) * 0.55;

        p.setValueAtTime(
          safe(
            hz * 0.58
          ),
          startAt
        );

        p.exponentialRampToValueAtTime(
          safe(
            hz * 1.45
          ),
          middle
        );

        p.exponentialRampToValueAtTime(
          safe(
            hz * 0.82
          ),
          endAt
        );

        return;
      }

      p.setValueAtTime(
        hz,
        startAt
      );
    }


    scheduleEvent(
      event,
      anchorTime
    ) {
      /*
       * A REST is explicit score time.
       *
       * Nothing is scheduled because silence
       * is already the speaker's state.
       * Its exact start/end still contributes
       * to score duration and display position.
       */
      if (
        event._type ===
        'rest'
      ) {
        return;
      }

      const ac =
        this.context;

      /*
       * Native A8 start and duration
       * are already decided before
       * reaching this output adapter.
       */

      const startAt =
        anchorTime +
        event._startA8 *
        DAC_SECONDS_PER_A8_SECOND;

      const endAt =
        startAt +
        event._durationA8 *
        DAC_SECONDS_PER_A8_SECOND;

      const durationSeconds =
        endAt -
        startAt;

      /*
       * Final speaker translation only.
       */

      const hz =
        event._pitch /
        DAC_SECONDS_PER_A8_SECOND;

      const oscillator =
        ac.createOscillator();

      const output =
        ac.createGain();

      oscillator.type =
        event._waveform;

      this.setMotion(
        oscillator,
        hz,
        startAt,
        endAt,
        event._motion
      );

      /*
       * Envelope is expression only.
       * It cannot alter A8 boundaries.
       */

      const attack =
        Math.min(
          0.018,
          durationSeconds *
          0.16
        );

      const release =
        Math.min(
          0.028,
          durationSeconds *
          0.22
        );

      const sustainStart =
        Math.min(
          endAt,
          startAt +
          attack
        );

      const releaseStart =
        Math.max(
          sustainStart,
          endAt -
          release
        );

      output.gain
        .cancelScheduledValues(
          startAt
        );

      output.gain
        .setValueAtTime(
          0.0001,
          startAt
        );

      output.gain
        .linearRampToValueAtTime(
          Math.max(
            0.0001,
            event._gain
          ),
          sustainStart
        );

      output.gain
        .setValueAtTime(
          Math.max(
            0.0001,
            event._gain
          ),
          releaseStart
        );

      output.gain
        .linearRampToValueAtTime(
          0.0001,
          endAt
        );

      oscillator.connect(
        output
      );

      output.connect(
        ac.destination
      );

      oscillator.start(
        startAt
      );

      oscillator.stop(
        endAt + 0.02
      );

      this.voices.push({
        oscillator,
        output
      });
    }

    async play(
      score
    ) {
      if (
        !this.coreReady
      ) {
        throw new Error(
          'CONNECT TO CORE20 BEFORE PREVIEW'
        );
      }

      const parsed =
        validateScore(
          score
        );

      this.stop(
        null,
        false
      );

      const ac =
        this.ensureContext();

      if (
        ac.state ===
        'suspended'
      ) {
        await ac.resume();
      }

      this.events =
        parsed.events;

      this.totalA8 =
        parsed.totalA8;

      this.activeIndex =
        -1;

      /*
       * Small DAC-output lead.
       * No A8 definition occurs here.
       */

      this.anchorTime =
        ac.currentTime +
        0.08;

      this.playing =
        true;

      for (
        const event
        of audibleTieEvents(
          this.events
        )
      ) {
        this.scheduleEvent(
          event,
          this.anchorTime
        );
      }

      this.onState({
        type:
          'PLAYING',

        totalA8:
          this.totalA8,

        eventCount:
          this.events.length,

        outputSecondsPerA8Second:
          DAC_SECONDS_PER_A8_SECOND
      });

      this.tick();
    }


    tick() {
      if (
        !this.playing ||
        !this.context
      ) {
        return;
      }

      /*
       * DISPLAY POSITION ONLY.
       * Never fed into score timing.
       */

      const elapsedA8 =
        Math.max(
          0,

          (
            this.context.currentTime -
            this.anchorTime
          ) /
          DAC_SECONDS_PER_A8_SECOND
        );

      let nextIndex =
        -1;

      for (
        let i = 0;
        i < this.events.length;
        i++
      ) {
        const event =
          this.events[i];

        if (
          elapsedA8 >=
            event._startA8 &&
          elapsedA8 <
            event._endA8
        ) {
          nextIndex = i;
          break;
        }
      }

      if (
        nextIndex !==
        this.activeIndex
      ) {
        this.activeIndex =
          nextIndex;

        this.onEvent({
          index:
            nextIndex,

          event:
            nextIndex >= 0
              ? this.events[
                  nextIndex
                ]
              : null,

          elapsedA8
        });
      }

      this.onState({
        type:
          'POSITION',

        elapsedA8,

        totalA8:
          this.totalA8
      });

      if (
        elapsedA8 >=
        this.totalA8
      ) {
        this.playing =
          false;

        this.activeIndex =
          -1;

        this.onEvent({
          index: -1,
          event: null,
          elapsedA8:
            this.totalA8
        });

        this.onState({
          type:
            'COMPLETE',

          totalA8:
            this.totalA8
        });

        return;
      }

      this.frame =
        requestAnimationFrame(
          () =>
            this.tick()
        );
    }


    stop(
      reason = 'STOPPED',
      notify = true
    ) {
      if (
        this.frame
      ) {
        cancelAnimationFrame(
          this.frame
        );
      }

      this.frame = 0;

      if (
        this.context
      ) {
        const now =
          this.context.currentTime;

        for (
          const voice
          of this.voices
        ) {
          try {
            voice.output.gain
              .cancelScheduledValues(
                now
              );
          } catch (_) {}

          try {
            voice.output.gain
              .setValueAtTime(
                0.0001,
                now
              );
          } catch (_) {}

          try {
            voice.oscillator
              .stop(
                now +
                0.01
              );
          } catch (_) {}
        }
      }

      this.voices = [];
      this.playing = false;
      this.activeIndex = -1;

      this.onEvent({
        index: -1,
        event: null,
        elapsedA8: 0
      });

      if (
        notify &&
        reason
      ) {
        this.onState({
          type:
            'STOPPED',

          reason
        });
      }
    }
  }


  window.A8MusicPlayerV1 =
    A8MusicPlayerV1;

})();
