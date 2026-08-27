'use strict';

const assert = require('assert');
const http = require('http');

const {
  createHardwareLabServer,
} = require('../hardware/a8-postseal-hardware-lab-server');

function request(port, method, pathname, body = null) {
  return new Promise((resolve, reject) => {
    const text = body === null ? null : JSON.stringify(body);

    const req = http.request({
      host: '127.0.0.1',
      port,
      method,
      path: pathname,
      headers: text === null ? {} : {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(text),
      },
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({
        status: res.statusCode,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });

    req.on('error', reject);
    if (text !== null) req.write(text);
    req.end();
  });
}

(async () => {
  console.log(
    'A8 post-seal hardware branch · Gate 6I selected-source Earth-observation server proof'
  );

  const { server } = createHardwareLabServer();

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const port = server.address().port;

  try {
    let r = await request(
      port,
      'GET',
      '/api/hardware/earth-observers'
    );

    assert.equal(r.status, 200);

    let p = JSON.parse(r.body);

    assert.equal(p.bridge.sourceEpoch, 1);
    assert.equal(p.bridge.selectedRawPulse, null);
    assert.equal(
      p.bridge.externalObservationAcceptsRawPulse,
      false
    );

    console.log(
      'PASS G6I-S01 · Earth bridge begins re-armed on selected source epoch with no invented raw baseline'
    );

    r = await request(
      port,
      'POST',
      '/api/mintaka/observe',
      {
        type: 'STELLAR_MERIDIAN',
        witness: 'MINTAKA',
      }
    );

    assert.equal(r.status, 400);
    assert(
      JSON.parse(r.body).error.includes(
        'selected Gate-6F rawPulse is not established'
      )
    );

    console.log(
      'PASS G6I-S02 · Mintaka cannot observe before Gate-6F establishes the selected raw baseline'
    );

    r = await request(
      port,
      'POST',
      '/api/hardware/virtual/advance',
      { rawAdvance: '100' }
    );

    assert.equal(r.status, 200);
    p = JSON.parse(r.body);

    assert.equal(p.recoveryInput.lastRawPulse, '100');
    assert.equal(p.earthObservers.selectedRawPulse, '100');

    console.log(
      'PASS G6I-S03 · Gate-6E raw progress propagates through Gate-6F to Earth bridge without a second counter'
    );

    r = await request(
      port,
      'POST',
      '/api/mintaka/observe',
      {
        type: 'STELLAR_MERIDIAN',
        witness: 'MINTAKA',
      }
    );

    assert.equal(r.status, 200);
    p = JSON.parse(r.body);

    assert.equal(p.observer.lastRawPulse, '100');
    assert.equal(p.recoveryInput.lastRawPulse, '100');

    console.log(
      'PASS G6I-S04 · Mintaka body carries no rawPulse; server stamps exact Gate-6F rawPulse 100'
    );

    r = await request(
      port,
      'POST',
      '/api/mintaka/observe',
      {
        type: 'STELLAR_MERIDIAN',
        rawPulse: '999999',
        witness: 'MINTAKA',
      }
    );

    assert.equal(r.status, 400);
    assert(
      JSON.parse(r.body).error.includes(
        'unsupported Mintaka observation field: rawPulse'
      )
    );

    console.log(
      'PASS G6I-S05 · client cannot spoof Mintaka rawPulse'
    );

    await request(
      port,
      'POST',
      '/api/hardware/virtual/advance',
      { rawAdvance: '388' }
    );

    r = await request(
      port,
      'POST',
      '/api/mintaka/observe',
      {
        type: 'STELLAR_MERIDIAN',
        witness: 'MINTAKA',
      }
    );

    p = JSON.parse(r.body);

    assert.equal(p.observer.lastRawPulse, '488');
    assert.equal(p.observer.latestSpanRaw, '388');

    console.log(
      'PASS G6I-S06 · Mintaka recurrence is recovered from selected raw-count separation'
    );

    await request(
      port,
      'POST',
      '/api/hardware/virtual/advance',
      { rawAdvance: '12' }
    );

    r = await request(
      port,
      'POST',
      '/api/sol/observe',
      {
        type: 'SOL_CELESTIAL_DIRECTION',
        witness: 'SOL',
        angle512: {
          numerator: '0',
          denominator: '1',
        },
      }
    );

    assert.equal(r.status, 200);
    p = JSON.parse(r.body);

    assert.equal(p.observer.lastRawPulse, '500');
    assert.equal(p.recoveryInput.lastRawPulse, '500');

    console.log(
      'PASS G6I-S07 · Sol body carries direction only; server stamps exact Gate-6F rawPulse 500'
    );

    r = await request(
      port,
      'POST',
      '/api/sol/observe',
      {
        type: 'SOL_CELESTIAL_DIRECTION',
        rawPulse: '123456',
        witness: 'SOL',
        angle512: {
          numerator: '1',
          denominator: '1',
        },
      }
    );

    assert.equal(r.status, 400);
    assert(
      JSON.parse(r.body).error.includes(
        'unsupported Sol observation field: rawPulse'
      )
    );

    console.log(
      'PASS G6I-S08 · client cannot spoof Sol rawPulse'
    );

    r = await request(port, 'GET', '/api/mintaka');
    assert.equal(r.status, 200);
    p = JSON.parse(r.body);
    assert.equal(
      p.rawPulseAuthority,
      'GATE6F_SELECTED_RAW_OSCILLATOR_INPUT'
    );
    assert.equal(p.observer.lastRawPulse, '488');

    r = await request(port, 'GET', '/api/sol');
    assert.equal(r.status, 200);
    p = JSON.parse(r.body);
    assert.equal(
      p.rawPulseAuthority,
      'GATE6F_SELECTED_RAW_OSCILLATOR_INPUT'
    );
    assert.equal(p.observer.lastRawPulse, '500');

    console.log(
      'PASS G6I-S09 · existing Mintaka and Sol pages can read selected-source observer state on port 18020'
    );

    r = await request(port, 'GET', '/api/state');
    assert.equal(r.status, 200);
    p = JSON.parse(r.body);

    assert.equal(p.version, '5.4.20');
    assert.equal(p.rawCount, '500');
    assert.equal(p.presentationOnly, true);
    assert.equal(p.writesClock, false);

    console.log(
      'PASS G6I-S10 · /api/state compatibility is read-only selected-counter presentation, not core authority'
    );

    r = await request(
      port,
      'POST',
      '/api/hardware/source/select',
      { mode: 'REAL' }
    );

    assert.equal(r.status, 200);
    p = JSON.parse(r.body);

    assert.equal(p.earthObservers.sourceEpoch, 2);
    assert.equal(p.earthObservers.selectedRawPulse, null);
    assert.equal(p.earthObservers.mintaka.eventCount, 0);
    assert.equal(p.earthObservers.sol.sampleCount, 0);

    console.log(
      'PASS G6I-S11 · VIRTUAL→REAL sourceEpoch switch clears Mintaka and Sol evidence'
    );

    r = await request(port, 'GET', '/mintaka.html');
    assert.equal(r.status, 200);
    assert(r.body.includes("fetch('/api/mintaka'"));

    r = await request(port, 'GET', '/sol.html');
    assert.equal(r.status, 200);
    assert(r.body.includes("fetch('/api/sol'"));

    console.log(
      'PASS G6I-S12 · existing observer pages remain served with no browser observation-injection path'
    );

  } finally {
    await new Promise(resolve => server.close(resolve));
  }

  console.log('');
  console.log(
    'PASS · A8-POSTSEAL-GATE6I-SELECTED-SOURCE-EARTH-OBSERVATION-SERVER'
  );
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
