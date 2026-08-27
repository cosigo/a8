'use strict';

/*
 * AUSPICIOUS 8 · v5.4.20
 * GATE 2C · HEADLESS MINTAKA SIMULATED-OBSERVATION ADAPTER
 *
 * This is a laboratory evidence generator / transport adapter.
 *
 * It does NOT:
 *   - read /api/state
 *   - call /api/control
 *   - own DAY_PHASE17
 *   - read host wall time
 *   - contain an expected Mintaka recurrence
 *
 * The simulated plant span is an EXPLICIT CLI input:
 *   --span <raw-pulse interval>
 *
 * Output contract sent to Gate-2B ingress:
 *   {
 *     type: 'STELLAR_MERIDIAN',
 *     rawPulse: '<monotonic integer>',
 *     witness: 'MINTAKA'
 *   }
 *
 * No waiting is performed between events. A burst therefore exercises
 * observer acceleration without introducing a timing source.
 */

const http = require('http');
const https = require('https');

const EVENT_TYPE = 'STELLAR_MERIDIAN';
const WITNESS = 'MINTAKA';

function parseUnsignedBigInt(value, name, { allowZero = true } = {}) {
  const text = String(value ?? '');
  if (!/^(0|[1-9][0-9]*)$/.test(text)) {
    throw new Error(`${name} must be a non-negative integer`);
  }

  const out = BigInt(text);
  if (!allowZero && out === 0n) {
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

function buildSimulatedEvents({ start = 0n, span, cycles = 8 }) {
  const startRaw = parseUnsignedBigInt(start, 'start');
  const spanRaw = parseUnsignedBigInt(span, 'span', { allowZero: false });
  const cycleCount = parsePositiveInteger(cycles, 'cycles');

  const events = [];
  for (let i = 0; i <= cycleCount; i++) {
    events.push({
      type: EVENT_TYPE,
      rawPulse: (startRaw + BigInt(i) * spanRaw).toString(),
      witness: WITNESS,
    });
  }
  return events;
}

function postObservation(endpoint, event) {
  const url = new URL(endpoint);

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('endpoint protocol must be http: or https:');
  }

  if (url.pathname !== '/api/mintaka/observe') {
    throw new Error('endpoint path must be exactly /api/mintaka/observe');
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

        res.setEncoding('utf8');
        res.on('data', chunk => {
          raw += chunk;
          if (raw.length > 1024 * 1024) {
            reject(new Error('Mintaka ingress response too large'));
            req.destroy();
          }
        });

        res.on('end', () => {
          let payload = null;
          try {
            payload = raw ? JSON.parse(raw) : null;
          } catch {
            reject(new Error(`Mintaka ingress returned non-JSON response (${res.statusCode})`));
            return;
          }

          if (res.statusCode < 200 || res.statusCode >= 300 || !payload || payload.ok !== true) {
            const msg = payload && payload.error
              ? payload.error
              : `HTTP ${res.statusCode}`;
            reject(new Error(`Mintaka ingress rejected observation: ${msg}`));
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

async function emitEvents(endpoint, events, postFn = postObservation) {
  if (!Array.isArray(events) || events.length < 2) {
    throw new Error('at least two Mintaka events are required');
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
    start: '0',
    span: '',
    cycles: '8',
    quiet: false,
  };

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

    const match = arg.match(/^--(endpoint|start|span|cycles)=(.*)$/);
    if (match) {
      opts[match[1]] = match[2];
      continue;
    }

    if (/^--(endpoint|start|span|cycles)$/.test(arg)) {
      const key = arg.slice(2);
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
    'A8 v5.4.20 · Gate 2C Mintaka simulated-observation adapter',
    '',
    'Required:',
    '  --endpoint <http(s)://host:port/api/mintaka/observe>',
    '  --span <explicit simulated raw-pulse recurrence>',
    '',
    'Optional:',
    '  --start <first raw pulse>       default 0',
    '  --cycles <number of cycles>     default 8',
    '  --quiet',
    '',
    'The adapter sends events as fast as the ingress accepts them.',
    'It does not use host time and it does not read or control the A8 core.',
  ].join('\n');
}

async function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);

  if (opts.help) {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }

  if (!opts.endpoint) throw new Error('--endpoint is required');
  if (!opts.span) throw new Error('--span is required');

  const events = buildSimulatedEvents({
    start: opts.start,
    span: opts.span,
    cycles: opts.cycles,
  });

  if (!opts.quiet) {
    console.log('A8 v5.4.20 · MINTAKA SIMULATED OBSERVATION ADAPTER');
    console.log('ROLE · test evidence generator / transport only');
    console.log(`ENDPOINT · ${opts.endpoint}`);
    console.log(`START RAW · ${events[0].rawPulse}`);
    console.log(`EXPLICIT SIMULATED SPAN · ${opts.span}`);
    console.log(`CYCLES · ${events.length - 1}`);
    console.log('PACER · NONE · burst as ingress accepts');
  }

  const result = await emitEvents(opts.endpoint, events);

  if (!opts.quiet) {
    const observer = result && result.observer ? result.observer : {};
    console.log(`OBSERVER STATUS · ${observer.status || 'UNKNOWN'}`);
    console.log(`EVENT COUNT · ${observer.eventCount ?? 'UNKNOWN'}`);
    console.log(`LATEST SPAN RAW · ${observer.latestSpanRaw ?? 'UNKNOWN'}`);
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
  parseUnsignedBigInt,
  parsePositiveInteger,
  buildSimulatedEvents,
  postObservation,
  emitEvents,
  parseArgs,
  main,
};
