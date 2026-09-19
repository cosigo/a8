'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');

const EXPECTED =
  '77eb2c5029886ed5bd5261746fe02b95f16580b76b5fef9c3d645d2dc0bb08ad';

const SEED_PATH = path.join(
  __dirname,
  'five-body',
  'a8-five-body-operating-seed-v2.json'
);

const PHYSICAL =
  'http://127.0.0.1:28788/snapshot';

function hashFile(p) {
  return crypto.createHash('sha256')
    .update(fs.readFileSync(p))
    .digest('hex');
}

function B(v) {
  return BigInt(String(v));
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, {timeout: 5000}, res => {
      let body = '';

      res.setEncoding('utf8');
      res.on('data', x => body += x);

      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }

        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error(`bad JSON: ${e.message}`));
        }
      });
    });

    req.on('timeout', () => {
      req.destroy(new Error('physical snapshot timeout'));
    });

    req.on('error', reject);
  });
}

function moon(body, now) {
  const schedule = body.predictionSchedule || [];

  for (const m of schedule) {
    const raw = B(m.raw);

    if (raw > now) {
      return {
        event: m.event,
        phase512: m.phase512,
        raw,
        source: 'SEALED_V2_SCHEDULE'
      };
    }
  }

  if (!schedule.length)
    throw new Error('empty moon schedule');

  let last = schedule[schedule.length - 1];
  let raw = B(last.raw);
  let event = last.event;

  while (raw <= now) {
    if (event === 'EAST') {
      raw += B(body.recurrenceRaw.eastToWest);
      event = 'WEST';
    } else {
      raw += B(body.recurrenceRaw.westToEast);
      event = 'EAST';
    }
  }

  return {
    event,
    phase512: event === 'EAST' ? 0 : 256,
    raw,
    source: 'AUTONOMOUS_RECURRENCE'
  };
}

function mintaka(body, now) {
  let raw = B(body.nextMarker.raw);
  const span = B(body.recurrenceRaw.stellarRotation);

  let source = 'SEALED_V2_NEXT_MARKER';

  if (raw <= now) {
    const n = ((now - raw) / span) + 1n;
    raw += n * span;
    source = 'AUTONOMOUS_STELLAR_RECURRENCE';
  }

  return {
    event: 'MERIDIAN_0',
    phase512: 0,
    raw,
    source
  };
}

function sol(body, now) {
  const schedule = body.predictionSchedule || [];

  for (const m of schedule) {
    const raw = B(m.raw);

    if (raw > now) {
      return {
        event: 'A8_ORBITAL_GRID',
        phase512: Number(m.phase512),
        raw,
        source: 'SEALED_V2_ORBIT_SCHEDULE'
      };
    }
  }

  if (!schedule.length)
    throw new Error('empty Sol schedule');

  const steps = body.gridStepRawByPhase;

  if (!Array.isArray(steps) || steps.length !== 512)
    throw new Error('Sol grid table is not 512 entries');

  const last = schedule[schedule.length - 1];

  let raw = B(last.raw);
  let phase = Number(last.phase512);

  while (raw <= now) {
    raw += B(steps[phase]);
    phase = (phase + 1) & 511;
  }

  return {
    event: 'A8_ORBITAL_GRID',
    phase512: phase,
    raw,
    source: 'AUTONOMOUS_A8_ORBIT_MODEL'
  };
}

function output(marker, now) {
  return {
    status: 'PREDICTED',
    event: marker.event,
    phase512: marker.phase512,
    predictedRaw: marker.raw.toString(),
    liveRaw: now.toString(),
    deltaRaw: (marker.raw - now).toString(),
    predictionSource: marker.source,
    witnessRaw: null,
    residualRaw: null
  };
}

async function main() {
  const actual = hashFile(SEED_PATH);

  if (actual !== EXPECTED)
    throw new Error(`seed hash mismatch · ${actual}`);

  const seed = JSON.parse(
    fs.readFileSync(SEED_PATH, 'utf8')
  );

  if (seed.schema !== 'A8-FIVE-BODY-OPERATING-SEED-V2')
    throw new Error(`unexpected seed schema · ${seed.schema}`);

  const physical = await getJson(PHYSICAL);

  if (
    Number(physical.SOURCE_EPOCH) !==
    Number(seed.anchor.physicalSourceEpoch)
  ) {
    throw new Error(
      `SOURCE_EPOCH mismatch · live ${physical.SOURCE_EPOCH} · seed ${seed.anchor.physicalSourceEpoch}`
    );
  }

  if (physical.STATUS !== 'ACTIVE')
    throw new Error(`physical source ${physical.STATUS}`);

  const now = B(physical.RAW_COUNT);

  if (now < B(seed.anchor.raw))
    throw new Error('live RAW behind sealed anchor');

  const markers = {
    IO: output(moon(seed.bodies.IO, now), now),
    EUROPA: output(moon(seed.bodies.EUROPA, now), now),
    GANYMEDE: output(moon(seed.bodies.GANYMEDE, now), now),
    MINTAKA: output(mintaka(seed.bodies.MINTAKA, now), now),
    SOL: output(sol(seed.bodies.SOL, now), now)
  };

  console.log(JSON.stringify({
    schema: 'A8-FIVE-BODY-MARKER-SNAPSHOT-V1',
    status: 'FIVE_BODY_PREDICTION_RUNNING',

    authority: {
      readOnly: true,
      writesCore20: false,
      writesClock: false,
      changesAuthority: false,
      externalFeedUsed: false
    },

    seed: {
      schema: seed.schema,
      sha256: actual,
      sourcePacketSeal: seed.sourcePacket.sealSha256
    },

    physical: {
      sourceEpoch: Number(physical.SOURCE_EPOCH),
      raw: now.toString(),
      reportSequence: Number(physical.REPORT_SEQUENCE),
      status: physical.STATUS
    },

    markers
  }, null, 2));
}

main().catch(err => {
  console.error(
    'A8 FIVE-BODY MARKER ENGINE FAIL ·',
    err.message
  );
  process.exit(1);
});
