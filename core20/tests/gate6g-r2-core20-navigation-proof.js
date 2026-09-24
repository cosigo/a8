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
  'A8 post-seal hardware branch · Gate 6G R2 Core-20 front-page navigation proof'
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
            chunk => chunks.push(chunk)
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

      req.on(
        'error',
        reject
      );
    }
  );
}

{
  const sample =
    '<!doctype html><html><body><h1>TEST</h1></body></html>';

  const out =
    injectMainLabLink(sample);

  assert(
    out.includes(
      'id="a8-global-lab-navigation"'
    )
  );

  assert(
    out.includes(
      'href="/index.html"'
    )
  );

  assert(
    out.includes(
      '>A8 LAB HOME</a>'
    )
  );

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

  assert.equal(
    (
      injectMainLabLink(out)
        .match(
          /id="a8-global-lab-navigation"/g
        ) || []
    ).length,
    1
  );
}

console.log(
  'PASS G6G-R2-01 · global served-page navigation explicitly exposes A8 LAB HOME and CORE 20 FRONT PAGE without duplicate injection'
);

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
        entry =>
          entry.name
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
          'href="/index.html"'
        ),
        `${page} lacks A8 LAB HOME target`
      );

      assert(
        r.body.includes(
          '>A8 LAB HOME</a>'
        ),
        `${page} lacks A8 LAB HOME label`
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
    }

    console.log(
      `PASS G6G-R2-02 · every served public HTML page (${pages.length}) visibly links to both lab home and Core-20 front page`
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

    assert(
      hub.body.includes(
        'CORE 20 FRONT PAGE'
      )
    );

    console.log(
      'PASS G6G-R2-03 · inherited engineering hub /index.html remains intact and visibly links to Core-20 front page'
    );

    const core20 =
      await request(
        port,
        '/jovian-operations.html'
      );

    assert.equal(
      core20.status,
      200
    );

    assert(
      core20.body.includes(
        'A8 Time Laboratory v5.4.20'
      )
    );

    assert(
      core20.body.includes(
        'Three independent recovery channels'
      )
    );

    console.log(
      'PASS G6G-R2-04 · explicit Core-20 front-page target is the Jovian operations surface'
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

    console.log(
      'PASS G6G-R2-05 · root / continues to resolve to the Core-20 Jovian front page'
    );

  } finally {
    await new Promise(
      resolve =>
        server.close(resolve)
    );
  }

  console.log('');
  console.log(
    'PASS · A8-POSTSEAL-GATE6G-R2-CORE20-FRONTPAGE-NAVIGATION'
  );
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
