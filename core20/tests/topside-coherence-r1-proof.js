'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');

const {
  staticPathFor,
  createHardwareLabServer,
} = require('../hardware/a8-postseal-hardware-lab-server');

console.log('A8 v5.4.20 · TOPSIDE COHERENCE 01 R1 proof');

assert.equal(path.basename(staticPathFor('/')), 'index.html');
console.log('PASS TC01-R1-01 · / is still Main Lab');

const primary = [
  ['index.html', 'YOU ARE HERE · MAIN LAB'],
  ['jovian-operations.html', 'YOU ARE HERE · CORE 20 · JUPITER NATURAL TIMEKEEPER'],
  ['mintaka.html', 'YOU ARE HERE · MINTAKA · EARTH AXIAL ROTATION'],
  ['sol.html', 'YOU ARE HERE · SOL · EARTH ORBITAL ADVANCE'],
  ['relationship.html', 'YOU ARE HERE · TERRA SHIP SLIP · ROTATION / ORBIT RELATIONSHIP'],
  ['hardware-source.html', 'YOU ARE HERE · CHIEF ENGINEER · VIRTUAL / REAL PULSE SOURCE'],
];

for (const [name, role] of primary) {
  const html = fs.readFileSync(
    path.resolve(__dirname, '..', 'public', name),
    'utf8'
  );

  assert.equal(
    (html.match(/id="a8-topside-system-nav"/g) || []).length,
    1,
    `${name}: exactly one Core-20 nav required`
  );

  assert(html.includes(role), `${name}: role marker missing`);

  assert.match(
    html,
    /href="\/"[^>]*>A8 LAB HOME<\/a>/,
    `${name}: established A8 LAB HOME → / contract missing`
  );

  for (const href of [
    '/jovian-operations.html',
    '/mintaka.html',
    '/sol.html',
    '/relationship.html',
    '/index.html#chief-engineer-links',
  ]) {
    assert(html.includes(`href="${href}"`), `${name}: missing ${href}`);
  }

  for (const href of [
    '/map-clock-compass.html',
    '/navigation.html',
    'https://a8.cosigo.io/canonical.html',
    'https://a8.cosigo.io/open-research.html',
    'https://a8.cosigo.io/',
    'https://cosigo.io/',
    'https://contact.cosigo.io/',
    'https://github.com/cosigo',
  ]) {
    assert(html.includes(`href="${href}"`), `${name}: utility route missing ${href}`);
  }

  assert(!html.includes('>ENGINEERING HUB</a>'));
}

console.log('PASS TC01-R1-02 · system nav and utility nav are separate and complete');

const index = fs.readFileSync(
  path.resolve(__dirname, '..', 'public', 'index.html'),
  'utf8'
);
assert(index.includes('id="chief-engineer-links"'));
console.log('PASS TC01-R1-03 · Chief Engineer remains a Main-Lab destination');

function request(port, pathname) {
  return new Promise((resolve, reject) => {
    const req = http.get(
      {host:'127.0.0.1', port, path:pathname},
      res => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve({
          status: res.statusCode,
          body: Buffer.concat(chunks).toString('utf8'),
        }));
      }
    );
    req.on('error', reject);
  });
}

(async () => {
  const {server} = createHardwareLabServer();

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const port = server.address().port;

  try {
    const root = await request(port, '/');
    assert.equal(root.status, 200);
    assert(root.body.includes('YOU ARE HERE · MAIN LAB'));
    assert.match(root.body, /href="\/"[^>]*>A8 LAB HOME<\/a>/);
    assert(root.body.includes('ARM MANUAL RECALIBRATION'));
    assert(!root.body.includes('id="a8-core20-global-navigation"'));

    const core = await request(port, '/jovian-operations.html');
    assert.equal(core.status, 200);
    assert(core.body.includes('YOU ARE HERE · CORE 20 · JUPITER NATURAL TIMEKEEPER'));
    assert(core.body.includes('JOVIAN A8 PHASE9'));
    assert.match(core.body, /href="\/"[^>]*>A8 LAB HOME<\/a>/);

    console.log('PASS TC01-R1-04 · served Main Lab and Core 20 are distinct and navigable');

    for (const pathname of [
      '/mintaka.html',
      '/sol.html',
      '/relationship.html',
      '/hardware-source.html',
    ]) {
      const r = await request(port, pathname);
      assert.equal(r.status, 200, pathname);
      assert.match(r.body, /href="\/"[^>]*>A8 LAB HOME<\/a>/);
      assert.equal(
        (r.body.match(/id="a8-topside-system-nav"/g) || []).length,
        1
      );
    }

    console.log('PASS TC01-R1-05 · observer/Chief-Engineer pages share the same home contract');

    const state = await request(port, '/api/state');
    assert.equal(state.status, 200);
    const parsed = JSON.parse(state.body);
    assert.equal(parsed.version, '5.4.20');
    assert.equal(parsed.writesClock, false);

    console.log('PASS TC01-R1-06 · Gate-6I API authority boundary remains read-only');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }

  console.log('');
  console.log('PASS · A8-v5.4.20-POSTSEAL-TOPSIDE-COHERENCE-01-R1-REGRESSION-COMPATIBILITY');
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
