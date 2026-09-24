'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const HOST = '127.0.0.1';
const PORT = 18027;

const STATE_DIR = '/var/lib/a8-shadow-ghost';
const STATE_FILE = path.join(STATE_DIR, 'latest.json');

const TOKEN = process.env.A8_GHOST_TOKEN;

const QUALIFIED_GHOST_RUNS = new Set([
  'bc562a83-8293-4e0c-b6bf-79e9687b7aea',
]);

function effectivePowerQualification(record) {
  if (
    record &&
    QUALIFIED_GHOST_RUNS.has(record.runId)
  ) {
    return 'QUALIFIED_STANDBY';
  }

  return (
    record &&
    record.powerQualification
      ? record.powerQualification
      : 'COMMISSIONING'
  );
}

if (!TOKEN) {
  throw new Error('A8_GHOST_TOKEN missing');
}

let latest = null;

try {
  latest = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
} catch (_) {}

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj, null, 2) + '\n';

  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body)
  });

  res.end(body);
}

function authorized(req) {
  const got = Buffer.from(String(req.headers.authorization || ''));
  const expected = Buffer.from('Bearer ' + TOKEN);

  return (
    got.length === expected.length &&
    crypto.timingSafeEqual(got, expected)
  );
}

function save(obj) {
  const tmp = STATE_FILE + '.tmp';

  fs.writeFileSync(
    tmp,
    JSON.stringify(obj, null, 2) + '\n',
    { mode: 0o640 }
  );

  fs.renameSync(tmp, STATE_FILE);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);

  if (url.pathname === '/api/shadow/ghost') {
    if (req.method !== 'GET') {
      return sendJson(res, 405, {
        ok: false,
        error: 'METHOD_NOT_ALLOWED'
      });
    }

    if (!latest) {
      return sendJson(res, 503, {
        ok: false,
        status: 'WAITING_FOR_GHOST'
      });
    }

    const age =
      Math.max(
        0,
        (Date.now() - latest.shadowReceiptUnixMsEvidenceOnly) / 1000
      );

    return sendJson(res, 200, {
      ok: true,
      ghost: {
        ...latest,
        reportedPowerQualification:
          latest.powerQualification ?? null,
        powerQualification:
          effectivePowerQualification(latest),
        linkStatus: age <= 8 ? 'RECEIVING' : 'STALE',
        receiptAgeSeconds: Number(age.toFixed(3))
      }
    });
  }

  if (url.pathname === '/api/shadow/ghost/ingest') {
    if (req.method !== 'POST') {
      return sendJson(res, 405, {
        ok: false,
        error: 'METHOD_NOT_ALLOWED'
      });
    }

    if (!authorized(req)) {
      return sendJson(res, 401, {
        ok: false,
        error: 'UNAUTHORIZED'
      });
    }

    let body = '';

    req.setEncoding('utf8');

    req.on('data', chunk => {
      body += chunk;
      if (body.length > 8192) req.destroy();
    });

    req.on('end', () => {
      let d;

      try {
        d = JSON.parse(body);
      } catch (_) {
        return sendJson(res, 400, {
          ok: false,
          error: 'INVALID_JSON'
        });
      }

      if (
        d.source !== 'A8_GHOST' ||
        typeof d.run_id !== 'string' ||
        !Number.isSafeInteger(d.sequence) ||
        !Number.isSafeInteger(d.raw_count)
      ) {
        return sendJson(res, 400, {
          ok: false,
          error: 'INVALID_GHOST_PAYLOAD'
        });
      }

      if (
        latest &&
        latest.runId === d.run_id &&
        d.sequence <= latest.sequence
      ) {
        return sendJson(res, 200, {
          ok: true,
          accepted: false,
          reason: 'DUPLICATE_OR_OLD'
        });
      }

      latest = {
        schema: 'A8-GHOST-SHADOW-V1',
        role: 'REMOTE_PHYSICAL_WITNESS',
        authority: 'NONE',

        runId: d.run_id,
        sequence: d.sequence,
        rawCount: d.raw_count,

        powerQualification:
          d.power_qualification || 'COMMISSIONING',

        throttledEvidence:
          d.throttled_evidence || null,

        ghostMonotonicNsEvidenceOnly:
          d.receive_monotonic_ns_evidence_only || null,

        shadowReceiptUtcEvidenceOnly:
          new Date().toISOString(),

        shadowReceiptUnixMsEvidenceOnly:
          Date.now()
      };

      save(latest);

      return sendJson(res, 200, {
        ok: true,
        accepted: true,
        sequence: latest.sequence,
        rawCount: latest.rawCount
      });
    });

    return;
  }

  sendJson(res, 404, {
    ok: false,
    error: 'NOT_FOUND'
  });
});

server.listen(PORT, HOST, () => {
  console.log(`A8 SHADOW GHOST · ${HOST}:${PORT}`);
});
