'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const serverPath = path.join(root, 'server.js');
const corePath = path.join(root, 'core', 'a8-core.js');
const accumulatorPath = path.join(
  root,
  'observer',
  'a8-terra-ship-slip-accumulator.js'
);
const pagePath = path.join(root, 'public', 'relationship.html');

const server = fs.readFileSync(serverPath, 'utf8');
const core = fs.readFileSync(corePath, 'utf8');
const accumulator = fs.readFileSync(accumulatorPath, 'utf8');
const page = fs.readFileSync(pagePath, 'utf8');

console.log('A8 v5.4.20 Gate 4D · Terra Ship Slip event-triggered accumulator wiring proof');

assert(
  server.includes("require('./observer/a8-terra-ship-slip-accumulator')"),
  'Terra Ship Slip accumulator import missing'
);
assert(
  server.includes('new TerraShipSlipAccumulator()'),
  'Terra Ship Slip accumulator instance missing'
);
assert(
  server.includes('function updateTerraShipSlipAccumulator(trigger)'),
  'event-triggered accumulator helper missing'
);
assert(
  server.includes("url.pathname === '/api/terra-ship-slip/accumulator'"),
  'read-only accumulator state endpoint missing'
);
console.log('PASS G4D-01 · server owns one downstream Terra Ship Slip accumulator and exposes a GET-only accumulator state endpoint');

const helperStart = server.indexOf(
  'function updateTerraShipSlipAccumulator(trigger)'
);
const serverStart = server.indexOf(
  'const server = http.createServer(async (req, res) => {',
  helperStart
);

assert(helperStart >= 0, 'accumulator helper start missing');
assert(serverStart > helperStart, 'accumulator helper end anchor missing');

const helper = server.slice(helperStart, serverStart);

for (const forbidden of [
  'core.',
  '/api/control',
  'handleControl',
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
    !helper.includes(forbidden),
    `accumulator helper contains forbidden upstream dependency: ${forbidden}`
  );
}

assert(helper.includes('mintakaObserver.snapshot()'));
assert(helper.includes('solObserver.snapshot()'));
assert(helper.includes('deriveMintakaSolRelationship('));
assert(helper.includes('terraShipSlipAccumulator.ingest(relationship)'));
console.log('PASS G4D-02 · downstream helper reads observer snapshots, derives relationship, and ingests accumulator without any core/control path');

const mintakaPostStart = server.indexOf(
  "if (req.method === 'POST' && url.pathname === '/api/mintaka/observe')"
);
const solGetStart = server.indexOf(
  "if (req.method === 'GET' && url.pathname === '/api/sol')",
  mintakaPostStart
);

assert(mintakaPostStart >= 0 && solGetStart > mintakaPostStart);
const mintakaPost = server.slice(mintakaPostStart, solGetStart);

assert(mintakaPost.includes('mintakaObserver.observe(event)'));
assert(
  mintakaPost.includes("updateTerraShipSlipAccumulator('MINTAKA_OBSERVATION')"),
  'Mintaka event does not trigger downstream Terra Ship Slip update'
);
console.log('PASS G4D-03 · each accepted Mintaka observation explicitly triggers one downstream Terra Ship Slip update');

const solPostStart = server.indexOf(
  "if (req.method === 'POST' && url.pathname === '/api/sol/observe')"
);
const relationshipGetStart = server.indexOf(
  "if (req.method === 'GET' && url.pathname === '/api/terra-ship-slip')",
  solPostStart
);

assert(solPostStart >= 0 && relationshipGetStart > solPostStart);
const solPost = server.slice(solPostStart, relationshipGetStart);

assert(solPost.includes('solObserver.observe(event)'));
assert(
  solPost.includes("updateTerraShipSlipAccumulator('SOL_OBSERVATION')"),
  'Sol event does not trigger downstream Terra Ship Slip refresh'
);
console.log('PASS G4D-04 · each accepted Sol observation explicitly triggers downstream relationship refresh without pretending a new rotation occurred');

const relationshipRouteStart = server.indexOf(
  "if (req.method === 'GET' && url.pathname === '/api/terra-ship-slip')"
);
const dataAnchor = server.indexOf(
  "if (req.method === 'GET' && url.pathname === '/api/data/inventory')",
  relationshipRouteStart
);

assert(relationshipRouteStart >= 0 && dataAnchor > relationshipRouteStart);
const getRoutes = server.slice(relationshipRouteStart, dataAnchor);

assert(
  getRoutes.includes("url.pathname === '/api/terra-ship-slip/accumulator'"),
  'accumulator GET route missing from relationship route region'
);
assert(
  !getRoutes.includes('terraShipSlipAccumulator.ingest('),
  'GET route must never ingest/accumulate Terra Ship Slip'
);
assert(
  !getRoutes.includes('updateTerraShipSlipAccumulator('),
  'GET route must never trigger Terra Ship Slip accumulation'
);
console.log('PASS G4D-05 · relationship and accumulator GET routes are observational only; GET polling cannot accumulate slip');

assert(!core.includes('TerraShipSlipAccumulator'));
assert(!core.includes('/api/terra-ship-slip/accumulator'));
console.log('PASS G4D-06 · A8Core remains unaware of Terra Ship Slip accumulator and its endpoint');

for (const forbidden of [
  '2398634',
  '599658',
  '599622',
  '599695',
  '598016',
  '365.25',
  '86400',
  '364.088',
  '45/32',
]) {
  assert(
    !accumulator.includes(forbidden),
    `accumulator contains forbidden seeded/legacy value: ${forbidden}`
  );
}
console.log('PASS G4D-07 · live wiring preserves the unchanged Gate-4C accumulator with no seeded closure/year/day answer');

assert(page.includes("fetch('/api/terra-ship-slip'"));
assert(page.includes("fetch('/api/terra-ship-slip/accumulator'"));
assert(!page.includes('/api/mintaka/observe'));
assert(!page.includes('/api/sol/observe'));
assert(!page.includes('/api/control'));
assert(!page.includes('method:"POST"'));
assert(!page.includes("method:'POST'"));
assert(!page.includes('method: "POST"'));
assert(!page.includes("method: 'POST'"));
console.log('PASS G4D-08 · Terra Ship Slip bench reads live relationship + accumulator state only and has no browser write path');

console.log('');
console.log('PASS · A8-v5.4.20-GATE4D-TERRA-SHIP-SLIP-EVENT-WIRING-STATIC');
