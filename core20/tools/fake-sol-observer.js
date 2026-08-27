'use strict';

/*
 * AUSPICIOUS 8 · v5.4.20
 * GATE 3C · HEADLESS SIMULATED SOL-DIRECTION ADAPTER
 *
 * Laboratory role:
 *   explicit simulated celestial-direction evidence generator / transport only.
 *
 * It does NOT:
 *   - read A8 core state
 *   - call the A8 core control path
 *   - own or pace DAY_PHASE17
 *   - read host wall time
 *   - contain an expected orbital rate, year length, solar recurrence, or day length
 *
 * Explicit CLI inputs define the simulation:
 *   raw start
 *   raw-pulse spacing
 *   starting native angle512 rational
 *   native angle512 step rational
 *   cycle count
 *
 * Output contract:
 *   {
 *     type: 'SOL_CELESTIAL_DIRECTION',
 *     rawPulse: '<monotonic integer>',
 *     witness: 'SOL',
 *     angle512: {
 *       numerator: '<integer>',
 *       denominator: '<positive integer>'
 *     }
 *   }
 *
 * Events are sent as quickly as the isolated Sol ingress accepts them.
 * There is no host-time pacer.
 */

const http = require('http');
const https = require('https');

const EVENT_TYPE = 'SOL_CELESTIAL_DIRECTION';
const WITNESS = 'SOL';
const FULL_TURN = 512n;

function absBigInt(value) {
  return value < 0n ? -value : value;
}

function gcd(a, b) {
  a = absBigInt(a);
  b = absBigInt(b);
  while (b !== 0n) {
    const t = a % b;
    a = b;
    b = t;
  }
  return a;
}

function reduce(numerator, denominator) {
  if (denominator === 0n) throw new Error('denominator must be non-zero');
  if (denominator < 0n) {
    numerator = -numerator;
    denominator = -denominator;
  }
  const d = gcd(numerator, denominator);
  return {
    numerator: numerator / d,
    denominator: denominator / d,
  };
}

function parseInteger(value, name, { nonNegative = false, positive = false } = {}) {
  const text = String(value ?? '');
  if (!/^-?(0|[1-9][0-9]*)$/.test(text)) {
    throw new Error(`${name} must be an integer`);
  }

  const out = BigInt(text);

  if (nonNegative && out < 0n) {
    throw new Error(`${name} must be non-negative`);
  }

  if (positive && out <= 0n) {
    throw new Error(`${name} must be greater than zero`);
  }

  return out;
}

function parsePositiveInteger(value, name) {
  const text = String(value ?? '');
  if (!/^[1-9][0-9]*$/.test(text)) {
    throw new Error(`${name} must be a positive integer`);
  }
  const out = Number(text);
  if (!Number.isSafeInteger(out)) {
    throw new Error(`${name} is too large`);
  }
  return out;
}

function normalizeAngle512(numerator, denominator) {
  let n = parseInteger(numerator, 'angle numerator');
  const d = parseInteger(denominator, 'angle denominator', { positive: true });

  const modulus = FULL_TURN * d;
  n %= modulus;
  if (n < 0n) n += modulus;

  return reduce(n, d);
}

function addRationals(a, b) {
  return reduce(
    a.numerator * b.denominator + b.numerator * a.denominator,
    a.denominator * b.denominator
  );
}

function isPositiveLessThanFullTurn(value) {
  return value.numerator > 0n &&
    value.numerator < FULL_TURN * value.denominator;
}

function buildSimulatedSolEvents({
  rawStart = 0n,
  rawSpan,
  angleStartNumerator,
  angleStartDenominator,
  angleStepNumerator,
  angleStepDenominator,
  cycles = 8,
}) {
  const startRaw = parseInteger(rawStart, 'rawStart', { nonNegative: true });
  const rawStep = parseInteger(rawSpan, 'rawSpan', { positive: true });
  const cycleCount = parsePositiveInteger(cycles, 'cycles');

  const startAngle = normalizeAngle512(
    angleStartNumerator,
    angleStartDenominator
  );

  const angleStep = reduce(
    parseInteger(angleStepNumerator, 'angleStepNumerator', { positive: true }),
    parseInteger(angleStepDenominator, 'angleStepDenominator', { positive: true })
  );

  if (!isPositiveLessThanFullTurn(angleStep)) {
    throw new Error('angle step must be greater than 0 and less than one 512-unit turn');
  }

  const events = [];
  let currentAngle = startAngle;

  for (let i = 0; i <= cycleCount; i++) {
    const normalized = normalizeAngle512(
      currentAngle.numerator,
      currentAngle.denominator
    );

    events.push({
      type: EVENT_TYPE,
      rawPulse: (startRaw + BigInt(i) * rawStep).toString(),
      witness: WITNESS,
      angle512: {
        numerator: normalized.numerator.toString(),
        denominator: normalized.denominator.toString(),
      },
    });

    currentAngle = addRationals(currentAngle, angleStep);
  }

  return events;
}

function postSolObservation(endpoint, event) {
  const url = new URL(endpoint);

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('endpoint protocol must be http: or https:');
  }

  if (url.pathname !== '/api/sol/observe') {
    throw new Error('endpoint path must be exactly /api/sol/observe');
  }

  const body = JSON.stringify(event);
  const transport = url.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const req = transport.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      res => {
        let raw = '';
        let settled = false;

        const fail = err => {
          if (settled) return;
          settled = true;
          reject(err);
        };

        res.setEncoding('utf8');
        res.on('data', chunk => {
          if (settled) return;
          raw += chunk;
          if (raw.length > 1024 * 1024) {
            fail(new Error('Sol ingress response too large'));
            req.destroy();
          }
        });

        res.on('end', () => {
          if (settled) return;
          settled = true;

          let payload;
          try {
            payload = raw ? JSON.parse(raw) : null;
          } catch {
            reject(new Error(`Sol ingress returned non-JSON response (${res.statusCode})`));
            return;
          }

          if (res.statusCode < 200 || res.statusCode >= 300 || !payload || payload.ok !== true) {
            const msg = payload && payload.error
              ? payload.error
              : `HTTP ${res.statusCode}`;
            reject(new Error(`Sol ingress rejected observation: ${msg}`));
            return;
          }

          resolve(payload);
        });
      }
    );

    req.on('error', reject);
    req.end(body);
  });
}

async function emitEvents(endpoint, events, postFn = postSolObservation) {
  if (!Array.isArray(events) || events.length < 2) {
    throw new Error('at least two Sol direction samples are required');
  }

  let last = null;
  for (const event of events) {
    last = await postFn(endpoint, event);
  }
  return last;
}

function parseArgs(argv) {
  const opts = {
    endpoint: '',
    rawStart: '0',
    rawSpan: '',
    angleStartNum: '',
    angleStartDen: '',
    angleStepNum: '',
    angleStepDen: '',
    cycles: '8',
    quiet: false,
  };

  const valueKeys = new Map([
    ['endpoint', 'endpoint'],
    ['raw-start', 'rawStart'],
    ['raw-span', 'rawSpan'],
    ['angle-start-num', 'angleStartNum'],
    ['angle-start-den', 'angleStartDen'],
    ['angle-step-num', 'angleStepNum'],
    ['angle-step-den', 'angleStepDen'],
    ['cycles', 'cycles'],
  ]);

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--quiet') {
      opts.quiet = true;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      opts.help = true;
      continue;
    }

    const equals = arg.match(/^--([^=]+)=(.*)$/);
    if (equals && valueKeys.has(equals[1])) {
      opts[valueKeys.get(equals[1])] = equals[2];
      continue;
    }

    if (arg.startsWith('--') && valueKeys.has(arg.slice(2))) {
      const key = valueKeys.get(arg.slice(2));
      i++;
      if (i >= argv.length) throw new Error(`${arg} requires a value`);
      opts[key] = argv[i];
      continue;
    }

    throw new Error(`unknown argument: ${arg}`);
  }

  return opts;
}

function usage() {
  return [
    'A8 v5.4.20 · Gate 3C simulated Sol-direction adapter',
    '',
    'Required:',
    '  --endpoint <http(s)://host:port/api/sol/observe>',
    '  --raw-span <positive raw-pulse interval>',
    '  --angle-start-num <integer>',
    '  --angle-start-den <positive integer>',
    '  --angle-step-num <positive integer>',
    '  --angle-step-den <positive integer>',
    '',
    'Optional:',
    '  --raw-start <first raw pulse>   default 0',
    '  --cycles <cycle count>          default 8',
    '  --quiet',
    '',
    'The adapter has no timing pacer. It sends as fast as ingress accepts.',
  ].join('\n');
}

async function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);

  if (opts.help) {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }

  for (const required of [
    'endpoint',
    'rawSpan',
    'angleStartNum',
    'angleStartDen',
    'angleStepNum',
    'angleStepDen',
  ]) {
    if (!opts[required]) throw new Error(`--${required} input is required`);
  }

  const events = buildSimulatedSolEvents({
    rawStart: opts.rawStart,
    rawSpan: opts.rawSpan,
    angleStartNumerator: opts.angleStartNum,
    angleStartDenominator: opts.angleStartDen,
    angleStepNumerator: opts.angleStepNum,
    angleStepDenominator: opts.angleStepDen,
    cycles: opts.cycles,
  });

  if (!opts.quiet) {
    console.log('A8 v5.4.20 · SIMULATED SOL-DIRECTION ADAPTER');
    console.log('ROLE · laboratory celestial-direction evidence generator / transport only');
    console.log(`ENDPOINT · ${opts.endpoint}`);
    console.log(`START RAW · ${events[0].rawPulse}`);
    console.log(`RAW SPAN · ${opts.rawSpan}`);
    console.log(`START ANGLE512 · ${opts.angleStartNum}/${opts.angleStartDen}`);
    console.log(`EXPLICIT ANGLE STEP512 · ${opts.angleStepNum}/${opts.angleStepDen}`);
    console.log(`CYCLES · ${events.length - 1}`);
    console.log('PACER · NONE · burst as ingress accepts');
  }

  const result = await emitEvents(opts.endpoint, events);

  if (!opts.quiet) {
    const observer = result && result.observer ? result.observer : {};
    console.log(`OBSERVER STATUS · ${observer.status || 'UNKNOWN'}`);
    console.log(`SAMPLE COUNT · ${observer.sampleCount ?? 'UNKNOWN'}`);
    const advance = observer.accumulatedForwardAdvance512;
    console.log(
      `ACCUMULATED ADVANCE512 · ${
        advance ? `${advance.numerator}/${advance.denominator}` : 'UNKNOWN'
      }`
    );
  }

  return 0;
}

if (require.main === module) {
  main().catch(err => {
    console.error(`FAIL · ${err && err.message ? err.message : String(err)}`);
    process.exitCode = 1;
  });
}

module.exports = {
  EVENT_TYPE,
  WITNESS,
  FULL_TURN,
  gcd,
  reduce,
  normalizeAngle512,
  addRationals,
  buildSimulatedSolEvents,
  postSolObservation,
  emitEvents,
  parseArgs,
  main,
};
