'use strict';

const assert =
  require('assert');

const fs =
  require('fs');

const path =
  require('path');

const {
  A8Core20NativeDittyBridge,
} = require(
  '../observer/a8-core20-native-ditty-bridge'
);

let raw =
  1000n;

let epoch =
  'fixture-epoch';

const bridge =
  new A8Core20NativeDittyBridge({
    getRaw:
      () => raw,

    getSourceEpoch:
      () => epoch,

    getRecurrenceText:
      () =>
        (
          131072n *
          16n
        ).toString() +
        '/1',
  });

const received =
  [];

bridge.onEvent(
  event => {
    received.push(event);
  }
);

const start =
  bridge.arm();

assert.strictEqual(
  start.type,
  'DITTY_START'
);

assert.strictEqual(
  start.state.note,
  'A'
);

assert.strictEqual(
  start.state.cyclesPerA8Second,
  '290'
);

console.log(
  'PASS · native ditty arms from live-style Core20 callbacks'
);

/*
 * First A note occupies slots 0–7.
 * Slot 8 begins C.
 */

raw =
  1008n;

const change =
  bridge.observeCurrentRaw();

assert.strictEqual(
  change.events.length,
  1
);

assert.strictEqual(
  change.events[0].type,
  'NOTE_CHANGE'
);

assert.strictEqual(
  change.events[0].transition.slot,
  '8'
);

assert.strictEqual(
  change.events[0].transition.note,
  'C'
);

assert.strictEqual(
  change.events[0].transition.cyclesPerA8Second,
  '345'
);

console.log(
  'PASS · raw progression crosses exact native note boundary'
);

/*
 * Jump across several native positions.
 * Bridge must preserve every score transition crossed.
 */

raw =
  1032n;

const multi =
  bridge.observeCurrentRaw();

assert(
  multi.events.length > 1
);

assert(
  multi.events.every(
    event =>
      event.type ===
      'NOTE_CHANGE'
  )
);

console.log(
  'PASS · skipped observer positions preserve native note transitions'
);

/*
 * Exact end of 512-position score.
 */

raw =
  1512n;

const done =
  bridge.observeCurrentRaw();

assert.strictEqual(
  done.status,
  'COMPLETE'
);

assert.strictEqual(
  done.state.status,
  'COMPLETE'
);

assert(
  done.events.some(
    event =>
      event.type ===
      'DITTY_COMPLETE'
  )
);

console.log(
  'PASS · native 8-bar score completes at divider position 512'
);

assert(
  received.length > 3
);

assert(
  received.every(
    event =>
      event.definingPathTouched ===
      false
  )
);

console.log(
  'PASS · bridge remains downstream / non-defining'
);

const source =
  fs.readFileSync(
    path.join(
      __dirname,
      '..',
      'observer',
      'a8-core20-native-ditty-bridge.js'
    ),
    'utf8'
  );

for (
  const prohibited of
  [
    /AudioContext/,
    /currentTime/,
    /setTimeout/,
    /setInterval/,
    /Date\(/,
    /performance\./,
    /675\s*\/\s*1024/,
    /\bHz\b/,
  ]
) {
  assert(
    !prohibited.test(source),
    `prohibited dependency: ${prohibited}`
  );
}

console.log(
  'PASS · bridge contains no outside timing/output dependency'
);

console.log();
console.log(
  'PASS · A8-CORE20-NATIVE-DITTY-BRIDGE-PROOF-V1'
);
