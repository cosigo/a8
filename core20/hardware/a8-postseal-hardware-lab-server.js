'use strict';

/*
 * AUSPICIOUS 8 · POST-SEAL HARDWARE BRANCH
 * GATE 6E · VISIBLE HARDWARE LAB SERVER
 *
 * Dedicated post-seal development observer.
 *
 * Default:
 *   HOST=127.0.0.1
 *   PORT=18020
 *
 * This server is deliberately separate from v5.4.20 server.js.
 *
 * API:
 *   GET  /api/hardware/source
 *   POST /api/hardware/source/select
 *   POST /api/hardware/virtual/advance
 *
 * There is deliberately NO network endpoint that can inject a REAL sample.
 * Future REAL observations must enter through the proven Gate-6C local
 * read-only device path, not through browser/network pretending to be hardware.
 */

const fs = require('fs');
const http = require('http');
const path = require('path');

const {
  MODE_VIRTUAL,
  MODE_REAL,
  A8PulseSourceEpochSelector,
} = require('./a8-pulse-source-selector');

const {
  Core20RecoveryInputBridge,
} = require('./a8-core20-recovery-input-bridge');

const {
  Core20JovianRecoveryWrapper,
} = require('./a8-jovian-recovery-wrapper');

const {
  Gate6GVirtualJovianFixture,
} = require('../experiments/a8-gate6g-jovian-virtual-fixture');

const {
  JovianPhaseTimekeeper,
} = require('./a8-jovian-phase-timekeeper');

const {
  SelectedSourceEarthObservationBridge,
} = require('./a8-selected-source-earth-observation-bridge');

const {
  deriveEarthRotationJovianScale,
} = require('../observer/a8-earth-rotation-jovian-scale');

const {
  deriveSolOrbitalJovianScale,
} = require('../observer/a8-sol-orbital-jovian-scale');

const {
  deriveSunReturnRecurrence,
} = require('../observer/a8-sun-return-recurrence');

const {
  CivilDayPhase17,
} = require('../observer/a8-day-phase17-civil-clock');

const {
  Core20ServerOwnedRuntime,
} = require('./a8-core20-server-owned-runtime');

const {
  A8Core20NativeDittyBridge,
} = require('../observer/a8-core20-native-ditty-bridge');

const {
  A8YearAngleJplBridge,
} = require('../observer/a8-year-angle-jpl-bridge');

const {
  A8Core20CalendarAnchor,
} = require('../observer/a8-core20-calendar-anchor');

const {
  A8Core20FlightRecorder,
} = require('../observer/a8-core20-flight-recorder');

const DEFAULT_HOST =
  process.env.HOST || '127.0.0.1';

const DEFAULT_PORT =
  Number(process.env.PORT || 18020);

const PUBLIC_ROOT =
  path.resolve(__dirname, '..', 'public');


/*
 * SERVER-OWNED VIRTUAL RAW RESOLUTION
 *
 * 1024 is the already-proven high-resolution astronomical fixture scale.
 * The additional exact ×512 multiplier adds raw ruler marks only.
 *
 * No ratio changes:
 * Io / Europa / Ganymede, Jovian ruler, Mintaka, Sol, recovered Sun-return,
 * and the downstream exact 2^17 civil divider all scale together.
 *
 * Purpose:
 * reduce virtual integer-edge quantization at the human A8-second boundary
 * from one ~54.259 ms raw pulse to one ~0.105975 ms raw pulse.
 *
 * This is simulator resolution only. It is not a new time authority.
 */
const CORE20_VIRTUAL_BASE_SCALE = 1024n;
const CORE20_VIRTUAL_RESOLUTION_MULTIPLIER = 512n;
const CORE20_VIRTUAL_SCALE =
  CORE20_VIRTUAL_BASE_SCALE *
  CORE20_VIRTUAL_RESOLUTION_MULTIPLIER;

const CORE20_VIRTUAL_Q = 97n * CORE20_VIRTUAL_SCALE;
const CORE20_VIRTUAL_JOVIAN_RULER = 4n * CORE20_VIRTUAL_Q;
const CORE20_VIRTUAL_EARTH_ROTATION_RAW = 4n * CORE20_VIRTUAL_JOVIAN_RULER;
const CORE20_EXPECTED_SUN_RETURN = '416611827712/511';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.gif': 'image/gif',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type':
      'application/json; charset=utf-8',
    'Cache-Control':
      'no-store',
  });

  res.end(
    JSON.stringify(payload)
  );
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    let settled = false;

    const fail = err => {
      if (settled) return;
      settled = true;
      reject(err);
    };

    req.on('data', chunk => {
      if (settled) return;

      raw += chunk.toString('utf8');

      if (raw.length > 4096) {
        fail(
          new Error(
            'request body too large'
          )
        );
      }
    });

    req.on('end', () => {
      if (settled) return;
      settled = true;

      try {
        if (!raw.trim()) {
          throw new Error(
            'JSON body required'
          );
        }

        resolve(
          JSON.parse(raw)
        );
      } catch (err) {
        reject(err);
      }
    });

    req.on('error', fail);
  });
}

function staticPathFor(urlPath) {
  const pathname =
    urlPath === '/'
      ? '/index.html'
      : urlPath;

  let decoded;

  try {
    decoded =
      decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const normalized =
    path.posix.normalize(decoded);

  if (
    normalized.includes('..') ||
    normalized.startsWith('/api/')
  ) {
    return null;
  }

  const relative =
    normalized.replace(/^\/+/, '');

  const absolute =
    path.resolve(
      PUBLIC_ROOT,
      relative
    );

  if (
    absolute !== PUBLIC_ROOT &&
    !absolute.startsWith(
      PUBLIC_ROOT + path.sep
    )
  ) {
    return null;
  }

  return absolute;
}

function injectMainLabLink(html) {
  /*
   * HISTORICAL COMPATIBILITY NO-OP.
   *
   * Site-wide floating A8 LAB HOME injection
   * is permanently disabled.
   *
   * Static HTML must be served exactly as authored.
   */
  return html;
}

function injectCore20Navigation(html) {
  if (
    html.includes(
      'id="a8-core20-global-navigation"'
    )
  ) {
    return html;
  }

  const navigation =
    '<div id="a8-core20-global-navigation" ' +
    'style="position:fixed;right:12px;bottom:52px;z-index:2147483646;' +
    'display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end;' +
    'max-width:calc(100vw - 24px)">' +

    '<a href="/jovian-operations.html" ' +
    'style="padding:8px 11px;border:1px solid #6d9cff;border-radius:9px;' +
    'background:#0b0f14;color:#d9e8ff;font:800 12px/1.2 ui-monospace,' +
    'SFMono-Regular,Menlo,Consolas,monospace;text-decoration:none;' +
    'box-shadow:0 4px 18px #0008">CORE 20 FRONT PAGE</a>' +

    '<a href="/index.html" ' +
    'style="padding:8px 11px;border:1px solid #425467;border-radius:9px;' +
    'background:#0b0f14;color:#b8d8ff;font:700 12px/1.2 ui-monospace,' +
    'SFMono-Regular,Menlo,Consolas,monospace;text-decoration:none;' +
    'box-shadow:0 4px 18px #0008">ENGINEERING HUB</a>' +

    '</div>';

  if (
    /<body(?:\s[^>]*)?>/i.test(
      html
    )
  ) {
    return html.replace(
      /(<body(?:\s[^>]*)?>)/i,
      `$1\n${navigation}`
    );
  }

  return navigation + '\n' + html;
}

function serveStatic(res, urlPath) {
  const file =
    staticPathFor(urlPath);

  if (!file) {
    return false;
  }

  let stat;

  try {
    stat = fs.statSync(file);
  } catch {
    return false;
  }

  if (!stat.isFile()) {
    return false;
  }

  const ext =
    path.extname(file).toLowerCase();

  res.writeHead(200, {
    'Content-Type':
      MIME[ext] ||
      'application/octet-stream',
    'Cache-Control':
      'no-store',
  });

  if (ext === '.html') {
    const html =
      fs.readFileSync(
        file,
        'utf8'
      );

    /*
     * TOPSIDE COHERENCE 01
     *
     * Primary pages own their navigation directly.
     * The historical Core-20 floating navigation injector remains exported
     * for provenance/tests, but is no longer painted over every served page.
     *
     * Deep/legacy pages may still receive one simple A8 LAB HOME return link.
     */
    res.end(
      html
    );

    return true;
  }

  fs.createReadStream(file).pipe(res);

  return true;
}

function createHardwareLabServer({
  selector =
    new A8PulseSourceEpochSelector(),
  recoveryBridge =
    new Core20RecoveryInputBridge(),
  jovianRecovery =
    new Core20JovianRecoveryWrapper(),
  jovianFixture =
    new Gate6GVirtualJovianFixture(),
  jovianTimekeeper =
    new JovianPhaseTimekeeper(),
  earthObservationBridge =
    new SelectedSourceEarthObservationBridge(),
  civilDayPhase17 =
    new CivilDayPhase17(),
} = {}) {
  if (selector.mode === 'NONE') {
    selector.select(
      MODE_VIRTUAL
    );
  }

  recoveryBridge.sync(
    selector.snapshot()
  );

  const currentJovian = () =>
    jovianRecovery.snapshot(
      recoveryBridge.snapshot()
        .lastRawPulse
    );

  const syncRecoveryInput = () => {
    const bridge =
      recoveryBridge.sync(
        selector.snapshot()
      );

    jovianRecovery.syncRecoveryInput(
      bridge
    );

    jovianTimekeeper.sync(
      bridge,
      currentJovian()
    );

    earthObservationBridge.sync(
      bridge
    );

    return bridge;
  };

  syncRecoveryInput();

  const currentTimekeeper = () => {
    jovianTimekeeper.sync(
      recoveryBridge.snapshot(),
      currentJovian()
    );

    return jovianTimekeeper.snapshot();
  };

  const currentEarthObservers = () => {
    earthObservationBridge.sync(
      recoveryBridge.snapshot()
    );

    return earthObservationBridge.snapshot();
  };

  const currentEarthRotationScale = () =>
    deriveEarthRotationJovianScale(
      currentTimekeeper(),
      currentEarthObservers()
    );

  const currentSolOrbitalScale = () =>
    deriveSolOrbitalJovianScale(
      currentEarthRotationScale(),
      currentEarthObservers()
    );

  const currentSunReturnRecurrence = () =>
    deriveSunReturnRecurrence(
      currentEarthRotationScale(),
      currentSolOrbitalScale()
    );

  const currentDayPhase17 = () => {
    const bridge =
      syncRecoveryInput();

    civilDayPhase17.syncSource(
      bridge
    );

    return civilDayPhase17.snapshot(
      bridge,
      currentSunReturnRecurrence()
    );
  };

  const observeMintakaSelected = observation => {
    const bridge =
      syncRecoveryInput();

    return earthObservationBridge.observeMintaka(
      bridge,
      observation
    );
  };

  const observeSolSelected = observation => {
    const bridge =
      syncRecoveryInput();

    return earthObservationBridge.observeSol(
      bridge,
      observation
    );
  };

  const observeJovian = event => {
    const bridge =
      syncRecoveryInput();

    const jovian =
      jovianRecovery.observe(
        bridge,
        event
      );

    jovianTimekeeper.sync(
      bridge,
      jovian
    );

    return jovian;
  };

  const ensureVirtualFixtureStarted = () => {
    if (selector.mode !== MODE_VIRTUAL) {
      throw new Error(
        'virtual Jovian fixture requires VIRTUAL source mode'
      );
    }

    if (
      !jovianFixture.active &&
      jovianFixture.groupIndex === 0
    ) {
      jovianFixture.start(
        selector.snapshot()
          .gate6a
          .lastRawPulse
      );
    }
  };

  const runFixtureGroup = () => {
    ensureVirtualFixtureStarted();

    const target =
      jovianFixture.consume();

    if (target === null) {
      return {
        complete: true,
        fixture:
          jovianFixture.snapshot(),
        jovian:
          currentJovian(),
        timekeeper:
          currentTimekeeper(),
      };
    }

    const current =
      selector.snapshot()
        .gate6a
        .lastRawPulse;

    const currentRaw =
      current === null
        ? 0n
        : BigInt(current);

    const advance =
      target.absoluteRawPulse -
      currentRaw;

    if (advance > 0n) {
      selector.advanceVirtual(
        advance.toString()
      );
    }

    syncRecoveryInput();

    const observations = [];

    for (const event of target.events) {
      observations.push(
        observeJovian(event)
      );
    }

    return {
      complete:
        !jovianFixture.active,
      targetRawPulse:
        target.absoluteRawPulse.toString(),
      events:
        target.events,
      observations,
      fixture:
        jovianFixture.snapshot(),
      source:
        selector.snapshot(),
      recoveryInput:
        recoveryBridge.snapshot(),
      jovian:
        currentJovian(),
      timekeeper:
        currentTimekeeper(),
    };
  };

  const selectedRawBigInt = () => {
    const raw = recoveryBridge.snapshot().lastRawPulse;
    return raw === null || raw === undefined ? 0n : BigInt(raw);
  };

  const advanceVirtualRawDirect = amount => {
    const n = BigInt(amount);
    if (n <= 0n) return;
    selector.advanceVirtual(n.toString());
    syncRecoveryInput();
  };

  const advanceVirtualToDirect = target => {
    const goal = BigInt(target);
    const now = selectedRawBigInt();
    if (goal < now) {
      throw new Error(`server virtual target regressed: target=${goal} current=${now}`);
    }
    const delta = goal - now;
    if (delta > 0n) advanceVirtualRawDirect(delta);
  };

  const prepareServerOwnedHighResolutionVirtual = async ({
    qualificationPause = async () => {},
  } = {}) => {
    selector.select(MODE_REAL);
    syncRecoveryInput();

    selector.select(MODE_VIRTUAL);
    jovianFixture.reset();
    jovianRecovery.forgetRecovery();
    jovianTimekeeper.forgetLock();
    syncRecoveryInput();

    advanceVirtualRawDirect(1n);
    const baseline = selectedRawBigInt();
    const base = baseline + 8n;

    for (let k = 0; k <= 8; k += 1) {
      const target = base + CORE20_VIRTUAL_Q * BigInt(k);
      advanceVirtualToDirect(target);

      observeJovian({ moon: 'io', turn: 'WEST' });
      if (k % 2 === 0) observeJovian({ moon: 'europa', turn: 'WEST' });
      if (k % 4 === 0) observeJovian({ moon: 'ganymede', turn: 'WEST' });

      /*
       * Expose this REAL simulator recovery state to observers.
       * Raw counts and observation identities above are unchanged.
       * The pause itself has zero defining authority.
       */
      await qualificationPause();
    }

    const tk = currentTimekeeper();
    if (
      tk.status !== 'JOVIAN_PHASE_RUNNING' ||
      tk.lockedRulerRawPer512 !== CORE20_VIRTUAL_JOVIAN_RULER.toString()
    ) {
      throw new Error('server-owned virtual Jovian qualification failed');
    }

    observeMintakaSelected({
      type: 'STELLAR_MERIDIAN',
      witness: 'MINTAKA',
    });

    advanceVirtualRawDirect(CORE20_VIRTUAL_EARTH_ROTATION_RAW);

    const mintaka = observeMintakaSelected({
      type: 'STELLAR_MERIDIAN',
      witness: 'MINTAKA',
    });

    if (!mintaka.observer || mintaka.observer.status !== 'RECOVERED') {
      throw new Error('server-owned Mintaka recovery failed');
    }

    observeSolSelected({
      type: 'SOL_CELESTIAL_DIRECTION',
      witness: 'SOL',
      angle512: { numerator: '100', denominator: '1' },
    });

    advanceVirtualRawDirect(CORE20_VIRTUAL_EARTH_ROTATION_RAW);

    const sol = observeSolSelected({
      type: 'SOL_CELESTIAL_DIRECTION',
      witness: 'SOL',
      angle512: { numerator: '101', denominator: '1' },
    });

    if (!sol.observer || sol.observer.status !== 'TRACKING') {
      throw new Error('server-owned Sol recovery failed');
    }

    const recurrence = currentSunReturnRecurrence();

    if (
      !recurrence ||
      recurrence.status !== 'SUN_RETURN_RECURRENCE_RECOVERED' ||
      !recurrence.rawPerSunReturnRecurrence ||
      recurrence.rawPerSunReturnRecurrence.text !== CORE20_EXPECTED_SUN_RETURN
    ) {
      throw new Error('server-owned Sun-return recovery failed');
    }

    // Keep the pure Gate-6M endpoint alive as an internal natural phase coordinate.
    const bridge = syncRecoveryInput();
    civilDayPhase17.syncSource(bridge);
    civilDayPhase17.anchor(
      bridge,
      recurrence,
      {
        type: 'ZERO_MERIDIAN_SOLAR_MIDNIGHT',
        witness: 'A8_ZERO_MERIDIAN',
      }
    );

    return recurrence;
  };

  let nativeDittyBridge = null;

  const core20Runtime = new Core20ServerOwnedRuntime({
    prepareVirtual: prepareServerOwnedHighResolutionVirtual,
    advanceRaw: amount => {
      const result =
        advanceVirtualRawDirect(amount);

      if (
        nativeDittyBridge &&
        nativeDittyBridge.status === 'RUNNING'
      ) {
        try {
          nativeDittyBridge.observeCurrentRaw();
        } catch (_) {
          /*
           * Native ditty is downstream only.
           * Observer failure cannot stop or alter Core20.
           */
          nativeDittyBridge.reset();
        }
      }

      return result;
    },
    getRaw: () => selectedRawBigInt(),
    getSourceEpoch: () => recoveryBridge.snapshot().sourceEpoch,
    getRecurrenceText: () => {
      const recurrence = currentSunReturnRecurrence();
      if (!recurrence || !recurrence.rawPerSunReturnRecurrence) {
        throw new Error('Sun-return recurrence unavailable');
      }
      return recurrence.rawPerSunReturnRecurrence.text;
    },

    /*
     * Execution/observer resolution only.
     * Exact hrtime remainder accumulation preserves the virtual raw pace.
     */
    intervalMs: 2,

    /*
     * Human-visible accelerated simulation.
     * Nine genuine Jovian observation groups take ~6.75 s.
     * This number never enters recovered spans or time authority.
     */
    qualificationPresentationMs: 750,
  });

  /*
   * ONE-SHOT ABSOLUTE YEAR-ANGLE BRIDGE
   *
   * JPL/UTC establish position only.
   * Ongoing year phase uses selected raw + recovered Sol rate.
   */
  const yearAngleBridge =
    new A8YearAngleJplBridge({
      getRaw:
        () => selectedRawBigInt(),

      getSourceEpoch:
        () =>
          recoveryBridge
            .snapshot()
            .sourceEpoch,

      getSolOrbitalScale:
        () =>
          currentSolOrbitalScale(),
    });

  /*
   * SERVER-OWNED NATIVE A8 CALENDAR
   *
   * Absolute year angle remains read-only orientation.
   * Native YEAR DAY is anchored separately once per source epoch.
   * Only Core20 integer dayCount advances the running calendar.
   */
  const calendarAnchor =
    new A8Core20CalendarAnchor({
      getClock:
        () =>
          core20Runtime.clockSnapshot(),

      getYearAngle:
        () =>
          yearAngleBridge.snapshot(),
    });

  /*
   * CORE20 NATIVE FLIGHT RECORDER
   *
   * Chief Engineer diagnostic observer only.
   * No time authority. No plant writes.
   * No UTC / host / browser timing.
   */
  const flightRecorder =
    new A8Core20FlightRecorder({
      maxEvents: 512,
    });

  flightRecorder.record(
    'RECORDER',
    'CORE20 FLIGHT RECORDER ARMED',
    null,
    {
      diagnosticOnly: true,
      authority: 'NONE',
    }
  );

  nativeDittyBridge =
    new A8Core20NativeDittyBridge({
      getRaw:
        () => selectedRawBigInt(),

      getSourceEpoch:
        () =>
          recoveryBridge
            .snapshot()
            .sourceEpoch,

      getRecurrenceText:
        () => {
          const recurrence =
            currentSunReturnRecurrence();

          if (
            !recurrence ||
            !recurrence.rawPerSunReturnRecurrence
          ) {
            throw new Error(
              'Sun-return recurrence unavailable for native ditty'
            );
          }

          return (
            recurrence
              .rawPerSunReturnRecurrence
              .text
          );
        },
    });

  const nativeDittyClients =
    new Set();

  const publishNativeDittyEvent =
    event => {
      const payload =
        `event: a8-ditty\n` +
        `data: ${JSON.stringify(event)}\n\n`;

      for (
        const res of
        Array.from(nativeDittyClients)
      ) {
        try {
          res.write(payload);
        } catch (_) {
          nativeDittyClients.delete(res);
        }
      }
    };

  const removeNativeDittyEventListener =
    nativeDittyBridge.onEvent(
      publishNativeDittyEvent
    );

  const core20EdgeClients =
    new Set();

  const publishCore20Edge =
    edge => {
      const payload =
        `event: a8-edge\n` +
        `data: ${JSON.stringify(edge)}\n\n`;

      for (
        const res of
        Array.from(core20EdgeClients)
      ) {
        try {
          res.write(payload);
        } catch (_) {
          core20EdgeClients.delete(
            res
          );
        }
      }
    };

  const removeCore20EdgeListener =
    core20Runtime.onClockEdge(
      publishCore20Edge
    );

  /*
   * Calendar restart persistence is downstream of the authoritative
   * Core20 clock-edge stream. It observes sourceEpoch + integer dayCount
   * and writes only when the integer day changes (plus one restart rebase).
   *
   * Persistence failure must never stop or alter Core20.
   */
  const removeCalendarPersistenceEdgeListener =
    core20Runtime.onClockEdge(
      edge => {
        try {
          calendarAnchor.observeClockEdge(
            edge
          );
        } catch (err) {
          console.error(
            'A8 CALENDAR PERSISTENCE OBSERVER ·',
            err && err.message
              ? err.message
              : String(err)
          );
        }
      }
    );

  /*
   * Flight recorder observes the authoritative Core20 edge stream.
   *
   * It deliberately does NOT record every A8-second edge.
   * Only sourceEpoch and integer civil-day transitions are retained.
   *
   * Recorder failure must never stop or alter Core20.
   */
  let recorderLastSourceEpoch = null;
  let recorderLastDayCount = null;

  const removeFlightRecorderEdgeListener =
    core20Runtime.onClockEdge(
      edge => {
        try {
          const sourceEpoch =
            edge &&
            edge.sourceEpoch !== undefined &&
            edge.sourceEpoch !== null
              ? String(edge.sourceEpoch)
              : null;

          const dayCount =
            edge &&
            edge.dayCount !== undefined &&
            edge.dayCount !== null
              ? String(edge.dayCount)
              : null;

          const recorderState = {
            sourceEpoch,

            rawPulse:
              edge &&
              (
                edge.rawPulse ??
                edge.rawCount
              ),

            dayPhase17:
              edge &&
              (
                edge.dayPhase17 ??
                edge.DAY_PHASE17
              ),

            dayCount,

            calendar:
              calendarAnchor.snapshot(),
          };

          if (
            sourceEpoch !== null &&
            sourceEpoch !==
              recorderLastSourceEpoch
          ) {
            flightRecorder.record(
              recorderLastSourceEpoch === null
                ? 'SOURCE_EPOCH_BASELINE'
                : 'SOURCE_EPOCH_CHANGE',

              recorderLastSourceEpoch === null
                ? 'SOURCE EPOCH OBSERVED'
                : 'SOURCE EPOCH CHANGED',

              recorderState,

              {
                previous:
                  recorderLastSourceEpoch,
                current:
                  sourceEpoch,
              }
            );

            recorderLastSourceEpoch =
              sourceEpoch;
          }

          if (
            dayCount !== null &&
            dayCount !==
              recorderLastDayCount
          ) {
            flightRecorder.record(
              recorderLastDayCount === null
                ? 'CLOCK_DAY_BASELINE'
                : 'CALENDAR_DAY_CHANGE',

              recorderLastDayCount === null
                ? 'CORE20 INTEGER DAY OBSERVED'
                : 'CORE20 INTEGER DAY CHANGED',

              recorderState,

              {
                previous:
                  recorderLastDayCount,
                current:
                  dayCount,
              }
            );

            recorderLastDayCount =
              dayCount;
          }
        } catch (err) {
          console.error(
            'A8 FLIGHT RECORDER OBSERVER ·',
            err && err.message
              ? err.message
              : String(err)
          );
        }
      }
    );

  const ensureCore20RuntimeRunning = async () => {
    if (core20Runtime.status !== 'RUNNING') await core20Runtime.start();
    return core20Runtime.snapshot();
  };

  const server =
    http.createServer(
      async (req, res) => {
        const url =
          new URL(
            req.url,
            `http://${req.headers.host || '127.0.0.1'}`
          );

        /*
         * CHIEF ENGINEER · CORE20 FLIGHT RECORDER
         *
         * Caddy protects this GET/POST surface.
         * Recorder state is diagnostic only.
         */
        if (
          req.method === 'GET' &&
          url.pathname ===
            '/api/core20/flight-recorder'
        ) {
          return sendJson(
            res,
            200,
            {
              ok: true,
              recorder:
                flightRecorder.snapshot(80),
            }
          );
        }

        if (
          req.method === 'POST' &&
          url.pathname ===
            '/api/core20/flight-recorder/clear'
        ) {
          try {
            const body =
              await readJsonBody(req);

            if (
              Object.keys(body).length !== 0
            ) {
              throw new Error(
                'FLIGHT RECORDER CLEAR accepts no fields'
              );
            }

            return sendJson(
              res,
              200,
              {
                ok: true,
                recorder:
                  flightRecorder.clear(),
              }
            );
          } catch (err) {
            return sendJson(
              res,
              400,
              {
                ok: false,
                error:
                  err && err.message
                    ? err.message
                    : String(err),
              }
            );
          }
        }

        if (
          req.method === 'GET' &&
          url.pathname === '/api/core20/runtime'
        ) {
          return sendJson(res, 200, {
            ok: true,
            runtime: core20Runtime.snapshot(),
          });
        }

        if (
          req.method === 'POST' &&
          url.pathname === '/api/core20/runtime/start'
        ) {
          try {
            const body = await readJsonBody(req);
            const allowed = new Set(['restart']);

            for (const key of Object.keys(body)) {
              if (!allowed.has(key)) {
                throw new Error(`unsupported Core20 runtime start field: ${key}`);
              }
            }

            const runtime = await core20Runtime.start({
              restart: body.restart === true,
            });

            return sendJson(res, 200, {
              ok: true,
              runtime,
              clock: core20Runtime.clockSnapshot(),
            });
          } catch (err) {
            return sendJson(res, 400, {
              ok: false,
              error: err && err.message ? err.message : String(err),
            });
          }
        }

        if (
          req.method === 'POST' &&
          url.pathname === '/api/core20/runtime/stop'
        ) {
          return sendJson(res, 200, {
            ok: true,
            runtime: core20Runtime.stop(),
            clock: core20Runtime.clockSnapshot(),
          });
        }

        if (
          req.method === 'POST' &&
          url.pathname ===
            '/api/core20/runtime/resume-diagnostic'
        ) {
          try {
            const body =
              await readJsonBody(req);

            if (
              Object.keys(body).length !== 0
            ) {
              throw new Error(
                'DIAGNOSTIC RESUME accepts no fields'
              );
            }

            const runtime =
              core20Runtime.resumeDiagnostic();

            return sendJson(
              res,
              200,
              {
                ok: true,
                mode:
                  'DIAGNOSTIC_RESUME_LOST_ELAPSED_TIME_NOT_RECOVERED',
                sourceEpochPreserved:
                  true,
                reacquiredJupiter:
                  false,
                sampledUTC:
                  false,
                alignmentPreserved:
                  true,
                runtime,
                clock:
                  core20Runtime.clockSnapshot(),
              }
            );
          } catch (err) {
            return sendJson(
              res,
              400,
              {
                ok: false,
                error:
                  err && err.message
                    ? err.message
                    : String(err),
              }
            );
          }
        }

        if (
          req.method === 'GET' &&
          url.pathname ===
            '/api/core20/year-angle'
        ) {
          return sendJson(
            res,
            200,
            {
              ok: true,
              yearAngle:
                yearAngleBridge.snapshot(),
            }
          );
        }

        if (
          req.method === 'GET' &&
          url.pathname ===
            '/api/core20/calendar'
        ) {
          return sendJson(
            res,
            200,
            {
              ok: true,
              calendar:
                calendarAnchor.snapshot(),
            }
          );
        }

        if (
          req.method === 'POST' &&
          url.pathname ===
            '/api/core20/calendar/anchor'
        ) {
          try {
            const body =
              await readJsonBody(req);

            const allowed =
              new Set(['yearDay']);

            for (const key of Object.keys(body)) {
              if (!allowed.has(key)) {
                throw new Error(
                  `unsupported native calendar anchor field: ${key}`
                );
              }
            }

            if (
              Object.keys(body).length !== 1 ||
              !Object.prototype.hasOwnProperty.call(body, 'yearDay')
            ) {
              throw new Error(
                'NATIVE CALENDAR ANCHOR accepts exactly one field: yearDay'
              );
            }

            const result =
              calendarAnchor.establish(body.yearDay);

            return sendJson(
              res,
              200,
              {
                ok: true,
                anchorApplied:
                  result.applied,
                result,
              }
            );
          } catch (err) {
            return sendJson(
              res,
              400,
              {
                ok: false,
                error:
                  err && err.message
                    ? err.message
                    : String(err),
              }
            );
          }
        }

        if (
          req.method === 'POST' &&
          url.pathname ===
            '/api/core20/year-angle/align-jpl'
        ) {
          try {
            const body =
              await readJsonBody(req);

            if (
              Object.keys(body).length !== 0
            ) {
              throw new Error(
                'YEAR ANGLE JPL ALIGN accepts no fields'
              );
            }

            /*
             * Never silently turn HOLD into a fresh start.
             * Operator must explicitly have a running recovered core.
             */
            if (
              core20Runtime.status !==
              'RUNNING'
            ) {
              throw new Error(
                'YEAR ANGLE JPL ALIGN requires RUNNING Core20'
              );
            }

            const result =
              await yearAngleBridge.alignOnce();

            return sendJson(
              res,
              200,
              {
                ok: true,

                alignmentApplied:
                  result.applied,

                alignment:
                  result.alignment,

                yearAngle:
                  result.yearAngle,

                externalBridge:
                  'JPL_HORIZONS_ONE_SHOT_ONLY',

                ongoingAuthority:
                  'SELECTED_RAW_PLUS_RECOVERED_SOL_ANGLE_PER_RAW',
              }
            );
          } catch (err) {
            return sendJson(
              res,
              400,
              {
                ok: false,
                error:
                  err && err.message
                    ? err.message
                    : String(err),
              }
            );
          }
        }

        if (
          req.method === 'GET' &&
          url.pathname ===
            '/api/core20/ditty/state'
        ) {
          return sendJson(
            res,
            200,
            {
              ok: true,
              ditty:
                nativeDittyBridge.snapshot(),
            }
          );
        }

        if (
          req.method === 'GET' &&
          url.pathname ===
            '/api/core20/ditty/score'
        ) {
          return sendJson(
            res,
            200,
            {
              ok: true,
              score:
                nativeDittyBridge.scoreSnapshot(),
            }
          );
        }

        if (
          req.method === 'GET' &&
          url.pathname ===
            '/api/core20/ditty/events'
        ) {
          res.writeHead(
            200,
            {
              'Content-Type':
                'text/event-stream',
              'Cache-Control':
                'no-store',
              'Connection':
                'keep-alive',
              'X-Accel-Buffering':
                'no',
            }
          );

          res.write(
            'event: ready\n' +
            'data: {"schema":"A8-CORE20-NATIVE-DITTY-STREAM-V1","authority":"CORE20_NATIVE_RAW_DIVIDER"}\n\n'
          );

          nativeDittyClients.add(res);

          req.on(
            'close',
            () => {
              nativeDittyClients.delete(res);
            }
          );

          return;
        }

        if (
          req.method === 'POST' &&
          url.pathname ===
            '/api/core20/ditty/start'
        ) {
          try {
            const body =
              await readJsonBody(req);

            if (
              Object.keys(body).length !== 0
            ) {
              throw new Error(
                'NATIVE DITTY START accepts no timing fields'
              );
            }

            await ensureCore20RuntimeRunning();

            nativeDittyBridge.reset();

            const start =
              nativeDittyBridge.arm();

            return sendJson(
              res,
              200,
              {
                ok: true,
                start,
                ditty:
                  nativeDittyBridge.snapshot(),
              }
            );
          } catch (err) {
            return sendJson(
              res,
              400,
              {
                ok: false,
                error:
                  err && err.message
                    ? err.message
                    : String(err),
              }
            );
          }
        }

        if (
          req.method === 'POST' &&
          url.pathname ===
            '/api/core20/ditty/reset'
        ) {
          try {
            const body =
              await readJsonBody(req);

            if (
              Object.keys(body).length !== 0
            ) {
              throw new Error(
                'NATIVE DITTY RESET accepts no timing fields'
              );
            }

            return sendJson(
              res,
              200,
              {
                ok: true,
                ditty:
                  nativeDittyBridge.reset(),
              }
            );
          } catch (err) {
            return sendJson(
              res,
              400,
              {
                ok: false,
                error:
                  err && err.message
                    ? err.message
                    : String(err),
              }
            );
          }
        }

        /*
         * CHIEF ENGINEER · MOMENTARY CIVIL RE-ALIGN
         */
        if (
          req.method === 'POST' &&
          url.pathname ===
            '/api/core20/civil-realign'
        ) {
          try {
            const body =
              await readJsonBody(req);

            if (
              Object.keys(body).length !== 0
            ) {
              throw new Error(
                'CIVIL RE-ALIGN accepts no fields'
              );
            }

            const result =
              core20Runtime.realignCivilPhase();

            return sendJson(
              res,
              200,
              {
                ok:
                  true,

                mode:
                  'MOMENTARY_CIVIL_REALIGN_AFTER_DIAGNOSTIC_HOLD',

                preservedNativeDayCount:
                  result.preservedDayCount,

                lostElapsedTimeRecovered:
                  false,

                outageDayInference:
                  false,

                utcMayAdvanceCalendarDay:
                  false,

                alignment:
                  result.alignment,

                clock:
                  result.clock,

                runtime:
                  core20Runtime.snapshot(),
              }
            );
          } catch (err) {
            return sendJson(
              res,
              400,
              {
                ok:
                  false,

                error:
                  err && err.message
                    ? err.message
                    : String(err),
              }
            );
          }
        }

        if (
          req.method === 'POST' &&
          url.pathname === '/api/core20/connect'
        ) {
          try {
            const body = await readJsonBody(req);

            if (Object.keys(body).length !== 0) {
              throw new Error('CONNECT TO CORE accepts no timing/alignment fields');
            }

            await ensureCore20RuntimeRunning();
            const result = core20Runtime.alignIfNeeded();

            return sendJson(res, 200, {
              ok: true,
              alignmentApplied: result.applied,
              alignment: result.alignment,
              clock: result.clock,
              runtime: core20Runtime.snapshot(),
            });
          } catch (err) {
            return sendJson(res, 400, {
              ok: false,
              error: err && err.message ? err.message : String(err),
            });
          }
        }

        if (
          req.method === 'GET' &&
          url.pathname ===
            '/api/core20/edges'
        ) {
          res.writeHead(
            200,
            {
              'Content-Type':
                'text/event-stream',
              'Cache-Control':
                'no-store',
              'Connection':
                'keep-alive',
              'X-Accel-Buffering':
                'no',
            }
          );

          res.write(
            'event: ready\n' +
            'data: {"schema":"A8-CORE20-CLOCK-EDGE-STREAM-V1","authority":"CORE20_DAY_PHASE17"}\n\n'
          );

          core20EdgeClients.add(
            res
          );

          req.on(
            'close',
            () => {
              core20EdgeClients.delete(
                res
              );
            }
          );

          return;
        }

        if (
          req.method === 'GET' &&
          url.pathname === '/api/core20/clock'
        ) {
          try {
            return sendJson(res, 200, {
              ok: true,
              clock: core20Runtime.clockSnapshot(),
              runtime: core20Runtime.snapshot(),
            });
          } catch (err) {
            return sendJson(res, 500, {
              ok: false,
              error: err && err.message ? err.message : String(err),
            });
          }
        }

        if (
          req.method === 'GET' &&
          url.pathname ===
            '/api/hardware/source'
        ) {
          return sendJson(
            res,
            200,
            {
              ok: true,
              source:
                selector.snapshot(),
              recoveryInput:
                syncRecoveryInput(),
              jovian:
                currentJovian(),
              timekeeper:
                currentTimekeeper(),
              earthObservers:
                currentEarthObservers(),
              jovianFixture:
                jovianFixture.snapshot(),
            }
          );
        }

        if (
          req.method === 'POST' &&
          url.pathname ===
            '/api/hardware/source/select'
        ) {
          try {
            const body =
              await readJsonBody(req);

            const allowed =
              new Set(['mode']);

            for (
              const key of
              Object.keys(body)
            ) {
              if (!allowed.has(key)) {
                throw new Error(
                  `unsupported selector field: ${key}`
                );
              }
            }

            if (
              body.mode !==
                MODE_VIRTUAL &&
              body.mode !==
                MODE_REAL
            ) {
              throw new Error(
                'mode must be VIRTUAL or REAL'
              );
            }

            const source =
              selector.select(
                body.mode
              );

            jovianFixture.reset();

            const recoveryInput =
              syncRecoveryInput();

            return sendJson(
              res,
              200,
              {
                ok: true,
                source,
                recoveryInput,
                jovian:
                  currentJovian(),
                timekeeper:
                  currentTimekeeper(),
                earthObservers:
                  currentEarthObservers(),
                jovianFixture:
                  jovianFixture.snapshot(),
              }
            );
          } catch (err) {
            return sendJson(
              res,
              400,
              {
                ok: false,
                error:
                  err &&
                  err.message
                    ? err.message
                    : String(err),
              }
            );
          }
        }

        if (
          req.method === 'POST' &&
          url.pathname === '/api/hardware/virtual/advance'
        ) {
          return sendJson(res, 409, {
            ok: false,
            error: 'BROWSER RAW ADVANCE DISABLED · NODE SERVER OWNS VIRTUAL PULSE GENERATION',
          });
        }

        /*
         * Gate 6I · selected-source Earth observers.
         *
         * Existing Mintaka / Sol presentation pages keep their historical
         * GET paths on the post-seal server, but POST rawPulse injection is
         * deliberately removed here. Gate-6F supplies rawPulse.
         */

        if (
          req.method === 'GET' &&
          url.pathname ===
            '/api/state'
        ) {
          const bridge =
            syncRecoveryInput();

          return sendJson(
            res,
            200,
            {
              version:
                '5.4.20',
              role:
                'POSTSEAL_SELECTED_SOURCE_PRESENTATION_STATE',
              rawCount:
                bridge.lastRawPulse,
              sourceEpoch:
                bridge.sourceEpoch,
              sourceMode:
                bridge.mode,
              sourceRig:
                bridge.rig,
              writesClock:
                false,
              presentationOnly:
                true,
            }
          );
        }

        if (
          req.method === 'POST' &&
          url.pathname ===
            '/api/hardware/civil-day/anchor'
        ) {
          try {
            const body =
              await readJsonBody(req);

            const allowed =
              new Set([
                'type',
                'witness',
              ]);

            for (
              const key of
              Object.keys(body)
            ) {
              if (!allowed.has(key)) {
                throw new Error(
                  `unsupported civil-day anchor field: ${key}`
                );
              }
            }

            const bridge =
              syncRecoveryInput();

            const recurrence =
              currentSunReturnRecurrence();

            const phase =
              civilDayPhase17.anchor(
                bridge,
                recurrence,
                body
              );

            return sendJson(
              res,
              200,
              {
                ok: true,
                phase,
                recurrence,
              }
            );
          } catch (err) {
            return sendJson(
              res,
              400,
              {
                ok: false,
                error:
                  err &&
                  err.message
                    ? err.message
                    : String(err),
              }
            );
          }
        }

        if (
          req.method === 'GET' &&
          url.pathname ===
            '/api/hardware/day-phase17'
        ) {
          return sendJson(
            res,
            200,
            {
              ok: true,

              phase:
                currentDayPhase17(),

              recurrence:
                currentSunReturnRecurrence(),
            }
          );
        }

        if (
          req.method === 'GET' &&
          url.pathname ===
            '/api/hardware/sun-return-recurrence'
        ) {
          syncRecoveryInput();

          return sendJson(
            res,
            200,
            {
              ok: true,

              recurrence:
                currentSunReturnRecurrence(),

              solOrbitalScale:
                currentSolOrbitalScale(),

              earthRotationScale:
                currentEarthRotationScale(),
            }
          );
        }

        if (
          req.method === 'GET' &&
          url.pathname ===
            '/api/hardware/sol-orbital-scale'
        ) {
          syncRecoveryInput();

          return sendJson(
            res,
            200,
            {
              ok: true,

              scale:
                currentSolOrbitalScale(),

              earthRotationScale:
                currentEarthRotationScale(),

              earthObservers:
                currentEarthObservers(),
            }
          );
        }

        if (
          req.method === 'GET' &&
          url.pathname ===
            '/api/hardware/earth-rotation-scale'
        ) {
          syncRecoveryInput();

          return sendJson(
            res,
            200,
            {
              ok: true,

              scale:
                currentEarthRotationScale(),

              timekeeper:
                currentTimekeeper(),

              earthObservers:
                currentEarthObservers(),
            }
          );
        }

        if (
          req.method === 'GET' &&
          (
            url.pathname ===
              '/api/hardware/earth-observers' ||
            url.pathname ===
              '/api/earth-observers'
          )
        ) {
          syncRecoveryInput();

          return sendJson(
            res,
            200,
            {
              ok: true,
              bridge:
                currentEarthObservers(),
            }
          );
        }

        if (
          req.method === 'GET' &&
          url.pathname ===
            '/api/mintaka'
        ) {
          syncRecoveryInput();

          const earth =
            currentEarthObservers();

          return sendJson(
            res,
            200,
            {
              ok: true,
              observer:
                earth.mintaka,
              selectedSource: {
                sourceEpoch:
                  earth.sourceEpoch,
                mode:
                  earth.mode,
                rig:
                  earth.rig,
                rawPulse:
                  earth.selectedRawPulse,
              },
              rawPulseAuthority:
                earth.rawPulseAuthority,
            }
          );
        }

        if (
          req.method === 'POST' &&
          url.pathname ===
            '/api/mintaka/observe'
        ) {
          try {
            const body =
              await readJsonBody(req);

            const result =
              observeMintakaSelected(
                body
              );

            return sendJson(
              res,
              200,
              {
                ok: true,
                observer:
                  result.observer,
                earthBridge:
                  result.bridge,
                recoveryInput:
                  recoveryBridge.snapshot(),
              }
            );
          } catch (err) {
            return sendJson(
              res,
              400,
              {
                ok: false,
                error:
                  err &&
                  err.message
                    ? err.message
                    : String(err),
              }
            );
          }
        }

        if (
          req.method === 'GET' &&
          url.pathname ===
            '/api/sol'
        ) {
          syncRecoveryInput();

          const earth =
            currentEarthObservers();

          return sendJson(
            res,
            200,
            {
              ok: true,
              observer:
                earth.sol,
              selectedSource: {
                sourceEpoch:
                  earth.sourceEpoch,
                mode:
                  earth.mode,
                rig:
                  earth.rig,
                rawPulse:
                  earth.selectedRawPulse,
              },
              rawPulseAuthority:
                earth.rawPulseAuthority,
            }
          );
        }

        if (
          req.method === 'POST' &&
          url.pathname ===
            '/api/sol/observe'
        ) {
          try {
            const body =
              await readJsonBody(req);

            const result =
              observeSolSelected(
                body
              );

            return sendJson(
              res,
              200,
              {
                ok: true,
                observer:
                  result.observer,
                earthBridge:
                  result.bridge,
                recoveryInput:
                  recoveryBridge.snapshot(),
              }
            );
          } catch (err) {
            return sendJson(
              res,
              400,
              {
                ok: false,
                error:
                  err &&
                  err.message
                    ? err.message
                    : String(err),
              }
            );
          }
        }

        if (
          req.method === 'GET' &&
          url.pathname ===
            '/api/hardware/recovery-input'
        ) {
          return sendJson(
            res,
            200,
            {
              ok: true,
              recoveryInput:
                syncRecoveryInput(),
            }
          );
        }

        if (
          req.method === 'GET' &&
          url.pathname ===
            '/api/hardware/jovian'
        ) {
          syncRecoveryInput();

          return sendJson(
            res,
            200,
            {
              ok: true,
              jovian:
                currentJovian(),
              timekeeper:
                currentTimekeeper(),
              fixture:
                jovianFixture.snapshot(),
            }
          );
        }

        if (
          req.method === 'POST' &&
          url.pathname ===
            '/api/hardware/jovian/observe'
        ) {
          try {
            const body =
              await readJsonBody(req);

            const allowed =
              new Set([
                'moon',
                'turn',
              ]);

            for (
              const key of
              Object.keys(body)
            ) {
              if (!allowed.has(key)) {
                throw new Error(
                  `unsupported Jovian request field: ${key}`
                );
              }
            }

            const jovian =
              observeJovian({
                moon:
                  body.moon,
                turn:
                  body.turn,
              });

            return sendJson(
              res,
              200,
              {
                ok: true,
                source:
                  selector.snapshot(),
                recoveryInput:
                  recoveryBridge.snapshot(),
                jovian,
                timekeeper:
                  currentTimekeeper(),
              }
            );
          } catch (err) {
            return sendJson(
              res,
              400,
              {
                ok: false,
                error:
                  err &&
                  err.message
                    ? err.message
                    : String(err),
              }
            );
          }
        }

        if (
          req.method === 'POST' &&
          url.pathname ===
            '/api/hardware/jovian/forget'
        ) {
          jovianFixture.reset();

          const jovian =
            jovianRecovery.forgetRecovery();

          const timekeeper =
            jovianTimekeeper.forgetLock();

          return sendJson(
            res,
            200,
            {
              ok: true,
              jovian,
              source:
                selector.snapshot(),
              recoveryInput:
                recoveryBridge.snapshot(),
              timekeeper,
            }
          );
        }

        if (
          req.method === 'POST' &&
          url.pathname ===
            '/api/hardware/jovian/fixture/next'
        ) {
          try {
            const result =
              runFixtureGroup();

            return sendJson(
              res,
              200,
              {
                ok: true,
                result,
              }
            );
          } catch (err) {
            return sendJson(
              res,
              400,
              {
                ok: false,
                error:
                  err &&
                  err.message
                    ? err.message
                    : String(err),
              }
            );
          }
        }

        if (
          req.method === 'POST' &&
          url.pathname ===
            '/api/hardware/jovian/fixture/run'
        ) {
          try {
            if (selector.mode !== MODE_VIRTUAL) {
              throw new Error(
                'virtual Jovian fixture requires VIRTUAL source mode'
              );
            }

            jovianRecovery.forgetRecovery();
            jovianTimekeeper.forgetLock();
            jovianFixture.reset();
            jovianFixture.start(
              selector.snapshot()
                .gate6a
                .lastRawPulse
            );

            let guard = 0;
            let result = null;

            while (
              jovianFixture.active &&
              guard < 64
            ) {
              result =
                runFixtureGroup();
              guard += 1;
            }

            if (guard >= 64) {
              throw new Error(
                'virtual Jovian fixture guard exceeded'
              );
            }

            return sendJson(
              res,
              200,
              {
                ok: true,
                result: {
                  groups:
                    guard,
                  source:
                    selector.snapshot(),
                  recoveryInput:
                    recoveryBridge.snapshot(),
                  jovian:
                    currentJovian(),
                  timekeeper:
                    currentTimekeeper(),
                  fixture:
                    jovianFixture.snapshot(),
                },
              }
            );
          } catch (err) {
            return sendJson(
              res,
              400,
              {
                ok: false,
                error:
                  err &&
                  err.message
                    ? err.message
                    : String(err),
              }
            );
          }
        }

        if (
          req.method === 'GET' &&
          url.pathname ===
            '/api/hardware/jovian-timekeeper'
        ) {
          syncRecoveryInput();

          return sendJson(
            res,
            200,
            {
              ok: true,
              timekeeper:
                currentTimekeeper(),
              jovian:
                currentJovian(),
              recoveryInput:
                recoveryBridge.snapshot(),
            }
          );
        }

        /*
         * Deliberately absent:
         *   POST /api/hardware/real/*
         *   clock/phase/authority endpoints
         *   hardware command endpoints
         */

        if (
          req.method === 'GET' &&
          serveStatic(
            res,
            url.pathname
          )
        ) {
          return;
        }

        return sendJson(
          res,
          404,
          {
            ok: false,
          }
        );
      }
    );

  server.on('listening', () => {
    core20Runtime.start()
      .then(() => {
        console.log('CORE20 RUNTIME · NODE OWNS VIRTUAL PULSE GENERATOR');
        console.log('CORE20 CLOCK · AWAITING MOMENTARY CONNECT ALIGNMENT');
      })
      .catch(err => {
        console.error(
          'CORE20 RUNTIME START FAILED ·',
          err && err.message ? err.message : err
        );
      });
  });

  server.on('close', () => {
    removeNativeDittyEventListener();

    for (
      const res of
      Array.from(nativeDittyClients)
    ) {
      try {
        res.end();
      } catch (_) {}
    }

    nativeDittyClients.clear();
    nativeDittyBridge.reset();

    removeFlightRecorderEdgeListener();

    removeCore20EdgeListener();

    for (
      const res of
      Array.from(core20EdgeClients)
    ) {
      try {
        res.end();
      } catch (_) {}
    }

    core20EdgeClients.clear();
    core20Runtime.stop();
  });

  return {
    server,
    selector,
    recoveryBridge,
    jovianRecovery,
    jovianFixture,
    jovianTimekeeper,
    earthObservationBridge,
    core20Runtime,
    nativeDittyBridge,
    flightRecorder,
  };
}

if (require.main === module) {
  const {
    server,
  } =
    createHardwareLabServer();

  server.listen(
    DEFAULT_PORT,
    DEFAULT_HOST,
    () => {
      console.log(
        `A8 post-seal hardware lab · Gate 6E`
      );
      console.log(
        `http://${DEFAULT_HOST}:${DEFAULT_PORT}/`
      );
      console.log(
        'ROOT · MAIN LAB'
      );
      console.log(
        `CORE 20 · http://${DEFAULT_HOST}:${DEFAULT_PORT}/jovian-operations.html`
      );
      console.log(
        'REAL hardware network injection · ABSENT'
      );
    }
  );
}

module.exports = {
  DEFAULT_HOST,
  DEFAULT_PORT,
  PUBLIC_ROOT,
  readJsonBody,
  staticPathFor,
  injectMainLabLink,
  injectCore20Navigation,
  serveStatic,
  createHardwareLabServer,
};
