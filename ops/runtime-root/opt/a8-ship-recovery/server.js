'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || '18022');

const TARGET_FILE = process.env.TARGET_FILE;
const RECOVERY_FILE = process.env.RECOVERY_FILE;
const DATA_DIR = process.env.DATA_DIR;

const EXPECTED_SHA = process.env.EXPECTED_SHA;
const PINNED_TAG = process.env.PINNED_TAG;
const PINNED_COMMIT = process.env.PINNED_COMMIT;

const PERMIT_FILE =
  path.join(DATA_DIR, 'permit.json');

const HISTORY_FILE =
  path.join(DATA_DIR, 'history.ndjson');

const BACKUP_DIR =
  path.join(DATA_DIR, 'backups');

function sha256Buffer(buffer) {
  return crypto
    .createHash('sha256')
    .update(buffer)
    .digest('hex');
}

function sha256File(file) {
  return sha256Buffer(
    fs.readFileSync(file)
  );
}

function json(res, code, body) {
  const data =
    Buffer.from(
      JSON.stringify(body, null, 2) + '\n'
    );

  res.writeHead(code, {
    'content-type':
      'application/json; charset=utf-8',

    'content-length':
      data.length,

    'cache-control':
      'no-store'
  });

  res.end(data);
}

function appendHistory(record) {
  fs.appendFileSync(
    HISTORY_FILE,
    JSON.stringify(record) + '\n',
    {mode: 0o600}
  );
}

function readPermit() {
  try {
    return JSON.parse(
      fs.readFileSync(
        PERMIT_FILE,
        'utf8'
      )
    );
  } catch (_) {
    return null;
  }
}

function removePermit() {
  try {
    fs.unlinkSync(PERMIT_FILE);
  } catch (_) {}
}

function recoveryIdentity() {
  const actual =
    sha256File(RECOVERY_FILE);

  return {
    tag: PINNED_TAG,
    commit: PINNED_COMMIT,
    expectedSha256: EXPECTED_SHA,
    actualSha256: actual,
    valid: actual === EXPECTED_SHA
  };
}

function statusPayload() {
  const liveHash =
    sha256File(TARGET_FILE);

  const recovery =
    recoveryIdentity();

  const permit =
    readPermit();

  return {
    ok: true,

    schema:
      'A8-SHIP-RECOVERY-STATUS-V1',

    target:
      TARGET_FILE,

    live: {
      sha256: liveHash,

      matchesPinnedRecovery:
        recovery.valid &&
        liveHash === EXPECTED_SHA
    },

    recovery,

    recoveryNeeded:
      recovery.valid &&
      liveHash !== EXPECTED_SHA,

    armAllowed:
      recovery.valid &&
      liveHash !== EXPECTED_SHA,

    permit: permit
      ? {
          id:
            permit.id,

          armedLiveSha256:
            permit.armedLiveSha256,

          expiresAt:
            permit.expiresAt
        }
      : null,

    boundaries: {
      touchesCore20: false,
      touchesSrvApps: false,
      touchesCaddy: false,
      touchesLifetimeState: false,
      touchesGitHistory: false
    }
  };
}

function readJsonBody(req) {
  return new Promise(
    (resolve, reject) => {

      let raw = '';

      req.setEncoding('utf8');

      req.on(
        'data',
        chunk => {
          raw += chunk;

          if (raw.length > 8192) {
            reject(
              new Error(
                'body too large'
              )
            );

            req.destroy();
          }
        }
      );

      req.on(
        'end',
        () => {
          if (!raw) {
            resolve({});
            return;
          }

          try {
            resolve(
              JSON.parse(raw)
            );
          } catch (_) {
            reject(
              new Error(
                'invalid json'
              )
            );
          }
        }
      );

      req.on(
        'error',
        reject
      );
    }
  );
}

function safeStamp() {
  return new Date()
    .toISOString()
    .replace(
      /[:.]/g,
      '-'
    );
}

const server =
  http.createServer(
    async (req, res) => {

      try {

        if (
          req.method === 'GET' &&
          req.url === '/status'
        ) {
          json(
            res,
            200,
            statusPayload()
          );

          return;
        }

        if (
          req.method === 'GET' &&
          req.url === '/history'
        ) {
          let records = [];

          try {
            records =
              fs.readFileSync(
                HISTORY_FILE,
                'utf8'
              )
              .split('\n')
              .filter(Boolean)
              .slice(-50)
              .map(
                line =>
                  JSON.parse(line)
              );

          } catch (_) {
            records = [];
          }

          json(
            res,
            200,
            {
              ok: true,

              schema:
                'A8-SHIP-RECOVERY-HISTORY-V1',

              records
            }
          );

          return;
        }

        if (
          req.method === 'POST' &&
          req.url === '/arm'
        ) {
          const body =
            await readJsonBody(req);

          const status =
            statusPayload();

          if (
            body.confirm !==
            'ARM ONE-SHOT SHIP RESTORE'
          ) {
            json(
              res,
              400,
              {
                ok: false,
                error:
                  'CONFIRMATION_REQUIRED'
              }
            );

            return;
          }

          if (
            !status.recovery.valid
          ) {
            json(
              res,
              409,
              {
                ok: false,
                error:
                  'PINNED_RECOVERY_INVALID'
              }
            );

            return;
          }

          if (
            !status.recoveryNeeded
          ) {
            json(
              res,
              409,
              {
                ok: false,

                error:
                  'LIVE_ALREADY_MATCHES_PINNED_RECOVERY',

                liveSha256:
                  status.live.sha256
              }
            );

            return;
          }

          const token =
            crypto
              .randomBytes(32)
              .toString('hex');

          const permit = {
            schema:
              'A8-SHIP-RECOVERY-PERMIT-V1',

            id:
              crypto.randomUUID(),

            tokenSha256:
              sha256Buffer(
                Buffer.from(token)
              ),

            armedLiveSha256:
              status.live.sha256,

            createdAt:
              new Date()
                .toISOString(),

            expiresAt:
              new Date(
                Date.now() +
                5 * 60 * 1000
              )
              .toISOString()
          };

          fs.writeFileSync(
            PERMIT_FILE,

            JSON.stringify(
              permit,
              null,
              2
            ) + '\n',

            {mode: 0o600}
          );

          json(
            res,
            200,
            {
              ok: true,

              permit: {
                id:
                  permit.id,

                token,

                armedLiveSha256:
                  permit.armedLiveSha256,

                expiresAt:
                  permit.expiresAt
              }
            }
          );

          return;
        }

        if (
          req.method === 'POST' &&
          req.url === '/apply'
        ) {
          const body =
            await readJsonBody(req);

          const permit =
            readPermit();

          if (!permit) {
            json(
              res,
              409,
              {
                ok: false,
                error:
                  'NO_ACTIVE_PERMIT'
              }
            );

            return;
          }

          /*
           * One shot means one shot.
           * Any APPLY attempt consumes it.
           */
          removePermit();

          const record = {
            schema:
              'A8-SHIP-RECOVERY-HISTORY-RECORD-V1',

            timestamp:
              new Date()
                .toISOString(),

            permitId:
              permit.id,

            pinnedTag:
              PINNED_TAG,

            pinnedCommit:
              PINNED_COMMIT,

            pinnedSha256:
              EXPECTED_SHA,

            result:
              'FAILED'
          };

          const fail =
            (
              code,
              error,
              extra = {}
            ) => {

              Object.assign(
                record,
                {
                  result: 'FAILED',
                  error
                },
                extra
              );

              appendHistory(
                record
              );

              json(
                res,
                code,
                {
                  ok: false,
                  error,
                  permitConsumed: true,
                  ...extra
                }
              );
            };

          if (
            body.confirm !==
            'APPLY ONE-SHOT SHIP RESTORE'
          ) {
            fail(
              400,
              'CONFIRMATION_REQUIRED'
            );

            return;
          }

          const suppliedTokenHash =
            sha256Buffer(
              Buffer.from(
                String(
                  body.token || ''
                )
              )
            );

          if (
            suppliedTokenHash !==
            permit.tokenSha256
          ) {
            fail(
              403,
              'INVALID_PERMIT_TOKEN'
            );

            return;
          }

          if (
            Date.now() >
            Date.parse(
              permit.expiresAt
            )
          ) {
            fail(
              409,
              'PERMIT_EXPIRED'
            );

            return;
          }

          const recovery =
            recoveryIdentity();

          if (!recovery.valid) {
            fail(
              409,
              'PINNED_RECOVERY_INVALID'
            );

            return;
          }

          const liveBefore =
            sha256File(
              TARGET_FILE
            );

          record.oldLiveSha256 =
            liveBefore;

          if (
            liveBefore !==
            permit.armedLiveSha256
          ) {
            fail(
              409,
              'LIVE_CHANGED_AFTER_ARM',
              {
                armedLiveSha256:
                  permit.armedLiveSha256,

                currentLiveSha256:
                  liveBefore
              }
            );

            return;
          }

          const stamp =
            safeStamp();

          const backupPath =
            path.join(
              BACKUP_DIR,

              `relationship-before-restore-${stamp}-${liveBefore.slice(0,12)}.html`
            );

          fs.copyFileSync(
            TARGET_FILE,
            backupPath
          );

          record.backupPath =
            backupPath;

          const targetDir =
            path.dirname(
              TARGET_FILE
            );

          const targetBase =
            path.basename(
              TARGET_FILE
            );

          const tempPath =
            path.join(
              targetDir,

              `.${targetBase}.a8-recovery-${process.pid}-${Date.now()}.tmp`
            );

          const targetStat =
            fs.statSync(
              TARGET_FILE
            );

          fs.copyFileSync(
            RECOVERY_FILE,
            tempPath
          );

          fs.chmodSync(
            tempPath,
            targetStat.mode & 0o777
          );

          const stagedHash =
            sha256File(
              tempPath
            );

          if (
            stagedHash !==
            EXPECTED_SHA
          ) {
            try {
              fs.unlinkSync(
                tempPath
              );
            } catch (_) {}

            fail(
              409,
              'STAGED_RECOVERY_HASH_MISMATCH',
              {
                stagedSha256:
                  stagedHash
              }
            );

            return;
          }

          fs.renameSync(
            tempPath,
            TARGET_FILE
          );

          const liveAfter =
            sha256File(
              TARGET_FILE
            );

          record.newLiveSha256 =
            liveAfter;

          if (
            liveAfter !==
            EXPECTED_SHA
          ) {
            fail(
              500,
              'POST_RESTORE_HASH_MISMATCH',
              {
                currentLiveSha256:
                  liveAfter
              }
            );

            return;
          }

          record.result =
            'RESTORED';

          appendHistory(
            record
          );

          json(
            res,
            200,
            {
              ok: true,

              status:
                'SHIP_PRESENTATION_RESTORED',

              permitConsumed:
                true,

              oldLiveSha256:
                liveBefore,

              newLiveSha256:
                liveAfter,

              backupPath,

              pinnedTag:
                PINNED_TAG,

              pinnedCommit:
                PINNED_COMMIT
            }
          );

          return;
        }

        json(
          res,
          404,
          {
            ok: false,
            error: 'NOT_FOUND'
          }
        );

      } catch (err) {

        json(
          res,
          500,
          {
            ok: false,
            error:
              err.message
          }
        );
      }
    }
  );

server.listen(
  PORT,
  '127.0.0.1',
  () => {
    console.log(
      `A8 Ship recovery qualification listening on 127.0.0.1:${PORT}`
    );
  }
);
