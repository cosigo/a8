'use strict';

const fs = require('fs');
const crypto = require('crypto');

const file = process.argv[2];

if (!file) {
  console.error(
    'usage: node verify-tape.js TAPE'
  );
  process.exitCode = 2;
} else {
  function sha256Text(text) {
    return crypto
      .createHash('sha256')
      .update(text)
      .digest('hex');
  }

  function stableStringify(value) {
    if (
      value === null ||
      typeof value !== 'object'
    ) {
      return JSON.stringify(value);
    }

    if (Array.isArray(value)) {
      return '[' +
        value.map(stableStringify).join(',') +
        ']';
    }

    const keys =
      Object.keys(value).sort();

    return '{' +
      keys.map((key) =>
        JSON.stringify(key) + ':' +
        stableStringify(value[key])
      ).join(',') +
      '}';
  }

  const lines =
    fs.readFileSync(file, 'utf8')
      .split('\n')
      .filter(Boolean);

  let expectedPrevious = null;
  let first = null;
  let last = null;
  let bad = null;

  for (
    let i = 0;
    i < lines.length;
    i += 1
  ) {
    const record =
      JSON.parse(lines[i]);

    const given =
      record.recordHash;

    const payload = {
      ...record
    };

    delete payload.recordHash;

    const calculated =
      sha256Text(
        stableStringify(payload)
      );

    if (
      record.previousRecordHash !==
      expectedPrevious
    ) {
      bad =
        `record ${i}: previous hash mismatch`;
      break;
    }

    if (
      calculated !== given
    ) {
      bad =
        `record ${i}: record hash mismatch`;
      break;
    }

    expectedPrevious =
      given;

    if (!first) {
      first = record;
    }

    last = record;
  }

  if (bad) {
    console.log(
      `FAIL · ${bad}`
    );
    process.exitCode = 1;
  } else {
    console.log(
      'PASS · hash chain intact'
    );
    console.log(
      `RECORDS · ${lines.length}`
    );
    console.log(
      `TAPE · ${first?.tapeId ?? '—'}`
    );
    console.log(
      `FIRST · ${first?.recordType ?? '—'}`
    );
    console.log(
      `LAST · ${last?.recordType ?? '—'}`
    );
    console.log(
      `LAST HASH · ${last?.recordHash ?? '—'}`
    );
  }
}
