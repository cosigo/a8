#!/usr/bin/env node
'use strict';
const { TerraShipSlipAccumulator } = require('./observer/a8-terra-ship-slip-accumulator');
const { deriveMintakaSolRelationship } = require('./observer/a8-mintaka-sol-relationship');
const { SolCelestialObserver } = require('./observer/a8-sol-observer');
const { MintakaRotationObserver } = require('./observer/a8-mintaka-observer');

const http = require('http');
const fs = require('fs');
const path = require('path');
const { A8Core } = require('./core/a8-core');
const { resolveDataRoot, inventory: dataInventory, inspect: inspectDataFile, REPLAY_SCHEMA } = require('./lib/a8-data-bridge');
const { formatA8AngleFromLegacy, a8UnitsToLegacyDegrees, toOctalFraction, sharedScaleFacts } = require('./lib/a8-angle');
const { ReplaySession } = require('./lib/a8-replay');

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 8000);
const PUBLIC = path.join(__dirname, 'public');
const A8_DATA_ROOT = resolveDataRoot(__dirname);

const core = new A8Core();
const sseClients = new Set();
let sseClientSeq = 0;
const replay = new ReplaySession(core, A8_DATA_ROOT);

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj, null, 2);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function observerSnapshot() {
  return core.snapshot();
}

function dropSseClient(res, reason = 'UNKNOWN') {
  const existed = sseClients.delete(res);

  if (existed) {
    console.warn(
      `A8 SSE DROP · id=${res._a8SseId || '?'} · reason=${reason}` +
      ` · writableLength=${res.writableLength || 0}` +
      ` · clients=${sseClients.size}`
    );
  }

  try { res.destroy(); } catch {}
}

function broadcast() {
  if (!sseClients.size) return;

  const payload = `data: ${JSON.stringify(observerSnapshot())}\n\n`;

  for (const res of [...sseClients]) {
    if (res.destroyed || res.writableEnded) {
      dropSseClient(res, res.destroyed ? 'DESTROYED' : 'WRITABLE_ENDED');
      continue;
    }

    // Observer safety boundary:
    // never allow a slow SSE client to accumulate stale A8 snapshots.
    if (res.writableNeedDrain) {
      dropSseClient(res, 'NEED_DRAIN');
      continue;
    }

    try {
      const accepted = res.write(payload);

      // A false return means Node has begun buffering for this client.
      // Drop the disposable observer connection instead of risking core memory.
      if (!accepted) dropSseClient(res, 'WRITE_BACKPRESSURE');
    } catch (err) {
      dropSseClient(res, `WRITE_ERROR:${err.code || err.message || 'UNKNOWN'}`);
    }
  }
}

function mime(file) {
  if (file.endsWith('.html')) return 'text/html; charset=utf-8';
  if (file.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (file.endsWith('.css')) return 'text/css; charset=utf-8';
  if (file.endsWith('.json')) return 'application/json; charset=utf-8';
  if (file.endsWith('.txt')) return 'text/plain; charset=utf-8';
  return 'application/octet-stream';
}

function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(err.code === 'ENOENT' ? 404 : 500);
      res.end(err.code === 'ENOENT' ? 'Not found' : 'Server error');
      return;
    }
    res.writeHead(200, {
      'Content-Type': mime(file),
      'Cache-Control': 'no-store',
    });
    res.end(data);
  });
}

async function readBody(req) {
  return await new Promise((resolve, reject) => {
    let body = '';
    req.on('data', c => {
      body += c;
      if (body.length > 1024 * 1024) reject(new Error('body too large'));
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

async function control(req, res) {
  let data;
  try {
    data = JSON.parse(await readBody(req) || '{}');
    const action = data.action;

    switch (action) {
      case 'run': if(core.sourceMode!=='SIMULATED_PLANT') throw new Error('plant RUN disabled during real-observation replay'); core.running = true; break;
      case 'pause': core.running = false; break;
      case 'step': core.advance(Number(data.steps || core.benchSteps)); break;
      case 'reset': core.reset(); break;
      case 'forget': core.forgetRecovery(); break;
      case 'oscillator': core.setOscillator(data.value); break;
      case 'drift': core.setDrift(data.value); break;
      case 'benchSteps': {
        const requested = Math.floor(Number(data.value));
        const allowed = [1, 2, 4, 8];
        core.benchSteps = allowed.includes(requested) ? requested : 8;
        break;
      }
      case 'observation': core.setObservationBlocked(!!data.blocked); break;
      case 'authority': core.setAuthority(data.source); break;
      case 'earthSpan': core.setEarthDayRawSpan(data.value); break;
      case 'fault': core.setMoonFault(data.source, data.percent); break;
      case 'clearFaults': core.clearMoonFaults(); break;
      case 'recalibrationMode': core.setRecalibrationMode(data.mode); break;
      case 'armManualCalibration': core.armManualCalibration(); break;
      case 'callistoDetune': core.setCallistoDetune(data.percent); break;
      case 'alignServerUtc': {
        const now = new Date();
        const utcMillisecondsSinceMidnight =
          now.getUTCHours() * 3600000 +
          now.getUTCMinutes() * 60000 +
          now.getUTCSeconds() * 1000 +
          now.getUTCMilliseconds();

        core.alignClockToUtcMilliseconds(
          utcMillisecondsSinceMidnight,
          'SERVER UTC BRIDGE · EXTERNAL CONVENTIONAL REFERENCE · NON-DEFINING'
        );
        break;
      }
      case 'clockPhase': core.setClockPhase(data.phase, data.source || 'CLOCK CONSOLE'); break;
      case 'clockAdjust': core.adjustClockTicks(data.delta); break;
      case 'clockResetTime': core.resetClockTime(); break;
      case 'clockResetDay': core.resetClockDayCount(); break;
      case 'clockResetAll': core.resetClockTime(); core.resetClockDayCount(); break;
      case 'clearEvents': core.clearEventLog(); break;
      default: throw new Error('unknown action');
    }

    broadcast();
    sendJson(res, 200, { ok: true, state: core.snapshot() });
  } catch (err) {
    sendJson(res, 400, { ok: false, error: err.message });
  }
}

const mintakaObserver = new MintakaRotationObserver();

function readMintakaObservationBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    let settled = false;

    const fail = (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    };

    req.on('data', chunk => {
      if (settled) return;
      raw += chunk;
      if (raw.length > 8192) {
        fail(new Error('Mintaka observation body too large'));
      }
    });

    req.on('end', () => {
      if (settled) return;
      settled = true;
      try {
        if (!raw.trim()) throw new Error('Mintaka observation body required');
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err instanceof Error ? err : new Error('Invalid Mintaka observation JSON'));
      }
    });

    req.on('error', fail);
  });
}

const solObserver = new SolCelestialObserver();

function readSolObservationBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    let settled = false;

    const fail = (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    };

    req.on('data', chunk => {
      if (settled) return;
      raw += chunk;
      if (raw.length > 8192) {
        fail(new Error('Sol observation body too large'));
      }
    });

    req.on('end', () => {
      if (settled) return;
      settled = true;
      try {
        if (!raw.trim()) throw new Error('Sol observation body required');
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err instanceof Error ? err : new Error('Invalid Sol observation JSON'));
      }
    });

    req.on('error', fail);
  });
}

const terraShipSlipAccumulator = new TerraShipSlipAccumulator();

function updateTerraShipSlipAccumulator(trigger) {
  const mintaka = mintakaObserver.snapshot();
  const sol = solObserver.snapshot();

  try {
    const relationship = deriveMintakaSolRelationship(mintaka, sol);
    const accumulator = terraShipSlipAccumulator.ingest(relationship);

    return {
      ready: true,
      trigger,
      relationship,
      accumulator,
    };
  } catch (err) {
    return {
      ready: false,
      trigger,
      relationship: null,
      accumulator: terraShipSlipAccumulator.snapshot(),
      source: {
        mintakaStatus: mintaka.status,
        solStatus: sol.status,
      },
      reason: err && err.message ? err.message : String(err),
    };
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || HOST}`);

  if (req.method === 'GET' && url.pathname === '/api/state') {
    return sendJson(res, 200, core.snapshot());
  }

  if (req.method === 'GET' && url.pathname === '/api/mintaka') {
    return sendJson(res, 200, {
      ok: true,
      observer: mintakaObserver.snapshot(),
    });
  }

  if (req.method === 'POST' && url.pathname === '/api/mintaka/observe') {
    try {
      const event = await readMintakaObservationBody(req);
      const observer = mintakaObserver.observe(event);
      const terraShipSlip = updateTerraShipSlipAccumulator('MINTAKA_OBSERVATION');
      return sendJson(res, 200, { ok: true, observer, terraShipSlip });
    } catch (err) {
      return sendJson(res, 400, {
        ok: false,
        error: err && err.message ? err.message : String(err),
      });
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/sol') {
    return sendJson(res, 200, {
      ok: true,
      observer: solObserver.snapshot(),
    });
  }

  if (req.method === 'POST' && url.pathname === '/api/sol/observe') {
    try {
      const event = await readSolObservationBody(req);
      const observer = solObserver.observe(event);
      const terraShipSlip = updateTerraShipSlipAccumulator('SOL_OBSERVATION');
      return sendJson(res, 200, { ok: true, observer, terraShipSlip });
    } catch (err) {
      return sendJson(res, 400, {
        ok: false,
        error: err && err.message ? err.message : String(err),
      });
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/terra-ship-slip') {
    const mintaka = mintakaObserver.snapshot();
    const sol = solObserver.snapshot();

    try {
      const terraShipSlip = deriveMintakaSolRelationship(mintaka, sol);
      return sendJson(res, 200, {
        ok: true,
        ready: true,
        terraShipSlip,
      });
    } catch (err) {
      return sendJson(res, 200, {
        ok: true,
        ready: false,
        terraShipSlip: null,
        source: {
          mintakaStatus: mintaka.status,
          solStatus: sol.status,
        },
        reason: err && err.message ? err.message : String(err),
      });
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/terra-ship-slip/accumulator') {
    return sendJson(res, 200, {
      ok: true,
      accumulator: terraShipSlipAccumulator.snapshot(),
    });
  }

  if (req.method === 'GET' && url.pathname === '/api/data/inventory') {
    try {
      const inv = await dataInventory(A8_DATA_ROOT, {
        withHashes: url.searchParams.get('hashes') !== '0',
        maxFiles: 5000,
      });
      return sendJson(res, 200, inv);
    } catch (err) {
      return sendJson(res, 500, { ok:false, error:err.message });
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/data/inspect') {
    try {
      return sendJson(res, 200, inspectDataFile(A8_DATA_ROOT, url.searchParams.get('path') || ''));
    } catch (err) {
      return sendJson(res, 400, { ok:false, error:err.message });
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/data/replay-schema') {
    return sendJson(res, 200, REPLAY_SCHEMA);
  }

  if (req.method === 'GET' && url.pathname === '/api/angle/from-legacy-degrees') {
    const degrees = Number(url.searchParams.get('degrees'));
    const digitsRaw = Number(url.searchParams.get('octalDigits') || 9);
    const octalDigits = Number.isFinite(digitsRaw) ? Math.max(0, Math.min(18, Math.trunc(digitsRaw))) : 9;
    const result = formatA8AngleFromLegacy(degrees, octalDigits);
    if (!result) return sendJson(res, 400, { ok:false, error:'degrees must be finite' });
    return sendJson(res, 200, {
      schema:'a8-angle-translation-v1',
      direction:'LEGACY_DEGREES_TO_A8_ANGLE',
      ...result,
      note:'Translation layer only. Source degrees do not define the native A8 angular ruler.'
    });
  }

  if (req.method === 'GET' && url.pathname === '/api/angle/to-legacy-degrees') {
    const a8 = Number(url.searchParams.get('a8'));
    if (!Number.isFinite(a8)) return sendJson(res, 400, { ok:false, error:'a8 must be finite' });
    const degrees = a8UnitsToLegacyDegrees(a8);
    return sendJson(res, 200, {
      schema:'a8-angle-translation-v1',
      direction:'A8_ANGLE_TO_LEGACY_DEGREES',
      a8Units:a8,
      a8Octal:toOctalFraction(a8, 9),
      legacyDegrees:degrees,
      scaleExact:'45/64',
      note:'Legacy degrees are reference output only.'
    });
  }

  if (req.method === 'GET' && url.pathname === '/api/angle/shared-scale-facts') {
    return sendJson(res, 200, {
      schema:'a8-shared-scale-v1',
      ...sharedScaleFacts(),
    });
  }

  if (req.method === 'GET' && url.pathname === '/api/replay/status') {
    return sendJson(res,200,{replay:replay.status(),state:core.snapshot()});
  }

  if (req.method === 'POST' && url.pathname === '/api/replay/load') {
    try{
      const body=JSON.parse(await readBody(req)||'{}');
      return sendJson(res,200,{ok:true,replay:replay.load(body.path||'')});
    }catch(err){return sendJson(res,400,{ok:false,error:err.message})}
  }

  if (req.method === 'POST' && url.pathname === '/api/replay/start') {
    try{
      const rp=replay.start();broadcast();
      return sendJson(res,200,{ok:true,replay:rp,state:core.snapshot()});
    }catch(err){return sendJson(res,400,{ok:false,error:err.message})}
  }

  if (req.method === 'POST' && url.pathname === '/api/replay/step') {
    try{
      const body=JSON.parse(await readBody(req)||'{}');
      const out=replay.step(body.count||1);broadcast();
      return sendJson(res,200,{ok:true,...out,state:core.snapshot()});
    }catch(err){return sendJson(res,400,{ok:false,error:err.message})}
  }

  if (req.method === 'POST' && url.pathname === '/api/replay/run') {
    try{
      const out=replay.runAll();broadcast();
      return sendJson(res,200,{ok:true,...out,state:core.snapshot()});
    }catch(err){return sendJson(res,400,{ok:false,error:err.message})}
  }

  if (req.method === 'POST' && url.pathname === '/api/replay/restart') {
    try{
      const rp=replay.restart();broadcast();
      return sendJson(res,200,{ok:true,replay:rp,state:core.snapshot()});
    }catch(err){return sendJson(res,400,{ok:false,error:err.message})}
  }

  if (req.method === 'POST' && url.pathname === '/api/replay/exit') {
    try{
      core.endObservationReplay();
      replay.started=false;
      broadcast();
      return sendJson(res,200,{ok:true,replay:replay.status(),state:core.snapshot()});
    }catch(err){return sendJson(res,400,{ok:false,error:err.message})}
  }

  if (req.method === 'GET' && url.pathname === '/api/recorder') {
    return sendJson(res, 200, core.recorderSnapshot());
  }

  if (req.method === 'GET' && url.pathname === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    const initialAccepted =
      res.write(`data: ${JSON.stringify(observerSnapshot())}\n\n`);

    res._a8SseId = ++sseClientSeq;
    sseClients.add(res);

    console.log(
      `A8 SSE CONNECT · id=${res._a8SseId}` +
      ` · initialAccepted=${initialAccepted}` +
      ` · clients=${sseClients.size}`
    );

    req.on('close', () => {
      const existed = sseClients.delete(res);
      console.log(
        `A8 SSE CLOSE · id=${res._a8SseId}` +
        ` · wasActive=${existed}` +
        ` · clients=${sseClients.size}`
      );
    });

    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/control') {
    return control(req, res);
  }

  if (req.method === 'GET') return serveStatic(req, res, url.pathname);

  res.writeHead(405); res.end('Method not allowed');
});

// Execution pace only. No wall-clock *value* enters recovery mathematics.
// process.hrtime.bigint() supplies monotonic elapsed duration for the visible
// NORMAL DEMO PACE clock only; it is explicitly outside the defining path.
const intervalMs = 20;
// Observer publication is downstream of the A8 core.
// The A8 SECOND itself is unchanged. Display resolution subdivides
// that native interval recursively by powers of two.
const observerSubdivisionsPerA8Second = 8n;
let lastObserverPhase =
  core.observerPhaseIndex(observerSubdivisionsPerA8Second);

let lastPaceNs = process.hrtime.bigint();
setInterval(() => {
  const nowNs = process.hrtime.bigint();
  const elapsedNs = nowNs - lastPaceNs;
  lastPaceNs = nowNs;

  if (core.running) {
    core.advance(core.benchSteps);
    core.advanceRealtimeClock(elapsedNs);

    const observerPhase =
      core.observerPhaseIndex(observerSubdivisionsPerA8Second);

    if (observerPhase !== lastObserverPhase) {
      lastObserverPhase = observerPhase;
      broadcast();
    }
  }
}, intervalMs);



server.listen(PORT, HOST, () => {
  console.log(`A8 Time Lab v5.4.20 running at http://${HOST}:${PORT}/`);
  console.log(`Node core owns state. Browser is observer/control only.`);
  console.log(`A8 data bridge: ${A8_DATA_ROOT}`);
  console.log(`A8 replay ingress: verified .a8obs streams drive RecoveryChannel.detect().`);
});
