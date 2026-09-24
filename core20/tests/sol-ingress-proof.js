'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const serverPath = path.join(root, 'server.js');
const corePath = path.join(root, 'core', 'a8-core.js');
const observerPath = path.join(root, 'observer', 'a8-sol-observer.js');
const pagePath = path.join(root, 'public', 'sol.html');

const server = fs.readFileSync(serverPath, 'utf8');
const core = fs.readFileSync(corePath, 'utf8');
const observer = fs.readFileSync(observerPath, 'utf8');
const page = fs.readFileSync(pagePath, 'utf8');

console.log('A8 v5.4.20 Gate 3B · Sol isolated celestial-direction ingress proof');

assert(server.includes("require('./observer/a8-sol-observer')"));
assert(server.includes('new SolCelestialObserver()'));
assert(server.includes("url.pathname === '/api/sol'"));
assert(server.includes("url.pathname === '/api/sol/observe'"));
console.log('PASS G3B-01 · server owns standalone Sol observer with explicit GET state and POST celestial-direction ingress routes');

const routeStart = server.indexOf("if (req.method === 'GET' && url.pathname === '/api/sol')");
const nextAnchor = server.indexOf("if (req.method === 'GET' && url.pathname === '/api/data/inventory')", routeStart);

assert(routeStart >= 0, 'Sol route block start missing');
assert(nextAnchor > routeStart, 'Sol route block end anchor missing');

const solRoutes = server.slice(routeStart, nextAnchor);

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
  'SOLAR_MERIDIAN',
  'MEAN_SUN',
]) {
  assert(
    !solRoutes.includes(forbidden),
    `Sol ingress block contains forbidden core/control/day dependency: ${forbidden}`
  );
}
console.log('PASS G3B-02 · Sol HTTP ingress block contains no core/control/clock/authority/day-divider call');

assert(solRoutes.includes('solObserver.snapshot()'));
assert(solRoutes.includes('solObserver.observe(event)'));
console.log('PASS G3B-03 · GET returns Sol observer snapshot only and POST forwards only to solObserver.observe(event)');

for (const forbidden of [
  '2398634',
  '599658',
  '599622',
  '599695',
  '365.25',
  '86400',
]) {
  assert(
    !observer.includes(forbidden),
    `Sol observer contains forbidden seeded/legacy value: ${forbidden}`
  );
}
console.log('PASS G3B-04 · ingress preserves fresh v20 Sol observer with no seeded solar recurrence or legacy day constant');

assert(page.includes("fetch('/api/sol'"));
assert(!/fetch\([^)]*\/api\/sol\/observe/.test(page));
assert(!page.includes('/api/control'));
assert(!page.includes('method:"POST"'));
assert(!page.includes("method:'POST'"));
assert(!page.includes('method: "POST"'));
assert(!page.includes("method: 'POST'"));
console.log('PASS G3B-05 · Sol bench displays live observer state but has no browser sample-injection or core-control POST path');

assert(!core.includes('SolCelestialObserver'));
assert(!core.includes('/api/sol'));
console.log('PASS G3B-06 · A8Core remains unaware of Sol observer and Sol ingress');

console.log('');
console.log('PASS · A8-v5.4.20-GATE3B-SOL-INGRESS-STATIC');
