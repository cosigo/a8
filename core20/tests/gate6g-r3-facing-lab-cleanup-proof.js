'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log(
  'A8 post-seal hardware branch · Gate 6G R3 facing-lab / Chief Engineer cleanup proof'
);

const root =
  path.resolve(
    __dirname,
    '..'
  );

const index =
  fs.readFileSync(
    path.join(
      root,
      'public',
      'index.html'
    ),
    'utf8'
  );

const launcherMatch =
  index.match(
    /<div class="launcher-grid"[^>]*>([\s\S]*?)<\/div>/
  );

assert(
  launcherMatch,
  'public launcher-grid missing'
);

const publicLaunchers =
  launcherMatch[1];

const ceMatch =
  index.match(
    /<details[^>]*id="chief-engineer-links"[^>]*>([\s\S]*?)<\/details>/
  );

assert(
  ceMatch,
  'Chief Engineer link section missing'
);

const chiefEngineer =
  ceMatch[1];

for (const href of [
  '/jovian-operations.html',
  '/mintaka.html',
  '/sol.html',
  '/relationship.html',
  '/clock.html',
  '/moons.html',
  '/audio.html',
  '/angle.html',
  '/quartz.html',
  '/map-clock-compass.html',
  '/navigation.html',
  '/celestial.html',
]) {
  assert(
    publicLaunchers.includes(
      `href="${href}"`
    ),
    `public launcher missing ${href}`
  );
}

console.log(
  'PASS G6G-R3-01 · facing launcher keeps Core-20, Mintaka, Sol, Terra Ship Slip and primary observer/instrument links'
);

const engineeringHrefs = [
  '/data.html',
  '/telescope.html',

  '/discipline.html',
  '/rate-slew.html',
  '/rate-continuity.html',
  '/disturbance-recovery.html',
  '/multi-window-recovery.html',
  '/holdover-reacquisition.html',
  '/repeated-holdover.html',
  '/discipline-harness.html',
  '/discipline-runner.html',
  '/pre-actuator-seal.html',

  '/hardware-interface.html',
  '/receive-only-transport.html',
  '/local-device-reader.html',
  '/pseudo-terminal-link.html',
  '/hardware-source.html',
];

for (const href of engineeringHrefs) {
  assert(
    !publicLaunchers.includes(
      `href="${href}"`
    ),
    `engineering link still facing public launcher: ${href}`
  );

  assert(
    chiefEngineer.includes(
      `href="${href}"`
    ),
    `Chief Engineer section missing ${href}`
  );
}

console.log(
  'PASS G6G-R3-02 · data/replay/hardware/discipline proof plumbing is absent from facing launcher and retained under Chief Engineer'
);

for (const href of [
  '/hardware-interface.html',
  '/receive-only-transport.html',
  '/local-device-reader.html',
  '/pseudo-terminal-link.html',
  '/hardware-source.html',
  '/jovian-operations.html',
]) {
  assert(
    index.includes(
      `href="${href}"`
    ),
    `historical Gate-6 link disappeared from index: ${href}`
  );
}

console.log(
  'PASS G6G-R3-03 · Gate-6A through Gate-6G link provenance remains present in index for inherited proof compatibility'
);

for (const required of [
  'RUN CORE',
  'PAUSE',
  'RESET ENTIRE LAB',
  'FORGET RECOVERY',
  'ARM MANUAL RECALIBRATION',
  'CHIEF ENGINEER',
]) {
  assert(
    index.includes(required),
    `inherited lab control/section missing: ${required}`
  );
}

console.log(
  'PASS G6G-R3-04 · inherited engineering controls remain intact'
);

assert(
  index.includes(
    'CHIEF ENGINEER · ENGINEERING / PROOF GATES'
  )
);

assert(
  index.includes(
    'The links below remain available for engineering, provenance, hardware integration and regression work.'
  )
);

console.log(
  'PASS G6G-R3-05 · Chief Engineer boundary is explicit rather than silently hiding engineering surfaces'
);

console.log('');
console.log(
  'PASS · A8-POSTSEAL-GATE6G-R3-FACING-LAB-CHIEF-ENGINEER-CLEANUP'
);
