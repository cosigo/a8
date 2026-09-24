'use strict';

/*
 * AUSPICIOUS 8 · v5.4.20
 * GATE 5J · PRE-ACTUATOR FULL-TREE SEAL PROOF
 *
 * This gate adds no control behavior.
 *
 * It verifies:
 *   - the fixed Gate-5J seal manifest exists
 *   - every sealed file still hashes exactly
 *   - the current sealed-scope file set equals the manifest file set exactly
 *   - core identity remains the Gate-1 v5.4.20 core seal
 *   - package/VERSION remain 5.4.20
 *
 * Excluded from seal recursion:
 *   node_modules/
 *   _patch_backups/
 *   seals/
 *
 * The seal manifest itself is outside the recursive seal scope to avoid
 * self-referential hashing.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');

const MANIFEST = path.join(
  ROOT,
  'seals',
  'v5_4_20-gate5j-pre-actuator-tree.sha256'
);

const EXPECTED_CORE_HASH =
  process.env.A8_EXPECT_CORE_HASH ||
  '03fcd1f5bc90354e616d4787558a4bdfecd7a259ccc986e61668fc6a8104a699';

function sha256File(file) {
  return crypto
    .createHash('sha256')
    .update(fs.readFileSync(file))
    .digest('hex');
}

function shouldExclude(rel) {
  return (
    rel === 'node_modules' ||
    rel.startsWith('node_modules/') ||
    rel === '_patch_backups' ||
    rel.startsWith('_patch_backups/') ||
    rel === 'seals' ||
    rel.startsWith('seals/')
  );
}

function walk(dir, base = ROOT, out = []) {
  const entries = fs.readdirSync(dir, {
    withFileTypes: true,
  });

  entries.sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const absolute = path.join(dir, entry.name);
    const rel = path
      .relative(base, absolute)
      .split(path.sep)
      .join('/');

    if (shouldExclude(rel)) {
      continue;
    }

    if (entry.isDirectory()) {
      walk(absolute, base, out);
      continue;
    }

    if (entry.isFile()) {
      out.push(rel);
    }
  }

  return out;
}

function parseManifest(text) {
  const map = new Map();

  for (const line of text.split('\n')) {
    if (!line.trim()) continue;

    const match = line.match(
      /^([a-f0-9]{64})\s+\*?(.+)$/
    );

    if (!match) {
      throw new Error(
        `invalid Gate-5J seal manifest line: ${line}`
      );
    }

    const rel = match[2].replace(/^\.\//, '');

    if (shouldExclude(rel)) {
      throw new Error(
        `manifest illegally contains excluded path: ${rel}`
      );
    }

    if (map.has(rel)) {
      throw new Error(
        `duplicate path in Gate-5J seal manifest: ${rel}`
      );
    }

    map.set(rel, match[1]);
  }

  return map;
}

console.log('A8 v5.4.20 Gate 5J · pre-actuator full-tree seal proof');

assert(
  fs.existsSync(MANIFEST),
  'Gate-5J seal manifest is missing'
);

const manifest = parseManifest(
  fs.readFileSync(MANIFEST, 'utf8')
);

assert(
  manifest.size > 0,
  'Gate-5J seal manifest is empty'
);

console.log(
  `PASS G5J-01 · seal manifest exists with ${manifest.size} sealed files`
);

const currentFiles = walk(ROOT).sort();
const manifestFiles = [...manifest.keys()].sort();

assert.deepEqual(
  currentFiles,
  manifestFiles,
  'sealed-scope file set differs from Gate-5J manifest'
);

console.log(
  'PASS G5J-02 · current sealed-scope file set equals manifest file set exactly'
);

for (const rel of manifestFiles) {
  const actual = sha256File(
    path.join(ROOT, rel)
  );

  assert.equal(
    actual,
    manifest.get(rel),
    `Gate-5J hash mismatch: ${rel}`
  );
}

console.log(
  'PASS G5J-03 · every sealed v5.4.20 tree file matches its exact Gate-5J SHA-256'
);

assert.equal(
  manifest.get('core/a8-core.js'),
  EXPECTED_CORE_HASH,
  'Gate-5J manifest does not preserve Gate-1 core seal'
);

assert.equal(
  sha256File(
    path.join(ROOT, 'core', 'a8-core.js')
  ),
  EXPECTED_CORE_HASH,
  'current core hash moved from Gate-1 seal'
);

console.log(
  'PASS G5J-04 · Gate-1 v5.4.20 core seal remains exact inside Gate-5J checkpoint'
);

const pkg = JSON.parse(
  fs.readFileSync(
    path.join(ROOT, 'package.json'),
    'utf8'
  )
);

assert.equal(
  pkg.version,
  '5.4.20',
  'package identity moved'
);

assert.equal(
  fs.readFileSync(
    path.join(ROOT, 'VERSION'),
    'utf8'
  ).trim(),
  '5.4.20',
  'VERSION identity moved'
);

console.log(
  'PASS G5J-05 · package and VERSION identities remain v5.4.20'
);

for (const required of [
  'observer/a8-jovian-slow-discipline-candidate.js',
  'observer/a8-bounded-rate-slew-simulator.js',
  'observer/a8-synthetic-rate-continuity-plant.js',

  'experiments/a8-synthetic-disturbance-recovery.js',
  'experiments/a8-multi-window-jovian-retarget.js',
  'experiments/a8-jovian-holdover-reacquisition.js',
  'experiments/a8-repeated-jovian-holdover-reacquisition.js',
  'experiments/a8-synthetic-discipline-harness.js',
  'experiments/gate5i-example-discipline-script.json',

  'tools/a8-discipline-runner.js',

  'tests/jovian-slow-discipline-candidate-proof.js',
  'tests/bounded-rate-slew-simulator-proof.js',
  'tests/synthetic-rate-continuity-plant-proof.js',
  'tests/synthetic-disturbance-recovery-proof.js',
  'tests/multi-window-jovian-retarget-proof.js',
  'tests/jovian-holdover-reacquisition-proof.js',
  'tests/repeated-jovian-holdover-reacquisition-proof.js',
  'tests/synthetic-discipline-harness-proof.js',
  'tests/discipline-runner-proof.js',
]) {
  assert(
    manifest.has(required),
    `Gate-5J manifest missing slow-discipline checkpoint file: ${required}`
  );
}

console.log(
  'PASS G5J-06 · complete Gate-5A through Gate-5I slow-discipline implementation/proof set is inside the sealed tree'
);

for (const required of [
  'observer/a8-mintaka-observer.js',
  'observer/a8-sol-observer.js',
  'observer/a8-mintaka-sol-relationship.js',
  'observer/a8-terra-ship-slip-accumulator.js',
  'server.js',
  'tests/run-tests.js',
]) {
  assert(
    manifest.has(required),
    `Gate-5J manifest missing upstream v20 file: ${required}`
  );
}

console.log(
  'PASS G5J-07 · upstream Mintaka/Sol/Terra Ship Slip/server/base-test tree is sealed with the slow-discipline branch'
);

assert(
  manifest.has('tests/gate5j-pre-actuator-seal-proof.js'),
  'Gate-5J proof itself is not inside sealed tree scope'
);

assert(
  manifest.has('public/pre-actuator-seal.html'),
  'Gate-5J presentation is not inside sealed tree scope'
);

console.log(
  'PASS G5J-08 · Gate-5J static proof and presentation are themselves part of the sealed tree'
);

console.log('');
console.log(
  'PASS · A8-v5.4.20-GATE5J-PRE-ACTUATOR-FULL-TREE-SEALED'
);
