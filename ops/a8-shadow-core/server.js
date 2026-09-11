'use strict';

const http = require('http');

const HOST = '127.0.0.1';
const PORT = 18024;

const PULSE_URL =
  'http://127.0.0.1:28788/snapshot';

const CORE20_URL =
  'http://127.0.0.1:18020/api/core20/clock';

function getJson(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let body = '';

      res.setEncoding('utf8');

      res.on('data', (chunk) => {
        body += chunk;
      });

      res.on('end', () => {
        if (
          res.statusCode < 200 ||
          res.statusCode >= 300
        ) {
          reject(
            new Error(
              `HTTP ${res.statusCode} · ${url}`
            )
          );
          return;
        }

        try {
          resolve(JSON.parse(body));
        } catch (err) {
          reject(
            new Error(
              `INVALID JSON · ${url} · ${err.message}`
            )
          );
        }
      });
    });

    req.setTimeout(2000, () => {
      req.destroy(
        new Error(`TIMEOUT · ${url}`)
      );
    });

    req.on('error', reject);
  });
}

function sendJson(res, statusCode, obj) {
  const body =
    JSON.stringify(obj, null, 2) + '\n';

  res.writeHead(statusCode, {
    'Content-Type':
      'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length':
      Buffer.byteLength(body)
  });

  res.end(body);
}

function methodGuard(req, res) {
  if (req.method === 'GET') {
    return false;
  }

  sendJson(res, 405, {
    ok: false,
    error: 'METHOD_NOT_ALLOWED'
  });

  return true;
}

const server = http.createServer(
  async (req, res) => {
    if (methodGuard(req, res)) {
      return;
    }

    const url =
      new URL(
        req.url,
        `http://${HOST}:${PORT}`
      );

    if (
      url.pathname ===
      '/api/shadow/status'
    ) {
      sendJson(res, 200, {
        ok: true,
        shadow: {
          schema:
            'A8-PHYSICAL-SHADOW-V0.1',
          status:
            'SHADOW_BABY_ALIVE',
          mode:
            'TEST_PHASE',
          physicalOscillator:
            true,
          currentAuthority:
            'CORE20',
          shadowAuthority:
            'NOT_YET',
          sourceSelected:
            false,
          drivesCore20:
            false,
          port: PORT
        }
      });
      return;
    }

    if (
      url.pathname ===
      '/api/shadow/comparison'
    ) {
      try {
        const [
          pulse,
          corePayload
        ] = await Promise.all([
          getJson(PULSE_URL),
          getJson(CORE20_URL)
        ]);

        const core =
          corePayload &&
          corePayload.clock
            ? corePayload.clock
            : {};

        sendJson(res, 200, {
          ok: true,

          shadow: {
            status:
              'OBSERVING_ONLY',
            authority:
              'NOT_YET',
            sourceSelected:
              false
          },

          physical555: {
            sourceEpoch:
              pulse.SOURCE_EPOCH,
            rawCount:
              pulse.RAW_COUNT,
            reportSequence:
              pulse.REPORT_SEQUENCE,
            status:
              pulse.STATUS
          },

          core20: {
            sourceEpoch:
              core.sourceEpoch,
            dayCount:
              core.dayCount,
            dayPhase17:
              core.dayPhase17,
            clockAuthority:
              core.clockAuthority
          },

          relationship:
            'PARALLEL_OBSERVATION_ONLY'
        });
      } catch (err) {
        sendJson(res, 503, {
          ok: false,
          error:
            'SHADOW_OBSERVATION_FAILED',
          detail:
            err.message
        });
      }

      return;
    }

    sendJson(res, 404, {
      ok: false,
      error: 'NOT_FOUND'
    });
  }
);

server.listen(
  PORT,
  HOST,
  () => {
    console.log(
      `A8 SHADOW BABY · ${HOST}:${PORT}`
    );
  }
);
