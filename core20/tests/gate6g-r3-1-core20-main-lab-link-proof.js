'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log(
  'A8 post-seal hardware branch · Gate 6G R3.1 Core-20 main-lab return-link proof'
);

const pagePath =
  path.resolve(
    __dirname,
    '..',
    'public',
    'jovian-operations.html'
  );

const html =
  fs.readFileSync(
    pagePath,
    'utf8'
  );

assert(
  html.includes(
    'id="core20-main-lab-link"'
  ),
  'Core-20 page lacks hard-coded main-lab link id'
);

assert(
  html.includes(
    'href="/index.html"'
  ),
  'Core-20 page does not link directly to /index.html'
);

assert(
  html.includes(
    'A8 LAB HOME'
  ),
  'Core-20 page lacks visible A8 LAB HOME label'
);

assert(
  html.includes(
    'A8 Time Laboratory v5.4.20'
  ),
  'Core-20 page identity moved'
);

assert(
  html.includes(
    'Three independent recovery channels'
  ),
  'Core-20 Jovian operations content moved'
);

console.log(
  'PASS G6G-R3.1-01 · Core-20 page contains a hard-coded visible A8 LAB HOME → /index.html route'
);

console.log(
  'PASS G6G-R3.1-02 · Core-20 page still contains v5.4.20 Jovian operations identity and three-channel recovery surface'
);

console.log('');
console.log(
  'PASS · A8-POSTSEAL-GATE6G-R3.1-CORE20-MAIN-LAB-RETURN-LINK'
);
