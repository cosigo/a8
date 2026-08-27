(() => {
  'use strict';
  const DAY_STATES = 131072;

  // DISPLAY-ONLY conventional bridge for browser audio.
  // Never use this value to define native A8 clock or Jovian recovery state.
  const A8_SECOND_SECONDS = 675 / 1024;
  const A8_STATE_MS = A8_SECOND_SECONDS * 1000;

  // PRESENTATION ONLY.
  // Network packets synchronize this observer; they do not animate it.
  // Web Audio schedules upcoming A8 boundaries ahead of browser rendering.
  const OBSERVER_HARD_REANCHOR_STATES = 8;
  const AUDIO_LOOKAHEAD_SECONDS = 8.000;
  const AUDIO_SCHEDULER_MS = 50;

  const PLANT_G_STEPS = 4096;
  const PLANT_SCHEDULER_HZ = 50;

  // DISPLAY-ONLY conventional bridge used to show approximate
  // simulation acceleration relative to natural Ganymede recurrence.
  // Never use this value in Jovian phase or recovery logic.
  const NATURAL_GANYMEDE_SECONDS = 7.155 * 86400;
  const state = {
    mode: 'decimal',
    running: false,
    core: null,
    coreConnected: false,
    moonStartPerf: performance.now (),
    moonPlantBase: 0,
    moonStepsPerPass: 2,
    audio: null,
    osc: null,
    gain: null,
    tickEnabled: false,
    observerReady: false,
    observerRunning: false,
    observerAnchorPhase: 0,
    observerAnchorPerf: performance.now (),
    audioTimer: null,
    nextAudioTickTime: null,
    scheduledTickVoices: new Set (),
  };

  const $ = id => document.getElementById (id);
  const clamp = (v, a, b) => Math.max (a, Math.min (b, v));
  const pad2 = n => String (n).padStart (2, '0');
  const oct2 = n => n.toString (8).padStart (2, '0');
  const gcd = (a, b) => (b ? gcd (b, a % b) : a);

  function applyCore20Snapshot (payload) {
    const clock = payload?.clock;

    if (
      !clock ||
      clock.schema !== 'A8-CORE20-SERVER-CLOCK-V1'
    ) {
      throw new Error ('INVALID CORE20 CLOCK SNAPSHOT');
    }

    const running =
      clock.status === 'CORE20_CLOCK_RUNNING';

    const phase17 =
      Number (clock.dayPhase17 || 0);

    const numerator =
      Number (clock.exactSubstate?.numerator || 0);

    const denominator =
      Number (clock.exactSubstate?.denominator || 1);

    /*
     * Normalize only the clock-coordinate portion needed by the
     * existing smooth presentation observer.
     *
     * Core20 remains authoritative.
     */
    const normalized = {
      running,
      clock: {
        phase17,
        paceFractionNumerator: numerator,
        paceFractionDenominator: denominator,
      },
    };

    state.core = normalized;
    state.coreConnected = true;
    state.running = running;

    reanchorObserver (normalized, true);

    $('clockStatus').textContent =
      running
        ? 'LIVE CORE20 · RUNNING'
        : 'CORE20 · NOT RUNNING';

    $('systemDot').className =
      running
        ? 'status-dot running'
        : 'status-dot stopped';

    const pulseOwner =
      clock.runtime?.pulseGeneratorOwner || 'CORE20';

    $('coreSource').textContent =
      pulseOwner === 'NODE_SERVER'
        ? 'CORE20 · NODE SERVER'
        : String (pulseOwner);

    $('jovianRecovery').textContent =
      running
        ? 'RECOVERED · CORE20'
        : 'CORE20 · NOT RUNNING';

    const authority =
      String (clock.clockAuthority || '');

    $('coreAuthority').textContent =
      authority === 'RECOVERED_JOVIAN_MINTAKA_SOL_SUN_RETURN'
        ? 'JOVIAN → MINTAKA → SOL → SUN RETURN'
        : (authority || '—');
  }

  function applyCore20Edge (edge) {
    if (
      !edge ||
      edge.schema !== 'A8-CORE20-CLOCK-EDGE-V1'
    ) {
      return;
    }

    const normalized = {
      running: true,
      clock: {
        phase17: Number (edge.dayPhase17 || 0),
        paceFractionNumerator: 0,
        paceFractionDenominator: 1,
      },
    };

    state.core = normalized;
    state.coreConnected = true;
    state.running = true;

    /*
     * The Core20 edge supplies authoritative phase.
     *
     * reanchorObserver() retains the existing presentation rule:
     * network arrival itself is NOT used as a beat source.
     */
    reanchorObserver (normalized);

    $('clockStatus').textContent =
      'LIVE CORE20 · RUNNING';

    $('systemDot').className =
      'status-dot running';
  }

  function wrapPhase (phase) {
    const p = phase % DAY_STATES;
    return p < 0 ? p + DAY_STATES : p;
  }

  function signedPhaseDelta (a, b) {
    let d = wrapPhase (a) - wrapPhase (b);
    if (d > DAY_STATES / 2) d -= DAY_STATES;
    if (d < -DAY_STATES / 2) d += DAY_STATES;
    return d;
  }

  function snapshotCorePhase (snapshot = state.core) {
    const clock = snapshot?.clock;
    if (!clock) return 0;

    const phase17 = Number (clock.phase17 || 0);
    const numerator = Number (clock.paceFractionNumerator || 0);
    const denominator = Number (clock.paceFractionDenominator || 1);

    const subphase =
      Number.isFinite (numerator) &&
      Number.isFinite (denominator) &&
      denominator > 0
        ? numerator / denominator
        : 0;

    return wrapPhase (phase17 + subphase);
  }

  function currentCorePhase (nowPerf = performance.now ()) {
    if (!state.observerReady) return snapshotCorePhase ();

    const elapsedStates =
      state.observerRunning
        ? (nowPerf - state.observerAnchorPerf) / A8_STATE_MS
        : 0;

    return wrapPhase (state.observerAnchorPhase + elapsedStates);
  }

  function reanchorObserver (snapshot, force = false) {
    const now = performance.now ();
    const serverPhase = snapshotCorePhase (snapshot);
    const nextRunning = Boolean (snapshot && snapshot.running);

    if (
      !state.observerReady ||
      force ||
      nextRunning !== state.observerRunning
    ) {
      state.observerAnchorPhase = serverPhase;
      state.observerAnchorPerf = now;
      state.observerReady = true;
      state.observerRunning = nextRunning;
      resetTickSchedule ();
      return;
    }

    // Packet arrival is NOT a beat source. Small SSE/network/event-loop delay
    // must not make the visible clock hop.
    const predicted = currentCorePhase (now);
    const errorStates = signedPhaseDelta (serverPhase, predicted);

    if (Math.abs (errorStates) > OBSERVER_HARD_REANCHOR_STATES) {
      state.observerAnchorPhase = serverPhase;
      state.observerAnchorPerf = now;
      resetTickSchedule ();
    }

    state.observerRunning = nextRunning;
  }

  function connectCore () {
    fetch (
      '/api/core20/clock',
      {
        cache: 'no-store'
      }
    )
      .then (r => {
        if (!r.ok) {
          throw new Error (`HTTP ${r.status}`);
        }

        return r.json ();
      })
      .then (applyCore20Snapshot)
      .catch (() => {
        state.coreConnected = false;

        $('clockStatus').textContent =
          'CORE20 UNAVAILABLE';

        $('systemDot').className =
          'status-dot stopped';
      });

    /*
     * Native Core20 authoritative DAY_PHASE17 edge stream.
     *
     * Named SSE event:
     *     event: a8-edge
     *
     * There is intentionally no Core18 /events compatibility layer.
     */
    const ev =
      new EventSource (
        '/api/core20/edges'
      );

    ev.addEventListener (
      'a8-edge',
      e => {
        try {
          applyCore20Edge (
            JSON.parse (e.data)
          );
        } catch (_) {
          $('clockStatus').textContent =
            'CORE20 DATA ERROR';
        }
      }
    );

    ev.onerror = () => {
      state.coreConnected = false;

      $('clockStatus').textContent =
        'CORE20 STREAM · RECONNECTING';

      $('systemDot').className =
        'status-dot stopped';
    };
  }

  function splitPhase (phase) {
    const p = (Math.floor (phase) % DAY_STATES + DAY_STATES) % DAY_STATES;
    return {
      phase: p,
      hour: Math.floor (p / 4096),
      minute: Math.floor (p % 4096 / 64),
      second: p % 64,
    };
  }

  async function ensureAudioContext () {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    state.audio = state.audio || new AC ();
    if (state.audio.state === 'suspended') await state.audio.resume ();
    return state.audio;
  }

  async function setA8Tick (enabled) {
    state.tickEnabled = Boolean (enabled);
    resetTickSchedule ();

    if (state.tickEnabled) {
      const audio = await ensureAudioContext ();
      if (!audio) {
        state.tickEnabled = false;
        $ ('a8TickEnabled').checked = false;
        return;
      }
      seedTickSchedule ();
    }
  }

  function scheduleA8TickAt (when) {
    if (!state.tickEnabled || !state.running || !state.audio) return;

    const osc = state.audio.createOscillator ();
    const gain = state.audio.createGain ();
    const voice = { osc, gain };
    state.scheduledTickVoices.add (voice);

    osc.type = 'sine';
    // Native tick pitch: 576 cycles per A8 SECOND.
    // Web Audio receives the conventional equivalent only at the output boundary.
    osc.frequency.setValueAtTime (nativeToHz (576), when);
    gain.gain.setValueAtTime (0.0001, when);
    gain.gain.exponentialRampToValueAtTime (0.045, when + 0.003);
    gain.gain.exponentialRampToValueAtTime (0.0001, when + 0.045);
    osc.connect (gain);
    gain.connect (state.audio.destination);

    osc.onended = () => {
      state.scheduledTickVoices.delete (voice);
      try { osc.disconnect (); } catch (_) {}
      try { gain.disconnect (); } catch (_) {}
    };

    osc.start (when);
    osc.stop (when + 0.055);
  }

  function cancelScheduledTicks () {
    if (!state.audio) {
      state.scheduledTickVoices.clear ();
      return;
    }

    const now = state.audio.currentTime;

    for (const voice of state.scheduledTickVoices) {
      try { voice.osc.stop (now); } catch (_) {}
      try { voice.osc.disconnect (); } catch (_) {}
      try { voice.gain.disconnect (); } catch (_) {}
    }

    state.scheduledTickVoices.clear ();
  }

  function resetTickSchedule () {
    state.nextAudioTickTime = null;
    cancelScheduledTicks ();
  }

  function seedTickSchedule () {
    if (
      !state.tickEnabled ||
      !state.running ||
      !state.observerReady ||
      !state.audio
    ) return;

    const phase = currentCorePhase ();
    const fraction = phase - Math.floor (phase);
    let delay = (1 - fraction) * A8_SECOND_SECONDS;

    // Never squeeze a nearly-expired boundary into the audio queue.
    if (delay < 0.060) delay += A8_SECOND_SECONDS;

    state.nextAudioTickTime = state.audio.currentTime + delay;
  }

  function runTickScheduler () {
    if (
      !state.tickEnabled ||
      !state.running ||
      !state.observerReady ||
      !state.audio
    ) {
      state.nextAudioTickTime = null;
    } else {
      if (state.nextAudioTickTime === null) seedTickSchedule ();

      while (
        state.nextAudioTickTime !== null &&
        state.nextAudioTickTime <
          state.audio.currentTime + AUDIO_LOOKAHEAD_SECONDS
      ) {
        scheduleA8TickAt (state.nextAudioTickTime);
        state.nextAudioTickTime += A8_SECOND_SECONDS;
      }
    }

    state.audioTimer = setTimeout (runTickScheduler, AUDIO_SCHEDULER_MS);
  }

  function setMode (mode) {
    state.mode = mode;
    $ ('decimalMode').classList.toggle ('active', mode === 'decimal');
    $ ('octalMode').classList.toggle ('active', mode === 'octal');
    $ ('digitalLabel').textContent = mode === 'decimal'
      ? '0-MERIDIAN · DECIMAL COMFORT · A8 UNITS'
      : '0-MERIDIAN · NATIVE OCTAL · A8 UNITS';
    if (mode === 'decimal') {
      $ ('clockHourUnit').textContent = 'A8 HOUR · 1/32 DAY';
      $ ('clockMinuteUnit').textContent = 'A8 MINUTE · 1/64 A8 HOUR';
      $ ('clockSecondUnit').textContent = 'A8 SECOND · 1/64 A8 MINUTE';
    } else {
      $ ('clockHourUnit').textContent = 'A8 HOUR · 1/40₈ DAY';
      $ ('clockMinuteUnit').textContent = 'A8 MINUTE · 1/100₈ A8 HOUR';
      $ ('clockSecondUnit').textContent = 'A8 SECOND · 1/100₈ A8 MINUTE';
    }
  }

  function displayTime (parts) {
    if (state.mode === 'octal')
      return `${oct2 (parts.hour)}:${oct2 (parts.minute)}:${oct2 (parts.second)}₈`;
    return `${pad2 (parts.hour)}:${pad2 (parts.minute)}:${pad2 (parts.second)}`;
  }

  function drawClock (parts, phase) {
    const c = $ ('clockCanvas');
    const ctx = c.getContext ('2d');
    const w = c.width, h = c.height, cx = w / 2, cy = h / 2;
    const R = Math.min (w, h) * 0.44;
    ctx.clearRect (0, 0, w, h);

    const bg = ctx.createRadialGradient (cx, cy, R * 0.1, cx, cy, R * 1.1);
    bg.addColorStop (0, '#171b1f');
    bg.addColorStop (1, '#080a0c');
    ctx.beginPath ();
    ctx.arc (cx, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = bg;
    ctx.fill ();

    // Familiar day-orientation layer only.
    // Midnight remains at phase zero; noon remains half a day later.
    // This gradient is visual guidance and does not define A8 time.
    ctx.save ();
    ctx.beginPath ();
    ctx.arc (cx, cy, R - 15, 0, Math.PI * 2);
    ctx.clip ();

    // Stronger localized orientation zones rather than one broad wash.
    // Their centers sit inward from the MIDNIGHT / NOON words so the
    // familiar labels remain visually separate and easy to read.

    const midnightShade = ctx.createRadialGradient (
      cx, cy - R * 0.48, R * 0.04,
      cx, cy - R * 0.48, R * 0.48
    );
    midnightShade.addColorStop (0, 'rgba(0, 4, 13, 0.66)');
    midnightShade.addColorStop (0.45, 'rgba(7, 15, 31, 0.38)');
    midnightShade.addColorStop (1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = midnightShade;
    ctx.fillRect (cx - R, cy - R, R * 2, R * 2);

    const noonGlow = ctx.createRadialGradient (
      cx, cy + R * 0.47, R * 0.03,
      cx, cy + R * 0.47, R * 0.39
    );
    noonGlow.addColorStop (0, 'rgba(224, 177, 76, 0.30)');
    noonGlow.addColorStop (0.48, 'rgba(176, 125, 45, 0.17)');
    noonGlow.addColorStop (1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = noonGlow;
    ctx.fillRect (cx - R, cy - R, R * 2, R * 2);

    ctx.restore ();

    ctx.lineWidth = 7;
    ctx.strokeStyle = '#8d6b2c';
    ctx.stroke ();
    ctx.beginPath ();
    ctx.arc (cx, cy, R - 12, 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#d1d4d7';
    ctx.stroke ();

    for (let i = 0; i < 128; i++) {
      const a = i / 128 * Math.PI * 2 - Math.PI / 2;
      const major = i % 4 === 0;
      const r1 = R - (major ? 31 : 18), r2 = R - 9;
      ctx.beginPath ();
      ctx.moveTo (cx + Math.cos (a) * r1, cy + Math.sin (a) * r1);
      ctx.lineTo (cx + Math.cos (a) * r2, cy + Math.sin (a) * r2);
      ctx.lineWidth = major ? 2.3 : 1;
      ctx.strokeStyle = major ? '#d6d8db' : '#555c63';
      ctx.stroke ();
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 19px system-ui, sans-serif';
    ctx.fillStyle = '#e5e7e9';
    for (let i = 0; i < 32; i++) {
      const a = i / 32 * Math.PI * 2 - Math.PI / 2;
      const rr = R - 55;
      const label = state.mode === 'octal'
        ? i.toString (8).padStart (2, '0')
        : String (i);
      ctx.fillText (label, cx + Math.cos (a) * rr, cy + Math.sin (a) * rr);
    }

    // Familiar civil-day orientation.
    // These labels are comfort markers over the native 32-part A8 day;
    // they do not alter or define the underlying A8 phase.
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.fillStyle = '#aeb4ba';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillText ('MIDNIGHT', cx, cy - R * 0.70);
    ctx.fillText ('NOON', cx, cy + R * 0.70);

    ctx.font = '800 15px system-ui, sans-serif';
    ctx.fillStyle = '#8f969d';
    ctx.fillText ('AM', cx + R * 0.70, cy);
    ctx.fillText ('PM', cx - R * 0.70, cy);

    const dayAngle = phase / DAY_STATES * Math.PI * 2 - Math.PI / 2;
    const minuteAngle =
      (parts.minute + parts.second / 64) / 64 * Math.PI * 2 - Math.PI / 2;
    const secondAngle = parts.second / 64 * Math.PI * 2 - Math.PI / 2;
    hand (ctx, cx, cy, dayAngle, R * 0.60, 7, '#e9ecef');
    hand (ctx, cx, cy, minuteAngle, R * 0.72, 4, '#d6a13a');
    hand (ctx, cx, cy, secondAngle, R * 0.79, 2, '#dc5a0a');
    ctx.beginPath ();
    ctx.arc (cx, cy, 10, 0, Math.PI * 2);
    ctx.fillStyle = '#dc5a0a';
    ctx.fill ();
    ctx.beginPath ();
    ctx.arc (cx, cy, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#f1f2f3';
    ctx.fill ();

    ctx.font = '800 16px system-ui, sans-serif';
    ctx.fillStyle = '#d6a13a';
    ctx.fillText ('A8 · 32', cx, cy + R * 0.26);
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.fillStyle = '#858c93';
    ctx.fillText ('ONE DAY · ONE TURN', cx, cy + R * 0.34);
  }

  function hand (ctx, cx, cy, a, len, width, color) {
    ctx.beginPath ();
    ctx.moveTo (cx - Math.cos (a) * 15, cy - Math.sin (a) * 15);
    ctx.lineTo (cx + Math.cos (a) * len, cy + Math.sin (a) * len);
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.strokeStyle = color;
    ctx.stroke ();
  }

  function updateClock () {
    const p = currentCorePhase ();
    const parts = splitPhase (p);
    $ ('digitalTime').textContent = displayTime (parts);
    $ ('phaseValue').textContent =
      state.mode === 'octal'
        ? parts.phase.toString (8).padStart (6, '0') + '₈'
        : String (parts.phase);
    const turnState = Math.floor (p * 512 / DAY_STATES) % 512;

    $ ('dayFraction').textContent =
      state.mode === 'octal'
        ? `A8 TURN STATE ${turnState.toString (8).padStart (3, '0')}₈ · RANGE 000₈–777₈ · WRAP → 000₈`
        : `A8 TURN STATE ${turnState} · RANGE 0–511 · WRAP → 0`;
    $ ('stateDecimal').textContent = String (parts.phase);
    $ ('stateOctal').textContent =
      parts.phase.toString (8).padStart (6, '0') + '₈';
    $ ('stateBinary').textContent =
      parts.phase.toString (2).padStart (17, '0') + '₂';
    drawClock (parts, p);
  }

  const moons = [
    {
      id: 'io',
      name: 'Io',
      ratio: '×4',
      period: 1,
      amp: 0.38,
      phase: 0.13,
      e: 0.07,
    },
    {
      id: 'eu',
      name: 'Europa',
      ratio: '×2',
      period: 2,
      amp: 0.55,
      phase: 0.31,
      e: 0.05,
    },
    {
      id: 'ga',
      name: 'Ganymede',
      ratio: '×1',
      period: 4,
      amp: 0.74,
      phase: 0.57,
      e: 0.04,
    },
    {
      id: 'ca',
      name: 'Callisto',
      ratio: 'witness',
      period: 28 / 3,
      amp: 0.90,
      phase: 0.79,
      e: 0.08,
    },
  ];

  function createMoonRows () {
    const host = $ ('moonRows');
    host.innerHTML = '';
    for (const m of moons) {
      const row = document.createElement ('div');
      row.className = 'moon-row';
      row.innerHTML = `
        <div class="moon-name"><strong>${m.name}</strong><span>${m.ratio}</span></div>
        <div class="moon-track"><div class="jupiter"></div><div class="moon-dot" id="dot-${m.id}"></div></div>
        <div class="moon-state"><strong id="we-${m.id}">—</strong><span id="ra-${m.id}">—</span></div>`;
      host.appendChild (row);
    }
  }

  function currentMoonPlantAdvance (now = performance.now ()) {
    const elapsed = (now - state.moonStartPerf) / 1000;
    return (
      state.moonPlantBase +
      elapsed * PLANT_SCHEDULER_HZ * state.moonStepsPerPass
    );
  }

  function naturalRateMultiple () {
    return (
      NATURAL_GANYMEDE_SECONDS *
      PLANT_SCHEDULER_HZ /
      PLANT_G_STEPS *
      state.moonStepsPerPass
    );
  }

  function updateMoonRateReadout () {
    $ (
      'publicMoonRate'
    ).textContent = `≈${Math.round (naturalRateMultiple ()).toLocaleString ()}×`;
  }

  function setMoonSpeed (value) {
    const n = Number (value);
    if (![1, 2, 4, 8].includes (n)) return;
    const now = performance.now ();
    state.moonPlantBase = currentMoonPlantAdvance (now);
    state.moonStartPerf = now;
    state.moonStepsPerPass = n;
    $ ('publicMoonSpeed').value = String (n);
    updateMoonRateReadout ();
  }

  function updateMoons () {
    const plantAdvance = currentMoonPlantAdvance ();
    for (const m of moons) {
      const phi = (plantAdvance / (PLANT_G_STEPS / 4 * m.period) + m.phase) % 1;
      const theta = phi * Math.PI * 2;
      const x = Math.sin (theta) * m.amp;
      const left = 50 + x * 46;
      const dot = $ (`dot-${m.id}`);
      dot.style.left = `${left}%`;

      // Observer depth only: near half passes in front of Jupiter,
      // far half passes behind it. This does not alter orbital phase
      // or projected WEST/EAST position.
      const front = Math.cos (theta) >= 0;
      dot.classList.toggle ('front', front);
      dot.classList.toggle ('back', !front);

      $ (
        `we-${m.id}`
      ).textContent = `${x < 0 ? 'W' : 'E'} · ${Math.abs (x).toFixed (3)}`;
      const depth = (1 - Math.cos (theta)) / 2;
      const label = depth < 0.18
        ? 'FRONT'
        : depth > 0.82 ? 'BACK' : depth < 0.5 ? 'FRONT→BACK' : 'BACK→FRONT';

      $ (`ra-${m.id}`).textContent = label;
    }
  }

  function angleFromOctal (raw) {
    const cleaned = String (raw).trim ().replace (/₈/g, '');
    if (!/^[0-7]{1,4}$/.test (cleaned)) return null;
    const value = parseInt (cleaned, 8);
    if (value < 0 || value > 512) return null;
    return value;
  }

  function fractionLabel (n, d) {
    if (n === 0) return '0';
    if (n === d) return '1';
    const g = gcd (n, d);
    return `${n / g}/${d / g}`;
  }

  function applyAngle (raw = $ ('angleOctal').value) {
    const n = angleFromOctal (raw);
    if (n === null) {
      $ ('angleOctal').setCustomValidity ('Enter octal 000 through 1000.');
      $ ('angleOctal').reportValidity ();
      return;
    }
    $ ('angleOctal').setCustomValidity ('');
    $ ('angleOctal').value = n.toString (8).padStart (n === 512 ? 4 : 3, '0');
    $ ('angleState').textContent = `${n} / 512`;
    $ ('angleTurn').textContent = fractionLabel (n, 512);
    const deg = n * 45 / 64;
    $ (
      'angleDegrees'
    ).textContent = `${Number.isInteger (deg) ? deg : deg
          .toFixed (6)
          .replace (/0+$/, '')
          .replace (/\.$/, '')}°`;
  }

  function nativeToHz (n) {
    return n / A8_SECOND_SECONDS;
  }
  function updateToneReadout () {
    const n = Number ($ ('toneNative').value);
    $ ('toneHz').textContent = `${nativeToHz (n).toFixed (3)} Hz`;
  }
  async function playTone () {
    stopTone ();
    const audio = await ensureAudioContext ();
    if (!audio) return;
    state.osc = audio.createOscillator ();
    state.gain = audio.createGain ();
    state.osc.type = 'sine';
    state.osc.frequency.value = nativeToHz (Number ($ ('toneNative').value));
    state.gain.gain.value = 0.055;
    state.osc.connect (state.gain);
    state.gain.connect (state.audio.destination);
    state.osc.start ();
  }
  function stopTone () {
    if (state.osc) {
      try {
        state.osc.stop ();
      } catch (e) {}
      state.osc.disconnect ();
      state.osc = null;
    }
    if (state.gain) {
      state.gain.disconnect ();
      state.gain = null;
    }
  }

  function openWhitepaper () {
    const d = $ ('whitepaperDialog');
    if (typeof d.showModal === 'function') d.showModal ();
    else window.location.href = 'whitepaper.html';
  }

  $ ('publicMoonSpeed').addEventListener ('change', e =>
    setMoonSpeed (e.target.value)
  );
  $ ('a8TickEnabled').addEventListener ('change', e =>
    setA8Tick (e.target.checked)
  );
  $ ('decimalMode').addEventListener ('click', () => setMode ('decimal'));
  $ ('octalMode').addEventListener ('click', () => setMode ('octal'));
  $ ('applyAngle').addEventListener ('click', () => applyAngle ());
  $ ('angleOctal').addEventListener ('keydown', e => {
    if (e.key === 'Enter') applyAngle ();
  });
  document.querySelectorAll ('[data-angle]').forEach (b =>
    b.addEventListener ('click', () => {
      $ ('angleOctal').value = b.dataset.angle;
      applyAngle (b.dataset.angle);
    })
  );
  $ ('toneNative').addEventListener ('change', () => {
    updateToneReadout ();
    if (state.osc) playTone ();
  });
  $ ('playTone').addEventListener ('click', playTone);
  $ ('stopTone').addEventListener ('click', stopTone);
  $ ('openWhitepaper').addEventListener ('click', openWhitepaper);
  $ ('footerWhitepaper').addEventListener ('click', openWhitepaper);
  document.addEventListener ('visibilitychange', () => {
    if (document.hidden) {
      stopTone ();
      return;
    }

    // Browser suspension/throttling may have interrupted queue maintenance.
    // Re-seed presentation audio from the current observer phase.
    if (state.tickEnabled) {
      ensureAudioContext ().then (() => {
        resetTickSchedule ();
        seedTickSchedule ();
      });
    }
  });

  createMoonRows ();
  applyAngle ('200');
  updateToneReadout ();
  updateMoonRateReadout ();
  connectCore ();
  runTickScheduler ();
  function frame () {
    updateClock ();
    updateMoons ();
    requestAnimationFrame (frame);
  }
  requestAnimationFrame (frame);
}) ();
