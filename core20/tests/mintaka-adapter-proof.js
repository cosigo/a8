'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const adapterPath = path.join(__dirname, '..', 'tools', 'fake-mintaka-observer.js');
const source = fs.readFileSync(adapterPath, 'utf8');

const {
  EVENT_TYPE,
  WITNESS,
  buildSimulatedEvents,
  emitEvents,
  parseArgs,
} = require('../tools/fake-mintaka-observer');

async function main() {
  console.log('A8 v5.4.20 Gate 2C · Mintaka simulated-observation adapter proof');

  const executable = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

  for (const forbidden of [
    '/api/state',
    '/api/control',
    'DAY_PHASE17',
    'PHASE20',
    'setClockPhase',
    'adjustClockTicks',
    'setAuthority',
    "require('../core",
    "require('./core",
    'Date.now',
    'new Date',
    'performance.now',
    'process.hrtime',
    'setTimeout',
    'setInterval',
    '598016',
    '2392064',
    'MEAN_SUN',
    'SOLAR_MERIDIAN',
  ]) {
    assert(!executable.includes(forbidden), `adapter executable code contains forbidden dependency/value: ${forbidden}`);
  }
  assert(
    executable.includes("url.pathname !== '/api/mintaka/observe'"),
    'adapter must enforce the isolated Mintaka ingress path'
  );
  console.log('PASS G2C-01 · adapter has no core read/control path, host-time pacer, seeded recurrence, Sol, or Earth-day machinery; endpoint is hard-locked to Mintaka ingress');

  {
    const events = buildSimulatedEvents({
      start: 991n,
      span: 123457n,
      cycles: 4,
    });

    assert.equal(events.length, 5);
    assert.deepEqual(events.map(e => e.rawPulse), [
      '991',
      '124448',
      '247905',
      '371362',
      '494819',
    ]);

    for (const event of events) {
      assert.deepEqual(Object.keys(event).sort(), ['rawPulse', 'type', 'witness']);
      assert.equal(event.type, EVENT_TYPE);
      assert.equal(event.witness, WITNESS);
    }
  }
  console.log('PASS G2C-02 · arbitrary explicit simulated span produces only qualified STELLAR_MERIDIAN + rawPulse + MINTAKA events');

  {
    const calls = [];
    const fakePost = async (endpoint, event) => {
      calls.push({ endpoint, event: { ...event } });
      return {
        ok: true,
        observer: {
          status: calls.length >= 2 ? 'RECOVERED' : 'SEEKING_SECOND_EVENT',
          eventCount: calls.length,
          latestSpanRaw: calls.length >= 2 ? '17' : null,
        },
      };
    };

    const events = buildSimulatedEvents({ start: 5n, span: 17n, cycles: 8 });
    const result = await emitEvents(
      'http://example.invalid/api/mintaka/observe',
      events,
      fakePost
    );

    assert.equal(calls.length, 9);
    assert(calls.every(c => c.endpoint.endsWith('/api/mintaka/observe')));
    assert.equal(result.observer.eventCount, 9);
  }
  console.log('PASS G2C-03 · headless adapter emits sequentially only to the supplied Mintaka ingress endpoint');

  {
    const opts = parseArgs([
      '--endpoint', 'http://127.0.0.1:9999/api/mintaka/observe',
      '--start', '100',
      '--span', '111',
      '--cycles', '16',
      '--quiet',
    ]);

    assert.equal(opts.endpoint, 'http://127.0.0.1:9999/api/mintaka/observe');
    assert.equal(opts.start, '100');
    assert.equal(opts.span, '111');
    assert.equal(opts.cycles, '16');
    assert.equal(opts.quiet, true);
  }
  console.log('PASS G2C-04 · simulator truth is explicit CLI input rather than a hidden plant period');

  assert.throws(
    () => buildSimulatedEvents({ start: 0, span: 0, cycles: 1 }),
    /span must be greater than zero/
  );
  assert.throws(
    () => buildSimulatedEvents({ start: 0, span: 10, cycles: 0 }),
    /cycles must be a positive integer/
  );
  console.log('PASS G2C-05 · invalid simulated spans/cycle counts are rejected before emission');

  console.log('');
  console.log('PASS · A8-v5.4.20-GATE2C-MINTAKA-ADAPTER-STATIC');
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
