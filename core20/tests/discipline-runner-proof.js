'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const { A8Core } = require('../core/a8-core');

const runner = require('../tools/a8-discipline-runner');

const runnerPath = path.join(
  __dirname,
  '..',
  'tools',
  'a8-discipline-runner.js'
);

const examplePath = path.join(
  __dirname,
  '..',
  'experiments',
  'gate5i-example-discipline-script.json'
);

const source = fs.readFileSync(runnerPath, 'utf8');

console.log('A8 v5.4.20 Gate 5I · read-only discipline laboratory runner proof');

const executable = source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '');

for (const forbidden of [
  "require('../core",
  "require('./core",
  "require('http')",
  "require('https')",
  "require('net')",
  "require('dgram')",
  "require('child_process')",
  'fetch(',
  'writeFile',
  'appendFile',
  'createWriteStream',
  'renameSync',
  'unlinkSync',
  'mkdirSync',
  'rmSync',
  'Date.now',
  'new Date',
  'performance.now',
  'process.hrtime',
  'setTimeout',
  'setInterval',
  'setClockPhase',
  'adjustClockTicks',
  'setAuthority',
  'STELLAR_MERIDIAN',
  'SOL_CELESTIAL_DIRECTION',
  'MEAN_SUN',
  'SOLAR_MERIDIAN',
  'DAY_PHASE17',
  'PHASE20',
]) {
  assert(
    !executable.includes(forbidden),
    `runner executable contains forbidden dependency/path: ${forbidden}`
  );
}

console.log('PASS G5I-01 · runner executable has no real-core import, network, file-write, host-time, timer, phase, authority, or Earth-observer path');

{
  const parsed = runner.parseArgs([
    '--script',
    './experiment.json',
    '--json',
  ]);

  assert.equal(parsed.help, false);
  assert.equal(parsed.scriptPath, './experiment.json');
  assert.equal(parsed.jsonMode, true);

  assert.throws(
    () => runner.parseArgs([]),
    /--script is required/
  );

  assert.throws(
    () => runner.parseArgs([
      '--script',
      'a.json',
      '--script',
      'b.json',
    ]),
    /--script may be supplied exactly once/
  );

  assert.throws(
    () => runner.parseArgs([
      '--script',
      'a.json',
      '--output',
      'report.json',
    ]),
    /unsupported argument: --output/
  );
}
console.log('PASS G5I-02 · CLI accepts one explicit --script plus optional --json and deliberately has no --output/write option');

{
  const input = JSON.parse(
    fs.readFileSync(examplePath, 'utf8')
  );

  const report = runner.runExperiment(input);

  assert.equal(
    report.schema,
    'A8-SYNTHETIC-DISCIPLINE-RUN-REPORT-V1'
  );

  assert.equal(
    report.role,
    'READ_ONLY_SYNTHETIC_DISCIPLINE_LAB_REPORT'
  );

  assert.equal(report.mode, 'DISCONNECTED_FROM_A8CORE');

  assert.deepEqual(
    report.supportedStates,
    ['RECOVERED', 'LOSS', 'REACQUIRED']
  );

  assert.equal(report.finalState, 'RECOVERED');
  assert.equal(report.scriptEventCount, 7);
  assert.equal(report.totalPlantAdvances, 125);

  assert.deepEqual(
    report.finalRateScale,
    { numerator: '1000', denominator: '1003' }
  );

  assert.deepEqual(
    report.finalClockPhase,
    {
      numerator: '250322088666899',
      denominator: '16015855856000',
    }
  );

  assert.deepEqual(
    report.losses.map(loss => loss.advances),
    [4, 6, 3]
  );

  assert.deepEqual(
    report.reacquisitions.map(event => event.slewDirection),
    ['DOWN', 'UP', 'DOWN']
  );

  assert.deepEqual(
    report.reacquisitions.map(event => event.recoveryUpdates),
    [10, 41, 61]
  );
}
console.log('PASS G5I-03 · example JSON reproduces exact Gate-5H 7-event / 125-advance result and final 1000/1003 rate');

{
  const input = JSON.parse(
    fs.readFileSync(examplePath, 'utf8')
  );

  const report = runner.runExperiment(input);

  assert.equal(report.proofBoundary.writesA8Core, false);
  assert.equal(report.proofBoundary.writesRealOscillator, false);
  assert.equal(report.proofBoundary.writesRealDivider, false);
  assert.equal(report.proofBoundary.writesRealClock, false);
  assert.equal(report.proofBoundary.writesClockPhase, false);
  assert.equal(report.proofBoundary.writesAuthority, false);

  assert.equal(report.proofBoundary.usesHostTime, false);
  assert.equal(report.proofBoundary.usesTimedCadence, false);
  assert.equal(report.proofBoundary.acceptsExternalPhaseControl, false);

  assert.equal(report.proofBoundary.runnerWritesFiles, false);
  assert.equal(report.proofBoundary.runnerUsesNetwork, false);

  assert.equal(report.proofBoundary.inventsCandidateDuringLoss, false);
  assert.equal(report.proofBoundary.changesRateDuringLoss, false);
  assert.equal(report.proofBoundary.candidateLoadChangesRate, false);
  assert.equal(report.proofBoundary.candidateLoadChangesPhase, false);
}
console.log('PASS G5I-04 · emitted proof boundary explicitly preserves all Gate-5H isolation and holdover/reacquisition rules');

{
  const cli = spawnSync(
    process.execPath,
    [
      runnerPath,
      '--script',
      examplePath,
      '--json',
    ],
    {
      encoding: 'utf8',
    }
  );

  assert.equal(cli.status, 0, cli.stderr);

  const report = JSON.parse(cli.stdout);

  assert.equal(
    report.schema,
    'A8-SYNTHETIC-DISCIPLINE-RUN-REPORT-V1'
  );

  assert.equal(report.finalState, 'RECOVERED');
  assert.equal(report.totalPlantAdvances, 125);

  assert.deepEqual(
    report.finalRateScale,
    { numerator: '1000', denominator: '1003' }
  );
}
console.log('PASS G5I-05 · actual CLI --json mode emits parseable canonical proof report to stdout');

{
  const cli = spawnSync(
    process.execPath,
    [
      runnerPath,
      '--script',
      examplePath,
    ],
    {
      encoding: 'utf8',
    }
  );

  assert.equal(cli.status, 0, cli.stderr);

  assert(
    cli.stdout.includes(
      'PASS · A8-v5.4.20-GATE5I-READ-ONLY-SYNTHETIC-DISCIPLINE-RUN'
    )
  );

  assert(
    cli.stdout.includes(
      'FINAL STATE          · RECOVERED'
    )
  );

  assert(
    cli.stdout.includes(
      'FINAL RATE          · 1000/1003'
    )
  );
}
console.log('PASS G5I-06 · human CLI mode prints compact proof report and Gate-5I PASS marker');

{
  const input = JSON.parse(
    fs.readFileSync(examplePath, 'utf8')
  );

  input.timestamp = 'forbidden';

  assert.throws(
    () => runner.runExperiment(input),
    /unsupported experiment script field: timestamp/
  );
}
console.log('PASS G5I-07 · top-level experiment contract rejects extra timestamp/hidden metadata fields');

{
  const tempPath = path.join(
    os.tmpdir(),
    `a8-gate5i-invalid-${process.pid}.json`
  );

  fs.writeFileSync(
    tempPath,
    JSON.stringify({
      schema: 'A8-SYNTHETIC-DISCIPLINE-SCRIPT-V1',
      divider: {
        numerator: '8',
        denominator: '1',
      },
      initialSettledRateScale: {
        numerator: '1',
        denominator: '1',
      },
      maxRateScaleStep: {
        numerator: '1',
        denominator: '10000',
      },
      script: [
        {
          state: 'RECOVERED',
        },
        {
          state: 'REACQUIRED',
          baselineJovianSample: {
            schema: 'A8-JOVIAN-RECURRENCE-SAMPLE-V1',
            source: 'JOVIAN_RECOVERED_RECURRENCE',
            rawNumerator: '1000',
            cycleDenominator: '1',
          },
          freshJovianSample: {
            schema: 'A8-JOVIAN-RECURRENCE-SAMPLE-V1',
            source: 'JOVIAN_RECOVERED_RECURRENCE',
            rawNumerator: '1001',
            cycleDenominator: '1',
          },
        },
        {
          state: 'LOSS',
          advances: 2,
        },
      ],
    }),
    'utf8'
  );

  try {
    const cli = spawnSync(
      process.execPath,
      [
        runnerPath,
        '--script',
        tempPath,
      ],
      {
        encoding: 'utf8',
      }
    );

    assert.notEqual(cli.status, 0);

    assert(
      cli.stderr.includes(
        'REACQUIRED event 2 requires LOSS state'
      )
    );
  } finally {
    fs.unlinkSync(tempPath);
  }
}
console.log('PASS G5I-08 · CLI propagates Gate-5H illegal-transition rejection instead of manufacturing a report');

{
  const c = new A8Core({ oscillator: 73 });

  const before = {
    rawTicks: c.rawTicks,
    naturalStep: c.naturalStep,
    oscillatorEpoch: c.oscillatorEpoch,
    dayPhase17: c.dayPhase17,
    dayCount: c.dayCount,
    selectedAuthority: c.selectedAuthority,
  };

  const input = JSON.parse(
    fs.readFileSync(examplePath, 'utf8')
  );

  runner.runExperiment(input);

  const after = {
    rawTicks: c.rawTicks,
    naturalStep: c.naturalStep,
    oscillatorEpoch: c.oscillatorEpoch,
    dayPhase17: c.dayPhase17,
    dayCount: c.dayCount,
    selectedAuthority: c.selectedAuthority,
  };

  assert.deepEqual(after, before);
}
console.log('PASS G5I-09 · complete local runner execution cannot mutate real A8Core raw state, oscillator epoch, clock phase, day count, or authority');

console.log('');
console.log('PASS · A8-v5.4.20-GATE5I-READ-ONLY-SYNTHETIC-DISCIPLINE-LAB-RUNNER');
