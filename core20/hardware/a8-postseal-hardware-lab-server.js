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
  SAMPLE_SCHEMA: PHYSICAL_JOVIAN_SAMPLE_SCHEMA,
  SAMPLE_SOURCE: PHYSICAL_JOVIAN_SAMPLE_SOURCE,
  ExternalPulseRigObserver,
} = require('./a8-external-pulse-rig-contract');

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
  deriveMintakaSolRelationship,
} = require('../observer/a8-mintaka-sol-relationship');

const {
  TerraShipSlipAccumulator,
} = require('../observer/a8-terra-ship-slip-accumulator');

const {
  deriveSunReturnRecurrence,
} = require('../observer/a8-sun-return-recurrence');

const {
  CivilDayPhase17,
} = require('../observer/a8-day-phase17-civil-clock');

const {
  MintakaPhase17,
} = require('../observer/a8-mintaka-phase17-clock');

const {
  OpposingClockDiscrepancy,
} = require('../observer/a8-opposing-clock-discrepancy');

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
const CORE20_SOL_HOLDOVER_PATH =
  process.env.A8_SOL_RATE_HOLDOVER_PATH || '';

const CORE20_SOL_HOLDOVER_SCHEMA =
  'A8-SOL-RATE-HOLDOVER-V1';


function solHoldoverAbs(v) {
  return v < 0n ? -v : v;
}

function solHoldoverGcd(a, b) {
  a = solHoldoverAbs(a);
  b = solHoldoverAbs(b);

  while (b !== 0n) {
    const t = a % b;
    a = b;
    b = t;
  }

  return a;
}

function solHoldoverReduce(n, d) {
  if (d === 0n) {
    throw new Error(
      'Sol holdover denominator must be non-zero'
    );
  }

  if (d < 0n) {
    n = -n;
    d = -d;
  }

  const g = solHoldoverGcd(n, d);

  return {
    n: n / g,
    d: d / g,
  };
}

function solHoldoverParseFraction(
  value,
  label
) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    throw new Error(
      `${label} must be a fraction object`
    );
  }

  const nText =
    String(value.numerator ?? '');

  const dText =
    String(value.denominator ?? '');

  if (
    !/^-?(0|[1-9][0-9]*)$/.test(nText) ||
    !/^(0|[1-9][0-9]*)$/.test(dText)
  ) {
    throw new Error(
      `${label} must contain integer numerator/denominator`
    );
  }

  const n = BigInt(nText);
  const d = BigInt(dText);

  if (d <= 0n) {
    throw new Error(
      `${label}.denominator must be positive`
    );
  }

  return solHoldoverReduce(n, d);
}

function solHoldoverFractionObject(value) {
  const r =
    solHoldoverReduce(
      value.n,
      value.d
    );

  return {
    numerator:
      r.n.toString(),

    denominator:
      r.d.toString(),

    text:
      r.d === 1n
        ? r.n.toString()
        : `${r.n}/${r.d}`,
  };
}

let solRateHoldoverCache = null;

function loadQualifiedSolRateHoldover() {
  if (solRateHoldoverCache) {
    return solRateHoldoverCache;
  }

  if (!CORE20_SOL_HOLDOVER_PATH) {
    throw new Error(
      'Sol rate holdover path is not configured'
    );
  }

  if (
    !fs.existsSync(
      CORE20_SOL_HOLDOVER_PATH
    )
  ) {
    throw new Error(
      'qualified Sol rate holdover checkpoint missing'
    );
  }

  const parsed =
    JSON.parse(
      fs.readFileSync(
        CORE20_SOL_HOLDOVER_PATH,
        'utf8'
      )
    );

  if (
    !parsed ||
    parsed.schema !==
      CORE20_SOL_HOLDOVER_SCHEMA ||
    !String(
      parsed.status || ''
    ).startsWith('QUALIFIED_')
  ) {
    throw new Error(
      'Sol rate holdover checkpoint is not qualified'
    );
  }

  const relationship =
    solHoldoverParseFraction(
      parsed
        .solAdvancePerMintakaRotation512,
      'Sol advance per Mintaka rotation'
    );

  if (
    relationship.n <= 0n ||
    relationship.n >=
      512n * relationship.d
  ) {
    throw new Error(
      'Sol holdover relationship must be >0 and <512 A8 per rotation'
    );
  }

  solRateHoldoverCache =
    parsed;

  return solRateHoldoverCache;
}

function writeQualifiedSolRateHoldover(
  payload
) {
  if (!CORE20_SOL_HOLDOVER_PATH) {
    throw new Error(
      'Sol rate holdover path is not configured'
    );
  }

  const dir =
    path.dirname(
      CORE20_SOL_HOLDOVER_PATH
    );

  fs.mkdirSync(
    dir,
    {
      recursive: true,
      mode: 0o750,
    }
  );

  const tmp =
    CORE20_SOL_HOLDOVER_PATH +
    `.tmp-${process.pid}`;

  const fd =
    fs.openSync(
      tmp,
      'w',
      0o600
    );

  try {
    fs.writeFileSync(
      fd,
      JSON.stringify(
        payload,
        null,
        2
      ) + '\n',
      'utf8'
    );

    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }

  fs.renameSync(
    tmp,
    CORE20_SOL_HOLDOVER_PATH
  );

  solRateHoldoverCache =
    payload;

  return payload;
}

function solHoldoverEffectiveSolSnapshot(
  earth
) {
  const sol =
    earth &&
    earth.sol
      ? earth.sol
      : null;

  const mintaka =
    earth &&
    earth.mintaka
      ? earth.mintaka
      : null;

  if (
    !sol ||
    !mintaka ||
    mintaka.status !== 'RECOVERED' ||
    !mintaka.recurrence
  ) {
    return sol;
  }

  const certificate =
    loadQualifiedSolRateHoldover();

  const heldPerRotation =
    solHoldoverParseFraction(
      certificate
        .solAdvancePerMintakaRotation512,
      'held Sol advance per Mintaka rotation'
    );

  const rawPerRotation =
    solHoldoverParseFraction(
      {
        numerator:
          mintaka.recurrence
            .reducedNumerator,

        denominator:
          mintaka.recurrence
            .reducedDenominator,
      },
      'Mintaka raw per rotation'
    );

  if (rawPerRotation.n <= 0n) {
    throw new Error(
      'Mintaka raw per rotation must be positive'
    );
  }

  /*
   * Held natural relation:
   *
   *   Sol angle / Mintaka rotation
   *
   * Newly recovered local ruler:
   *
   *   raw / Mintaka rotation
   *
   * Therefore:
   *
   *   Sol angle / raw
   */
  const perRaw =
    solHoldoverReduce(
      heldPerRotation.n *
        rawPerRotation.d,

      heldPerRotation.d *
        rawPerRotation.n
    );

  return {
    ...sol,

    status:
      'TRACKING',

    forwardAdvancePerRawPulse512:
      solHoldoverFractionObject(
        perRaw
      ),

    rateMode:
      'HOLDOVER',

    rateAuthority:
      'PERSISTED_LAST_QUALIFIED_SOL_RELATIONSHIP',

    rateHoldover: {
      schema:
        certificate.schema,

      status:
        certificate.status,

      relationshipBasis:
        certificate.relationshipBasis,

      solAdvancePerMintakaRotation512:
        certificate
          .solAdvancePerMintakaRotation512,

      authorityBoundary:
        certificate.authorityBoundary ||
        null,
    },
  };
}

function persistObservedSolRateHoldover(
  earth
) {
  if (
    !earth ||
    !earth.mintaka ||
    !earth.sol ||
    earth.mintaka.status !==
      'RECOVERED' ||
    earth.sol.status !==
      'TRACKING' ||
    !Number.isSafeInteger(
      earth.sol.intervalCount
    ) ||
    earth.sol.intervalCount < 1
  ) {
    return null;
  }

  const relationship =
    deriveMintakaSolRelationship(
      earth.mintaka,
      earth.sol
    );

  const samples =
    Array.isArray(
      earth.sol.samples
    )
      ? earth.sol.samples.slice(-2)
      : [];

  const payload = {
    schema:
      CORE20_SOL_HOLDOVER_SCHEMA,

    status:
      'QUALIFIED_OBSERVED_HOLDOVER',

    role:
      'PERSISTED_LAST_QUALIFIED_SOL_ORBIT_RELATIONSHIP',

    relationshipBasis:
      'SOL_A8_ANGLE_ADVANCE_PER_MINTAKA_STELLAR_ROTATION',

    solAdvancePerMintakaRotation512:
      relationship
        .solAdvancePerMintakaRotation512,

    evidence: {
      sourceEpoch:
        earth.sourceEpoch,

      mintaka:
        relationship
          .evidenceWindows
          .mintaka,

      sol:
        relationship
          .evidenceWindows
          .sol,

      latestSolSamples:
        samples,
    },

    authorityBoundary: {
      crossRunUse:
        'RATE_RELATIONSHIP_ONLY_NO_RAW_CONTINUITY',

      manufacturesRawContinuity:
        false,

      infersOutageElapsedTime:
        false,

      networkCadenceAuthority:
        false,

      bootstrapOnlyUntilNextQualifiedSolObservation:
        false,
    },
  };

  return (
    writeQualifiedSolRateHoldover(
      payload
    )
  );
}

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
  mintakaPhase17 =
    new MintakaPhase17(),
  opposingClockDiscrepancy =
    new OpposingClockDiscrepancy(),
  terraShipSlipLifetimeLedger = null,
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

  /*
   * PHYSICAL JOVIAN LANE
   *
   * Epoch-N physical carrier RAW enters here independently of the
   * historical VIRTUAL_RIG_A qualification fixture.
   *
   * THIS LANE DOES NOT DRIVE CORE20 YET.
   *
   * Real Jupiter witnesses are stamped against the latest accepted
   * physical carrier RAW. A carrier replacement creates a fresh
   * physical source epoch and automatically re-arms recovery.
   */
  const physicalJovianRecoveryBridge =
    new Core20RecoveryInputBridge();

  const physicalJovianRecovery =
    new Core20JovianRecoveryWrapper();

  const physicalJovianTimekeeper =
    new JovianPhaseTimekeeper();

  let physicalJovianSourceEpoch = null;
  let physicalJovianRig = null;
  let physicalJovianObserver =
    new ExternalPulseRigObserver();

  let physicalJovianLastReportSequence = null;
  let physicalJovianEpochChanges = 0;

  /*
   * ACTUAL JUPITER FEED
   *
   * Continuous carrier RAW and observational evidence are deliberately
   * separate lanes.
   *
   * CONTINUOUS:
   *   Epoch-N physical RAW -> current carrier coordinate / timekeeper
   *
   * EVIDENCE:
   *   server-side frame capture -> Jupiter-relative x -> 3-frame turn
   *   detector -> exact middle-frame physical RAW -> Jovian recovery
   *
   * No model/display value is accepted here.
   * No caller may supply rawPulse.
   * No turn is accepted from a caller.
   */
  const physicalJovianEvidenceBridge =
    new Core20RecoveryInputBridge();

  let physicalJovianEvidenceObserver =
    new ExternalPulseRigObserver();

  let physicalJovianFrameSequence = 0;
  let physicalJovianLastProcessedFrameRaw = null;
  let physicalJovianLastFrame = null;

  const physicalJovianFrameCaptures =
    new Map();

  const physicalJovianFrameHistory = {
    io: [],
    europa: [],
    ganymede: [],
  };

  const PHYSICAL_JOVIAN_FRAME_LIMIT = 4096;
  const PHYSICAL_JOVIAN_TURN_EPS = 1e-10;

  const physicalJovianSelectorSnapshot = () => {
    if (physicalJovianSourceEpoch === null) {
      return null;
    }

    const gate6a =
      physicalJovianObserver.snapshot();

    return {
      schema:
        'A8-PULSE-SOURCE-EPOCH-SELECTOR-V1',

      role:
        'PHYSICAL_JOVIAN_CARRIER_EPOCH_ADAPTER',

      mode:
        'REAL',

      sourceEpoch:
        physicalJovianSourceEpoch,

      activeRig:
        gate6a.rig,

      gate6a,

      virtualRig:
        null,

      lastSwitch: {
        from:
          null,

        to:
          'REAL',

        epoch:
          physicalJovianSourceEpoch,

        baselineCleared:
          true,

        counterContinuityCarried:
          false,
      },

      counterContinuityAcrossSourceSwitch:
        false,

      phaseContinuityManufacturedAcrossSourceSwitch:
        false,

      switchRequiresFreshRawBaseline:
        true,

      definingPayload:
        'EPOCH-N PHYSICAL RAW + REAL JOVIAN TURN WITNESS',

      writesA8Core:
        false,

      writesClock:
        false,

      writesPhase:
        false,

      writesOscillator:
        false,

      writesDivider:
        false,

      writesAuthority:
        false,

      usesHostTime:
        false,

      usesLegacyTime:
        false,

      usesFrequencyHz:
        false,

      acceptsTimestamp:
        false,
    };
  };

  const physicalJovianEvidenceSelectorSnapshot = () => {
    if (physicalJovianSourceEpoch === null) {
      return null;
    }

    const gate6a =
      physicalJovianEvidenceObserver.snapshot();

    return {
      schema:
        'A8-PULSE-SOURCE-EPOCH-SELECTOR-V1',

      role:
        'PHYSICAL_JOVIAN_EVIDENCE_EPOCH_ADAPTER',

      mode:
        'REAL',

      sourceEpoch:
        physicalJovianSourceEpoch,

      activeRig:
        gate6a.rig,

      gate6a,

      virtualRig:
        null,

      lastSwitch: {
        from:
          null,

        to:
          'REAL',

        epoch:
          physicalJovianSourceEpoch,

        baselineCleared:
          true,

        counterContinuityCarried:
          false,
      },

      counterContinuityAcrossSourceSwitch:
        false,

      phaseContinuityManufacturedAcrossSourceSwitch:
        false,

      switchRequiresFreshRawBaseline:
        true,

      definingPayload:
        'SERVER-CAPTURED PHYSICAL RAW + JUPITER-RELATIVE X TURN EVIDENCE',

      writesA8Core:
        false,

      writesClock:
        false,

      writesPhase:
        false,

      writesOscillator:
        false,

      writesDivider:
        false,

      writesAuthority:
        false,

      usesHostTime:
        false,

      usesLegacyTime:
        false,

      usesFrequencyHz:
        false,

      acceptsTimestamp:
        false,
    };
  };


  const syncPhysicalJovian = () => {
    const selectorSnapshot =
      physicalJovianSelectorSnapshot();

    const evidenceSelectorSnapshot =
      physicalJovianEvidenceSelectorSnapshot();

    if (
      selectorSnapshot === null ||
      evidenceSelectorSnapshot === null
    ) {
      return null;
    }

    const bridge =
      physicalJovianRecoveryBridge.sync(
        selectorSnapshot
      );

    const evidenceBridge =
      physicalJovianEvidenceBridge.sync(
        evidenceSelectorSnapshot
      );

    physicalJovianRecovery.syncRecoveryInput(
      evidenceBridge
    );

    const jovian =
      physicalJovianRecovery.snapshot(
        bridge.lastRawPulse
      );

    physicalJovianTimekeeper.sync(
      bridge,
      jovian
    );

    return bridge;
  };

  const currentPhysicalJovian = () => {
    const bridge =
      physicalJovianRecoveryBridge.snapshot();

    const raw =
      bridge.lastRawPulse;

    return {
      schema:
        'A8-PHYSICAL-JOVIAN-LANE-V1',

      role:
        'REAL_JUPITER_OBSERVATION_OVER_REPLACEABLE_PHYSICAL_CARRIER',

      status:
        physicalJovianSourceEpoch === null
          ? 'WAITING_FOR_PHYSICAL_CARRIER'
          : 'PHYSICAL_CARRIER_ACTIVE',

      physicalSourceEpoch:
        physicalJovianSourceEpoch,

      rig:
        physicalJovianRig,

      lastReportSequence:
        physicalJovianLastReportSequence,

      carrierEpochChanges:
        physicalJovianEpochChanges,

      recoveryInput:
        bridge,

      evidenceInput:
        physicalJovianEvidenceBridge.snapshot(),

      actualFeed: {
        status:
          physicalJovianSourceEpoch === null
            ? 'WAITING_FOR_PHYSICAL_CARRIER'
            : 'READY_FOR_REAL_FRAME_CAPTURE',

        frameRawPolicy:
          'SERVER_CAPTURED_PHYSICAL_RAW_ONLY',

        measurementReduction:
          'x = moonX - jupiterX',

        turnDetector:
          'THREE_FRAME_STRICT_LOCAL_EXTREMUM',

        turnRawPolicy:
          'MIDDLE_FRAME_CAPTURE_RAW',

        callerSuppliedRawAccepted:
          false,

        callerSuppliedTurnAccepted:
          false,

        modelFeedbackAccepted:
          false,

        lastProcessedFrameRaw:
          physicalJovianLastProcessedFrameRaw,

        lastFrame:
          physicalJovianLastFrame,
      },

      jovian:
        physicalJovianRecovery.snapshot(
          raw
        ),

      timekeeper:
        physicalJovianTimekeeper.snapshot(),

      actuatorConnected:
        false,

      writesCore20:
        false,

      writesClock:
        false,

      changesCivilPhase:
        false,

      usesVirtualFixture:
        false,

      usesHostTime:
        false,

      usesUTC:
        false,
    };
  };

  const notePhysicalJovianSample = ({
    SOURCE_EPOCH,
    RAW_COUNT,
    REPORT_SEQUENCE = null,
    STATUS,
  }) => {
    if (STATUS !== 'ACTIVE') {
      throw new Error(
        'physical Jovian carrier sample is not ACTIVE'
      );
    }

    const epochText =
      String(SOURCE_EPOCH ?? '');

    if (!/^[1-9][0-9]*$/.test(epochText)) {
      throw new Error(
        'physical Jovian SOURCE_EPOCH invalid'
      );
    }

    const epochBig =
      BigInt(epochText);

    if (
      epochBig >
      BigInt(Number.MAX_SAFE_INTEGER)
    ) {
      throw new Error(
        'physical Jovian SOURCE_EPOCH exceeds safe integer'
      );
    }

    const epoch =
      Number(epochBig);

    const rawText =
      String(RAW_COUNT ?? '');

    if (!/^(0|[1-9][0-9]*)$/.test(rawText)) {
      throw new Error(
        'physical Jovian RAW_COUNT invalid'
      );
    }

    if (
      physicalJovianSourceEpoch === null ||
      physicalJovianSourceEpoch !== epoch
    ) {
      if (physicalJovianSourceEpoch !== null) {
        physicalJovianEpochChanges += 1;
      }

      physicalJovianSourceEpoch =
        epoch;

      physicalJovianRig =
        `ARDUINO_PHYSICAL_EPOCH_${epoch}`;

      physicalJovianObserver =
        new ExternalPulseRigObserver();

      physicalJovianEvidenceObserver =
        new ExternalPulseRigObserver();

      physicalJovianFrameSequence = 0;
      physicalJovianLastProcessedFrameRaw = null;
      physicalJovianLastFrame = null;

      physicalJovianFrameCaptures.clear();

      for (
        const history of
        Object.values(
          physicalJovianFrameHistory
        )
      ) {
        history.length = 0;
      }
    }

    const prior =
      physicalJovianObserver
        .snapshot()
        .lastRawPulse;

    if (
      prior !== null &&
      BigInt(rawText) < BigInt(prior)
    ) {
      throw new Error(
        'physical Jovian RAW regressed inside carrier epoch'
      );
    }

    if (
      prior === null ||
      BigInt(rawText) > BigInt(prior)
    ) {
      physicalJovianObserver.observe({
        schema:
          PHYSICAL_JOVIAN_SAMPLE_SCHEMA,

        source:
          PHYSICAL_JOVIAN_SAMPLE_SOURCE,

        rig:
          physicalJovianRig,

        rawPulse:
          rawText,
      });
    }

    const evidencePrior =
      physicalJovianEvidenceObserver
        .snapshot()
        .lastRawPulse;

    if (evidencePrior === null) {
      physicalJovianEvidenceObserver.observe({
        schema:
          PHYSICAL_JOVIAN_SAMPLE_SCHEMA,

        source:
          PHYSICAL_JOVIAN_SAMPLE_SOURCE,

        rig:
          physicalJovianRig,

        rawPulse:
          rawText,
      });
    }

    physicalJovianLastReportSequence =
      REPORT_SEQUENCE === null ||
      REPORT_SEQUENCE === undefined
        ? null
        : String(REPORT_SEQUENCE);

    syncPhysicalJovian();

    return currentPhysicalJovian();
  };

  const notePhysicalJovianTurnAtRaw = ({
    moon,
    turn,
    rawPulse,
  }) => {
    const rawText =
      String(rawPulse ?? '');

    if (!/^(0|[1-9][0-9]*)$/.test(rawText)) {
      throw new Error(
        'detected Jovian turn RAW invalid'
      );
    }

    const prior =
      physicalJovianEvidenceObserver
        .snapshot()
        .lastRawPulse;

    if (
      prior !== null &&
      BigInt(rawText) < BigInt(prior)
    ) {
      throw new Error(
        'detected Jovian turn RAW regressed'
      );
    }

    if (
      prior === null ||
      BigInt(rawText) > BigInt(prior)
    ) {
      physicalJovianEvidenceObserver.observe({
        schema:
          PHYSICAL_JOVIAN_SAMPLE_SCHEMA,

        source:
          PHYSICAL_JOVIAN_SAMPLE_SOURCE,

        rig:
          physicalJovianRig,

        rawPulse:
          rawText,
      });
    }

    const evidenceBridge =
      physicalJovianEvidenceBridge.sync(
        physicalJovianEvidenceSelectorSnapshot()
      );

    physicalJovianRecovery.syncRecoveryInput(
      evidenceBridge
    );

    physicalJovianRecovery.observe(
      evidenceBridge,
      {
        moon,
        turn,
      }
    );

    const continuousBridge =
      physicalJovianRecoveryBridge.snapshot();

    const jovianNow =
      physicalJovianRecovery.snapshot(
        continuousBridge.lastRawPulse
      );

    physicalJovianTimekeeper.sync(
      continuousBridge,
      jovianNow
    );

    return currentPhysicalJovian();
  };

  const capturePhysicalJovianFrame = () => {
    const bridge =
      syncPhysicalJovian();

    if (
      bridge === null ||
      bridge.lastRawPulse === null ||
      physicalJovianSourceEpoch === null
    ) {
      throw new Error(
        'physical Jovian frame capture requires active physical carrier'
      );
    }

    physicalJovianFrameSequence += 1;

    const captureId =
      `E${physicalJovianSourceEpoch}-F` +
      String(
        physicalJovianFrameSequence
      ).padStart(8, '0');

    const capture = {
      schema:
        'A8-PHYSICAL-JOVIAN-FRAME-CAPTURE-V1',

      captureId,

      sourceEpoch:
        physicalJovianSourceEpoch,

      rawPulse:
        bridge.lastRawPulse,

      reportSequence:
        physicalJovianLastReportSequence,

      processed:
        false,
    };

    physicalJovianFrameCaptures.set(
      captureId,
      capture
    );

    while (
      physicalJovianFrameCaptures.size >
      PHYSICAL_JOVIAN_FRAME_LIMIT
    ) {
      const firstKey =
        physicalJovianFrameCaptures
          .keys()
          .next()
          .value;

      physicalJovianFrameCaptures.delete(
        firstKey
      );
    }

    return {
      ...capture,
    };
  };

  const ingestPhysicalJovianFrame = body => {
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body)
    ) {
      throw new Error(
        'physical Jovian frame body must be an object'
      );
    }

    const allowedTop =
      new Set([
        'captureId',
        'jupiterX',
        'moons',
      ]);

    for (
      const key of
      Object.keys(body)
    ) {
      if (!allowedTop.has(key)) {
        throw new Error(
          `unsupported physical Jovian frame field: ${key}`
        );
      }
    }

    const captureId =
      String(body.captureId ?? '');

    const capture =
      physicalJovianFrameCaptures.get(
        captureId
      );

    if (!capture) {
      throw new Error(
        'unknown or expired physical Jovian captureId'
      );
    }

    if (capture.processed) {
      throw new Error(
        'physical Jovian capture already processed'
      );
    }

    if (
      capture.sourceEpoch !==
      physicalJovianSourceEpoch
    ) {
      throw new Error(
        'physical Jovian capture belongs to stale carrier epoch'
      );
    }

    const raw =
      BigInt(capture.rawPulse);

    if (
      physicalJovianLastProcessedFrameRaw !==
        null &&
      raw <=
        BigInt(
          physicalJovianLastProcessedFrameRaw
        )
    ) {
      throw new Error(
        'physical Jovian frame RAW must strictly advance'
      );
    }

    const jupiterX =
      Number(body.jupiterX);

    if (!Number.isFinite(jupiterX)) {
      throw new Error(
        'physical Jovian jupiterX must be finite'
      );
    }

    if (
      !body.moons ||
      typeof body.moons !== 'object' ||
      Array.isArray(body.moons)
    ) {
      throw new Error(
        'physical Jovian moons must be an object'
      );
    }

    const allowedMoons =
      new Set([
        'io',
        'europa',
        'ganymede',
      ]);

    for (
      const key of
      Object.keys(body.moons)
    ) {
      if (!allowedMoons.has(key)) {
        throw new Error(
          `unsupported physical Jovian moon: ${key}`
        );
      }
    }

    const observations = [];
    const turns = [];

    for (
      const moon of
      ['io', 'europa', 'ganymede']
    ) {
      const rec =
        body.moons[moon];

      const history =
        physicalJovianFrameHistory[
          moon
        ];

      /*
       * Missing moon measurement means blocked/missing observation.
       * It is NOT x=0 and it clears the three-frame detector window.
       */
      if (
        !rec ||
        rec.visible === false
      ) {
        history.length = 0;

        observations.push({
          moon,
          visible:
            false,
          rawPulse:
            capture.rawPulse,
          x:
            null,
        });

        continue;
      }

      if (
        typeof rec !== 'object' ||
        Array.isArray(rec)
      ) {
        throw new Error(
          `${moon} measurement must be an object`
        );
      }

      const allowedMeasurement =
        new Set([
          'moonX',
          'visible',
          'uncertaintyX',
        ]);

      for (
        const key of
        Object.keys(rec)
      ) {
        if (
          !allowedMeasurement.has(key)
        ) {
          throw new Error(
            `unsupported ${moon} measurement field: ${key}`
          );
        }
      }

      const moonX =
        Number(rec.moonX);

      if (!Number.isFinite(moonX)) {
        throw new Error(
          `${moon} moonX must be finite when visible`
        );
      }

      const uncertaintyX =
        rec.uncertaintyX === undefined ||
        rec.uncertaintyX === null
          ? null
          : Number(rec.uncertaintyX);

      if (
        uncertaintyX !== null &&
        (
          !Number.isFinite(
            uncertaintyX
          ) ||
          uncertaintyX < 0
        )
      ) {
        throw new Error(
          `${moon} uncertaintyX must be finite and non-negative`
        );
      }

      const x =
        moonX -
        jupiterX;

      const sample = {
        captureId,
        rawPulse:
          capture.rawPulse,
        x,
        uncertaintyX,
      };

      history.push(
        sample
      );

      while (
        history.length > 3
      ) {
        history.shift();
      }

      observations.push({
        moon,
        visible:
          true,
        rawPulse:
          capture.rawPulse,
        x,
        uncertaintyX,
      });

      if (history.length === 3) {
        const [a, b, c] =
          history;

        const east =
          b.x >
            a.x +
              PHYSICAL_JOVIAN_TURN_EPS &&
          b.x >
            c.x +
              PHYSICAL_JOVIAN_TURN_EPS;

        const west =
          b.x <
            a.x -
              PHYSICAL_JOVIAN_TURN_EPS &&
          b.x <
            c.x -
              PHYSICAL_JOVIAN_TURN_EPS;

        if (east || west) {
          turns.push({
            moon,
            turn:
              east
                ? 'EAST'
                : 'WEST',
            rawPulse:
              b.rawPulse,
            captureId:
              b.captureId,
            x:
              b.x,
          });
        }
      }
    }

    turns.sort((a, b) => {
      const ar =
        BigInt(a.rawPulse);

      const br =
        BigInt(b.rawPulse);

      if (ar < br)
        return -1;

      if (ar > br)
        return 1;

      return a.moon.localeCompare(
        b.moon
      );
    });

    const evidencePrior =
      physicalJovianEvidenceObserver
        .snapshot()
        .lastRawPulse;

    for (const turn of turns) {
      if (
        evidencePrior !== null &&
        BigInt(turn.rawPulse) <
          BigInt(evidencePrior)
      ) {
        throw new Error(
          'detected turn precedes accepted Jovian evidence RAW'
        );
      }
    }

    for (const turn of turns) {
      notePhysicalJovianTurnAtRaw(
        turn
      );
    }

    capture.processed =
      true;

    physicalJovianLastProcessedFrameRaw =
      capture.rawPulse;

    physicalJovianLastFrame = {
      schema:
        'A8-PHYSICAL-JOVIAN-FRAME-RESULT-V1',

      captureId,

      sourceEpoch:
        capture.sourceEpoch,

      rawPulse:
        capture.rawPulse,

      jupiterX,

      observations,

      turns,
    };

    physicalJovianFrameCaptures.delete(
      captureId
    );

    return {
      frame:
        physicalJovianLastFrame,

      physicalJovian:
        currentPhysicalJovian(),
    };
  };


  const currentEarthObservers = () => {
    earthObservationBridge.sync(
      recoveryBridge.snapshot()
    );

    return earthObservationBridge.snapshot();
  };


  let solHoldoverEnabled =
    false;

  const currentEffectiveEarthObservers =
    () => {
      const earth =
        currentEarthObservers();

      if (
        earth.sol &&
        earth.sol.status ===
          'TRACKING' &&
        earth.sol
          .forwardAdvancePerRawPulse512
      ) {
        return {
          ...earth,

          sol: {
            ...earth.sol,

            rateMode:
              'OBSERVED',

            rateAuthority:
              'CURRENT_SELECTED_RAW_STAMPED_SOL_OBSERVATIONS',
          },
        };
      }

      if (!solHoldoverEnabled) {
        return earth;
      }

      return {
        ...earth,

        sol:
          solHoldoverEffectiveSolSnapshot(
            earth
          ),
      };
    };

  /*
   * SPACESHIP EARTH · TERRA SHIP SLIP
   *
   * Downstream state only.
   * No Core20 clock write.
   * No observer-authority change.
   * No inferred missing rotations.
   */
  const terraShipSlipAccumulator =
    new TerraShipSlipAccumulator();

  /*
   * EXTERNAL PHYSICAL EARTH EVIDENCE
   *
   * Real Mintaka / Sol observation lane.
   *
   * Raw authority:
   *   Arduino-B Timer1/D5 physical counter.
   *
   * This lane does NOT derive physical raw from Core mapped raw.
   * It does NOT write the civil clock.
   * It does NOT write the legacy Gate-6F Earth observers.
   * It does NOT write Terra Ship Slip.
   */
  const {
    PhysicalEarthEvidenceLedger,
  } = require(
    '../observer/a8-physical-earth-evidence-ledger'
  );

  const physicalEarthEvidenceLedger =
    new PhysicalEarthEvidenceLedger({
      directory:
        process.env
          .A8_CORE20_PHYSICAL_EARTH_EVIDENCE_DIR ||
        '/home/greg/.local/state/a8-core20/physical-earth-evidence',

      expectedSourceEpoch:
        process.env
          .A8_CORE20_EXTERNAL_PHYSICAL_EPOCH,
    });

  const currentTerraShipSlip = () => {
    const earth =
      currentEffectiveEarthObservers();

    try {
      const relationship =
        deriveMintakaSolRelationship(
          earth.mintaka,
          earth.sol
        );

      return {
        ok: true,
        ready: true,

        solRateMode:
          earth.sol &&
          earth.sol.rateMode
            ? earth.sol.rateMode
            : 'OBSERVED',

        solRateHoldover:
          earth.sol &&
          earth.sol.rateMode ===
            'HOLDOVER'
            ? earth.sol.rateHoldover
            : null,

        terraShipSlip: {
          ...relationship,

          solRateMode:
            earth.sol &&
            earth.sol.rateMode
              ? earth.sol.rateMode
              : 'OBSERVED',
        },
      };
    } catch (err) {
      return {
        ok: true,
        ready: false,
        terraShipSlip: null,
        source: {
          mintakaStatus:
            earth.mintaka &&
            earth.mintaka.status,
          solStatus:
            earth.sol &&
            earth.sol.status,
        },
        reason:
          err && err.message
            ? err.message
            : String(err),
      };
    }
  };

  const updateTerraShipSlipAccumulator =
    trigger => {
      const state =
        currentTerraShipSlip();

      if (
        !state.ready ||
        !state.terraShipSlip
      ) {
        return {
          ...state,
          trigger,
          accumulator:
            terraShipSlipAccumulator.snapshot(),
        };
      }

      try {
        return {
          ok: true,
          ready: true,
          trigger,
          relationship:
            state.terraShipSlip,
          accumulator:
            terraShipSlipAccumulator.ingest(
              state.terraShipSlip
            ),
        };
      } catch (err) {
        return {
          ok: false,
          ready: false,
          trigger,
          relationship:
            state.terraShipSlip,
          accumulator:
            terraShipSlipAccumulator.snapshot(),
          reason:
            err && err.message
              ? err.message
              : String(err),
        };
      }
    };

  const currentEarthRotationScale = () =>
    deriveEarthRotationJovianScale(
      currentTimekeeper(),
      currentEarthObservers()
    );

  const currentSolOrbitalScale = () => {
    const earth =
      currentEffectiveEarthObservers();

    const scale =
      deriveSolOrbitalJovianScale(
        currentEarthRotationScale(),
        earth
      );

    return {
      ...scale,

      solRateMode:
        earth.sol &&
        earth.sol.rateMode
          ? earth.sol.rateMode
          : 'UNAVAILABLE',

      solRateHoldover:
        earth.sol &&
        earth.sol.rateMode ===
          'HOLDOVER'
          ? earth.sol.rateHoldover
          : null,
    };
  };

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

  /*
   * INDEPENDENT MINTAKA 2^17 STELLAR CLOCK
   *
   * Downstream/read-only.
   * Selected raw counter + recovered Mintaka recurrence only.
   */
  const currentMintakaPhase17 = () => {
    const bridge =
      syncRecoveryInput();

    const earth =
      currentEarthObservers();

    const earthScale =
      deriveEarthRotationJovianScale(
        currentTimekeeper(),
        earth
      );

    return mintakaPhase17.snapshot(
      bridge,
      earthScale,
      earth.mintaka
    );
  };

  /*
   * OPPOSING CLOCK INSTRUMENT
   *
   * One selected-raw snapshot feeds BOTH clocks and the
   * exact discrepancy accumulator.
   *
   * This prevents sequential HTTP reads from manufacturing
   * an artificial phase difference.
   */
  const currentOpposingClockInstrument = () => {
    const bridge =
      syncRecoveryInput();

    const earth =
      currentEffectiveEarthObservers();

    const earthScale =
      deriveEarthRotationJovianScale(
        currentTimekeeper(),
        earth
      );

    const solScale =
      deriveSolOrbitalJovianScale(
        earthScale,
        earth
      );

    const sunReturn =
      deriveSunReturnRecurrence(
        earthScale,
        solScale
      );

    civilDayPhase17.syncSource(
      bridge
    );

    const mintakaClock =
      mintakaPhase17.snapshot(
        bridge,
        earthScale,
        earth.mintaka
      );

    const civilClock =
      civilDayPhase17.snapshot(
        bridge,
        sunReturn
      );

    const discrepancy =
      opposingClockDiscrepancy.snapshot(
        bridge,
        earthScale,
        sunReturn
      );

    const bridgeRaw =
      bridge.lastRawPulse === null ||
      bridge.lastRawPulse === undefined
        ? null
        : String(
            bridge.lastRawPulse
          );

    const mintakaRaw =
      mintakaClock.selectedRawPulse ??
      null;

    const civilRaw =
      civilClock.currentSelectedRawPulse ??
      null;

    const rawAgreement =
      bridgeRaw !== null &&
      mintakaRaw === bridgeRaw &&
      civilRaw === bridgeRaw;

    const ready =
      mintakaClock.status ===
        'MINTAKA_PHASE17_STELLAR_CLOCK_ACTIVE' &&
      civilClock.status ===
        'DAY_PHASE17_CIVIL_CLOCK_ACTIVE' &&
      discrepancy.status ===
        'OPPOSING_CLOCK_DISCREPANCY_ACTIVE' &&
      discrepancy.ready === true &&
      rawAgreement;

    return {
      schema:
        'A8-OPPOSING-CLOCK-INSTRUMENT-V1',

      status:
        ready
          ? 'OPPOSING_CLOCK_INSTRUMENT_ACTIVE'
          : 'OPPOSING_CLOCK_INSTRUMENT_WAITING',

      ready,

      sourceEpoch:
        bridge.sourceEpoch,

      sourceMode:
        bridge.mode ?? null,

      rig:
        bridge.rig ?? null,

      selectedRawPulse:
        bridgeRaw,

      sameSelectedRawPulse:
        rawAgreement,

      rawSampleAudit: {
        bridge:
          bridgeRaw,

        mintakaClock:
          mintakaRaw,

        civilClock:
          civilRaw,
      },

      mintakaClock,
      civilClock,
      discrepancy,

      naturalInputs: {
        earthRotationScale:
          earthScale,

        sunReturnRecurrence:
          sunReturn,
      },

      authorityBoundary: {
        writesA8Core:
          false,

        writesMintakaObserver:
          false,

        writesSolObserver:
          false,

        writesTerraShipSlip:
          false,

        writesCivilClock:
          false,

        writesCalendar:
          false,

        changesAuthority:
          false,

        usesLegacyTime:
          false,

        usesHostTime:
          false,

        usesBrowserTime:
          false,

        usesFrequencyHz:
          false,

        usesUTC:
          false,

        usesNTP:
          false,

        usesGPS:
          false,
      },
    };
  };

  const observeMintakaSelected = observation => {
    const bridge =
      syncRecoveryInput();

    const result =
      earthObservationBridge.observeMintaka(
        bridge,
        observation
      );

    return {
      ...result,
      terraShipSlip:
        updateTerraShipSlipAccumulator(
          'MINTAKA_OBSERVATION'
        ),
    };
  };

  const observeSolSelected = observation => {
    const bridge =
      syncRecoveryInput();

    const result =
      earthObservationBridge.observeSol(
        bridge,
        observation
      );

    let solRateHoldover =
      null;

    if (
      result.observer &&
      result.observer.status ===
        'TRACKING' &&
      Number.isSafeInteger(
        result.observer.intervalCount
      ) &&
      result.observer.intervalCount > 0
    ) {
      solRateHoldover =
        persistObservedSolRateHoldover(
          result.bridge
        );
    }

    return {
      ...result,

      solRateHoldover,

      terraShipSlip:
        updateTerraShipSlipAccumulator(
          'SOL_OBSERVATION'
        ),
    };
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

  /*
   * QUALIFIED PHYSICAL RAW -> CORE RAW
   *
   * Same affine mapping and integer-floor semantics used by
   * the live external-physical ingest lane.
   *
   * Read-only coordinate translation.
   * Does not advance Core20.
   */
  const mapPhysicalRawToCoreRaw = physicalRawValue => {
    const physicalRaw =
      BigInt(
        physicalRawValue
      );

    const physicalAnchor =
      BigInt(
        process.env
          .A8_CORE20_EXTERNAL_PHYSICAL_ANCHOR
      );

    const coreAnchor =
      BigInt(
        process.env
          .A8_CORE20_EXTERNAL_CORE_ANCHOR
      );

    const ratioNumerator =
      BigInt(
        process.env
          .A8_CORE20_EXTERNAL_RATIO_NUMERATOR
      );

    const ratioDenominator =
      BigInt(
        process.env
          .A8_CORE20_EXTERNAL_RATIO_DENOMINATOR
      );

    if (
      ratioDenominator <=
      0n
    ) {
      throw new Error(
        'external physical/Core ratio denominator must be positive'
      );
    }

    if (
      physicalRaw <
      physicalAnchor
    ) {
      throw new Error(
        'physical raw regressed behind configured external anchor'
      );
    }

    const physicalDelta =
      physicalRaw -
      physicalAnchor;

    const externalCoreAdvance =
      (
        physicalDelta *
        ratioNumerator
      ) /
      ratioDenominator;

    const coreRaw =
      coreAnchor +
      externalCoreAdvance;

    return {
      physicalRaw,
      physicalAnchor,
      coreAnchor,
      ratioNumerator,
      ratioDenominator,
      physicalDelta,
      externalCoreAdvance,
      coreRaw,
    };
  };


  /*
   * EUROPA NATURAL/MODEL RAW CLOCK LANE
   *
   * Arduino RAW is a replaceable carrier coordinate.
   * This adapter projects it onto the qualified Entry011
   * natural/model RAW axis used by the civil clock.
   *
   * It does not alter the legacy physical->Core projection.
   */
  const mapPhysicalRawToNaturalClockRaw =
    physicalRawValue => {
      const physicalRaw =
        BigInt(physicalRawValue);

      const physicalAnchor =
        BigInt(
          process.env
            .A8_CLOCK_NATURAL_PHYSICAL_ANCHOR
        );

      const naturalAnchor =
        BigInt(
          process.env
            .A8_CLOCK_NATURAL_MODEL_ANCHOR
        );

      const ratioNumerator =
        BigInt(
          process.env
            .A8_CLOCK_NATURAL_RATIO_NUMERATOR
        );

      const ratioDenominator =
        BigInt(
          process.env
            .A8_CLOCK_NATURAL_RATIO_DENOMINATOR
        );

      if (ratioDenominator <= 0n) {
        throw new Error(
          'natural clock carrier ratio denominator must be positive'
        );
      }

      if (physicalRaw < physicalAnchor) {
        throw new Error(
          'physical RAW regressed behind natural clock carrier anchor'
        );
      }

      const physicalDelta =
        physicalRaw -
        physicalAnchor;

      const naturalAdvance =
        (
          physicalDelta *
          ratioNumerator
        ) /
        ratioDenominator;

      return {
        physicalRaw,
        physicalAnchor,
        naturalAnchor,
        ratioNumerator,
        ratioDenominator,
        physicalDelta,
        naturalAdvance,
        naturalRaw:
          naturalAnchor +
          naturalAdvance,
      };
    };

  /*
   * MINTAKA + SOL SUN-RETURN RELATIONSHIP
   *
   * This is a DOWNSTREAM clock relationship expressed on
   * the Europa natural/model RAW axis.
   *
   * It may later be refined by new Mintaka/Sol evidence
   * without changing Europa, the natural axis, or carrier
   * authority.
   */
  const naturalRawPerSunReturnText = () => {
    const numerator =
      String(
        process.env
          .A8_CLOCK_NATURAL_SUN_RETURN_NUMERATOR ||
        ''
      );

    const denominator =
      String(
        process.env
          .A8_CLOCK_NATURAL_SUN_RETURN_DENOMINATOR ||
        ''
      );

    if (
      !/^[0-9]+$/.test(numerator) ||
      !/^[0-9]+$/.test(denominator) ||
      denominator === '0'
    ) {
      throw new Error(
        'natural RAW/Sun-return configuration invalid'
      );
    }

    return `${numerator}/${denominator}`;
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

    solHoldoverEnabled = false;

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

    /*
     * SOL RATE HOLDOVER RECOVERY
     *
     * No artificial direction pair is injected here.
     *
     * The persisted natural relationship is:
     *
     *   Sol A8 angle advance / Mintaka stellar rotation
     *
     * Fresh Mintaka recovery above supplies:
     *
     *   selected raw / Mintaka stellar rotation
     *
     * Their exact ratio restores:
     *
     *   Sol A8 angle advance / selected raw
     *
     * Old absolute raw counts are never replayed across runs.
     */
    solHoldoverEnabled =
      true;

    const effectiveEarth =
      currentEffectiveEarthObservers();

    if (
      !effectiveEarth.sol ||
      effectiveEarth.sol.status !==
        'TRACKING' ||
      effectiveEarth.sol.rateMode !==
        'HOLDOVER' ||
      !effectiveEarth.sol
        .forwardAdvancePerRawPulse512
    ) {
      throw new Error(
        'qualified Sol rate holdover recovery failed'
      );
    }

    const recurrence =
      currentSunReturnRecurrence();

    if (
      !recurrence ||
      recurrence.status !==
        'SUN_RETURN_RECURRENCE_RECOVERED' ||
      !recurrence.rawPerSunReturnRecurrence
    ) {
      throw new Error(
        'server-owned Sun-return recovery failed from qualified Sol holdover'
      );
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
    getRaw:
      () => selectedRawBigInt(),

    getSourceEpoch:
      () =>
        recoveryBridge
          .snapshot()
          .sourceEpoch,

    getRecurrenceText: () => {
      const recurrence = currentSunReturnRecurrence();
      if (!recurrence || !recurrence.rawPerSunReturnRecurrence) {
        throw new Error('Sun-return recurrence unavailable');
      }
      return recurrence.rawPerSunReturnRecurrence.text;
    },

    getNaturalRecurrenceText:
      () => naturalRawPerSunReturnText(),

    /*
     * Execution/observer resolution only.
     * Under PRIMARY physical mode this scheduler never advances RAW.
     * Host-monotonic pacing is reserved for explicit LEGACY emergency use.
     */
    intervalMs: 2,

    /*
     * Human-visible accelerated simulation.
     * Nine genuine Jovian observation groups take ~6.75 s.
     * This number never enters recovered spans or time authority.
     */
    qualificationPresentationMs: 750,

    externalPhysicalPrimary:
      process.env.A8_CORE20_EXTERNAL_PHYSICAL === '1',

    legacyEmergencyEnabled:
      process.env.A8_CORE20_LEGACY_EMERGENCY === '1',
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

  /*
   * TERRA SHIP SLIP · LIFETIME PERSISTENCE
   *
   * Downstream observer only.
   * The Core20 native edge provides the checkpoint cadence.
   * No host timer, UTC cadence, cron, or missing-motion inference.
   */
  const currentTerraLifetimeEdge =
    () => {
      const c =
        core20Runtime
          .clockSnapshot();

      if (
        !c ||
        c.status !==
          'CORE20_CLOCK_RUNNING'
      ) {
        return null;
      }

      /*
       * Temporary external physical holdover preserves civil continuity only.
       * It is explicitly NOT qualified Terra Ship Slip evidence.
       */
      if (
        c.alignment &&
        c.alignment.role ===
          'TEMPORARY_EXTERNAL_PHYSICAL_HOLDOVER'
      ) {
        return null;
      }

      const totalState =
        BigInt(c.dayCount) *
          131072n +
        BigInt(c.dayPhase17);

      return {
        schema:
          'A8-CORE20-CLOCK-EDGE-V1',

        sequence: null,

        sourceEpoch:
          String(c.sourceEpoch),

        deltaStates: '0',

        rawPulse:
          String(
            c.currentSelectedRawPulse
          ),

        totalState:
          totalState.toString(),

        dayCount:
          String(c.dayCount),

        dayPhase17:
          String(c.dayPhase17),

        clockAuthority:
          c.clockAuthority,

        definingPathTouched:
          false,

        browserTimingAuthority:
          false,
      };
    };

  /*
   * TERRA SHIP SLIP · NATIVE A8 CALENDAR FIREWALL
   *
   * Only a fully-running native A8 calendar position may
   * enter the lifetime/report layer.
   *
   * Awaiting / stale / reanchor-required calendar states
   * become null. Slip accumulation continues; date/report
   * advancement pauses.
   *
   * No persistence fallback.
   * No external position fallback.
   * No conventional-time fallback.
   */
  const currentNativeA8CalendarForTerra =
    () => {
      const c =
        calendarAnchor.snapshot();

      if (
        !c ||
        c.status !==
          'CALENDAR_RUNNING_FROM_CORE20_COUNT' ||
        c.anchored !== true
      ) {
        return null;
      }

      const p =
        c.persistence || {};

      /*
       * Explicit authority firewall.
       * These flags are inspected only to reject contamination;
       * none of the persistence object enters Terra state.
       */
      if (
        p.usesUTC !== false ||
        p.usesJPL !== false ||
        p.usesYearAngle !== false ||
        p.usesBrowserTime !== false ||
        p.usesHostTime !== false ||
        p.usesLegacySeconds !== false ||
        p.usesNetworkCadence !== false
      ) {
        return null;
      }

      const required = [
        'yearCycle4',
        'yearCycleLabel',
        'yearDay',
        'yearDayOctal',
        'yearLength',
        'isLeapYear',
        'calendarRegion',
        'coreDayCount',
      ];

      for (const key of required) {
        if (
          c[key] === undefined ||
          c[key] === null
        ) {
          return null;
        }
      }

      /*
       * WHITELIST ONLY.
       *
       * No anchor object.
       * No persistence object.
       * No migration provenance.
       * No year-angle diagnostic.
       * No external reference.
       */
      return {
        yearCycle4:
          c.yearCycle4,

        yearCycleLabel:
          c.yearCycleLabel,

        yearDay:
          c.yearDay,

        yearDayOctal:
          c.yearDayOctal,

        yearLength:
          c.yearLength,

        isLeapYear:
          c.isLeapYear,

        calendarRegion:
          c.calendarRegion,

        coreDayCount:
          c.coreDayCount,
      };
    };

  const observeTerraLifetime =
    ({
      edge,
      reason = 'CLOCK_EDGE',
      forceWrite = false,
      cleanShutdown = false,
    } = {}) => {
      if (
        !terraShipSlipLifetimeLedger
      ) {
        return null;
      }

      const bridge =
        recoveryBridge.snapshot();

      const earthScale =
        currentEarthRotationScale();

      const sunReturn =
        currentSunReturnRecurrence();

      const discrepancy =
        opposingClockDiscrepancy
          .snapshot(
            bridge,
            earthScale,
            sunReturn
          );

      if (
        !discrepancy ||
        discrepancy.ready !== true
      ) {
        return (
          terraShipSlipLifetimeLedger
            .snapshot()
        );
      }

      return (
        terraShipSlipLifetimeLedger
          .observe({
            edge,
            discrepancy,
            calendar:
              currentNativeA8CalendarForTerra(),

            accumulator:
              terraShipSlipAccumulator
                .snapshot(),

            reason,
            forceWrite,
            cleanShutdown,
          })
      );
    };

  const sealTerraShipSlipLifetime =
    () => {
      if (
        !terraShipSlipLifetimeLedger
      ) {
        return null;
      }

      const edge =
        currentTerraLifetimeEdge();

      if (!edge) {
        return (
          terraShipSlipLifetimeLedger
            .snapshot()
        );
      }

      return observeTerraLifetime({
        edge,
        reason:
          'CLEAN_SHUTDOWN',
        forceWrite: true,
        cleanShutdown: true,
      });
    };

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

  const removeTerraLifetimeEdgeListener =
    terraShipSlipLifetimeLedger
      ? core20Runtime.onClockEdge(
          edge => {
            try {
              observeTerraLifetime({
                edge,
                reason:
                  'CLOCK_EDGE',
              });
            } catch (err) {
              console.error(
                'TERRA SHIP SLIP LIFETIME OBSERVER ·',
                err && err.message
                  ? err.message
                  : String(err)
              );
            }
          }
        )
      : () => {};

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

        /*
         * QUALIFIED EXTERNAL PHYSICAL PRIMARY
         *
         * Loopback service input only.
         *
         * Input contains physical counter identity/count only.
         * No timestamp, seconds, Hz, UTC or elapsed host time.
         */
        if (
          req.method === 'GET' &&
          url.pathname ===
            '/api/core20/physical-earth-evidence'
        ) {
          return sendJson(
            res,
            200,
            {
              ok: true,

              evidence:
                physicalEarthEvidenceLedger
                  .snapshot(),
            }
          );
        }

        if (
          req.method === 'POST' &&
          url.pathname ===
            '/api/core20/external-physical/sample'
        ) {
          try {
            if (
              process.env
                .A8_CORE20_EXTERNAL_PHYSICAL !==
              '1'
            ) {
              throw new Error(
                'external physical mode is not enabled'
              );
            }

            if (
              req.headers[
                'x-a8-external-physical'
              ] !== '1'
            ) {
              return sendJson(
                res,
                403,
                {
                  ok: false,
                  error:
                    'EXTERNAL PHYSICAL HEADER REQUIRED',
                }
              );
            }

            const body =
              await readJsonBody(req);

            const allowed =
              new Set([
                'SOURCE_EPOCH',
                'RAW_COUNT',
                'REPORT_SEQUENCE',
                'STATUS',
              ]);

            for (
              const key of
              Object.keys(body)
            ) {
              if (!allowed.has(key)) {
                throw new Error(
                  `unsupported external physical field: ${key}`
                );
              }
            }

            if (
              String(body.SOURCE_EPOCH) !== String(process.env.A8_CORE20_EXTERNAL_PHYSICAL_EPOCH || '')
            ) {
              throw new Error(
                'physical SOURCE_EPOCH changed · continuity broken'
              );
            }

            if (
              body.STATUS !== 'ACTIVE'
            ) {
              throw new Error(
                'physical source is not ACTIVE'
              );
            }

            const rawText =
              String(
                body.RAW_COUNT ?? ''
              );

            if (
              !/^[0-9]+$/.test(rawText)
            ) {
              throw new Error(
                'physical RAW_COUNT invalid'
              );
            }

            const physicalRaw =
              BigInt(rawText);

            const PHYSICAL_ANCHOR =
              BigInt(
                process.env.A8_CORE20_EXTERNAL_PHYSICAL_ANCHOR
              );

            const CORE_ANCHOR =
              BigInt(
                process.env.A8_CORE20_EXTERNAL_CORE_ANCHOR
              );

            const CIVIL_CORE_ANCHOR =
              BigInt(
                process.env.A8_CORE20_EXTERNAL_CIVIL_CORE_ANCHOR ||
                process.env.A8_CORE20_EXTERNAL_CORE_ANCHOR
              );

            const RATIO_NUMERATOR =
              BigInt(
                process.env.A8_CORE20_EXTERNAL_RATIO_NUMERATOR
              );

            const RATIO_DENOMINATOR =
              BigInt(
                process.env.A8_CORE20_EXTERNAL_RATIO_DENOMINATOR
              );

            if (
              physicalRaw <
              PHYSICAL_ANCHOR
            ) {
              throw new Error(
                'physical raw regressed behind configured external anchor'
              );
            }

            physicalEarthEvidenceLedger
              .notePhysicalSample({
                SOURCE_EPOCH:
                  body.SOURCE_EPOCH,

                RAW_COUNT:
                  rawText,

                REPORT_SEQUENCE:
                  body.REPORT_SEQUENCE ??
                  null,

                STATUS:
                  body.STATUS,
              });

            notePhysicalJovianSample({
              SOURCE_EPOCH:
                body.SOURCE_EPOCH,

              RAW_COUNT:
                rawText,

              REPORT_SEQUENCE:
                body.REPORT_SEQUENCE ??
                null,

              STATUS:
                body.STATUS,
            });

            await ensureCore20RuntimeRunning();

            const naturalClockMapping =
              mapPhysicalRawToNaturalClockRaw(
                physicalRaw
              );

            const physicalDelta =
              physicalRaw -
              PHYSICAL_ANCHOR;

            const externalCoreAdvance =
              (
                physicalDelta *
                RATIO_NUMERATOR
              ) /
              RATIO_DENOMINATOR;

            const targetCoreRaw =
              CORE_ANCHOR +
              externalCoreAdvance;

            const advanced =
              core20Runtime
                .advanceExternalPhysicalToTarget(
                  targetCoreRaw.toString(),
                  naturalClockMapping
                    .naturalRaw
                    .toString()
                );

            let clock =
              core20Runtime
                .clockSnapshot();

            if (
              clock.status !==
              'CORE20_CLOCK_RUNNING'
            ) {
              core20Runtime
                .installExternalPhysicalAlignment({
                  anchorRawPulse:
                    CIVIL_CORE_ANCHOR.toString(),

                  clockAnchorRawPulse:
                    String(
                      process.env
                        .A8_CLOCK_NATURAL_MODEL_ANCHOR
                    ),

                  targetDayCount:
                    String(
                      process.env.A8_CORE20_EXTERNAL_DAY_COUNT || '0'
                    ),

                  targetDayPhase17:
                    String(
                      process.env.A8_CORE20_EXTERNAL_DAY_PHASE17
                    ),

                  externalPhysicalSourceEpoch:
                    String(
                      process.env.A8_CORE20_EXTERNAL_PHYSICAL_EPOCH
                    ),
                });

              clock =
                core20Runtime
                  .clockSnapshot();
            }

            const alignment =
              clock.alignment || {};

            const expectedExternalRole =
              process.env.A8_CORE20_EXTERNAL_JOVIAN_QUALIFIED === '1'
                ? 'QUALIFIED_EXTERNAL_PHYSICAL_PRIMARY'
                : 'TEMPORARY_EXTERNAL_PHYSICAL_HOLDOVER';

            if (
              alignment.role !==
              expectedExternalRole ||
              alignment
                .externalPhysicalSourceEpoch !==
              String(
                process.env.A8_CORE20_EXTERNAL_PHYSICAL_EPOCH
              )
            ) {
              throw new Error(
                'external physical alignment identity mismatch'
              );
            }

            return sendJson(
              res,
              200,
              {
                ok: true,

                mode:
                  expectedExternalRole,

                authority:
                  expectedExternalRole ===
                    'QUALIFIED_EXTERNAL_PHYSICAL_PRIMARY'
                    ? 'ENGINEERED PHYSICAL PACE · RECOVERED JOVIAN/MINTAKA/SOL RATE · MERIDIAN-0 PHASE · PREDICTIVE SYSTEM'
                    : 'NONE · ENGINEERED PHYSICAL PACE · TEMPORARY MAPPED HOLDOVER',

                physical: {
                  sourceEpoch:
                    String(
                      process.env.A8_CORE20_EXTERNAL_PHYSICAL_EPOCH
                    ),

                  rawCount:
                    physicalRaw.toString(),

                  reportSequence:
                    body.REPORT_SEQUENCE ??
                    null,

                  status:
                    body.STATUS,
                },

                mapping: {
                  physicalAnchorRaw:
                    PHYSICAL_ANCHOR.toString(),

                  coreAnchorRaw:
                    CORE_ANCHOR.toString(),

                  ratio:
                    `${process.env.A8_CORE20_EXTERNAL_RATIO_NUMERATOR}/` +
                    `${process.env.A8_CORE20_EXTERNAL_RATIO_DENOMINATOR}`,

                  ratioLower:
                    null,

                  ratioUpper:
                    null,

                  physicalDelta:
                    physicalDelta.toString(),

                  externalCoreAdvance:
                    externalCoreAdvance.toString(),

                  targetCoreRaw:
                    targetCoreRaw.toString(),

                  naturalClock: {
                    domain:
                      'EUROPA_NATURAL_MODEL_RAW',

                    physicalAnchorRaw:
                      naturalClockMapping
                        .physicalAnchor
                        .toString(),

                    naturalAnchorRaw:
                      naturalClockMapping
                        .naturalAnchor
                        .toString(),

                    carrierRatio:
                      `${naturalClockMapping.ratioNumerator}/` +
                      `${naturalClockMapping.ratioDenominator}`,

                    naturalRaw:
                      naturalClockMapping
                        .naturalRaw
                        .toString(),
                  },

                  advancedThisSample:
                    advanced.toString(),
                },

                clock,
              }
            );
          } catch (err) {
            return sendJson(
              res,
              409,
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
            '/api/core20/year-angle/align-native-sol'
        ) {
          try {
            const body =
              await readJsonBody(req);

            if (
              process.env
                .A8_CORE20_EXTERNAL_PHYSICAL !==
              '1'
            ) {
              throw new Error(
                'native Sol year-angle alignment requires PRIMARY external physical mode'
              );
            }

            if (
              core20Runtime.status !==
              'RUNNING'
            ) {
              throw new Error(
                'native Sol year-angle alignment requires RUNNING Core20'
              );
            }

            /*
             * Preserve one-shot behavior without creating
             * another physical evidence record.
             */
            const existing =
              yearAngleBridge
                .snapshot();

            if (
              existing.aligned ===
              true
            ) {
              return sendJson(
                res,
                200,
                {
                  ok: true,

                  alignmentApplied:
                    false,

                  physicalEvidenceRecorded:
                    false,

                  alignment:
                    existing.alignment,

                  yearAngle:
                    existing,
                }
              );
            }

            /*
             * The external observation supplies ONLY:
             *
             *   type
             *   witness
             *   exact native angle512
             *
             * The physical ledger itself stamps the currently
             * selected Epoch-5 physical RAW sample.
             */
            /*
             * Reject an invalid/non-PHASE27-native angle
             * before the evidence ledger writes anything.
             */
            yearAngleBridge
              .validateNativeSolAngle512(
                body.angle512
              );

            const physicalEvidence =
              physicalEarthEvidenceLedger
                .recordSol(
                  body
                );

            const mapped =
              mapPhysicalRawToCoreRaw(
                physicalEvidence
                  .physicalRawCount
              );

            const currentCoreRaw =
              selectedRawBigInt();

            if (
              mapped.coreRaw >
              currentCoreRaw
            ) {
              throw new Error(
                'native Sol mapped Core RAW is ahead of current selected RAW'
              );
            }

            const result =
              yearAngleBridge
                .alignNativeSol({
                  rawAtYearAlign:
                    mapped
                      .coreRaw
                      .toString(),

                  angle512:
                    physicalEvidence
                      .angle512,

                  physicalSourceEpoch:
                    physicalEvidence
                      .physicalSourceEpoch,

                  physicalRawCount:
                    physicalEvidence
                      .physicalRawCount,

                  physicalReportSequence:
                    physicalEvidence
                      .physicalReportSequence,

                  rawAuthority:
                    physicalEvidence
                      .rawAuthority,

                  coreMapping: {
                    method:
                      'QUALIFIED_EXTERNAL_PHYSICAL_TO_CORE_INTEGER_FLOOR',

                    physicalAnchorRaw:
                      mapped
                        .physicalAnchor
                        .toString(),

                    coreAnchorRaw:
                      mapped
                        .coreAnchor
                        .toString(),

                    ratioCoreRawPerPhysicalEdge:
                      mapped
                        .ratioNumerator
                        .toString() +
                      '/' +
                      mapped
                        .ratioDenominator
                        .toString(),

                    physicalDelta:
                      mapped
                        .physicalDelta
                        .toString(),

                    mappedCoreAdvance:
                      mapped
                        .externalCoreAdvance
                        .toString(),

                    mappedCoreRaw:
                      mapped
                        .coreRaw
                        .toString(),
                  },
                });

            return sendJson(
              res,
              200,
              {
                ok: true,

                alignmentApplied:
                  result.applied,

                physicalEvidenceRecorded:
                  true,

                physicalEvidence,

                alignment:
                  result.alignment,

                yearAngle:
                  result.yearAngle,

                orientationAuthority:
                  'NATIVE_SOL_CELESTIAL_DIRECTION',

                ongoingAuthority:
                  'SELECTED_RAW_PLUS_RECOVERED_SOL_ANGLE_PER_RAW',

                usesJpl:
                  false,

                usesUtc:
                  false,

                usesHostTime:
                  false,
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
            '/api/terra-ship-slip'
        ) {
          return sendJson(
            res,
            200,
            currentTerraShipSlip()
          );
        }

        if (
          req.method === 'GET' &&
          url.pathname ===
            '/api/terra-ship-slip/accumulator'
        ) {
          return sendJson(
            res,
            200,
            {
              ok: true,
              accumulator:
                terraShipSlipAccumulator.snapshot(),
            }
          );
        }

        if (
          req.method === 'GET' &&
          url.pathname ===
            '/api/terra-ship-slip/lifetime'
        ) {
          return sendJson(
            res,
            200,
            {
              ok: true,
              lifetime:
                terraShipSlipLifetimeLedger
                  ? terraShipSlipLifetimeLedger
                      .snapshot()
                  : {
                      status:
                        'LIFETIME_PERSISTENCE_DISABLED',
                    },
            }
          );
        }

        if (
          req.method === 'GET' &&
          url.pathname ===
            '/api/mintaka/clock'
        ) {
          try {
            return sendJson(
              res,
              200,
              {
                ok: true,
                clock:
                  currentMintakaPhase17(),
              }
            );
          } catch (err) {
            return sendJson(
              res,
              500,
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
            '/api/opposing-clocks'
        ) {
          try {
            return sendJson(
              res,
              200,
              {
                ok: true,
                instrument:
                  currentOpposingClockInstrument(),
              }
            );
          } catch (err) {
            return sendJson(
              res,
              500,
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


            if (
              process.env
                .A8_CORE20_EXTERNAL_PHYSICAL ===
              '1'
            ) {
              const physicalEvidence =
                physicalEarthEvidenceLedger
                  .recordMintaka(
                    body
                  );

              return sendJson(
                res,
                200,
                {
                  ok: true,

                  mode:
                    'EXTERNAL_PHYSICAL_EVIDENCE_ONLY',

                  physicalEvidence,

                  mappedCoreObserverUpdated:
                    false,

                  terraShipSlipUpdated:
                    false,

                  authority:
                    'ARDUINO_B_PHYSICAL_RAW · SOURCE_EPOCH_BOUND · NO HOST TIME',
                }
              );
            }

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


            if (
              process.env
                .A8_CORE20_EXTERNAL_PHYSICAL ===
              '1'
            ) {
              const physicalEvidence =
                physicalEarthEvidenceLedger
                  .recordSol(
                    body
                  );

              return sendJson(
                res,
                200,
                {
                  ok: true,

                  mode:
                    'EXTERNAL_PHYSICAL_EVIDENCE_ONLY',

                  physicalEvidence,

                  mappedCoreObserverUpdated:
                    false,

                  terraShipSlipUpdated:
                    false,

                  authority:
                    'ARDUINO_B_PHYSICAL_RAW · SOURCE_EPOCH_BOUND · NO HOST TIME',
                }
              );
            }

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
            '/api/hardware/jovian-physical'
        ) {
          return sendJson(
            res,
            200,
            {
              ok: true,
              physicalJovian:
                currentPhysicalJovian(),
            }
          );
        }

        if (
          req.method === 'POST' &&
          url.pathname ===
            '/api/hardware/jovian-physical/frame/capture'
        ) {
          try {
            const body =
              await readJsonBody(req);

            if (
              body &&
              Object.keys(body).length !== 0
            ) {
              throw new Error(
                'frame capture accepts no caller timing or measurement fields'
              );
            }

            return sendJson(
              res,
              200,
              {
                ok: true,
                capture:
                  capturePhysicalJovianFrame(),
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
            '/api/hardware/jovian-physical/frame/measure'
        ) {
          try {
            const body =
              await readJsonBody(req);

            return sendJson(
              res,
              200,
              {
                ok: true,
                ...ingestPhysicalJovianFrame(
                  body
                ),
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
            '/api/hardware/jovian-physical/observe'
        ) {
          return sendJson(
            res,
            410,
            {
              ok: false,
              error:
                'MANUAL_TURN_INGRESS_DISABLED',

              requiredPath:
                'frame/capture -> real Jupiter/moon measurement -> frame/measure',

              acceptsCallerRaw:
                false,

              acceptsCallerTurn:
                false,
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

    removeTerraLifetimeEdgeListener();

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
    physicalJovianRecoveryBridge,
    physicalJovianRecovery,
    physicalJovianTimekeeper,
    physicalJovianEvidenceBridge,
    currentPhysicalJovian,
    notePhysicalJovianSample,
    capturePhysicalJovianFrame,
    ingestPhysicalJovianFrame,
    earthObservationBridge,
    core20Runtime,
    nativeDittyBridge,
    terraShipSlipLifetimeLedger,
    sealTerraShipSlipLifetime,
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
