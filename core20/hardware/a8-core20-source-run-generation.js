'use strict';

const fs = require('fs');
const path = require('path');

const SCHEMA =
  'A8-CORE20-SOURCE-RUN-GENERATION-V1';

function parseGeneration(value) {
  const text =
    String(value ?? '');

  if (!/^(0|[1-9][0-9]*)$/.test(text)) {
    throw new Error(
      'source run generation must be a non-negative integer'
    );
  }

  return BigInt(text);
}

function allocateSourceRunGeneration(
  checkpointPath
) {
  if (
    typeof checkpointPath !== 'string' ||
    checkpointPath.length === 0
  ) {
    throw new TypeError(
      'source run generation checkpoint path required'
    );
  }

  let previous = 0n;

  if (
    fs.existsSync(
      checkpointPath
    )
  ) {
    const parsed =
      JSON.parse(
        fs.readFileSync(
          checkpointPath,
          'utf8'
        )
      );

    if (
      !parsed ||
      parsed.schema !== SCHEMA
    ) {
      throw new Error(
        'unsupported source run generation checkpoint schema'
      );
    }

    previous =
      parseGeneration(
        parsed.sourceRunGeneration
      );
  }

  const next =
    previous + 1n;

  const payload = {
    schema:
      SCHEMA,

    sourceRunGeneration:
      next.toString(),

    previousSourceRunGeneration:
      previous.toString(),

    role:
      'PERSISTENT_CORE20_PROCESS_RAW_CONTINUITY_DISCRIMINATOR',

    definesElapsedTime:
      false,

    definesRawPulse:
      false,

    changesAuthority:
      false,

    usesUTC:
      false,

    usesHostTime:
      false,

    usesLegacyTime:
      false,

    usesFrequencyHz:
      false,

    infersOutageElapsedTime:
      false,
  };

  const dir =
    path.dirname(
      checkpointPath
    );

  fs.mkdirSync(
    dir,
    {
      recursive: true,
      mode: 0o750,
    }
  );

  const tmp =
    `${checkpointPath}.tmp-${process.pid}`;

  const fd =
    fs.openSync(
      tmp,
      'w',
      0o600
    );

  try {
    fs.writeFileSync(
      fd,
      JSON.stringify(
        payload,
        null,
        2
      ) + '\n',
      'utf8'
    );

    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }

  fs.renameSync(
    tmp,
    checkpointPath
  );

  return payload;
}

module.exports = {
  SCHEMA,
  parseGeneration,
  allocateSourceRunGeneration,
};
