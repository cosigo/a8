'use strict';

(() => {
  const PANEL_ID = 'core20-virtual-operating-surface';
  const DAY = 131072;
  const A8_STATE_MS = 675000 / 1024;

  const byId = id => document.getElementById(id);

  let refreshBusy = false;
  let refreshTimer = null;

  /*
   * CORE18-STYLE CIVIL CLOCK OBSERVER
   *
   * Core20 owns DAY_PHASE17 and exactSubstate.
   * performance.now() is output-only interpolation between authoritative anchors.
   * Ordinary poll arrival is NOT the beat source.
   */
  let clockObserverReady = false;
  let clockObserverRunning = false;
  let clockAnchorTotal = 0;
  let clockAnchorPerf = performance.now();
  let clockObserverEpoch = null;
  let clockFrameStarted = false;

  const value = (id, v) => {
    const el = byId(id);
    if (el) {
      el.textContent =
        v === null || v === undefined || v === ''
          ? '—'
          : String(v);
    }
  };

  const status = (text, kind = 'warn') => {
    const el = byId('c20vStatus');
    if (!el) return;
    el.textContent = text;
    el.className = `pill ${kind}`;
  };

  async function api(path, options = {}) {
    const response = await fetch(path, {
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      ...options,
    });

    const payload = await response.json();

    if (!response.ok || payload.ok === false) {
      throw new Error(payload.error || `${path} failed`);
    }

    return payload;
  }

  const post = (path, body = {}) =>
    api(path, {
      method: 'POST',
      body: JSON.stringify(body),
    });

  function serverContinuousTotal(clock) {
    const sub = clock.exactSubstate || {};
    const n = Number(sub.numerator || 0);
    const d = Number(sub.denominator || 1);

    const frac =
      Number.isFinite(n) &&
      Number.isFinite(d) &&
      d > 0
        ? n / d
        : 0;

    return (
      Number(clock.dayCount || 0) * DAY +
      Number(clock.dayPhase17 || 0) +
      frac
    );
  }

  function observerContinuousTotal(
    nowPerf = performance.now()
  ) {
    if (!clockObserverReady) return NaN;

    const elapsedStates =
      clockObserverRunning
        ? (nowPerf - clockAnchorPerf) /
          A8_STATE_MS
        : 0;

    return clockAnchorTotal + elapsedStates;
  }

  function reanchorClockObserver(
    clock,
    force = false
  ) {
    if (
      !clock ||
      clock.status !== 'CORE20_CLOCK_RUNNING'
    ) {
      clockObserverRunning = false;
      return;
    }

    const now = performance.now();
    const serverTotal =
      serverContinuousTotal(clock);
    const nextEpoch =
      String(clock.sourceEpoch ?? '');

    if (
      !Number.isFinite(serverTotal)
    ) {
      return;
    }

    if (
      !clockObserverReady ||
      force ||
      nextEpoch !== clockObserverEpoch ||
      !clockObserverRunning
    ) {
      clockAnchorTotal = serverTotal;
      clockAnchorPerf = now;
      clockObserverEpoch = nextEpoch;
      clockObserverReady = true;
      clockObserverRunning = true;
      return;
    }

    /*
     * Proven v5.4.18 rule:
     * ordinary packet arrival is NOT the beat source.
     * Only material divergence causes a hard display re-anchor.
     */
    const predicted =
      observerContinuousTotal(now);
    const err =
      serverTotal - predicted;

    if (Math.abs(err) > 2) {
      clockAnchorTotal = serverTotal;
      clockAnchorPerf = now;
    }

    clockObserverEpoch = nextEpoch;
    clockObserverRunning = true;
  }

  function fieldsFromPhase(p) {
    return {
      second: p & 63,
      minute: (p >> 6) & 63,
      hour: (p >> 12) & 31,
    };
  }

  function renderSmoothClock() {
    if (
      !clockObserverReady ||
      !clockObserverRunning
    ) {
      return;
    }

    const total =
      Math.floor(
        observerContinuousTotal()
      );

    if (!Number.isFinite(total)) return;

    const phase =
      ((total % DAY) + DAY) % DAY;

    const f =
      fieldsFromPhase(phase);

    value('c20vPhase', phase);

    value(
      'c20vClock',
      `${String(f.hour).padStart(2, '0')}:` +
      `${String(f.minute).padStart(2, '0')}:` +
      `${String(f.second).padStart(2, '0')}`
    );
  }

  function clockFrame() {
    renderSmoothClock();

    requestAnimationFrame(
      clockFrame
    );
  }

  function startClockFrame() {
    if (clockFrameStarted) return;

    clockFrameStarted = true;

    requestAnimationFrame(
      clockFrame
    );
  }


  const MINTAKA_REGISTER_BITS = 18n;
  const MINTAKA_REGISTER_STATES =
    1n << MINTAKA_REGISTER_BITS;

  const SOL_REGISTER_BITS = 27n;
  const SOL_REGISTER_STATES =
    1n << SOL_REGISTER_BITS;

  function registerMod(value, modulus) {
    return (
      (value % modulus) +
      modulus
    ) % modulus;
  }

  function exactRational(obj) {
    if (!obj) return null;

    try {
      if (
        obj.numerator !== undefined &&
        obj.denominator !== undefined
      ) {
        const numerator =
          BigInt(obj.numerator);

        const denominator =
          BigInt(obj.denominator);

        if (denominator <= 0n) {
          return null;
        }

        return {
          numerator,
          denominator,
        };
      }

      if (obj.text !== undefined) {
        const text =
          String(obj.text).trim();

        const slash =
          text.indexOf('/');

        if (slash < 0) {
          return {
            numerator: BigInt(text),
            denominator: 1n,
          };
        }

        const numerator =
          BigInt(
            text.slice(0, slash)
          );

        const denominator =
          BigInt(
            text.slice(slash + 1)
          );

        if (denominator <= 0n) {
          return null;
        }

        return {
          numerator,
          denominator,
        };
      }
    } catch (_) {
      return null;
    }

    return null;
  }


  /*
   * MINTAKA LIVE EARTH-ROTATION REGISTER
   *
   * Last accepted STELLAR_MERIDIAN is the zero crossing.
   *
   * recovered rotation:
   *     813694976 raw
   *
   * Register:
   *     2^18 states / Earth axial rotation
   *
   * No conventional time enters this calculation.
   */
  function mintakaLiveRegister(
    selectedRaw,
    observer,
    scale
  ) {
    try {
      if (
        selectedRaw === null ||
        selectedRaw === undefined ||
        !observer ||
        observer.lastRawPulse === undefined
      ) {
        return null;
      }

      const recurrence =
        exactRational(
          scale &&
          scale.mintakaRawPerEarthAxialRotation
        );

      if (!recurrence) {
        return null;
      }

      const raw =
        BigInt(selectedRaw);

      const anchor =
        BigInt(
          observer.lastRawPulse
        );

      const delta =
        raw - anchor;

      /*
       * recurrence = numerator / denominator raw.
       *
       * rotation fraction =
       *   delta / recurrence
       * = delta * denominator / numerator
       */
      const rotationNumerator =
        registerMod(
          delta * recurrence.denominator,
          recurrence.numerator
        );

      return (
        rotationNumerator *
        MINTAKA_REGISTER_STATES
      ) / recurrence.numerator;
    } catch (_) {
      return null;
    }
  }


  /*
   * SOL LIVE ORBIT REGISTER
   *
   * Start from the last actually observed native angle512,
   * then advance using the recovered:
   *
   *     SOL_ANGLE_PER_RAW
   *
   * The native celestial turn already has 512 = 2^9
   * angle states.
   *
   * We append 18 exact binary subdivisions:
   *
   *     9 + 18 = 27 bits
   *
   * therefore:
   *
   *     phase27 = angle512 × 2^18
   *
   * modulo the full 2^27 orbit register.
   */
  function solLiveRegister(
    selectedRaw,
    observer,
    scale
  ) {
    try {
      if (
        selectedRaw === null ||
        selectedRaw === undefined ||
        !observer ||
        observer.lastRawPulse === undefined
      ) {
        return null;
      }

      const angle =
        exactRational(
          observer.lastAngle512
        );

      const rate =
        exactRational(
          scale &&
          scale.solAdvancePerRawPulse512
        );

      if (!angle || !rate) {
        return null;
      }

      const raw =
        BigInt(selectedRaw);

      const anchorRaw =
        BigInt(
          observer.lastRawPulse
        );

      const deltaRaw =
        raw - anchorRaw;

      /*
       * angleNow =
       *
       * angle.numerator / angle.denominator
       *
       * +
       *
       * deltaRaw *
       * rate.numerator / rate.denominator
       */
      const angleNowNumerator =
        angle.numerator *
          rate.denominator +
        deltaRaw *
          rate.numerator *
          angle.denominator;

      const angleNowDenominator =
        angle.denominator *
        rate.denominator;

      /*
       * One angle512 unit is 1/512 turn.
       *
       * 2^27 / 512 = 2^18.
       */
      const phase27 =
        (
          angleNowNumerator *
          (1n << 18n)
        ) /
        angleNowDenominator;

      return registerMod(
        phase27,
        SOL_REGISTER_STATES
      );
    } catch (_) {
      return null;
    }
  }


  function formatRegisterBinary(
    value,
    bits
  ) {
    if (value === null) {
      return '—';
    }

    return (
      value
        .toString(2)
        .padStart(
          Number(bits),
          '0'
        ) +
      '₂'
    );
  }


  function formatRegisterOctal(
    value,
    digits
  ) {
    if (value === null) {
      return '—';
    }

    return (
      value
        .toString(8)
        .padStart(
          digits,
          '0'
        ) +
      '₈'
    );
  }

  async function refresh() {
    if (refreshBusy) return;
    refreshBusy = true;

    try {
      const [
        source,
        jovian,
        earth,
        sol,
        sun,
        clockP,
        runtimeP,
      ] = await Promise.all([
        api('/api/hardware/source'),
        api('/api/hardware/jovian'),
        api('/api/hardware/earth-rotation-scale'),
        api('/api/hardware/sol-orbital-scale'),
        api('/api/hardware/sun-return-recurrence'),
        api('/api/core20/clock'),
        api('/api/core20/runtime'),
      ]);

      const sourceState =
        source.source || source;

      const tk =
        jovian.timekeeper || {};

      const earthScale =
        earth.scale || {};

      const solScale =
        sol.scale || {};

      const earthObservers =
        earth.earthObservers ||
        sol.earthObservers ||
        {};

      const mintakaObserver =
        earthObservers.mintaka || {};

      const solObserver =
        earthObservers.sol || {};

      const recurrence =
        sun.recurrence || {};

      const clock =
        clockP.clock || {};

      const runtime =
        runtimeP.runtime || {};

      /*
       * Read-only year-angle state.
       * This GET never contacts JPL.
       * JPL is contacted only by explicit button POST.
       */
      const yearP =
        await api(
          '/api/core20/year-angle'
        );

      const year =
        yearP.yearAngle || {};

      value(
        'c20vSource',
        sourceState.mode
      );

      value(
        'c20vEpoch',
        sourceState.sourceEpoch
      );

      const selectedRaw =
        clock.currentSelectedRawPulse ??
        (
          sourceState.gate6a &&
          sourceState.gate6a.lastRawPulse
        ) ??
        earthObservers.selectedRawPulse ??
        null;

      value(
        'c20vRaw',
        selectedRaw
      );

      value(
        'c20vJovian',
        tk.status === 'JOVIAN_PHASE_RUNNING'
          ? 'RECOVERED · 1:2:4'
          : tk.status
      );

      value(
        'c20vRuler',
        tk.lockedRulerRawPer512
      );

      value(
        'c20vPace',
        runtime.status === 'RUNNING'
          ? 'NODE SERVER OWNED · BROWSER IS OBSERVER'
          : runtime.status
      );

      value(
        'c20vMintaka',
        earthScale.status
      );

      const mintakaRegister =
        mintakaLiveRegister(
          selectedRaw,
          mintakaObserver,
          earthScale
        );

      value(
        'c20vMintakaRegisterBin',
        formatRegisterBinary(
          mintakaRegister,
          18n
        )
      );

      value(
        'c20vMintakaRegisterOct',
        formatRegisterOctal(
          mintakaRegister,
          6
        )
      );

      value(
        'c20vSol',
        solScale.status
      );

      const solRegister =
        solLiveRegister(
          selectedRaw,
          solObserver,
          solScale
        );

      value(
        'c20vSolRegisterBin',
        formatRegisterBinary(
          solRegister,
          27n
        )
      );

      value(
        'c20vSolRegisterOct',
        formatRegisterOctal(
          solRegister,
          9
        )
      );

      value(
        'c20vYearPhase9',
        year.phase9Octal ||
        (
          year.aligned
            ? year.status
            : 'AWAITING ONE-SHOT JPL ALIGN'
        )
      );

      value(
        'c20vYearPhase27',
        year.phase27Octal ||
        '—'
      );

      value(
        'c20vYearJpl',
        year.alignment &&
        year.alignment.jplObsEcLon360
          ? (
              year.alignment.jplObsEcLon360 +
              '° · JPL ObsEcLon'
            )
          : '—'
      );

      value(
        'c20vYearAlignStatus',
        year.status ||
        'YEAR ANGLE STATE UNAVAILABLE'
      );

      value(
        'c20vSun',
        recurrence.rawPerSunReturnRecurrence &&
        recurrence.rawPerSunReturnRecurrence.text
          ? recurrence.rawPerSunReturnRecurrence.text
          : recurrence.status
      );

      /*
       * Do not write integer clock snapshots here.
       * Polling supplies authoritative anchors only.
       */
      reanchorClockObserver(
        clock
      );

      if (
        !clockObserverReady
      ) {
        value(
          'c20vPhase',
          clock.dayPhase17 ??
          'CONNECT CLOCK FOR 0-MERIDIAN ALIGN'
        );

        value(
          'c20vClock',
          clock.clock &&
          clock.clock.decimal
            ? clock.clock.decimal
            : 'CONNECT TO CORE'
        );
      }

      value(
        'c20vCivilStatus',
        clock.status
      );

      const connectButton =
        byId('c20vConnect');

      const start =
        byId('c20vStart');

      const stop =
        byId('c20vStop');

      const resume =
        byId('c20vResume');

      const yearAlign =
        byId('c20vYearAlign');

      if (connectButton) {
        connectButton.disabled =
          runtime.status !== 'RUNNING' ||
          clock.status === 'CORE20_CLOCK_RUNNING';
      }

      if (start) {
        start.disabled =
          runtime.status === 'QUALIFYING';
      }

      if (stop) {
        stop.disabled =
          runtime.status !== 'RUNNING';
      }

      if (resume) {
        resume.disabled =
          runtime.status !== 'STOPPED';
      }

      if (yearAlign) {
        yearAlign.disabled =
          runtime.status !== 'RUNNING' ||
          year.status ===
            'YEAR_ANGLE_RUNNING_FROM_RECOVERED_SOL';
      }

      status(
        runtime.status === 'RUNNING'
          ? (
              clock.status ===
              'CORE20_CLOCK_RUNNING'
                ? 'CORE20 · RUNNING · SERVER OWNED'
                : 'CORE20 · RUNNING · CLOCK AWAITS CONNECT ALIGNMENT'
            )
          : (
              runtime.status === 'STOPPED'
                ? 'CORE20 · DIAGNOSTIC HOLD · ELAPSED TIME IS NOT BEING RECORDED'
                : `CORE20 · ${runtime.status}`
            ),
        runtime.status === 'RUNNING'
          ? 'good'
          : runtime.status === 'ERROR'
            ? 'bad'
            : 'warn'
      );

      startClockFrame();
    } catch (err) {
      clockObserverRunning = false;

      status(
        `DISCONNECTED · ${err.message}`,
        'bad'
      );
    } finally {
      refreshBusy = false;
    }
  }

  async function connectCurrent() {
    status(
      'CORE20 · CONNECTING CURRENT SOURCE EPOCH',
      'warn'
    );

    try {
      await post(
        '/api/core20/connect',
        {}
      );

      clockObserverReady = false;
      clockObserverRunning = false;
      clockObserverEpoch = null;

      await refresh();
    } catch (err) {
      status(
        `FAIL · ${err.message}`,
        'bad'
      );
    }
  }

  async function restart() {
    status(
      'CORE20 · SERVER REQUALIFYING',
      'warn'
    );

    try {
      await post(
        '/api/core20/runtime/start',
        { restart: true }
      );

      /*
       * Fresh Core20 source epochs deliberately invalidate the
       * previous zero-meridian alignment.
       *
       * RESET / START is one Chief Engineer operating action:
       *   1. restart + recover the fresh source epoch
       *   2. request the existing server-owned one-shot CONNECT
       *
       * The browser supplies no timing/alignment value.
       * /api/core20/connect accepts an empty body only.
       */
      await post(
        '/api/core20/connect',
        {}
      );

      clockObserverReady = false;
      clockObserverRunning = false;
      clockObserverEpoch = null;

      await refresh();
    } catch (err) {
      status(
        `FAIL · ${err.message}`,
        'bad'
      );
    }
  }

  async function stop() {
    try {
      await post(
        '/api/core20/runtime/stop',
        {}
      );

      clockObserverRunning = false;

      await refresh();
    } catch (err) {
      status(
        `FAIL · ${err.message}`,
        'bad'
      );
    }
  }

  async function resumeDiagnostic() {
    status(
      'CORE20 · DIAGNOSTIC RESUME · HELD ELAPSED TIME REMAINS LOST',
      'warn'
    );

    try {
      await post(
        '/api/core20/runtime/resume-diagnostic',
        {}
      );

      /*
       * Same server epoch and alignment.
       * No CONNECT call here.
       * No UTC access here.
       */
      clockObserverReady = false;
      clockObserverRunning = false;

      await refresh();
    } catch (err) {
      status(
        `FAIL · ${err.message}`,
        'bad'
      );
    }
  }

  async function alignYearAngleJpl() {
    status(
      'CORE20 · ONE-SHOT JPL YEAR-ANGLE QUERY',
      'warn'
    );

    const button =
      byId('c20vYearAlign');

    if (button) {
      button.disabled =
        true;
    }

    try {
      const result =
        await post(
          '/api/core20/year-angle/align-jpl',
          {}
        );

      const year =
        result.yearAngle || {};

      status(
        year.phase9Octal
          ? (
              'YEAR ANGLE ALIGNED · ' +
              year.phase9Octal +
              ' · RUNNING FROM RECOVERED SOL'
            )
          : 'YEAR ANGLE ALIGNMENT COMPLETE',
        'good'
      );

      await refresh();
    } catch (err) {
      status(
        `YEAR ANGLE ALIGN FAIL · ${err.message}`,
        'bad'
      );

      if (button) {
        button.disabled =
          false;
      }
    }
  }


  function loop() {
    refresh();

    refreshTimer =
      setTimeout(
        loop,
        document.hidden
          ? 1000
          : 250
      );
  }

  function wire() {
    if (!byId(PANEL_ID)) return;

    const connectButton =
      byId('c20vConnect');

    const start =
      byId('c20vStart');

    const stopButton =
      byId('c20vStop');

    const resumeButton =
      byId('c20vResume');

    if (connectButton) {
      connectButton.addEventListener(
        'click',
        connectCurrent
      );
    }

    if (start) {
      start.addEventListener(
        'click',
        restart
      );
    }

    if (stopButton) {
      stopButton.addEventListener(
        'click',
        stop
      );
    }

    if (resumeButton) {
      resumeButton.addEventListener(
        'click',
        resumeDiagnostic
      );
    }

    const yearAlignButton =
      byId('c20vYearAlign');

    if (yearAlignButton) {
      yearAlignButton.addEventListener(
        'click',
        alignYearAngleJpl
      );
    }

    loop();
  }

  document.addEventListener(
    'visibilitychange',
    () => {
      if (
        !document.hidden &&
        refreshTimer !== null
      ) {
        refresh();
      }
    }
  );

  window.addEventListener(
    'pagehide',
    () => {
      if (refreshTimer !== null) {
        clearTimeout(
          refreshTimer
        );
      }

      refreshTimer = null;
      clockObserverRunning = false;
    }
  );

  if (
    document.readyState === 'loading'
  ) {
    document.addEventListener(
      'DOMContentLoaded',
      wire
    );
  } else {
    wire();
  }
})();

