'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log(
  'A8 post-seal hardware branch · Gate 6G R3.2 hardware-source direct navigation proof'
);

const page =
  fs.readFileSync(
    path.resolve(
      __dirname,
      '..',
      'public',
      'hardware-source.html'
    ),
    'utf8'
  );

assert(
  page.includes(
    'href="/index.html">A8 LAB HOME</a>'
  ),
  'Virtual/Real Pulse Source page lacks direct A8 LAB HOME → /index.html link'
);

assert(
  page.includes(
    'href="/jovian-operations.html">CORE 20 FRONT PAGE</a>'
  ),
  'Virtual/Real Pulse Source page lacks direct CORE 20 FRONT PAGE link'
);

assert(
  !page.includes(
    'href="/">HARDWARE LAB</a>'
  ),
  'obsolete misleading HARDWARE LAB → / link remains'
);

for (const required of [
  'VIRTUAL / REAL PULSE SOURCE',
  'VIRTUAL RIG',
  'REAL HARDWARE',
  'CORE-20 INPUT',
  'SOURCE EPOCH',
]) {
  assert(
    page.includes(required),
    `hardware-source content moved: ${required}`
  );
}

console.log(
  'PASS G6G-R3.2-01 · Virtual/Real Pulse Source has hard-coded A8 LAB HOME → /index.html'
);

console.log(
  'PASS G6G-R3.2-02 · Virtual/Real Pulse Source has hard-coded CORE 20 FRONT PAGE → /jovian-operations.html'
);

console.log(
  'PASS G6G-R3.2-03 · obsolete HARDWARE LAB → / label is removed while source-selector content remains intact'
);

console.log('');
console.log(
  'PASS · A8-POSTSEAL-GATE6G-R3.2-HARDWARE-SOURCE-DIRECT-NAVIGATION'
);
