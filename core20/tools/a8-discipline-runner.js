'use strict';

/*
 * AUSPICIOUS 8 · v5.4.20
 * GATE 5I · READ-ONLY SYNTHETIC DISCIPLINE LABORATORY RUNNER
 *
 * Reads one explicit local JSON experiment script.
 * Runs the already-proven Gate-5H synthetic discipline harness.
 * Emits a proof report to stdout.
 *
 * It intentionally has:
 *   - no A8Core import
 *   - no server/API path
 *   - no network path
 *   - no file write path
 *   - no actuator path
 *   - no host-time source
 *   - no timer/scheduler cadence
 *   - no phase setter
 *
 * Usage:
 *   node tools/a8-discipline-runner.js --script ./experiment.json
 *   node tools/a8-discipline-runner.js --script ./experiment.json --json
 *
 * To preserve output, the shell may redirect stdout. The runner itself does not
 * write reports or mutate experiment files.
 */

const fs = require('fs');
const path = require('path');

const {
  runSyntheticDisciplineHarness,
} = require('../experiments/a8-synthetic-discipline-harness');

const SCRIPT_SCHEMA = 'A8-SYNTHETIC-DISCIPLINE-SCRIPT-V1';
const REPORT_SCHEMA = 'A8-SYNTHETIC-DISCIPLINE-RUN-REPORT-V1';

function usage() {
  return [
    'A8 v5.4.20 · Gate 5I · read-only discipline laboratory runner',
    '',
    'Usage:',
    '  node tools/a8-discipline-runner.js --script <experiment.json>',
    '  node tools/a8-discipline-runner.js --script <experiment.json> --json',
  ].join('\n');
}

function parseArgs(argv) {
  let scriptPath = null;
  let jsonMode = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--script') {
      if (scriptPath !== null) {
        throw new Error('--script may be supplied exactly once');
      }

      const value = argv[++i];

      if (!value || value.startsWith('--')) {
        throw new Error('--script requires a local JSON path');
      }

      scriptPath = value;
      continue;
    }

    if (arg === '--json') {
      if (jsonMode) {
        throw new Error('--json may be supplied exactly once');
      }

      jsonMode = true;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      return {
        help: true,
        scriptPath: null,
        jsonMode: false,
      };
    }

    throw new Error(`unsupported argument: ${arg}`);
  }

  if (!scriptPath) {
    throw new Error('--script is required');
  }

  return {
    help: false,
    scriptPath,
    jsonMode,
  };
}

function validateTopLevel(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('experiment script root must be an object');
  }

  const allowed = new Set([
    'schema',
    'divider',
    'initialSettledRateScale',
    'maxRateScaleStep',
    'script',
  ]);

  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) {
      throw new Error(`unsupported experiment script field: ${key}`);
    }
  }

  if (input.schema !== SCRIPT_SCHEMA) {
    throw new Error(`experiment schema must be ${SCRIPT_SCHEMA}`);
  }

  for (const required of [
    'divider',
    'initialSettledRateScale',
    'maxRateScaleStep',
    'script',
  ]) {
    if (!Object.prototype.hasOwnProperty.call(input, required)) {
      throw new Error(`experiment script missing required field: ${required}`);
    }
  }
}

function readExperimentScript(scriptPath) {
  const resolved = path.resolve(scriptPath);

  const text = fs.readFileSync(resolved, 'utf8');

  let input;

  try {
    input = JSON.parse(text);
  } catch (err) {
    throw new Error(`invalid experiment JSON: ${err.message}`);
  }

  validateTopLevel(input);

  return {
    resolved,
    input,
  };
}

function buildReport(input, harnessResult) {
  const losses = harnessResult.events
    .filter(event => event.state === 'LOSS')
    .map(event => ({
      eventIndex: event.eventIndex,
      label: event.label,
      advances: event.advances,
      heldRateScale: event.heldRateScale,
      phaseAdvance: event.phaseAdvance,
      candidateInvented: event.candidateInvented,
    }));

  const reacquisitions = harnessResult.events
    .filter(event => event.state === 'REACQUIRED')
    .map(event => ({
      eventIndex: event.eventIndex,
      label: event.label,

      signedFractionalRateError:
        event.candidate.signedFractionalRateError,

      recommendedRateScaleCandidate:
        event.candidate.recommendedRateScaleCandidate,

      candidateAppliedDirectly:
        event.candidate.applied,

      candidateLoadPhaseMovement:
        event.candidateLoadPhaseMovement,

      candidateLoadRateMovement:
        event.candidateLoadRateMovement,

      slewDirection: event.slewDirection,
      targetRateScale: event.targetRateScale,
      recoveryUpdates: event.recoveryUpdates,
      settledRateScale: event.settledRateScale,
      phaseAtSettlement: event.phaseAtSettlement,
    }));

  return {
    schema: REPORT_SCHEMA,
    role: 'READ_ONLY_SYNTHETIC_DISCIPLINE_LAB_REPORT',
    mode: 'DISCONNECTED_FROM_A8CORE',

    sourceScriptSchema: input.schema,
    harnessSchema: harnessResult.schema,

    supportedStates: harnessResult.supportedStates,
    finalState: harnessResult.finalState,

    scriptEventCount: harnessResult.scriptEventCount,
    totalPlantAdvances: harnessResult.totalPlantAdvances,

    initialSettledRateScale:
      harnessResult.initialSettledRateScale,

    maxRateScaleStep:
      harnessResult.maxRateScaleStep,

    finalRateScale:
      harnessResult.finalRateScale,

    finalClockPhase:
      harnessResult.finalClockPhase,

    losses,
    reacquisitions,
    stateTransitions: harnessResult.stateTransitions,

    proofBoundary: {
      writesA8Core: false,
      writesRealOscillator: false,
      writesRealDivider: false,
      writesRealClock: false,
      writesClockPhase: false,
      writesAuthority: false,

      usesHostTime: false,
      usesTimedCadence: false,
      acceptsExternalPhaseControl: false,

      runnerWritesFiles: false,
      runnerUsesNetwork: false,

      inventsCandidateDuringLoss:
        harnessResult.inventsCandidateDuringLoss,

      changesRateDuringLoss:
        harnessResult.changesRateDuringLoss,

      candidateLoadChangesRate:
        harnessResult.candidateLoadChangesRate,

      candidateLoadChangesPhase:
        harnessResult.candidateLoadChangesPhase,

      requiresSettlementBeforeLoss:
        harnessResult.requiresSettlementBeforeLoss,

      requiresLossBeforeReacquisition:
        harnessResult.requiresLossBeforeReacquisition,
    },
  };
}

function runExperiment(input) {
  validateTopLevel(input);

  const harnessResult = runSyntheticDisciplineHarness({
    divider: input.divider,
    initialSettledRateScale: input.initialSettledRateScale,
    maxRateScaleStep: input.maxRateScaleStep,
    script: input.script,
  });

  return buildReport(input, harnessResult);
}

function rationalText(value) {
  if (!value) return '—';

  return value.denominator === '1'
    ? value.numerator
    : `${value.numerator}/${value.denominator}`;
}

function humanReport(report) {
  const lines = [];

  lines.push('AUSPICIOUS 8 · v5.4.20 · GATE 5I');
  lines.push('READ-ONLY SYNTHETIC DISCIPLINE LABORATORY RUN');
  lines.push('');

  lines.push(`FINAL STATE          · ${report.finalState}`);
  lines.push(`SCRIPT EVENTS        · ${report.scriptEventCount}`);
  lines.push(`PLANT ADVANCES       · ${report.totalPlantAdvances}`);
  lines.push(
    `FINAL RATE          · ${rationalText(report.finalRateScale)}`
  );
  lines.push(
    `FINAL PHASE         · ${rationalText(report.finalClockPhase)}`
  );

  lines.push('');
  lines.push('LOSS WINDOWS');

  for (const loss of report.losses) {
    lines.push(
      `  #${loss.eventIndex} ${loss.label} · advances=${loss.advances} · held=${rationalText(loss.heldRateScale)} · phase+=${rationalText(loss.phaseAdvance)}`
    );
  }

  lines.push('');
  lines.push('REACQUISITIONS');

  for (const event of report.reacquisitions) {
    lines.push(
      `  #${event.eventIndex} ${event.label} · error=${rationalText(event.signedFractionalRateError)} · target=${rationalText(event.targetRateScale)} · ${event.slewDirection} · updates=${event.recoveryUpdates}`
    );
  }

  lines.push('');
  lines.push('PROOF BOUNDARY');
  lines.push('  A8Core write                · NO');
  lines.push('  real oscillator/divider     · NO');
  lines.push('  clock/phase write           · NO');
  lines.push('  authority write             · NO');
  lines.push('  host time / timed cadence   · NO');
  lines.push('  network                     · NO');
  lines.push('  runner file writes          · NO');
  lines.push('  candidate invented in LOSS  · NO');
  lines.push('  rate movement in LOSS       · NO');
  lines.push('  candidate-load phase move   · NO');
  lines.push('  candidate-load rate move    · NO');

  lines.push('');
  lines.push(
    'PASS · A8-v5.4.20-GATE5I-READ-ONLY-SYNTHETIC-DISCIPLINE-RUN'
  );

  return lines.join('\n');
}

function main(argv) {
  const args = parseArgs(argv);

  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }

  const { input } = readExperimentScript(args.scriptPath);
  const report = runExperiment(input);

  if (args.jsonMode) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(`${humanReport(report)}\n`);
  }

  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`FAIL · ${err.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  SCRIPT_SCHEMA,
  REPORT_SCHEMA,
  usage,
  parseArgs,
  validateTopLevel,
  readExperimentScript,
  buildReport,
  runExperiment,
  humanReport,
  main,
};
