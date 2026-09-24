'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = 18021;
const DATA = '/var/lib/a8-music-review';

const DIR = {
  incoming: path.join(DATA, 'review', 'incoming'),
  approved: path.join(DATA, 'review', 'approved'),
  rejected: path.join(DATA, 'review', 'rejected'),
  published: path.join(DATA, 'published')
};

const CURRENT = path.join(DATA, 'current.a8m');
const CURRENT_META = path.join(DATA, 'current.meta.json');

const PROMOTION = Object.freeze({
  weekly: {
    score: path.join(DATA, 'weekly.a8m'),
    meta: path.join(DATA, 'weekly.meta.json')
  },

  monthly: {
    score: path.join(DATA, 'monthly.a8m'),
    meta: path.join(DATA, 'monthly.meta.json')
  },

  yearly: {
    score: path.join(DATA, 'yearly.a8m'),
    meta: path.join(DATA, 'yearly.meta.json')
  }
});

const BAR_COUNT = 8;
const BAR_SLOTS = 64;
const MAX_BODY = 512 * 1024;

const WAVES = new Set([
  'sine',
  'triangle',
  'square',
  'sawtooth'
]);

const MOTIONS = new Set([
  'steady',
  'rise',
  'fall',
  'whoosh'
]);

for (const dir of Object.values(DIR)) {
  fs.mkdirSync(dir, { recursive: true });
}


function response(res, status, body) {
  const text = JSON.stringify(body, null, 2) + '\n';

  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });

  res.end(text);
}


function fail(message, status = 422) {
  const error = new Error(message);
  error.status = status;
  throw error;
}


function gcd(a, b) {
  a = Math.abs(a);
  b = Math.abs(b);

  while (b) {
    [a, b] = [b, a % b];
  }

  return a || 1;
}


function fraction(value, label) {
  const text = String(value ?? '').trim();

  if (!text) {
    fail(label + ' REQUIRED');
  }

  let n;
  let d;

  if (text.includes('/')) {
    const parts = text.split('/');

    if (parts.length !== 2) {
      fail('INVALID ' + label);
    }

    n = Number(parts[0]);
    d = Number(parts[1]);
  } else {
    n = Number(text);
    d = 1;
  }

  if (
    !Number.isInteger(n) ||
    !Number.isInteger(d) ||
    d === 0
  ) {
    fail('INVALID ' + label);
  }

  if (d < 0) {
    n = -n;
    d = -d;
  }

  const g = gcd(n, d);

  return [
    n / g,
    d / g
  ];
}


function fractionText(value) {
  const x = Array.isArray(value)
    ? value
    : fraction(value, 'FRACTION');

  return x[1] === 1
    ? String(x[0])
    : x[0] + '/' + x[1];
}


function durationSlots(value) {
  const x = fraction(value, 'DURATION');

  if (x[0] <= 0) {
    fail('DURATION MUST BE POSITIVE');
  }

  const numerator = x[0] * 16;

  if (numerator % x[1] !== 0) {
    fail('DURATION MUST LAND ON 1/16 A8 SLOT GRID');
  }

  const slots = numerator / x[1];

  if (
    !Number.isInteger(slots) ||
    slots < 1 ||
    slots > BAR_SLOTS
  ) {
    fail('INVALID NATIVE DURATION');
  }

  return slots;
}


function slotA8(slot) {
  return fractionText([
    slot,
    16
  ]);
}


function cleanText(value, max) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}


function cleanId(value) {
  const id = String(value || '');

  if (!/^[A-Za-z0-9._-]+$/.test(id)) {
    fail('INVALID SUBMISSION ID', 400);
  }

  return id;
}


function validateScore(source) {
  if (
    !source ||
    source.format !== 'A8M-1' ||
    !Array.isArray(source.bars)
  ) {
    fail('A8M-1 BAR SCORE REQUIRED');
  }

  if (source.bars.length !== BAR_COUNT) {
    fail('DITTY SUBMISSION REQUIRES EXACTLY 8 BARS');
  }

  let eventCount = 0;
  let noteCount = 0;
  let restCount = 0;

  const bars = source.bars.map((sourceBar, barIndex) => {
    if (
      !sourceBar ||
      !Array.isArray(sourceBar.events)
    ) {
      fail(
        'BAR ' +
        (barIndex + 1) +
        ' EVENTS REQUIRED'
      );
    }

    let cursor = 0;

    const events = sourceBar.events.map(
      (item, eventIndex) => {
        eventCount++;

        if (eventCount > 1024) {
          fail('TOO MANY SCORE EVENTS');
        }

        const type = String(
          item.type || 'note'
        ).toLowerCase();

        if (
          type !== 'note' &&
          type !== 'rest'
        ) {
          fail('INVALID EVENT TYPE');
        }

        const width = durationSlots(
          item.durationA8
        );

        if (cursor + width > BAR_SLOTS) {
          fail(
            'BAR ' +
            (barIndex + 1) +
            ' EXCEEDS 64 NATIVE SLOTS'
          );
        }

        const clean = {
          type,
          label: cleanText(item.label, 100),
          startA8: slotA8(cursor),
          durationA8: fractionText(
            fraction(
              item.durationA8,
              'DURATION'
            )
          ),
          endA8: slotA8(cursor + width)
        };

        if (type === 'rest') {
          restCount++;
        } else {
          noteCount++;

          const pitch = fraction(
            item.cyclesPerA8Second,
            'PITCH'
          );

          if (pitch[0] <= 0) {
            fail('PITCH MUST BE POSITIVE');
          }

          const waveform = String(
            item.waveform || 'sine'
          ).toLowerCase();

          const motion = String(
            item.motion || 'steady'
          ).toLowerCase();

          const gain = Number(
            item.gain ?? 0.5
          );

          if (!WAVES.has(waveform)) {
            fail('INVALID WAVEFORM');
          }

          if (!MOTIONS.has(motion)) {
            fail('INVALID MOTION');
          }

          if (
            !Number.isFinite(gain) ||
            gain < 0 ||
            gain > 1
          ) {
            fail('GAIN MUST BE 0..1');
          }

          clean.noteName =
            cleanText(
              item.noteName,
              8
            ) || null;

          clean.octaveShift =
            Number.isInteger(
              item.octaveShift
            )
              ? item.octaveShift
              : null;

          clean.cyclesPerA8Second =
            fractionText(pitch);

          clean.waveform = waveform;
          clean.motion = motion;
          clean.gain = gain;
        }

        cursor += width;

        return clean;
      }
    );

    if (cursor !== BAR_SLOTS) {
      fail(
        'BAR ' +
        (barIndex + 1) +
        ' MUST EQUAL EXACTLY 64 NATIVE SLOTS'
      );
    }

    return {
      bar: barIndex + 1,
      complete: true,
      durationA8: '4',
      events
    };
  });

  return {
    score: {
      format: 'A8M-1',
      schema: 'A8-MUSIC-DRAG-BARS-V1',

      title:
        cleanText(
          source.title,
          100
        ) ||
        'Untitled A8 composition',

      barLengthA8: '4',
      nativeSubdivision: '1/16 A8 second',
      nativeSlotsPerBar: 64,
      pitchUnit: 'cycles / A8 second',

      timing: {
        restsExplicit: true,
        hiddenBrowserIntervals: false,
        browserDragDefinesTime: false,
        eventOrderDefinesPlacement: true
      },

      bars
    },

    summary: {
      bars: 8,
      slots: 512,
      events: eventCount,
      notes: noteCount,
      rests: restCount
    }
  };
}


function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];

    req.on('data', chunk => {
      size += chunk.length;

      if (size > MAX_BODY) {
        reject(
          Object.assign(
            new Error('REQUEST TOO LARGE'),
            { status: 413 }
          )
        );

        req.destroy();
        return;
      }

      chunks.push(chunk);
    });

    req.on('end', () => {
      try {
        resolve(
          JSON.parse(
            Buffer.concat(chunks)
              .toString('utf8')
          )
        );
      } catch (_) {
        reject(
          Object.assign(
            new Error('INVALID JSON'),
            { status: 400 }
          )
        );
      }
    });

    req.on('error', reject);
  });
}


function atomicWrite(filename, object) {
  const temp =
    filename +
    '.tmp-' +
    process.pid +
    '-' +
    crypto
      .randomBytes(4)
      .toString('hex');

  fs.writeFileSync(
    temp,
    JSON.stringify(
      object,
      null,
      2
    ) + '\n',
    {
      encoding: 'utf8',
      mode: 0o640
    }
  );

  fs.renameSync(
    temp,
    filename
  );
}


function itemFile(bucket, id) {
  return path.join(
    DIR[bucket],
    cleanId(id) + '.json'
  );
}


function readItem(bucket, id) {
  const filename = itemFile(
    bucket,
    id
  );

  if (!fs.existsSync(filename)) {
    fail(
      'SUBMISSION NOT FOUND',
      404
    );
  }

  return JSON.parse(
    fs.readFileSync(
      filename,
      'utf8'
    )
  );
}


function listBucket(bucket) {
  return fs
    .readdirSync(DIR[bucket])
    .filter(
      name =>
        name.endsWith('.json')
    )
    .map(
      name =>
        JSON.parse(
          fs.readFileSync(
            path.join(
              DIR[bucket],
              name
            ),
            'utf8'
          )
        )
    )
    .map(
      item => ({
        id: item.id,
        status: item.status,
        submittedAt: item.submittedAt,
        reviewedAt: item.reviewedAt || null,
        title: item.score.title,
        composer: item.metadata.composer,
        note: item.metadata.note,
        summary: item.summary
      })
    )
    .sort(
      (a, b) =>
        String(b.submittedAt)
          .localeCompare(
            String(a.submittedAt)
          )
    );
}


function moveItem(
  id,
  from,
  to,
  status
) {
  const item =
    readItem(from, id);

  item.status = status;

  /*
   * Review timestamp is ordinary
   * administrative metadata only.
   * It never enters musical authority.
   */
  item.reviewedAt =
    new Date().toISOString();

  atomicWrite(
    itemFile(to, id),
    item
  );

  fs.unlinkSync(
    itemFile(from, id)
  );

  return item;
}


const server = http.createServer(
  async (req, res) => {
    try {
      const url = new URL(
        req.url,
        'http://localhost'
      );


      if (
        req.method === 'GET' &&
        url.pathname === '/health'
      ) {
        return response(
          res,
          200,
          {
            ok: true,
            service: 'A8_MUSIC_REVIEW_V1',
            authority:
              'NON_MUSICAL_REVIEW_WORKFLOW'
          }
        );
      }


      if (
        req.method === 'POST' &&
        url.pathname ===
          '/api/music-review/submit'
      ) {
        const body =
          await readBody(req);

        const composer =
          cleanText(
            body.composer,
            60
          );

        if (!composer) {
          fail(
            'COMPOSER NAME OR HANDLE REQUIRED'
          );
        }

        const validated =
          validateScore(
            body.score
          );

        /*
         * Submission timestamp is
         * administrative metadata only.
         */
        const submittedAt =
          new Date().toISOString();

        const id =
          submittedAt
            .slice(0, 10)
            .replaceAll('-', '') +
          '-' +
          crypto
            .randomBytes(6)
            .toString('hex');

        const item = {
          id,
          status: 'incoming',
          submittedAt,

          metadata: {
            composer,

            note:
              cleanText(
                body.note,
                280
              )
          },

          summary:
            validated.summary,

          score:
            validated.score
        };

        atomicWrite(
          itemFile(
            'incoming',
            id
          ),
          item
        );

        return response(
          res,
          201,
          {
            ok: true,
            id,
            status: 'incoming',
            message:
              'SUBMITTED FOR CURATOR REVIEW',
            summary:
              validated.summary
          }
        );
      }


      if (
        req.method === 'GET' &&
        url.pathname ===
          '/api/music-review/admin/incoming'
      ) {
        return response(
          res,
          200,
          {
            ok: true,
            items:
              listBucket('incoming')
          }
        );
      }


      if (
        req.method === 'GET' &&
        url.pathname ===
          '/api/music-review/admin/approved'
      ) {
        return response(
          res,
          200,
          {
            ok: true,
            items:
              listBucket('approved')
          }
        );
      }


      if (
        req.method === 'GET' &&
        url.pathname ===
          '/api/music-review/admin/item'
      ) {
        const bucket =
          String(
            url.searchParams
              .get('bucket') ||
            ''
          );

        if (
          ![
            'incoming',
            'approved',
            'rejected'
          ].includes(bucket)
        ) {
          fail(
            'INVALID BUCKET',
            400
          );
        }

        return response(
          res,
          200,
          {
            ok: true,

            item:
              readItem(
                bucket,
                url.searchParams
                  .get('id')
              )
          }
        );
      }


      if (
        req.method === 'POST' &&
        url.pathname ===
          '/api/music-review/admin/approve'
      ) {
        const body =
          await readBody(req);

        const item =
          moveItem(
            body.id,
            'incoming',
            'approved',
            'approved'
          );

        return response(
          res,
          200,
          {
            ok: true,
            id: item.id,
            status: 'approved'
          }
        );
      }


      if (
        req.method === 'POST' &&
        url.pathname ===
          '/api/music-review/admin/reject'
      ) {
        const body =
          await readBody(req);

        const item =
          moveItem(
            body.id,
            'incoming',
            'rejected',
            'rejected'
          );

        return response(
          res,
          200,
          {
            ok: true,
            id: item.id,
            status: 'rejected'
          }
        );
      }


      /*
       * APPROVED LIBRARY REMOVAL
       *
       * Administrative operation only.
       *
       * A currently-selected ditty may NOT be removed.
       * A stale/missing current metadata condition also refuses
       * removal rather than guessing.
       */
      if (
        req.method === 'POST' &&
        url.pathname ===
          '/api/music-review/admin/remove-approved'
      ) {
        const body =
          await readBody(req);

        const id =
          cleanId(body.id);

        const item =
          readItem(
            'approved',
            id
          );

        let currentMeta =
          null;

        if (
          fs.existsSync(
            CURRENT_META
          )
        ) {
          try {
            currentMeta =
              JSON.parse(
                fs.readFileSync(
                  CURRENT_META,
                  'utf8'
                )
              );
          } catch (_) {
            fail(
              'CURRENT DITTY METADATA INVALID · REMOVAL REFUSED',
              409
            );
          }
        }

        if (
          fs.existsSync(CURRENT) &&
          !currentMeta
        ) {
          fail(
            'CURRENT DITTY METADATA MISSING · REMOVAL REFUSED',
            409
          );
        }

        if (
          currentMeta &&
          String(
            currentMeta.submissionId ||
            ''
          ) === id
        ) {
          fail(
            'CURRENT DITTY CANNOT BE REMOVED FROM APPROVED LIBRARY',
            409
          );
        }

        /*
         * Never remove an approved composition while a
         * public winner slot still points to it.
         */
        for (
          const [slot, target]
          of Object.entries(PROMOTION)
        ) {
          let meta = null;

          if (fs.existsSync(target.meta)) {
            try {
              meta =
                JSON.parse(
                  fs.readFileSync(
                    target.meta,
                    'utf8'
                  )
                );
            } catch (_) {
              fail(
                slot.toUpperCase() +
                ' WINNER METADATA INVALID · REMOVAL REFUSED',
                409
              );
            }
          }

          if (
            fs.existsSync(target.score) &&
            !meta
          ) {
            fail(
              slot.toUpperCase() +
              ' WINNER METADATA MISSING · REMOVAL REFUSED',
              409
            );
          }

          if (
            meta &&
            String(
              meta.submissionId ||
              ''
            ) === id
          ) {
            fail(
              slot.toUpperCase() +
              ' WINNER CANNOT BE REMOVED FROM APPROVED LIBRARY',
              409
            );
          }
        }

        fs.unlinkSync(
          itemFile(
            'approved',
            id
          )
        );

        const publishedFile =
          path.join(
            DIR.published,
            id + '.a8m'
          );

        let publishedCopyRemoved =
          false;

        if (
          fs.existsSync(
            publishedFile
          )
        ) {
          fs.unlinkSync(
            publishedFile
          );

          publishedCopyRemoved =
            true;
        }

        return response(
          res,
          200,
          {
            ok: true,
            id,
            status: 'removed',
            title:
              item.score.title,
            publishedCopyRemoved
          }
        );
      }


      /*
       * CURATOR WINNER PROMOTION
       *
       * weekly / monthly / yearly are independent pointers.
       *
       * Weekly additionally maintains CURRENT as the
       * compatibility pointer for existing consumers.
       */
      if (
        req.method === 'POST' &&
        url.pathname ===
          '/api/music-review/admin/promote'
      ) {
        const body =
          await readBody(req);

        const id =
          cleanId(body.id);

        const slot =
          String(
            body.slot ||
            ''
          )
            .trim()
            .toLowerCase();

        if (
          !Object.prototype.hasOwnProperty.call(
            PROMOTION,
            slot
          )
        ) {
          fail(
            'INVALID PROMOTION SLOT',
            400
          );
        }

        const item =
          readItem(
            'approved',
            id
          );

        const promotedAt =
          new Date().toISOString();

        const meta = {
          slot,
          submissionId: id,
          title:
            item.score.title,
          composer:
            item.metadata.composer,
          promotedAt,
          publishedAt:
            promotedAt,
          summary:
            item.summary
        };

        atomicWrite(
          path.join(
            DIR.published,
            id + '.a8m'
          ),
          item.score
        );

        atomicWrite(
          PROMOTION[slot].score,
          item.score
        );

        atomicWrite(
          PROMOTION[slot].meta,
          meta
        );

        if (
          slot ===
          'weekly'
        ) {
          atomicWrite(
            CURRENT,
            item.score
          );

          atomicWrite(
            CURRENT_META,
            {
              submissionId: id,
              title:
                item.score.title,
              composer:
                item.metadata.composer,
              publishedAt:
                promotedAt,
              summary:
                item.summary
            }
          );
        }

        return response(
          res,
          200,
          {
            ok: true,
            id,
            slot,
            status:
              'promoted',
            title:
              item.score.title,
            composer:
              item.metadata.composer,
            promotedAt
          }
        );
      }


      if (
        req.method === 'POST' &&
        url.pathname ===
          '/api/music-review/admin/publish'
      ) {
        const body =
          await readBody(req);

        const id =
          cleanId(body.id);

        const item =
          readItem(
            'approved',
            id
          );

        const publishedAt =
          new Date().toISOString();

        atomicWrite(
          path.join(
            DIR.published,
            id + '.a8m'
          ),
          item.score
        );

        atomicWrite(
          CURRENT,
          item.score
        );

        atomicWrite(
          CURRENT_META,
          {
            submissionId: id,
            title: item.score.title,
            composer:
              item.metadata.composer,
            publishedAt,
            summary:
              item.summary
          }
        );

        return response(
          res,
          200,
          {
            ok: true,
            id,
            status: 'current',
            title:
              item.score.title,
            composer:
              item.metadata.composer
          }
        );
      }


      /*
       * PUBLIC WINNER SLOTS
       */
      if (
        req.method === 'GET' &&
        (
          url.pathname ===
            '/api/music-review/weekly' ||
          url.pathname ===
            '/api/music-review/monthly' ||
          url.pathname ===
            '/api/music-review/yearly'
        )
      ) {
        const slot =
          url.pathname
            .split('/')
            .pop();

        const target =
          PROMOTION[slot];

        if (
          !fs.existsSync(
            target.score
          )
        ) {
          return response(
            res,
            404,
            {
              ok: false,
              slot,
              message:
                'NO ' +
                slot.toUpperCase() +
                ' CURATED WINNER'
            }
          );
        }

        return response(
          res,
          200,
          {
            ok: true,
            slot,

            meta:
              fs.existsSync(
                target.meta
              )
                ? JSON.parse(
                    fs.readFileSync(
                      target.meta,
                      'utf8'
                    )
                  )
                : null,

            score:
              JSON.parse(
                fs.readFileSync(
                  target.score,
                  'utf8'
                )
              )
          }
        );
      }


      if (
        req.method === 'GET' &&
        url.pathname ===
          '/api/music-review/current'
      ) {
        if (
          !fs.existsSync(CURRENT)
        ) {
          return response(
            res,
            404,
            {
              ok: false,
              message:
                'NO CURATED CURRENT DITTY'
            }
          );
        }

        return response(
          res,
          200,
          {
            ok: true,

            meta:
              fs.existsSync(
                CURRENT_META
              )
                ? JSON.parse(
                    fs.readFileSync(
                      CURRENT_META,
                      'utf8'
                    )
                  )
                : null,

            score:
              JSON.parse(
                fs.readFileSync(
                  CURRENT,
                  'utf8'
                )
              )
          }
        );
      }


      return response(
        res,
        404,
        {
          ok: false,
          message: 'NOT FOUND'
        }
      );

    } catch (error) {
      return response(
        res,
        error.status || 500,
        {
          ok: false,

          message:
            error.message ||
            'SERVER ERROR'
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
      'A8_MUSIC_REVIEW_V1 listening on 127.0.0.1:' +
      PORT
    );
  }
);
