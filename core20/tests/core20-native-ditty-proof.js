'use strict';

const fs =
  require('fs');

const assert =
  require('assert');

const path =
  require('path');

const {
  A8Core20NativeDitty,
  NOTE_SCALE,
  SCORE,
  SCORE_SLOTS,
  BAR_COUNT,
  BAR_SLOTS,
} = require(
  '../observer/a8-core20-native-ditty'
);

function pass(message) {
  console.log(
    `PASS · ${message}`
  );
}

assert.strictEqual(
  BAR_COUNT,
  8n
);

assert.strictEqual(
  BAR_SLOTS,
  64n
);

assert.strictEqual(
  SCORE_SLOTS,
  512n
);

pass(
  '8 bars × 64 native divider slots = 512'
);

const durations =
  new Set(
    SCORE.map(
      event =>
        event.durationA8
    )
  );

for (
  const expected of
  [
    '1',
    '1/2',
    '1/4',
    '1/8',
    '1/16',
  ]
) {
  assert(
    durations.has(expected),
    `missing native duration ${expected}`
  );
}

pass(
  'score uses 1 · 1/2 · 1/4 · 1/8 · 1/16 A8-second divisions'
);

assert.deepStrictEqual(
  NOTE_SCALE,
  {
    A: 290,
    'A#': 307,
    B: 325,
    C: 345,
    'C#': 365,
    D: 387,
    'D#': 410,
    E: 435,
    F: 460,
    'F#': 487,
    G: 516,
    'G#': 548,
  }
);

pass(
  'native A8 pitch table preserved exactly'
);

/*
 * Synthetic native fixture only:
 *
 * 2^17 × 16 raw counts / Sun return
 *
 * therefore one fixture raw increment crosses exactly
 * one 1/16-A8-second divider position.
 *
 * This fixture is used only to prove divider arithmetic.
 */

const fixtureRawPerSunReturn =
  (
    131072n *
    16n
  ).toString() +
  '/1';

const ditty =
  new A8Core20NativeDitty();

const initial =
  ditty.arm({
    sourceEpoch:
      'fixture-epoch',

    rawPulse:
      '1000',

    rawPerSunReturn:
      fixtureRawPerSunReturn,
  });

assert.strictEqual(
  initial.status,
  'PLAYING'
);

assert.strictEqual(
  initial.totalDividerSlot,
  '0'
);

assert.strictEqual(
  initial.bar,
  1
);

assert.strictEqual(
  initial.note,
  'A'
);

assert.strictEqual(
  initial.cyclesPerA8Second,
  '290'
);

pass(
  'ditty arms directly on selected raw coordinate'
);

const oneSlot =
  ditty.observe({
    sourceEpoch:
      'fixture-epoch',

    rawPulse:
      '1001',
  });

assert.strictEqual(
  oneSlot.state.totalDividerSlot,
  '1'
);

pass(
  'exact first 1/16 divider crossing'
);

const barTwo =
  ditty.observe({
    sourceEpoch:
      'fixture-epoch',

    rawPulse:
      String(
        1000n + 64n
      ),
  });

assert.strictEqual(
  barTwo.state.bar,
  2
);

assert.strictEqual(
  barTwo.state.slotInBar,
  '0'
);

pass(
  'exact native bar boundary at 64 divider slots'
);

const finalPlaying =
  ditty.observe({
    sourceEpoch:
      'fixture-epoch',

    rawPulse:
      String(
        1000n + 511n
      ),
  });

assert.strictEqual(
  finalPlaying.state.status,
  'PLAYING'
);

assert.strictEqual(
  finalPlaying.state.totalDividerSlot,
  '511'
);

assert.strictEqual(
  finalPlaying.state.bar,
  8
);

pass(
  'final native score position is slot 511'
);

const complete =
  ditty.observe({
    sourceEpoch:
      'fixture-epoch',

    rawPulse:
      String(
        1000n + 512n
      ),
  });

assert.strictEqual(
  complete.state.status,
  'COMPLETE'
);

assert.strictEqual(
  complete.state.totalDividerSlot,
  '512'
);

pass(
  '8-bar ditty completes exactly at native divider slot 512'
);

const sourceText =
  fs.readFileSync(
    path.join(
      __dirname,
      '..',
      'observer',
      'a8-core20-native-ditty.js'
    ),
    'utf8'
  );

const prohibited =
  [
    /\bDate\b/,
    /\bperformance\b/,
    /AudioContext/,
    /currentTime/,
    /setTimeout/,
    /setInterval/,
    /675\s*\/\s*1024/,
    /\bHOST_DAY\b/,
    /\bHOST_DAY_MS\b/,
    /\bHOST_DAY_NS\b/,
    /\bHz\b/,
  ];

for (const pattern of prohibited) {
  assert(
    !pattern.test(sourceText),
    `prohibited dependency found: ${pattern}`
  );
}

pass(
  'native ditty module contains no outside timing/output dependency'
);

console.log();
console.log(
  'PASS · A8-CORE20-NATIVE-DITTY-PROOF-V1'
);
