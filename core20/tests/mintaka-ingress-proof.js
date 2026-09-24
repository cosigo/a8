'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const serverPath = path.join(root, 'server.js');
const corePath = path.join(root, 'core', 'a8-core.js');
const observerPath = path.join(root, 'observer', 'a8-mintaka-observer.js');
const pagePath = path.join(root, 'public', 'mintaka.html');

const server = fs.readFileSync(serverPath, 'utf8');
const observer = fs.readFileSync(observerPath, 'utf8');
const page = fs.readFileSync(pagePath, 'utf8');

console.log('A8 v5.4.20 Gate 2B · Mintaka isolated observation ingress proof');

assert(server.includes("require('./observer/a8-mintaka-observer')"));
assert(server.includes('new MintakaRotationObserver()'));
assert(server.includes("url.pathname === '/api/mintaka'"));
assert(server.includes("url.pathname === '/api/mintaka/observe'"));
console.log('PASS G2B-01 · server owns a standalone Mintaka observer with explicit GET state and POST observation ingress routes');

const routeStart = server.indexOf("if (req.method === 'GET' && url.pathname === '/api/mintaka')");
const nextAnchor = server.indexOf("if (req.method === 'GET' && url.pathname === '/api/data/inventory')", routeStart);
assert(routeStart >= 0 && nextAnchor > routeStart);

const mintakaRoutes = server.slice(routeStart, nextAnchor);

for (const forbidden of [
  'core.',
  'handleControl',
  '/api/control',
  'setClockPhase',
  'adjustClockTicks',
  'setAuthority',
  'setEarthDayRawSpan',
  'DAY_PHASE17',
  'PHASE20',
  'MEAN_SUN',
  'SOLAR_MERIDIAN',
]) {
  assert(!mintakaRoutes.includes(forbidden), `Mintaka ingress block contains forbidden core/control dependency: ${forbidden}`);
}
console.log('PASS G2B-02 · Mintaka HTTP ingress block contains no core/control/clock/authority call');

assert(mintakaRoutes.includes('mintakaObserver.snapshot()'));
assert(mintakaRoutes.includes('mintakaObserver.observe(event)'));
console.log('PASS G2B-03 · GET is observer snapshot only and POST forwards only to Mintaka observer.observe');

for (const forbidden of ['598016', '2392064', '365.25', '86400']) {
  assert(!server.includes(`MINTAKA_EXPECTED_${forbidden}`));
}
assert(!observer.includes('598016'));
console.log('PASS G2B-04 · ingress introduces no expected Mintaka recurrence or legacy day constant');

assert(page.includes("fetch('/api/mintaka'"));
assert(!/fetch\([^)]*\/api\/mintaka\/observe/.test(page));
assert(!page.includes('/api/control'));
assert(!page.includes('method:"POST"'));
assert(!page.includes("method:'POST'"));
assert(!page.includes('method: "POST"'));
assert(!page.includes("method: 'POST'"));
console.log('PASS G2B-05 · Mintaka bench displays live observer state but has no browser event-injection or core-control POST path');

const core = fs.readFileSync(corePath, 'utf8');
assert(!core.includes('MintakaRotationObserver'));
assert(!core.includes('/api/mintaka'));
console.log('PASS G2B-06 · A8Core remains unaware of Mintaka observer and ingress');

console.log('');
console.log('PASS · A8-v5.4.20-GATE2B-MINTAKA-INGRESS-STATIC');
