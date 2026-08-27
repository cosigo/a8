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
  'A8 v5.4.20 · post-seal TOPSIDE COHERENCE 01 proof'
);

assert.equal(
  path.basename(
    staticPathFor('/')
  ),
  'index.html'
);

console.log(
  'PASS TC01-01 · / resolves to Main Lab index.html, not Core-20 Jovian Operations'
);

const primary = [
  ['index.html', 'YOU ARE HERE · MAIN LAB'],
  ['jovian-operations.html', 'YOU ARE HERE · CORE 20 · JUPITER NATURAL TIMEKEEPER'],
  ['mintaka.html', 'YOU ARE HERE · MINTAKA · EARTH AXIAL ROTATION'],
  ['sol.html', 'YOU ARE HERE · SOL · EARTH ORBITAL ADVANCE'],
  ['relationship.html', 'YOU ARE HERE · TERRA SHIP SLIP · ROTATION / ORBIT RELATIONSHIP'],
  ['hardware-source.html', 'YOU ARE HERE · CHIEF ENGINEER · VIRTUAL / REAL PULSE SOURCE'],
];

for (const [name, role] of primary) {
  const html =
    fs.readFileSync(
      path.resolve(
        __dirname,
        '..',
        'public',
        name
      ),
      'utf8'
    );

  assert.equal(
    (
      html.match(
        /id="a8-topside-system-nav"/g
      ) || []
    ).length,
    1,
    `${name} must contain exactly one top-side system nav`
  );

  assert(
    html.includes(role),
    `${name} role banner missing`
  );

  for (const href of [
    '/',
    '/jovian-operations.html',
    '/mintaka.html',
    '/sol.html',
    '/relationship.html',
    '/index.html#chief-engineer-links',
  ]) {
    assert(
      html.includes(
        `href="${href}"`
      ),
      `${name} missing ${href}`
    );
  }

  assert(
    !html.includes(
      'ENGINEERING HUB'
    ),
    `${name} still carries obsolete ENGINEERING HUB label`
  );
}

console.log(
  'PASS TC01-02 · Main Lab, Core 20, Mintaka, Sol, Terra Ship Slip and Pulse Source share one explicit navigation model'
);

const index =
  fs.readFileSync(
    path.resolve(
      __dirname,
      '..',
      'public',
      'index.html'
    ),
    'utf8'
  );

assert(
  index.includes(
    'id="chief-engineer-links"'
  )
);

console.log(
  'PASS TC01-03 · Chief Engineer is one explicit Main-Lab destination rather than a competing home page'
);

const core20 =
  fs.readFileSync(
    path.resolve(
      __dirname,
      '..',
      'public',
      'jovian-operations.html'
    ),
    'utf8'
  );

assert(
  core20.includes(
    'JOVIAN A8 PHASE9'
  )
);

assert(
  !core20.includes(
    'id="core20-main-lab-link"'
  )
);

console.log(
  'PASS TC01-04 · Core-20 page remains the Gate-6H Jovian timekeeper surface, with redundant one-off back-button removed'
);

const hardware =
  fs.readFileSync(
    path.resolve(
      __dirname,
      '..',
      'public',
      'hardware-source.html'
    ),
    'utf8'
  );

for (const href of [
  '/hardware-interface.html',
  '/receive-only-transport.html',
  '/local-device-reader.html',
  '/pseudo-terminal-link.html',
]) {
  assert(
    hardware.includes(
      `href="${href}"`
    ),
    `hardware engineering chain lost ${href}`
  );
}

console.log(
  'PASS TC01-05 · Gate-6A–6D remain available as a local Chief-Engineer hardware chain, not top-level homes'
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
                status: res.statusCode,
                body:
                  Buffer.concat(chunks)
                    .toString('utf8'),
              })
            );
          }
        );

      req.on(
        'error',
        reject
      );
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
        'YOU ARE HERE · MAIN LAB'
      )
    );

    assert(
      root.body.includes(
        'ARM MANUAL RECALIBRATION'
      )
    );

    assert(
      !root.body.includes(
        'id="a8-core20-global-navigation"'
      )
    );

    const core =
      await request(
        port,
        '/jovian-operations.html'
      );

    assert.equal(
      core.status,
      200
    );

    assert(
      core.body.includes(
        'YOU ARE HERE · CORE 20 · JUPITER NATURAL TIMEKEEPER'
      )
    );

    assert(
      core.body.includes(
        'JOVIAN A8 PHASE9'
      )
    );

    assert(
      !core.body.includes(
        'id="a8-core20-global-navigation"'
      )
    );

    console.log(
      'PASS TC01-06 · served / is visibly Main Lab; served /jovian-operations.html is visibly Core 20; floating compatibility nav is gone'
    );

    for (const pathname of [
      '/mintaka.html',
      '/sol.html',
      '/relationship.html',
      '/hardware-source.html',
    ]) {
      const r =
        await request(
          port,
          pathname
        );

      assert.equal(
        r.status,
        200,
        pathname
      );

      assert.equal(
        (
          r.body.match(
            /id="a8-topside-system-nav"/g
          ) || []
        ).length,
        1,
        `${pathname} served with duplicate system nav`
      );
    }

    console.log(
      'PASS TC01-07 · named top-side pages serve with exactly one coherent system navigation'
    );

    const state =
      await request(
        port,
        '/api/state'
      );

    assert.equal(
      state.status,
      200
    );

    const parsed =
      JSON.parse(
        state.body
      );

    assert.equal(
      parsed.version,
      '5.4.20'
    );

    assert.equal(
      parsed.writesClock,
      false
    );

    console.log(
      'PASS TC01-08 · top-side routing cleanup does not alter Gate-6I selected-source API authority boundary'
    );

  } finally {
    await new Promise(
      resolve =>
        server.close(resolve)
    );
  }

  console.log('');
  console.log(
    'PASS · A8-v5.4.20-POSTSEAL-TOPSIDE-COHERENCE-01'
  );
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
