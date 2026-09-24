'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const sourcePath = path.join(__dirname, '..', 'tools', 'fake-sol-observer.js');
const source = fs.readFileSync(sourcePath, 'utf8');

const {
  EVENT_TYPE,
  WITNESS,
  buildSimulatedSolEvents,
  emitEvents,
  parseArgs,
} = require('../tools/fake-sol-observer');

async function main() {
  console.log('A8 v5.4.20 Gate 3C · simulated Sol-direction adapter proof');

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
    'SOLAR_MERIDIAN',
    'MEAN_SUN',
    '2398634',
    '599658',
    '599622',
    '599695',
    '365.25',
    '86400',
  ]) {
    assert(
      !executable.includes(forbidden),
      `adapter executable code contains forbidden dependency/value: ${forbidden}`
    );
  }

  assert(
    executable.includes("url.pathname !== '/api/sol/observe'"),
    'adapter must enforce isolated Sol ingress path'
  );

  console.log('PASS G3C-01 · adapter has no core read/control path, host-time pacer, Mean-Sun/day machinery, or seeded orbital result; endpoint is hard-locked to Sol ingress');

  {
    const events = buildSimulatedSolEvents({
      rawStart: 1000n,
      rawSpan: 97n,
      angleStartNumerator: 2047n,
      angleStartDenominator: 4n,
      angleStepNumerator: 3n,
      angleStepDenominator: 8n,
      cycles: 4,
    });

    assert.equal(events.length, 5);
    assert.deepEqual(events.map(e => e.rawPulse), [
      '1000', '1097', '1194', '1291', '1388',
    ]);

    assert.deepEqual(events.map(e => e.angle512), [
      { numerator: '2047', denominator: '4' }, // 511.75
      { numerator: '1', denominator: '8' },    // 0.125
      { numerator: '1', denominator: '2' },    // 0.5
      { numerator: '7', denominator: '8' },    // 0.875
      { numerator: '5', denominator: '4' },    // 1.25
    ]);

    for (const event of events) {
      assert.equal(event.type, EVENT_TYPE);
      assert.equal(event.witness, WITNESS);
      assert.deepEqual(
        Object.keys(event).sort(),
        ['angle512', 'rawPulse', 'type', 'witness']
      );
    }
  }
  console.log('PASS G3C-02 · explicit native angle step crosses 512-wrap exactly and emits only qualified Sol direction samples');

  {
    const calls = [];
    const fakePost = async (endpoint, event) => {
      calls.push({ endpoint, event: JSON.parse(JSON.stringify(event)) });
      return {
        ok: true,
        observer: {
          status: calls.length >= 2 ? 'TRACKING' : 'SEEKING_SECOND_SAMPLE',
          sampleCount: calls.length,
        },
      };
    };

    const events = buildSimulatedSolEvents({
      rawStart: 5n,
      rawSpan: 11n,
      angleStartNumerator: 10n,
      angleStartDenominator: 1n,
      angleStepNumerator: 1n,
      angleStepDenominator: 16n,
      cycles: 8,
    });

    const result = await emitEvents(
      'http://example.invalid/api/sol/observe',
      events,
      fakePost
    );

    assert.equal(calls.length, 9);
    assert(calls.every(c => c.endpoint.endsWith('/api/sol/observe')));
    assert.equal(result.observer.sampleCount, 9);
  }
  console.log('PASS G3C-03 · headless adapter emits sequentially only to the supplied isolated Sol ingress endpoint');

  {
    const opts = parseArgs([
      '--endpoint', 'http://127.0.0.1:9999/api/sol/observe',
      '--raw-start', '100',
      '--raw-span', '73',
      '--angle-start-num', '2047',
      '--angle-start-den', '4',
      '--angle-step-num', '3',
      '--angle-step-den', '8',
      '--cycles', '16',
      '--quiet',
    ]);

    assert.equal(opts.endpoint, 'http://127.0.0.1:9999/api/sol/observe');
    assert.equal(opts.rawStart, '100');
    assert.equal(opts.rawSpan, '73');
    assert.equal(opts.angleStartNum, '2047');
    assert.equal(opts.angleStartDen, '4');
    assert.equal(opts.angleStepNum, '3');
    assert.equal(opts.angleStepDen, '8');
    assert.equal(opts.cycles, '16');
    assert.equal(opts.quiet, true);
  }
  console.log('PASS G3C-04 · simulator orbital motion is explicit native CLI input rather than a hidden rate/period');

  assert.throws(
    () => buildSimulatedSolEvents({
      rawStart: 0,
      rawSpan: 0,
      angleStartNumerator: 0,
      angleStartDenominator: 1,
      angleStepNumerator: 1,
      angleStepDenominator: 8,
      cycles: 1,
    }),
    /rawSpan must be greater than zero/
  );

  assert.throws(
    () => buildSimulatedSolEvents({
      rawStart: 0,
      rawSpan: 10,
      angleStartNumerator: 0,
      angleStartDenominator: 1,
      angleStepNumerator: 512,
      angleStepDenominator: 1,
      cycles: 1,
    }),
    /angle step must be greater than 0 and less than one 512-unit turn/
  );

  console.log('PASS G3C-05 · invalid raw spacing or ambiguous ≥full-turn angular step is rejected before emission');

  console.log('');
  console.log('PASS · A8-v5.4.20-GATE3C-SOL-ADAPTER-STATIC');
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
