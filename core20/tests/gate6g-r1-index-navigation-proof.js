'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');

const {
  injectMainLabLink,
  createHardwareLabServer,
} = require(
  '../hardware/a8-postseal-hardware-lab-server'
);

console.log(
  'A8 post-seal hardware branch · Gate 6G R1 index provenance + main-lab navigation proof'
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

for (const inherited of [
  'RUN CORE',
  'PAUSE',
  'RESET ENTIRE LAB',
  'FORGET RECOVERY',
  'ARM MANUAL RECALIBRATION',
  'CHIEF ENGINEER',
  'Three independent recovery channels',
  'Comparator',
  'Divider / qualification',
]) {
  assert(
    index.includes(inherited),
    `restored inherited lab index missing: ${inherited}`
  );
}

console.log(
  'PASS G6G-R1-01 · restored post-seal index retains inherited engineering-lab controls including ARM MANUAL RECALIBRATION'
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
    index.includes(`href="${href}"`),
    `post-seal index missing Gate-6 launcher: ${href}`
  );
}

console.log(
  'PASS G6G-R1-02 · restored inherited index also carries Gate-6A through Gate-6G launchers'
);

{
  const sample =
    '<!doctype html><html><body><h1>X</h1></body></html>';

  const injected =
    injectMainLabLink(sample);

  assert(
    injected.includes(
      '>A8 LAB HOME</a>'
    )
  );

  assert(
    injected.includes(
      'href="/"'
    )
  );

  const already =
    '<html><body><a href="/">A8 LAB HOME</a></body></html>';

  assert.equal(
    injectMainLabLink(already),
    already
  );
}

console.log(
  'PASS G6G-R1-03 · server-layer navigation injection adds one A8 LAB HOME link and leaves pages that already have one untouched'
);

function request(port, pathname) {
  return new Promise(
    (resolve, reject) => {
      const req =
        http.get(
          {
            host: '127.0.0.1',
            port,
            path: pathname,
          },
          res => {
            const chunks = [];

            res.on(
              'data',
              c => chunks.push(c)
            );

            res.on(
              'end',
              () => resolve({
                status:
                  res.statusCode,
                body:
                  Buffer.concat(
                    chunks
                  ).toString('utf8'),
              })
            );
          }
        );

      req.on('error', reject);
    }
  );
}

(async () => {
  const {
    server,
  } =
    createHardwareLabServer();

  await new Promise(
    (resolve, reject) => {
      server.once(
        'error',
        reject
      );

      server.listen(
        0,
        '127.0.0.1',
        resolve
      );
    }
  );

  const port =
    server.address().port;

  try {
    const publicRoot =
      path.join(
        root,
        'public'
      );

    const pages =
      fs.readdirSync(
        publicRoot,
        {
          withFileTypes:
            true,
        }
      )
      .filter(
        e =>
          e.isFile() &&
          e.name.endsWith('.html')
      )
      .map(
        e => e.name
      )
      .sort();

    assert(
      pages.length > 0
    );

    for (const name of pages) {
      const r =
        await request(
          port,
          '/' + name
        );

      assert.equal(
        r.status,
        200,
        `page failed to serve: ${name}`
      );

      assert(
        r.body.includes(
          'A8 LAB HOME'
        ) ||
        r.body.includes(
          'A8 Engineering Lab'
        ),
        `served page lacks main-lab return link: ${name}`
      );
    }

    const rootPage =
      await request(
        port,
        '/'
      );

    assert.equal(
      rootPage.status,
      200
    );

    assert(
      rootPage.body.includes(
        'A8 Time Laboratory v5.4.20'
      )
    );

    assert(
      rootPage.body.includes(
        'Three independent recovery channels'
      )
    );

    assert(
      rootPage.body.includes(
        'A8 LAB HOME'
      )
    );

    console.log(
      `PASS G6G-R1-04 · every served public HTML page (${pages.length}) has a visible link back to the main lab root`
    );

    console.log(
      'PASS G6G-R1-05 · root / remains the Gate-6G Jovian operations page'
    );

  } finally {
    await new Promise(
      resolve =>
        server.close(resolve)
    );
  }

  console.log('');
  console.log(
    'PASS · A8-POSTSEAL-GATE6G-R1-INDEX-PROVENANCE-AND-MAIN-LAB-NAVIGATION'
  );
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
