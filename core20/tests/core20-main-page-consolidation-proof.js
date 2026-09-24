'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');

const {
  staticPathFor,
  createHardwareLabServer,
} = require(
  '../hardware/a8-postseal-hardware-lab-server'
);

console.log(
  'A8 v5.4.20 · Core-20 Main-Page Consolidation 01 proof'
);

assert.equal(
  path.basename(staticPathFor('/')),
  'index.html'
);

const publicRoot = path.resolve(
  __dirname,
  '..',
  'public'
);

const index = fs.readFileSync(
  path.join(publicRoot, 'index.html'),
  'utf8'
);

assert(index.includes('id="lab-modules"'));
assert(index.includes('ARM MANUAL RECALIBRATION'));

console.log(
  'PASS C20M-01 · original A8 engineering Main Lab remains the root instrument'
);

assert.equal(
  (index.match(/id="core20-jovian"/g) || []).length,
  1
);

assert(
  index.includes(
    'CORE 20 · JUPITER · POST-SEAL TIMEKEEPER'
  )
);

for (const id of [
  'c20Source',
  'c20Epoch',
  'c20Rig',
  'c20Raw',
  'c20Input',
  'c20Recovery',
  'c20Ruler',
  'c20Qualified',
  'c20TkStatus',
  'c20Phase9',
  'c20Cycles',
  'c20Subphase',
]) {
  assert(
    index.includes(`id="${id}"`),
    `Main Lab missing integrated Core-20 field ${id}`
  );
}

console.log(
  'PASS C20M-02 · selected-source, Gate-6F, Jovian ruler and Gate-6H continuous phase state are integrated into Main Lab'
);

for (const text of [
  'DAY_PHASE17 NOT YET DRIVEN',
  'PHASE20 NOT YET DRIVEN',
  'no Earth-day',
]) {
  assert(
    index.toLowerCase().includes(
      text.toLowerCase()
    ),
    `Earth-day boundary missing: ${text}`
  );
}

console.log(
  'PASS C20M-03 · Main Lab preserves explicit no-invented-Earth-day boundary'
);

for (const endpoint of [
  '/api/hardware/source',
  '/api/hardware/jovian/fixture/run',
  '/api/hardware/jovian/fixture/next',
  '/api/hardware/jovian/forget',
  '/api/hardware/virtual/advance',
]) {
  assert(
    index.includes(endpoint),
    `integrated Core-20 UI missing endpoint ${endpoint}`
  );
}

console.log(
  'PASS C20M-04 · integrated controls use the already-proven post-seal APIs'
);

const oldPage = fs.readFileSync(
  path.join(publicRoot, 'jovian-operations.html'),
  'utf8'
);

assert(
  oldPage.includes(
    "location.replace('/#core20-jovian')"
  )
);

assert(
  !oldPage.includes(
    'Three independent recovery channels'
  )
);

assert(
  !oldPage.includes(
    'JOVIAN A8 PHASE9'
  )
);

console.log(
  'PASS C20M-05 · jovian-operations.html is no longer an operating instrument; it is compatibility redirect only'
);

const offenders = [];

for (const name of fs.readdirSync(publicRoot)) {
  if (!name.endsWith('.html')) continue;
  if (name === 'jovian-operations.html') continue;

  const html = fs.readFileSync(
    path.join(publicRoot, name),
    'utf8'
  );

  if (
    html.includes(
      'href="/jovian-operations.html"'
    )
  ) {
    offenders.push(name);
  }
}

assert.deepEqual(
  offenders,
  []
);

console.log(
  'PASS C20M-06 · no public page links to the retired Jovian operations page'
);

assert(
  index.includes(
    'href="/#core20-jovian"'
  )
);

console.log(
  'PASS C20M-07 · Core-20 links land on the integrated section of A8 Lab Home'
);

function request(port, pathname) {
  return new Promise(
    (resolve, reject) => {
      const req = http.get(
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
              status: res.statusCode,
              body:
                Buffer.concat(chunks)
                  .toString('utf8'),
            })
          );
        }
      );

      req.on('error', reject);
    }
  );
}

(async () => {
  const {server} =
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
    const root =
      await request(
        port,
        '/'
      );

    assert.equal(
      root.status,
      200
    );

    assert(
      root.body.includes(
        'id="core20-jovian"'
      )
    );

    assert(
      root.body.includes(
        'ARM MANUAL RECALIBRATION'
      )
    );

    console.log(
      'PASS C20M-08 · served / is one combined original Main Lab + Core-20 operating surface'
    );

    const old =
      await request(
        port,
        '/jovian-operations.html'
      );

    assert.equal(
      old.status,
      200
    );

    assert(
      old.body.includes(
        "location.replace('/#core20-jovian')"
      )
    );

    console.log(
      'PASS C20M-09 · old Jovian URL cannot expose a second operating surface'
    );

    const source =
      await request(
        port,
        '/api/hardware/source'
      );

    assert.equal(
      source.status,
      200
    );

    const parsed =
      JSON.parse(
        source.body
      );

    assert.equal(
      parsed.ok,
      true
    );

    assert(
      parsed.recoveryInput
    );

    assert(
      parsed.jovian
    );

    assert(
      parsed.timekeeper
    );

    console.log(
      'PASS C20M-10 · combined Main Lab is backed by the current Gate-6F/G/H post-seal state API'
    );

  } finally {
    await new Promise(
      resolve =>
        server.close(resolve)
    );
  }

  console.log('');
  console.log(
    'PASS · A8-v5.4.20-POSTSEAL-CORE20-MAIN-PAGE-CONSOLIDATION-01'
  );
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
