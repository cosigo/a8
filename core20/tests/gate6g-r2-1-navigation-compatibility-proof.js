'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');

const {
  injectMainLabLink,
  injectCore20Navigation,
  createHardwareLabServer,
} = require(
  '../hardware/a8-postseal-hardware-lab-server'
);

console.log(
  'A8 post-seal hardware branch · Gate 6G R2.1 navigation compatibility proof'
);

// Preserve the exact R1 semantic contract.
{
  const already =
    '<html><body><a href="/">A8 LAB HOME</a></body></html>';

  assert.equal(
    injectMainLabLink(already),
    already
  );
}

console.log(
  'PASS G6G-R2.1-01 · historical R1 A8 LAB HOME injection semantics remain byte-for-byte compatible'
);

// New Core-20 layer is independent and idempotent.
{
  const sample =
    '<html><body><a href="/">A8 LAB HOME</a></body></html>';

  const out =
    injectCore20Navigation(sample);

  assert(
    out.includes(
      'href="/jovian-operations.html"'
    )
  );

  assert(
    out.includes(
      '>CORE 20 FRONT PAGE</a>'
    )
  );

  assert(
    out.includes(
      'href="/index.html"'
    )
  );

  assert(
    out.includes(
      '>ENGINEERING HUB</a>'
    )
  );

  assert.equal(
    (
      injectCore20Navigation(out)
        .match(
          /id="a8-core20-global-navigation"/g
        ) || []
    ).length,
    1
  );
}

console.log(
  'PASS G6G-R2.1-02 · independent Core-20 navigation layer adds explicit front-page and engineering-hub links without changing R1 logic'
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
                  ).toString(
                    'utf8'
                  ),
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
    const publicRoot =
      path.resolve(
        __dirname,
        '..',
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
        entry =>
          entry.isFile() &&
          entry.name.endsWith(
            '.html'
          )
      )
      .map(
        entry => entry.name
      )
      .sort();

    assert(
      pages.length > 0
    );

    for (const page of pages) {
      const r =
        await request(
          port,
          '/' + page
        );

      assert.equal(
        r.status,
        200,
        `failed to serve ${page}`
      );

      assert(
        r.body.includes(
          'A8 LAB HOME'
        ) ||
        r.body.includes(
          'A8 Engineering Lab'
        ),
        `${page} lacks main-lab return link`
      );

      assert(
        r.body.includes(
          'href="/jovian-operations.html"'
        ),
        `${page} lacks Core-20 front-page target`
      );

      assert(
        r.body.includes(
          '>CORE 20 FRONT PAGE</a>'
        ),
        `${page} lacks Core-20 front-page label`
      );

      assert(
        r.body.includes(
          'href="/index.html"'
        ),
        `${page} lacks engineering-hub target`
      );
    }

    console.log(
      `PASS G6G-R2.1-03 · every served public HTML page (${pages.length}) exposes main-lab return plus explicit Core-20 front page and engineering hub`
    );

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
        'A8 Time Laboratory v5.4.20'
      )
    );

    const hub =
      await request(
        port,
        '/index.html'
      );

    assert.equal(
      hub.status,
      200
    );

    assert(
      hub.body.includes(
        'ARM MANUAL RECALIBRATION'
      )
    );

    console.log(
      'PASS G6G-R2.1-04 · root remains Core-20 Jovian operations and /index.html remains inherited engineering hub'
    );

  } finally {
    await new Promise(
      resolve =>
        server.close(resolve)
    );
  }

  console.log('');
  console.log(
    'PASS · A8-POSTSEAL-GATE6G-R2.1-NAVIGATION-COMPATIBILITY'
  );
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
