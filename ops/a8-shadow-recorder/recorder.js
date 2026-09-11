'use strict';

const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const path = require('path');

const SOURCE_URL =
  'http://127.0.0.1:28788/snapshot';

const SHADOW_SERVER =
  '/opt/a8-shadow-core/server.js';

const STATE_DIR =
  '/var/lib/a8-shadow-recorder';

const STATUS_FILE =
  path.join(STATE_DIR, 'status.json');

const POLL_MS = 5000;
const FSYNC_EVERY = 12;

const WITNESS_HOST =
  '127.0.0.1';

const WITNESS_PORT =
  18026;

const TAPE_SCHEMA =
  'A8-SHADOW-HEARTBEAT-TAPE-V1';

const RECEIPT_ROLE =
  'NON_DEFINING_RECORDKEEPING_ONLY';

const processStartMono = process.hrtime.bigint();

let fd = null;
let tapePath = null;
let tapeId = null;
let sourceEpoch = null;
let sequence = 0;
let previousRecordHash = null;
let writesSinceSync = 0;
let lastSnapshot = null;
let sourceWasDown = false;
let stopping = false;

function sha256Text(text) {
  return crypto
    .createHash('sha256')
    .update(text)
    .digest('hex');
}

function sha256File(file) {
  return crypto
    .createHash('sha256')
    .update(fs.readFileSync(file))
    .digest('hex');
}

function stableStringify(value) {
  if (
    value === null ||
    typeof value !== 'object'
  ) {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return '[' +
      value.map(stableStringify).join(',') +
      ']';
  }

  const keys = Object.keys(value).sort();

  return '{' +
    keys.map((key) =>
      JSON.stringify(key) + ':' +
      stableStringify(value[key])
    ).join(',') +
    '}';
}

function safeUtc() {
  return new Date().toISOString();
}

function compactUtc() {
  return safeUtc()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

function receiptMonoNs() {
  return (
    process.hrtime.bigint() -
    processStartMono
  ).toString();
}

function normalizeSnapshot(s) {
  return {
    sourceEpoch:
      String(s.SOURCE_EPOCH),
    rawCount:
      String(s.RAW_COUNT),
    reportSequence:
      String(s.REPORT_SEQUENCE),
    status:
      String(s.STATUS)
  };
}

function fetchSnapshot() {
  return new Promise((resolve, reject) => {
    const req = http.get(
      SOURCE_URL,
      (res) => {
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
                `HTTP_${res.statusCode}`
              )
            );
            return;
          }

          try {
            resolve(
              normalizeSnapshot(
                JSON.parse(body)
              )
            );
          } catch (err) {
            reject(
              new Error(
                `INVALID_SOURCE_JSON:${err.message}`
              )
            );
          }
        });
      }
    );

    req.setTimeout(2000, () => {
      req.destroy(
        new Error('SOURCE_TIMEOUT')
      );
    });

    req.on('error', reject);
  });
}

function updateStatus(extra = {}) {
  const tmp =
    STATUS_FILE + '.tmp';

  const status = {
    schema:
      'A8-SHADOW-RECORDER-STATUS-V1',
    status:
      fd === null
        ? 'WAITING_FOR_SOURCE'
        : 'RECORDING',
    tape:
      tapePath,
    tapeId,
    sourceEpoch,
    recordSequence:
      sequence,
    lastRecordHash:
      previousRecordHash,
    lastSnapshot,
    receiptTimeRole:
      RECEIPT_ROLE,
    ...extra
  };

  fs.writeFileSync(
    tmp,
    JSON.stringify(status, null, 2) +
      '\n'
  );

  fs.renameSync(
    tmp,
    STATUS_FILE
  );
}

function writeRecord(type, fields = {}) {
  if (fd === null) {
    return;
  }

  const base = {
    schema:
      TAPE_SCHEMA,
    tapeId,
    sequence,
    recordType:
      type,
    receiptUtc:
      safeUtc(),
    receiptTimeRole:
      RECEIPT_ROLE,
    receiptMonotonicNsSinceRecorderStart:
      receiptMonoNs(),
    previousRecordHash,
    ...fields
  };

  const recordHash =
    sha256Text(
      stableStringify(base)
    );

  const record = {
    ...base,
    recordHash
  };

  fs.appendFileSync(
    fd,
    JSON.stringify(record) + '\n'
  );

  previousRecordHash =
    recordHash;

  sequence += 1;
  writesSinceSync += 1;

  if (
    writesSinceSync >=
    FSYNC_EVERY
  ) {
    fs.fsyncSync(fd);
    writesSinceSync = 0;
  }

  updateStatus();
}

function openTape(snapshot) {
  sourceEpoch =
    snapshot.sourceEpoch;

  sequence = 0;
  previousRecordHash = null;
  writesSinceSync = 0;

  tapeId =
    `epoch-${sourceEpoch}-` +
    `${compactUtc()}-pid-${process.pid}`;

  tapePath =
    path.join(
      STATE_DIR,
      tapeId + '.open.ndjson'
    );

  fd = fs.openSync(
    tapePath,
    'ax',
    0o640
  );

  lastSnapshot = snapshot;

  writeRecord(
    'RUN_START',
    {
      sourceEndpoint:
        SOURCE_URL,
      physicalSource:
        '555_PULSE_BOX',
      sourceSnapshot:
        snapshot,
      recorderSha256:
        sha256File(__filename),
      shadowServerSha256:
        sha256File(SHADOW_SERVER),
      pollMilliseconds:
        String(POLL_MS),
      definingClockInput:
        false,
      core20Input:
        false
    }
  );

  console.log(
    `RECORDER START · ${tapePath}`
  );
}

function sealTape(reason) {
  if (fd === null) {
    return;
  }

  writeRecord(
    'RUN_STOP',
    {
      reason,
      sourceSnapshot:
        lastSnapshot
    }
  );

  fs.fsyncSync(fd);
  fs.closeSync(fd);

  const sealed =
    tapePath.replace(
      /\.open\.ndjson$/,
      '.sealed.ndjson'
    );

  fs.renameSync(
    tapePath,
    sealed
  );

  console.log(
    `RECORDER SEALED · ${sealed}`
  );

  fd = null;
  tapePath = sealed;

  updateStatus({
    status: 'SEALED'
  });
}

function anomaly(previous, current) {
  try {
    if (
      previous.sourceEpoch ===
        current.sourceEpoch &&
      (
        BigInt(current.rawCount) <
          BigInt(previous.rawCount) ||
        BigInt(current.reportSequence) <
          BigInt(previous.reportSequence)
      )
    ) {
      return true;
    }
  } catch (_) {
    return true;
  }

  return false;
}

function sendJson(
  res,
  statusCode,
  payload
) {
  const body =
    JSON.stringify(
      payload,
      null,
      2
    ) + '\n';

  res.writeHead(
    statusCode,
    {
      'Content-Type':
        'application/json',
      'Content-Length':
        Buffer.byteLength(body)
    }
  );

  res.end(body);
}

function readJsonBody(req) {
  return new Promise(
    (resolve, reject) => {
      let body = '';

      req.setEncoding('utf8');

      req.on('data', chunk => {
        body += chunk;

        if (body.length > 1024) {
          reject(
            new Error(
              'REQUEST_BODY_TOO_LARGE'
            )
          );
        }
      });

      req.on('end', () => {
        try {
          resolve(
            JSON.parse(body || '{}')
          );
        } catch (err) {
          reject(
            new Error(
              'INVALID_JSON'
            )
          );
        }
      });

      req.on('error', reject);
    }
  );
}

function normalizeJovianWitness(body) {
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body)
  ) {
    throw new Error(
      'WITNESS_MUST_BE_OBJECT'
    );
  }

  const allowed =
    new Set([
      'moon',
      'turn'
    ]);

  for (
    const key of
    Object.keys(body)
  ) {
    if (!allowed.has(key)) {
      throw new Error(
        `UNSUPPORTED_FIELD:${key}`
      );
    }
  }

  const moon =
    String(
      body.moon || ''
    ).toLowerCase();

  if (
    moon !== 'io' &&
    moon !== 'eu' &&
    moon !== 'ga'
  ) {
    throw new Error(
      'MOON_MUST_BE_io_eu_ga'
    );
  }

  const turn =
    String(
      body.turn || ''
    ).toUpperCase();

  if (
    turn !== 'WEST' &&
    turn !== 'EAST'
  ) {
    throw new Error(
      'TURN_MUST_BE_WEST_OR_EAST'
    );
  }

  return {
    moon,
    turn
  };
}

async function recordJovianWitness(
  body
) {
  const witness =
    normalizeJovianWitness(body);

  /*
   * Recorder captures physical state itself.
   * Caller cannot supply rawPulse, epoch,
   * phase, frequency or timestamp.
   */
  const snapshot =
    await fetchSnapshot();

  if (fd === null) {
    throw new Error(
      'RECORDER_WAITING_FOR_SOURCE'
    );
  }

  if (
    snapshot.sourceEpoch !==
    sourceEpoch
  ) {
    throw new Error(
      'SOURCE_EPOCH_CHANGED_BEFORE_WITNESS'
    );
  }

  if (
    lastSnapshot &&
    anomaly(
      lastSnapshot,
      snapshot
    )
  ) {
    throw new Error(
      'PHYSICAL_SOURCE_ANOMALY'
    );
  }

  writeRecord(
    'JOVIAN_TURN_WITNESS',
    {
      witness,
      sourceSnapshot:
        snapshot,

      recorderRole:
        RECEIPT_ROLE,

      receiptTimeDefinesClock:
        false,

      injectsShadow:
        false,

      injectsCore20:
        false
    }
  );

  return {
    witness,
    sourceSnapshot:
      snapshot,
    recordSequence:
      sequence - 1,
    recordHash:
      previousRecordHash
  };
}

const witnessServer =
  http.createServer(
    async (req, res) => {
      if (
        req.method === 'POST' &&
        req.url ===
          '/api/recorder/jovian-witness'
      ) {
        try {
          const body =
            await readJsonBody(req);

          const recorded =
            await recordJovianWitness(
              body
            );

          sendJson(
            res,
            200,
            {
              ok: true,
              recorded
            }
          );
        } catch (err) {
          sendJson(
            res,
            400,
            {
              ok: false,
              error:
                String(
                  err.message || err
                )
            }
          );
        }

        return;
      }

      sendJson(
        res,
        404,
        {
          ok: false,
          error:
            'NOT_FOUND'
        }
      );
    }
  );

witnessServer.listen(
  WITNESS_PORT,
  WITNESS_HOST,
  () => {
    console.log(
      'A8 SHADOW JOVIAN WITNESS CAMERA · ' +
      `${WITNESS_HOST}:${WITNESS_PORT}`
    );
  }
);

async function poll() {
  if (stopping) {
    return;
  }

  try {
    const snapshot =
      await fetchSnapshot();

    if (fd === null) {
      openTape(snapshot);
    }

    if (
      sourceEpoch !==
      snapshot.sourceEpoch
    ) {
      writeRecord(
        'SOURCE_EPOCH_END',
        {
          oldSourceEpoch:
            sourceEpoch,
          newSourceEpoch:
            snapshot.sourceEpoch,
          sourceSnapshot:
            lastSnapshot
        }
      );

      sealTape(
        'SOURCE_EPOCH_CHANGED'
      );

      openTape(snapshot);
    }

    if (
      sourceWasDown
    ) {
      writeRecord(
        'SOURCE_RECOVERED',
        {
          sourceSnapshot:
            snapshot
        }
      );

      sourceWasDown = false;
    }

    if (
      lastSnapshot &&
      anomaly(
        lastSnapshot,
        snapshot
      )
    ) {
      writeRecord(
        'SOURCE_ANOMALY',
        {
          previousSnapshot:
            lastSnapshot,
          sourceSnapshot:
            snapshot
        }
      );
    }

    lastSnapshot =
      snapshot;

    writeRecord(
      'HEARTBEAT',
      {
        sourceSnapshot:
          snapshot
      }
    );
  } catch (err) {
    if (
      fd !== null &&
      !sourceWasDown
    ) {
      writeRecord(
        'SOURCE_ERROR',
        {
          error:
            String(err.message || err)
        }
      );
    }

    sourceWasDown = true;

    updateStatus({
      status:
        'SOURCE_UNAVAILABLE',
      error:
        String(err.message || err)
    });
  }
}

async function shutdown(signal) {
  if (stopping) {
    return;
  }

  stopping = true;

  try {
    sealTape(signal);
  } catch (err) {
    console.error(
      'RECORDER SEAL ERROR',
      err
    );
  }

  process.exit(0);
}

process.on(
  'SIGTERM',
  () => shutdown('SIGTERM')
);

process.on(
  'SIGINT',
  () => shutdown('SIGINT')
);

console.log(
  'A8 SHADOW RECORDER · WAITING FOR PHYSICAL SOURCE'
);

poll();

setInterval(
  poll,
  POLL_MS
);
