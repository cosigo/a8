'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const serverPath = path.join(root, 'server.js');
const corePath = path.join(root, 'core', 'a8-core.js');
const relationshipPath = path.join(
  root,
  'observer',
  'a8-mintaka-sol-relationship.js'
);
const pagePath = path.join(root, 'public', 'relationship.html');

const server = fs.readFileSync(serverPath, 'utf8');
const core = fs.readFileSync(corePath, 'utf8');
const relationship = fs.readFileSync(relationshipPath, 'utf8');
const page = fs.readFileSync(pagePath, 'utf8');

console.log('A8 v5.4.20 Gate 4B · live read-only Terra Ship Slip relationship proof');

assert(
  server.includes("require('./observer/a8-mintaka-sol-relationship')"),
  'relationship module import missing'
);
assert(
  server.includes("url.pathname === '/api/terra-ship-slip'"),
  'Terra Ship Slip GET endpoint missing'
);
console.log('PASS G4B-01 · server exposes explicit GET /api/terra-ship-slip using the Gate-4A relationship module');

const routeStart = server.indexOf(
  "if (req.method === 'GET' && url.pathname === '/api/terra-ship-slip')"
);
const nextAnchor = server.indexOf(
  "if (req.method === 'GET' && url.pathname === '/api/data/inventory')",
  routeStart
);

assert(routeStart >= 0, 'Terra Ship Slip route start missing');
assert(nextAnchor > routeStart, 'Terra Ship Slip route end anchor missing');

const route = server.slice(routeStart, nextAnchor);

for (const forbidden of [
  'core.',
  '/api/control',
  'handleControl',
  '.observe(',
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
    !route.includes(forbidden),
    `Terra Ship Slip route contains forbidden write/control dependency: ${forbidden}`
  );
}
console.log('PASS G4B-02 · Terra Ship Slip route contains no core.*, observer.observe, control, clock, authority, or civil-day write path');

assert(route.includes('mintakaObserver.snapshot()'));
assert(route.includes('solObserver.snapshot()'));
assert(route.includes('deriveMintakaSolRelationship('));
console.log('PASS G4B-03 · live relationship derives only from current read-only Mintaka and Sol snapshots');

assert(!core.includes('deriveMintakaSolRelationship'));
assert(!core.includes('/api/terra-ship-slip'));
console.log('PASS G4B-04 · A8Core remains unaware of Terra Ship Slip relationship logic and endpoint');

for (const forbidden of [
  '2398634',
  '599658',
  '599622',
  '599695',
  '598016',
  '365.25',
  '86400',
]) {
  assert(
    !relationship.includes(forbidden),
    `relationship module contains forbidden seeded/legacy value: ${forbidden}`
  );
}
console.log('PASS G4B-05 · live endpoint preserves Gate-4A relationship module with no seeded solar/stellar answer or legacy day constant');

assert(page.includes("fetch('/api/terra-ship-slip'"));
assert(!page.includes('/api/mintaka/observe'));
assert(!page.includes('/api/sol/observe'));
assert(!page.includes('/api/control'));
assert(!page.includes('method:"POST"'));
assert(!page.includes("method:'POST'"));
assert(!page.includes('method: "POST"'));
assert(!page.includes("method: 'POST'"));
assert(page.includes('TERRA SHIP SLIP'));
console.log('PASS G4B-06 · Terra Ship Slip bench reads the relationship endpoint only and has no browser observation/control POST path');

console.log('');
console.log('PASS · A8-v5.4.20-GATE4B-TERRA-SHIP-SLIP-LIVE-STATIC');
