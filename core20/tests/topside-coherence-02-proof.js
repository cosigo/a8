'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');

const {
  staticPathFor,
  createHardwareLabServer,
} = require('../hardware/a8-postseal-hardware-lab-server');

console.log('A8 v5.4.20 · TOPSIDE COHERENCE 02 · single-header proof');

assert.equal(path.basename(staticPathFor('/')), 'index.html');

function getHeader(html, name) {
  const match = html.match(
    /<nav id="a8-topside-coherence-02"[\s\S]*?<\/nav>/
  );
  assert(match, `${name}: unified header missing`);
  return match[0];
}

const pages = [
  ['index.html', 'YOU ARE HERE · MAIN LAB'],
  ['jovian-operations.html', 'YOU ARE HERE · CORE 20 · JUPITER NATURAL TIMEKEEPER'],
  ['mintaka.html', 'YOU ARE HERE · MINTAKA · EARTH AXIAL ROTATION'],
  ['sol.html', 'YOU ARE HERE · SOL · EARTH ORBITAL ADVANCE'],
  ['relationship.html', 'YOU ARE HERE · TERRA SHIP SLIP · ROTATION / ORBIT RELATIONSHIP'],
  ['hardware-source.html', 'YOU ARE HERE · CHIEF ENGINEER · VIRTUAL / REAL PULSE SOURCE'],
];

for (const [name, role] of pages) {
  const html = fs.readFileSync(
    path.resolve(__dirname, '..', 'public', name),
    'utf8'
  );

  assert.equal(
    (html.match(/id="a8-topside-coherence-02"/g) || []).length,
    1,
    `${name}: exactly one unified header`
  );

  const nav = getHeader(html, name);

  assert(nav.includes(role), `${name}: role marker missing`);

  for (const [href,label] of [
    ['/', 'A8 LAB HOME'],
    ['/jovian-operations.html', 'CORE 20 · JUPITER'],
    ['/moons.html', '4-MOON VIEW'],
    ['/mintaka.html', 'MINTAKA'],
    ['/sol.html', 'SOL'],
    ['/relationship.html', 'TERRA SHIP SLIP'],
    ['/index.html#chief-engineer-links', 'CHIEF ENGINEER'],
  ]) {
    assert(nav.includes(`href="${href}"`), `${name}: missing ${href}`);
    assert(nav.includes(`>${label}</a>`), `${name}: missing ${label}`);
  }

  for (const href of [
    '/map-clock-compass.html',
    '/navigation.html',
    '/celestial.html',
    'https://a8.cosigo.io/canonical.html',
    'https://a8.cosigo.io/open-research.html',
    'https://a8.cosigo.io/',
    'https://lab.a8.cosigo.io/',
    'https://cosigo.io/',
    'https://contact.cosigo.io/',
    'https://github.com/cosigo',
  ]) {
    assert(nav.includes(`href="${href}"`), `${name}: utility route missing ${href}`);
  }

  assert.equal(
    (nav.match(/>A8 LAB HOME<\/a>/g) || []).length,
    1,
    `${name}: A8 LAB HOME duplicated inside header`
  );

  assert(!html.includes('id="a8-topside-system-nav"'));
  assert(!html.includes('id="a8-global-utility-fallback"'));
  assert(!html.includes('>ENGINEERING HUB</a>'));
}

console.log(
  'PASS TC02-01 · each primary page has one header with non-duplicated system and utility destinations'
);

const coreHtml = fs.readFileSync(
  path.resolve(__dirname, '..', 'public', 'jovian-operations.html'),
  'utf8'
);
const coreNav = getHeader(coreHtml, 'jovian-operations.html');

for (const label of [
  'A8 LAB HOME',
  'CORE 20 · JUPITER',
  '4-MOON VIEW',
  'MINTAKA',
  'SOL',
  'TERRA SHIP SLIP',
  'CHIEF ENGINEER',
]) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  assert.equal(
    (coreNav.match(new RegExp(`>${escaped}<\\/a>`, 'g')) || []).length,
    1,
    `Core-20 header repeats ${label}`
  );
}

console.log(
  'PASS TC02-02 · Jovian/Core-20 header contains each system destination exactly once'
);

const index = fs.readFileSync(
  path.resolve(__dirname, '..', 'public', 'index.html'),
  'utf8'
);
assert(index.includes('id="chief-engineer-links"'));
assert(index.includes('ARM MANUAL RECALIBRATION'));

console.log(
  'PASS TC02-03 · Main Lab remains the established engineering lab'
);

const moonsPath = path.resolve(__dirname, '..', 'public', 'moons.html');
if (fs.existsSync(moonsPath)) {
  const moons = fs.readFileSync(moonsPath, 'utf8');
  const moonsNav = getHeader(moons, 'moons.html');
  assert(moonsNav.includes('YOU ARE HERE · JUPITER · 4-MOON OBSERVER'));
  assert.equal(
    (moonsNav.match(/>A8 LAB HOME<\/a>/g) || []).length,
    1
  );
  console.log(
    'PASS TC02-04 · 4-Moon View is a distinct Jupiter observer with the same single header'
  );
}

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
    for (const [pathname, marker] of [
      ['/', 'YOU ARE HERE · MAIN LAB'],
      ['/jovian-operations.html', 'YOU ARE HERE · CORE 20 · JUPITER NATURAL TIMEKEEPER'],
      ['/mintaka.html', 'YOU ARE HERE · MINTAKA · EARTH AXIAL ROTATION'],
      ['/sol.html', 'YOU ARE HERE · SOL · EARTH ORBITAL ADVANCE'],
      ['/relationship.html', 'YOU ARE HERE · TERRA SHIP SLIP · ROTATION / ORBIT RELATIONSHIP'],
      ['/hardware-source.html', 'YOU ARE HERE · CHIEF ENGINEER · VIRTUAL / REAL PULSE SOURCE'],
    ]) {
      const r = await request(port, pathname);
      assert.equal(r.status, 200, pathname);
      assert(r.body.includes(marker), pathname);
      assert.equal(
        (r.body.match(/id="a8-topside-coherence-02"/g) || []).length,
        1,
        pathname
      );
      const nav = getHeader(r.body, pathname);
      assert.equal(
        (nav.match(/>A8 LAB HOME<\/a>/g) || []).length,
        1,
        pathname
      );
    }

    console.log(
      'PASS TC02-05 · served pages contain one coherent header with no injected duplicate menu'
    );

    const state = await request(port, '/api/state');
    assert.equal(state.status, 200);
    const parsed = JSON.parse(state.body);
    assert.equal(parsed.version, '5.4.20');
    assert.equal(parsed.writesClock, false);

    console.log(
      'PASS TC02-06 · presentation cleanup leaves Gate-6I authority read-only'
    );
  } finally {
    await new Promise(resolve => server.close(resolve));
  }

  console.log('');
  console.log('PASS · A8-v5.4.20-POSTSEAL-TOPSIDE-COHERENCE-02-SINGLE-HEADER');
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
