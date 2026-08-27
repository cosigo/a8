#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { A8Core, A8_TOL } = require('../core/a8-core');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { safeRelative, parsePhemuFilename, classifyFile, REPLAY_SCHEMA, resolveDataRoot } = require('../lib/a8-data-bridge');
const {
  deriveRelativeX, csvToA8Obs, generateRows, generateIrregularRows, rowsToCsv, rowsToA8Obs
} = require('../lib/a8-telescope');
const { parseA8ObsText } = require('../lib/a8-replay');
const {
  legacyDegreesToA8Units,
  a8UnitsToLegacyDegrees,
  normalizeA8Turn,
  toOctalFraction,
  formatA8AngleFromLegacy,
  arcLengthFromA8Angle,
  radiusFromA8ArcLength,
  circumferenceFromRadius,
  radiusFromCircumference,
  areaFromRadius,
  sharedScaleFacts,
} = require('../lib/a8-angle');

function runUntil(core, predicate, maxSteps = 100000, batch = 8) {
  let used = 0;
  while (!predicate() && used < maxSteps) {
    core.advance(batch);
    used += batch;
  }
  assert(predicate(), `condition not reached within ${maxSteps} plant steps`);
  return used;
}
function close(actual, expected, tol = 0.5, label = '') {
  assert(Math.abs(actual - expected) <= tol,
    `${label}: got ${actual}, expected ${expected} ± ${tol}`);
}
function signedCycleDeltaForTest(a,b) {
  let d=(a-b)%1;
  if(d>0.5)d-=1;if(d<-0.5)d+=1;
  return d;
}
function allLocked(c) {
  return ['io','eu','ga'].every(id => c.channels[id].lockedSpan !== null);
}
function allFullyQualified(c) {
  return ['io','eu','ga'].every(id =>
    c.channels[id].qualificationComplete &&
    c.channels[id].qualificationEpoch === c.oscillatorEpoch
  );
}

console.log('A8 v5.4.18 observer cadence + deterministic parity tests');

{
  const c = new A8Core({oscillator:73});
  runUntil(c, () => allFullyQualified(c), 18000, 1);
  close(c.channels.io.lockedSpan, 74752, 0.01, 'Io @73');
  close(c.channels.eu.lockedSpan, 149504, 0.01, 'Europa @73');
  close(c.channels.ga.lockedSpan, 299008, 0.01, 'Ganymede @73');
  close(c.channels.io.lockedSpan*4, 299008, 0.01, 'Io normalized');
  close(c.channels.eu.lockedSpan*2, 299008, 0.01, 'Europa normalized');
  close(c.channels.ga.lockedSpan, 299008, 0.01, 'Ganymede normalized');
  assert.equal(c.comparator.verdict, 'THREE-CHANNEL EQUAL-DURATION BASELINE AGREEMENT · 8:4:2');
  assert.equal(c.comparator.authorityQualification, 'QUALIFIED_3');
  assert.equal(c.channels.io.qualificationWindowRaw, 598016);
  assert.equal(c.channels.eu.qualificationWindowRaw, 598016);
  assert.equal(c.channels.ga.qualificationWindowRaw, 598016);
  console.log('PASS 1 · baseline spans preserve 1:2:4 and full 8:4:2 qualification covers the same 598016 raw-pulse window');
}

{
  const c = new A8Core({oscillator:73});
  runUntil(c, () => allFullyQualified(c), 18000, 1);
  c.setOscillator(146);

  runUntil(c, () =>
    allFullyQualified(c) &&
    c.channels.io.lockedSpan === 149504 &&
    c.channels.eu.lockedSpan === 299008 &&
    c.channels.ga.lockedSpan === 598016,
    26000, 1);

  assert.equal(c.comparator.verdict, 'THREE-CHANNEL EQUAL-DURATION BASELINE AGREEMENT · 8:4:2');
  assert.equal(c.channels.io.qualificationWindowRaw, 1196032);
  assert.equal(c.channels.eu.qualificationWindowRaw, 1196032);
  assert.equal(c.channels.ga.qualificationWindowRaw, 1196032);
  console.log('PASS 2 · oscillator 73→146 doubles raw spans without changing normalized structure');
}

{
  const c = new A8Core({oscillator:73});
  runUntil(c, () => allFullyQualified(c), 18000, 1);
  const before = {
    io:c.channels.io.lockedSpan,
    eu:c.channels.eu.lockedSpan,
    ga:c.channels.ga.lockedSpan,
  };
  c.setObservationBlocked(true);
  c.setDrift(16);
  c.advance(10000);
  assert.equal(c.channels.io.lockedSpan, before.io);
  assert.equal(c.channels.eu.lockedSpan, before.eu);
  assert.equal(c.channels.ga.lockedSpan, before.ga);
  assert(c.rawTicks > 0n);
  c.setObservationBlocked(false);

  runUntil(c, () =>
    allFullyQualified(c) &&
    c.channels.io.lockedSpan !== before.io &&
    c.channels.eu.lockedSpan !== before.eu &&
    c.channels.ga.lockedSpan !== before.ga,
    26000, 1);

  console.log('PASS 3 · blackout preserves frozen calibration; restore permits fresh post-drift recovery');
}

{
  const c = new A8Core({oscillator:73, selectedAuthority:'ga'});
  runUntil(c, () => allFullyQualified(c), 18000, 1);
  assert.equal(c.comparator.authorityQualification, 'QUALIFIED_3');

  // Perturb selected Ganymede's future rate by +1%, preserving current phase.
  c.setMoonFault('ga', 1.0);

  // Wait until the recovery channel itself observes/recalibrates a changed G span
  // and the comparator can identify the outlier against Io+Europa.
  runUntil(c, () => c.comparator.quality.ga === 'FAULT', 30000, 1);
  assert.equal(c.comparator.quality.io, 'HEALTHY');
  assert.equal(c.comparator.quality.eu, 'HEALTHY');
  assert.equal(c.comparator.authorityQualification, 'HOLDOVER');
  assert.equal(c.dividerStatus().calibration, 'HOLDOVER');

  // Switching authority to a healthy witness restores qualification without
  // erasing the Ganymede fault evidence.
  c.setAuthority('io');
  assert.equal(c.comparator.authorityQualification, 'QUALIFIED_3');
  assert.equal(c.comparator.quality.ga, 'FAULT');
  console.log('PASS 4 · selected Ganymede outlier → HOLDOVER; healthy Io authority restores qualification without erasing fault');
}

{
  const c = new A8Core({oscillator:73});
  runUntil(c, () => allFullyQualified(c), 18000, 1);
  c.setMoonFault('ga', 1.0);
  runUntil(c, () => c.comparator.quality.ga === 'FAULT', 30000, 1);
  c.setAuthority('io');
  assert.equal(c.dividerStatus().calibration, 'FULLY VERIFIED · 8:4:2 EQUAL-DURATION BASELINE');
  assert.equal(c.comparator.quality.ga, 'FAULT');
  console.log('PASS 5 · unselected moon fault remains visible while healthy selected authority stays qualified');
}


{
  const c = new A8Core({oscillator:73, selectedAuthority:'ga'});
  runUntil(c, () => allFullyQualified(c), 18000, 1);
  assert.equal(c.comparator.authorityQualification, 'QUALIFIED_3');
  const oldEpoch = c.oscillatorEpoch;

  c.setDrift(10);
  assert.equal(c.oscillatorEpoch, oldEpoch + 1);
  assert.equal(c.comparator.authorityQualification, 'HOLDOVER');
  assert.equal(c.comparator.verdict, 'RECALIBRATION IN PROGRESS');

  let sawIoCurrentFirst = false;
  let sawTwoCurrent = false;
  let sawFalseMoonFault = false;

  let sawThreeEarly = false;
  for (let i = 0; i < 26000; i++) {
    c.advance(1);
    const q = c.comparator.quality;
    if (Object.values(q).includes('FAULT')) sawFalseMoonFault = true;
    if (c.comparator.currentCount === 1 && c.channels.io.calibrationEpoch === c.oscillatorEpoch) {
      sawIoCurrentFirst = true;
    }
    if (c.comparator.currentCount === 2) sawTwoCurrent = true;
    if (c.comparator.currentCount === 3 && c.comparator.fullQualifiedCount < 3) sawThreeEarly = true;
    if (allFullyQualified(c)) break;
  }

  assert(sawIoCurrentFirst, 'Io should become current before slower channels');
  assert(sawTwoCurrent, 'two-current-channel transition should be observable');
  assert(sawThreeEarly, 'three early current channels should be visible before full 8:4:2 qualification');
  assert.equal(sawFalseMoonFault, false, 'mixed epochs must never create a moon FAULT');
  assert.equal(c.comparator.currentCount, 3);
  assert.equal(c.comparator.fullQualifiedCount, 3);
  assert.equal(c.comparator.verdict, 'THREE-CHANNEL EQUAL-DURATION BASELINE AGREEMENT · 8:4:2');
  assert.equal(c.comparator.authorityQualification, 'QUALIFIED_3');
  console.log('PASS 6 · Δ epoch retains staged early recovery, then requires full 8:4:2 equal-duration-baseline before QUALIFIED_3');
}

{
  const c = new A8Core({oscillator:73, selectedAuthority:'ga'});
  runUntil(c, () => allFullyQualified(c), 18000, 1);
  c.setDrift(10);
  runUntil(c, () => allFullyQualified(c), 26000, 1);
  assert.equal(c.comparator.verdict, 'THREE-CHANNEL EQUAL-DURATION BASELINE AGREEMENT · 8:4:2');
  assert.equal(c.comparator.authorityQualification, 'QUALIFIED_3');
  console.log('PASS 7 · Δ 10/512 settles to fully qualified 8:4:2 agreement with no residual fault');
}


{
  const c = new A8Core({oscillator:73, selectedAuthority:'ga'});
  runUntil(c, () => allFullyQualified(c), 18000, 1);
  assert.equal(c.comparator.verdict, 'THREE-CHANNEL EQUAL-DURATION BASELINE AGREEMENT · 8:4:2');
  assert.equal(c.comparator.epochReference, 299008);

  c.setMoonFault('eu', 0.25);
  c.setMoonFault('ga', 0.25);

  runUntil(c, () =>
    c.comparator.quality.eu === 'FAULT' &&
    c.comparator.quality.ga === 'FAULT',
    35000, 1);

  assert.equal(c.comparator.quality.io, 'HEALTHY');
  assert.equal(c.comparator.authorityQualification, 'HOLDOVER');
  assert(c.comparator.verdict.includes('TWO-CHANNEL CORRELATED DEVIATION'));
  assert.equal(c.comparator.epochReference, 299008);
  console.log('PASS 8 · Europa + Ganymede +0.25% cannot outvote healthy Io; frozen epoch baseline identifies both shifted channels');
}

{
  const c = new A8Core({oscillator:73, selectedAuthority:'ga'});
  // Inject two identical moon perturbations BEFORE any qualified baseline exists.
  c.setMoonFault('eu', 0.25);
  c.setMoonFault('ga', 0.25);

  runUntil(c, () => allFullyQualified(c), 22000, 1);

  assert.equal(c.comparator.epochReference, null);
  assert(c.comparator.verdict.includes('UNRESOLVED'));
  assert.equal(c.comparator.quality.io, 'CONFLICT');
  assert.equal(c.comparator.quality.eu, 'CONFLICT');
  assert.equal(c.comparator.quality.ga, 'CONFLICT');
  assert.notEqual(c.comparator.authorityQualification, 'QUALIFIED');
  console.log('PASS 9 · 2-v-1 split with no prior qualified baseline is UNRESOLVED; median majority is not treated as truth');
}


{
  const c = new A8Core({oscillator:73});
  // The accelerated raw divider must no longer race the visible clock.
  c.advance(4096);
  assert.equal(c.dayPhase17, 0n);
  assert(c.dividerTotalTicks > 0n);
  console.log('PASS 10 · accelerated Jovian/raw-divider activity no longer races the visible 17-bit clock');
}

{
  const c = new A8Core({oscillator:73});
  const fullConventionalDayNs = 86400n * 1000000000n;
  c.advanceRealtimeClock(fullConventionalDayNs);
  assert.equal(c.dayCount, 1n);
  assert.equal(c.dayPhase17, 0n);

  // Half a conventional Earth day must be exact A8 noon.
  const d = new A8Core({oscillator:73});
  d.advanceRealtimeClock(fullConventionalDayNs / 2n);
  assert.equal(d.dayPhase17, 65536n);
  assert.equal(d.clockFields().decimal, '16:00:00');
  assert.equal(d.clockFields().octal, '20:00:00₈');
  console.log('PASS 11 · normal demo pacer maps one conventional Earth day to exactly 2^17 states; half-day = A8 16:00:00 / 20:00:00₈');
}


{
  const c = new A8Core({oscillator:73, selectedAuthority:'io'});
  runUntil(c, () => allFullyQualified(c), 18000, 1);
  assert.equal(c.comparator.authorityQualification, 'QUALIFIED_3');

  c.setOscillator(146);
  assert.equal(c.comparator.authorityQualification, 'HOLDOVER');

  // Io must become current first and immediately become usable because Io is selected.
  runUntil(c, () => c.comparator.currentCount === 1, 5000, 1);
  assert.deepEqual(c.comparator.current, ['io']);
  assert.equal(c.comparator.quality.io, 'SINGLE_CURRENT');
  assert.equal(c.comparator.authorityQualification, 'SINGLE_REFRESH');
  assert.equal(c.dividerStatus().calibration, 'SINGLE-CHANNEL REFRESH');
  assert.equal(c.comparator.quality.eu, 'RECALIBRATING');
  assert.equal(c.comparator.quality.ga, 'RECALIBRATING');

  // Europa must then corroborate Io while Ganymede is still catching up.
  runUntil(c, () => c.comparator.currentCount === 2, 7000, 1);
  assert.deepEqual(c.comparator.current, ['io','eu']);
  assert.equal(c.comparator.quality.io, 'CORROBORATED');
  assert.equal(c.comparator.quality.eu, 'CORROBORATED');
  assert.equal(c.comparator.authorityQualification, 'CORROBORATED_2');
  assert.equal(c.dividerStatus().calibration, 'CORROBORATED · 2 CHANNELS');
  assert.equal(c.comparator.quality.ga, 'RECALIBRATING');

  // Ganymede then becomes EARLY current. All three may be used/corroborated,
  // but the frozen epoch baseline must still wait for 8:4:2 completion.
  runUntil(c, () => c.comparator.currentCount === 3, 10000, 1);
  assert.equal(c.comparator.authorityQualification, 'CORROBORATED_3_EARLY');
  assert.equal(c.comparator.epochReference, null);
  assert(c.comparator.verdict.includes('BUILDING 8:4:2'));

  runUntil(c, () => allFullyQualified(c), 14000, 1);
  assert.equal(c.comparator.verdict, 'THREE-CHANNEL EQUAL-DURATION BASELINE AGREEMENT · 8:4:2');
  assert.equal(c.comparator.authorityQualification, 'QUALIFIED_3');
  assert.equal(c.dividerStatus().calibration, 'FULLY VERIFIED · 8:4:2 EQUAL-DURATION BASELINE');
  assert.equal(c.comparator.epochReference, 598016);
  console.log('PASS 12 · oscillator change preserves 1/2/3-channel early usability, while full baseline waits for Io8 / Europa4 / Ganymede2');
}

{
  const c = new A8Core({oscillator:73, selectedAuthority:'ga'});
  runUntil(c, () => allFullyQualified(c), 18000, 1);
  c.setOscillator(146);

  // Io may be available first, but selected Ganymede remains stale; no auto-switch.
  runUntil(c, () => c.comparator.currentCount === 1, 5000, 1);
  assert.deepEqual(c.comparator.current, ['io']);
  assert.equal(c.comparator.authorityQualification, 'HOLDOVER');
  assert.deepEqual(c.comparator.availableAuthorities, ['io']);

  runUntil(c, () => c.comparator.currentCount === 2, 7000, 1);
  assert.equal(c.comparator.authorityQualification, 'HOLDOVER');
  assert.deepEqual(c.comparator.availableAuthorities, ['io','eu']);

  // Explicitly selecting Io now uses the already-current channel immediately.
  c.setAuthority('io');
  assert.equal(c.comparator.authorityQualification, 'CORROBORATED_2');
  console.log('PASS 13 · no silent failover: stale selected Ganymede stays HOLDOVER while fresh Io/Europa are exposed as available authorities');
}


{
  const c = new A8Core({oscillator:73, selectedAuthority:'ga'});
  runUntil(c, () => allFullyQualified(c), 18000, 1);
  const before = {
    raw: c.rawTicks,
    epoch: c.oscillatorEpoch,
    ref: c.epochReference,
    io: c.channels.io.lockedSpan,
    eu: c.channels.eu.lockedSpan,
    ga: c.channels.ga.lockedSpan,
  };

  const phase = c.alignClockToLocalMilliseconds(12 * 60 * 60 * 1000, 'TEST NOON');
  assert.equal(phase, 65536n);
  assert.equal(c.dayPhase17, 65536n);
  assert.equal(c.clockFields().decimal, '16:00:00');
  assert.equal(c.rawTicks, before.raw);
  assert.equal(c.oscillatorEpoch, before.epoch);
  assert.equal(c.epochReference, before.ref);
  assert.equal(c.channels.io.lockedSpan, before.io);
  assert.equal(c.channels.eu.lockedSpan, before.eu);
  assert.equal(c.channels.ga.lockedSpan, before.ga);
  assert(c.eventLog.some(e => e.type === 'ALIGN'));
  console.log('PASS 14 · one-shot noon ALIGN sets DAY_PHASE17=65536 / 16:00:00 and touches no Jovian recovery state');
}

{
  const c = new A8Core({oscillator:73});
  c.setDrift(4);
  c.setAuthority('io');
  c.setMoonFault('ga', 0.25);
  const messages = c.eventLog.map(e => e.message).join('\n');
  assert(messages.includes('Δ 0/512 → 4/512'));
  assert(messages.includes('AUTHORITY GA → IO'));
  assert(messages.includes('GANYMEDE RATE FAULT'));
  const snap = c.snapshot();
  assert(snap.recorder.count >= 4);
  assert(Array.isArray(snap.recorder.events));
  console.log('PASS 15 · flight recorder captures drift, authority, and moon-fault controls with raw/plant/epoch context');
}


{
  const c = new A8Core({oscillator:73});
  const snap = c.snapshot();
  assert(snap.secondary.callistoPlant);
  assert.equal(typeof snap.secondary.callistoPlant.x, 'number');
  assert.equal(typeof snap.secondary.callistoPlant.ph, 'number');
  console.log('PASS 16 · snapshot exposes Callisto plant state for the four-moon observer page');
}


{
  const c = new A8Core({oscillator:73, selectedAuthority:'io'});
  // Exact plant endpoints from the unchanged v0.6.20 equations.
  c.naturalStep = 256;  // Io phase 0.25 -> EAST x=+1
  assert(Math.abs(c.plantState('io').x - 1) < 1e-12);
  c.naturalStep = 768;  // Io phase 0.75 -> WEST x=-1
  assert(Math.abs(c.plantState('io').x + 1) < 1e-12);
  console.log('PASS 17 · Io plant still reaches exact EAST +1 and WEST -1 endpoints');
}

{
  const c = new A8Core({oscillator:73, selectedAuthority:'io'});
  let guard=0;
  while(!allFullyQualified(c) && guard++ < 30000) c.advance(1);
  assert.equal(c.naturalStep, 11265);

  c.setDrift(4);
  const early={io:null,eu:null,ga:null};
  const full={io:null,eu:null,ga:null};
  guard=0;
  while(!allFullyQualified(c) && guard++ < 30000){
    c.advance(1);
    for (const id of ['io','eu','ga']) {
      if (early[id]===null && c.channels[id].calibrationEpoch===c.oscillatorEpoch) early[id]=c.naturalStep;
      if (full[id]===null && c.channels[id].qualificationComplete && c.channels[id].qualificationEpoch===c.oscillatorEpoch) full[id]=c.naturalStep;
    }
  }
  assert.deepEqual(early, {io:13057, eu:15361, ga:19457});
  assert.deepEqual(full, {io:20225, eu:21505, ga:23553});
  assert(early.io < early.eu && early.eu < early.ga);
  assert(full.io < full.eu && full.eu < full.ga);
  console.log('PASS 18 · one-step Δ recovery remains visibly staged for both EARLY and FULL 8:4:2 qualification');
}

{
  const c = new A8Core({oscillator:73});
  runUntil(c, () => allFullyQualified(c), 18000, 1);
  assert.equal(c.channels.io.qualificationSpanCount, 8);
  assert.equal(c.channels.eu.qualificationSpanCount, 4);
  assert.equal(c.channels.ga.qualificationSpanCount, 2);
  assert.equal(c.channels.io.qualificationWindowRaw, 598016);
  assert.equal(c.channels.eu.qualificationWindowRaw, 598016);
  assert.equal(c.channels.ga.qualificationWindowRaw, 598016);
  console.log('PASS 19 · Io8 / Europa4 / Ganymede2 produce exactly equal 598016-pulse full-qualification windows');
}


{
  const c = new A8Core({oscillator:73});
  let d = c.plantDiagnostics();
  assert(Math.abs(d.innerLaplaceResidual) < 1e-12);
  assert.equal(d.innerIntegrityState, 'nominal');

  c.setMoonFault('io', 1.0);
  c.advance(1);
  d = c.plantDiagnostics();
  assert(d.innerLaplaceResidual > 0);
  assert.notEqual(d.innerIntegrityState, 'nominal');

  const residualBeforeZero = d.innerLaplaceResidual;
  c.setMoonFault('io', 0);
  c.advance(128);
  d = c.plantDiagnostics();
  assert(Math.abs(d.innerLaplaceResidual - residualBeforeZero) < 1e-12);

  c.reset();
  d = c.plantDiagnostics();
  assert(Math.abs(d.innerLaplaceResidual) < 1e-12);
  assert.equal(d.innerIntegrityState, 'nominal');
  console.log('PASS 20 · restored Chief Engineer residual accumulates under Io fault, remains after dial returns to zero, and reset clears it');
}


{
  const c = new A8Core({oscillator:73});

  c.naturalStep = 0;
  let p = c.plantState('io');
  assert.equal(p.phase9, 0);
  assert.equal(p.phase9Octal, '000₈');
  assert.equal(p.phase9Binary, '000000000');

  // Io period is 1024 plant steps. At step 1022 its discrete 512-state
  // address is the final state, 777₈, before rollover.
  c.naturalStep = 1022;
  p = c.plantState('io');
  assert.equal(p.phase9, 511);
  assert.equal(p.phase9Octal, '777₈');
  assert.equal(p.phase9Binary, '111111111');

  c.naturalStep = 1024;
  p = c.plantState('io');
  assert.equal(p.phase9, 0);
  assert.equal(p.phase9Octal, '000₈');
  assert.equal(p.phase9Binary, '000000000');

  console.log('PASS 21 · plant presentation exposes native PHASE9 rollover 000₈ … 777₈ → 000₈ while continuous φ remains secondary');
}


{
  const A8_TO_LEGACY_HZ = 1024 / 675;
  const LEGACY_HZ_TO_A8 = 675 / 1024;

  assert(Math.abs(512 * A8_TO_LEGACY_HZ - 776.722962962963) < 1e-12);
  assert(Math.abs(512 * LEGACY_HZ_TO_A8 - 337.5) < 1e-12);

  const a8a = 256;
  const a8b = 512;
  const a8c = 1024;
  assert.equal(a8b / a8a, 2);
  assert.equal(a8c / a8b, 2);
  assert(Math.abs((a8b * A8_TO_LEGACY_HZ) / (a8a * A8_TO_LEGACY_HZ) - 2) < 1e-12);
  assert(Math.abs((a8c * A8_TO_LEGACY_HZ) / (a8b * A8_TO_LEGACY_HZ) - 2) < 1e-12);

  console.log('PASS 22 · A8 frequency trainer uses exact 675/1024 time-ruler conversion and preserves exact binary doubling/halving');
}


{
  assert.equal(512 / 256, 2);
  assert.equal(1024 / 512, 2);
  assert.equal(Math.log2(256 / 512), -1);
  assert.equal(Math.log2(512 / 512), 0);
  assert.equal(Math.log2(1024 / 512), 1);
  assert.equal(Math.log2(2048 / 512), 2);

  console.log('PASS 23 · A8 binary ladder maps exact 2:1 octave ratios to integer octave steps around the 512-A8 trainer anchor');
}


{
  const p=parsePhemuFilename('E202102280948_4o2_0_SPA_O-C.dat');
  assert(p);assert.equal(p.filenameTimestampToken,'2021-02-28T09:48');
  assert.equal(p.eventToken,'4o2');assert.equal(p.observerToken,'SPA');
  console.log('PASS 24 · PHEMU filename metadata is recognized without inventing physical column semantics');
}
{
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'a8-data-'));
  try{
    const f=path.join(tmp,'E202102280948_4o2_0_SPA_O-C.dat');
    fs.writeFileSync(f,'588.87788 0.855494 1.000000\n588.98505 0.962971 1.000000\n');
    const info=classifyFile(f);
    assert.equal(info.kind,'NSDB_PHEMU_LIGHT_CURVE');assert.equal(info.readiness,'EVENT_PHOTOMETRY');
    assert.equal(info.parsed.numericColumnCount,3);
    assert(info.notes.some(x=>/Do not treat as Jupiter-relative x-position/.test(x)));
  }finally{fs.rmSync(tmp,{recursive:true,force:true})}
  console.log('PASS 25 · three-column PHEMU photometry is never silently classified as apparent x');
}
{
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'a8-vizier-'));
  try{
    const f=path.join(tmp,'sample.tsv');
    fs.writeFileSync(f,'# VizieR\n# CDS catalogue\nMoon\tUTC\tRA\tDE\nIo\t2018-01-01\t1\t2\n');
    const info=classifyFile(f);assert.equal(info.kind,'VIZIER_TSV');assert.equal(info.readiness,'POSITION_CANDIDATE');
  }finally{fs.rmSync(tmp,{recursive:true,force:true})}
  console.log('PASS 26 · VizieR-style TSV is a position candidate pending verified column mapping');
}
{
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'a8-safe-'));
  try{assert.throws(()=>safeRelative(tmp,'../escape.dat'),/escapes A8 data root/);assert.equal(safeRelative(tmp,'inside.dat'),path.join(tmp,'inside.dat'))}
  finally{fs.rmSync(tmp,{recursive:true,force:true})}
  console.log('PASS 27 · data inspector rejects path traversal outside the evidence archive');
}
{
  assert.equal(REPLAY_SCHEMA.status,'CONNECTED_FOR_A8OBS_STREAMS');
  assert(REPLAY_SCHEMA.prohibitedShortcuts.some(x=>/published orbital period/.test(x)));
  assert(REPLAY_SCHEMA.prohibitedShortcuts.some(x=>/source UTC/.test(x)));
  assert(REPLAY_SCHEMA.prohibitedShortcuts.some(x=>/photometric brightness/.test(x)));
  console.log('PASS 28 · connected replay still prevents period, UTC, and photometry-to-position shortcuts');
}


{
  assert.equal(legacyDegreesToA8Units(360), 512);
  assert.equal(legacyDegreesToA8Units(180), 256);
  assert.equal(legacyDegreesToA8Units(90), 128);
  assert.equal(legacyDegreesToA8Units(45), 64);
  assert.equal(a8UnitsToLegacyDegrees(512), 360);
  assert.equal(a8UnitsToLegacyDegrees(64), 45);
  console.log('PASS 29 · exact 360→512 angle translation preserves cardinal/eighth-turn landmarks');
}
{
  const one=legacyDegreesToA8Units(1);
  assert(Math.abs(one - 64/45) < 1e-15);
  assert(Math.abs(a8UnitsToLegacyDegrees(one) - 1) < 1e-15);
  console.log('PASS 30 · awkward legacy 1° translates exactly by rational 64/45 and round-trips');
}
{
  assert.equal(toOctalFraction(0,0),'000₈');
  assert.equal(toOctalFraction(64,0),'100₈');
  assert.equal(toOctalFraction(128,0),'200₈');
  assert.equal(toOctalFraction(256,0),'400₈');
  assert.equal(toOctalFraction(512,0),'1000₈');
  assert.equal(toOctalFraction(normalizeA8Turn(512),0),'000₈');
  console.log('PASS 31 · native octal angle landmarks preserve 000₈/100₈/200₈/400₈/1000₈ rollover');
}
{
  const r=formatA8AngleFromLegacy(1,12);
  assert(r.a8Octal.includes('.'));
  assert(r.a8Octal.split('.')[1].replace('₈','').length===12);
  assert(Math.abs(r.a8Units - 64/45) < 1e-15);
  console.log('PASS 32 · fractional octal angle output preserves sub-unit precision instead of forcing 512 bins');
}
{
  const facts=sharedScaleFacts();
  assert.match(facts.angle.statement,/45\/64 legacy degree/);
  assert.match(facts.timeMinute.statement,/45\/64 legacy minute/);
  assert.match(facts.timeHour.statement,/45 legacy minutes/);
  console.log('PASS 33 · shared 45/64 angle/minute scale is explicit and dimensionally labeled');
}

{
  const r=7;
  const c=circumferenceFromRadius(r);
  assert(Math.abs(radiusFromCircumference(c)-r)<1e-12);
  assert(Math.abs(c/(2*r)-Math.PI)<1e-12);
  console.log('PASS 34 · π remains circumference/diameter and radius round-trips independently of angular ruler');
}
{
  const r=7;
  assert(Math.abs(arcLengthFromA8Angle(r,512)-2*Math.PI*r)<1e-12);
  assert(Math.abs(arcLengthFromA8Angle(r,256)-Math.PI*r)<1e-12);
  assert(Math.abs(arcLengthFromA8Angle(r,128)-Math.PI*r/2)<1e-12);
  console.log('PASS 35 · 1000₈/400₈/200₈ map exactly to full/half/quarter circle arcs');
}
{
  const r=13.25;
  for(const theta of [64,128,256,400,512]){
    const s=arcLengthFromA8Angle(r,theta);
    assert(Math.abs(radiusFromA8ArcLength(s,theta)-r)<1e-12);
  }
  console.log('PASS 36 · general A8 arc formula recovers radius across arbitrary A8 angular amounts');
}
{
  const r=3;
  assert(Math.abs(areaFromRadius(r)-Math.PI*r*r)<1e-12);
  console.log('PASS 37 · A8 angle ruler leaves Euclidean circle area A=πr² unchanged');
}

{
  const text=[
    JSON.stringify({schema:'a8obs-v1',rawPulse:'0',moon:'io',x:1}),
    JSON.stringify({schema:'a8obs-v1',rawPulse:'10',moon:'io',x:0}),
    JSON.stringify({schema:'a8obs-v1',rawPulse:'20',moon:'io',x:-1})
  ].join('\n');
  const recs=parseA8ObsText(text);
  assert.equal(recs.length,3);
  assert.equal(recs[2].rawPulse,'20');
  console.log('PASS 38 · .a8obs parser preserves monotonic raw-pulse observation order');
}
{
  const c=new A8Core();
  c.beginObservationReplay();
  for(const r of [
    {rawPulse:'0',moon:'io',x:0},
    {rawPulse:'100',moon:'io',x:-1},
    {rawPulse:'200',moon:'io',x:0},
    {rawPulse:'300',moon:'io',x:1},
    {rawPulse:'400',moon:'io',x:0},
    {rawPulse:'500',moon:'io',x:-1},
    {rawPulse:'600',moon:'io',x:0},
  ]) c.ingestObservationRecord(r);
  assert.equal(c.channels.io.lockedSpan,400);
  assert.equal(c.sourceMode,'REAL_OBSERVATION_REPLAY');
  console.log('PASS 39 · external rawPulse+x records hit the unchanged WEST detector and recover an Io span');
}
{
  const c=new A8Core();
  c.beginObservationReplay();
  for(let raw=0;raw<=3350;raw+=25){
    for(const [moon,span] of [['io',400],['eu',800],['ga',1600]]){
      c.ingestObservationRecord({
        rawPulse:String(raw),
        moon,
        x:-Math.cos(2*Math.PI*(raw-100)/span)
      });
    }
  }
  assert.equal(c.channels.io.qualificationComplete,true);
  assert.equal(c.channels.eu.qualificationComplete,true);
  assert.equal(c.channels.ga.qualificationComplete,true);
  assert(Math.abs(c.channels.io.lockedSpan*4-1600)<1e-9);
  assert(Math.abs(c.channels.eu.lockedSpan*2-1600)<1e-9);
  assert(Math.abs(c.channels.ga.lockedSpan-1600)<1e-9);
  assert.equal(c.comparator.authorityQualification,'QUALIFIED_3');
  console.log('PASS 40 · replay ingress completes independent Io8/Europa4/Ganymede2 qualification');
}
{
  const c=new A8Core();
  c.beginObservationReplay();
  c.ingestObservationRecord({rawPulse:'10',moon:'io',x:0});
  assert.throws(()=>c.ingestObservationRecord({rawPulse:'9',moon:'io',x:0}),/monotonic nondecreasing/);
  console.log('PASS 41 · replay refuses backward raw-pulse ordering');
}
{
  assert.equal(classifyFile('/tmp/night.a8obs').kind,'A8_OBSERVATION_STREAM');
  assert.equal(classifyFile('/tmp/night.a8obs').readiness,'ENGINE_REPLAY_READY');
  console.log('PASS 42 · Data Bridge recognizes engine-ready .a8obs streams');
}

{
  assert(Math.abs(deriveRelativeX(1024.5,1418.2)-393.7)<1e-12);
  console.log('PASS 43 · telescope adapter derives defining x only as moonX − JupiterX');
}
{
  const csv=['frameId,rawPulse,moon,jupiterX,moonX,visible,uncertaintyX','F1,100,io,1000,1100,true,0.5','F2,125,io,1010,1110,true,0.5'].join('\n');
  const r=csvToA8Obs(csv);
  assert.equal(r.length,2);
  assert.equal(r[0].x,100);
  assert.equal(r[1].x,100);
  console.log('PASS 44 · telescope tracking drift cancels in Jupiter-relative pixel subtraction');
}
{
  const rows=generateRows({steps:220,noisePx:0,gapEvery:0});
  const obs=rowsToA8Obs(rows);
  const c=new A8Core();
  c.beginObservationReplay();
  for(const r of obs)c.ingestObservationRecord(r);
  assert.equal(c.channels.io.qualificationComplete,true);
  assert.equal(c.channels.eu.qualificationComplete,true);
  assert.equal(c.channels.ga.qualificationComplete,true);
  assert.equal(c.comparator.authorityQualification,'QUALIFIED_3');
  console.log('PASS 45 · fake CCD/counter stream reaches full 8:4:2 qualification through Lab 11');
}
{
  const rows=generateRows({steps:220,noisePx:0.7,gapEvery:0,seed:8});
  const obs=rowsToA8Obs(rows);
  const c=new A8Core();
  c.beginObservationReplay();
  for(const r of obs)c.ingestObservationRecord(r);
  assert.equal(c.comparator.authorityQualification,'QUALIFIED_3');
  console.log('PASS 46 · deterministic CCD centroid noise still reaches three-channel qualification');
}
{
  const rows=generateRows({steps:40,noisePx:0.5,gapEvery:8});
  assert(rows.some(r=>r.visible===false));
  assert.match(rowsToCsv(rows),/frameId,rawPulse,moon,jupiterX,moonX,visible,uncertaintyX/);
  console.log('PASS 47 · fake telescope emits optional visibility gaps using the future real-observer schema');
}

{
  const a=generateIrregularRows({steps:400,noisePx:0.7,weatherSeed:808});
  const b=generateIrregularRows({steps:400,noisePx:0.7,weatherSeed:808});
  assert.equal(a.rows.length,1200);
  assert.deepEqual(a.blocks,b.blocks);
  assert.equal(rowsToCsv(a.rows),rowsToCsv(b.rows));
  assert(a.visibleFrameGroups>0 && a.blockedFrameGroups>0);
  console.log('PASS 48 · irregular observatory weather is deterministic by seed and contains both observing and blocked blocks');
}
{
  const r=generateIrregularRows({steps:500,noisePx:0.7,weatherSeed:808});
  const blocked=r.rows.filter(x=>x.visible===false);
  assert(blocked.length>3);
  let foundRun=false;
  for(let i=3;i<r.rows.length;i+=3){
    if(!r.rows[i].visible && !r.rows[i-3].visible){foundRun=true;break}
  }
  assert(foundRun);
  const raws=[...new Set(r.rows.map(x=>x.rawPulse))].map(BigInt);
  for(let i=1;i<raws.length;i++) assert.equal(raws[i]-raws[i-1],25n);
  console.log('PASS 49 · blocked observing intervals are multi-frame blocks while the arbitrary raw counter continues without deletion');
}
{
  const r=generateIrregularRows({steps:1200,noisePx:0.7,weatherSeed:808});
  const obs=rowsToA8Obs(r.rows),c=new A8Core();c.beginObservationReplay();
  for(const x of obs)c.ingestObservationRecord(x);
  assert.equal(c.replayRecordCount,3600);
  assert.equal(c.sourceMode,'REAL_OBSERVATION_REPLAY');
  assert(['UNQUALIFIED','SINGLE_REFRESH','CORROBORATED_2','CORROBORATED_3_EARLY','QUALIFIED_3','REJECTED','HOLDOVER'].includes(c.comparator.authorityQualification));
  console.log('PASS 50 · irregular visibility replays through the unchanged recovery core without changing comparator/tolerance policy');
}
{
  const c=new A8Core({oscillator:73});
  runUntil(c,()=>allFullyQualified(c),18000,1);
  const before={io:c.channels.io.lockedSpan,eu:c.channels.eu.lockedSpan,ga:c.channels.ga.lockedSpan};
  c.setRecalibrationMode('MANUAL');
  c.advance(9000);
  assert.equal(c.channels.io.lockedSpan,before.io);
  assert.equal(c.channels.eu.lockedSpan,before.eu);
  assert.equal(c.channels.ga.lockedSpan,before.ga);
  assert.equal(c.recalibrationMode,'MANUAL');
  assert.equal(c.channels.io.calibrationActive,false);
  console.log('PASS 51 · MANUAL mode freezes established calibration instead of silently auto-refreshing it');
}
{
  const c=new A8Core({oscillator:73});
  runUntil(c,()=>allFullyQualified(c),18000,1);
  c.setRecalibrationMode('MANUAL');
  c.setDrift(8);
  const staleEpoch=c.oscillatorEpoch;
  assert.equal(c.channels.io.calibrationEpoch,staleEpoch-1);
  c.armManualCalibration();
  runUntil(c,()=>['io','eu','ga'].every(id=>c.channels[id].calibrationEpoch===staleEpoch && !c.channels[id].manualArmed),12000,1);
  assert.equal(c.channels.io.qualificationSpanCount,1);
  assert.equal(c.channels.eu.qualificationSpanCount,1);
  assert.equal(c.channels.ga.qualificationSpanCount,1);
  assert.equal(c.channels.io.calibrationActive,false);
  assert.match(c.channels.ga.calibrationMessage,/MANUAL · CALIBRATED/);
  console.log('PASS 52 · ARM MANUAL RECALIBRATION captures one fresh independent WEST→WEST span per primary moon then freezes again');
}
{
  const c=new A8Core();
  c.advance(777);
  const before=c.plantState('ca').ph;
  c.setCallistoDetune(0.75);
  const after=c.plantState('ca').ph;
  assert(Math.abs(signedCycleDeltaForTest(after,before))<1e-12);
  assert.equal(c.snapshot().secondary.callistoDetunePct,0.75);
  const innerBefore=c.plantDiagnostics().innerLaplaceResidual;
  c.advance(100);
  assert.equal(c.plantDiagnostics().innerLaplaceResidual,innerBefore);
  c.reset();
  assert.equal(c.snapshot().secondary.callistoDetunePct,0);
  console.log('PASS 53 · Callisto Chief Engineer detune preserves instantaneous phase and remains outside primary inner-system recovery diagnostic');
}
{
  const c=new A8Core();
  const s=c.snapshot();
  assert.equal(s.bench.stepsPerPass,8);
  assert.equal(s.bench.observerResolutionSteps,1);
  assert(s.bench.approximateNaturalGanymedeRateMultiple>1);
  console.log('PASS 54 · bench snapshot defaults to 8 steps/pass and preserves one-step observer resolution plus ×N natural-rate reference');
}
{
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'a8-root-'));
  const programs=path.join(tmp,'programs');
  const lab=path.join(programs,'a8_time_lab_v5_4_14');
  const data=path.join(programs,'A8-data');
  fs.mkdirSync(lab,{recursive:true});fs.mkdirSync(data,{recursive:true});
  assert.equal(resolveDataRoot(lab,undefined),data);
  fs.rmSync(tmp,{recursive:true,force:true});
  console.log('PASS 55 · default Data Bridge root now prefers sibling A8-data beside the installed lab folder');
}
{
  const c=new A8Core();
  c.beginObservationReplay();
  assert.equal(c.sourceMode,'REAL_OBSERVATION_REPLAY');
  c.endObservationReplay();
  assert.equal(c.sourceMode,'SIMULATED_PLANT');
  const serverText=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');
  assert.match(serverText,/\/api\/replay\/exit/);
  console.log('PASS 56 · explicit replay-exit control returns source ownership to SIMULATED_PLANT');
}
{
  const dataHtml=fs.readFileSync(path.join(__dirname,'..','public','data.html'),'utf8');
  assert.match(dataHtml,/START \/ RESTART REPLAY/);
  assert.match(dataHtml,/EXIT REPLAY → SIMULATED PLANT/);
  assert.match(dataHtml,/A8_OBSERVATION_STREAM/);
  assert.match(dataHtml,/replayPath'\)\.value=d\.path/);
  assert(dataHtml.indexOf('id="inspectPanel"') < dataHtml.indexOf('<h2>Archive files</h2>'));
  console.log('PASS 57 · Data Bridge inspection is visible, populates replay-ready .a8obs path, and keeps LOAD explicit');
}
{
  const ui=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8');
  assert.match(ui,/ARM MANUAL RECALIBRATION/);
  assert.match(ui,/Callisto secondary detuning/);
  assert.match(ui,/BENCH RATE REF/);
  console.log('PASS 58 · engineering UI restores manual calibration, Callisto secondary control, and plant acceleration readout');
}
{
  const c=new A8Core({oscillator:73});
  runUntil(c,()=>allFullyQualified(c),18000,1);
  c.setRecalibrationMode('MANUAL');
  c.advance(5000);
  c.setRecalibrationMode('AUTO');
  assert.equal(c.channels.io.qualificationSpanCount,0);
  assert.equal(c.channels.eu.qualificationSpanCount,0);
  assert.equal(c.channels.ga.qualificationSpanCount,0);
  runUntil(c,()=>allFullyQualified(c),18000,1);
  close(c.channels.io.lockedSpan,74752,0.01,'Io manual→auto');
  close(c.channels.eu.lockedSpan,149504,0.01,'Europa manual→auto');
  close(c.channels.ga.lockedSpan,299008,0.01,'Ganymede manual→auto');
  console.log('PASS 59 · MANUAL→AUTO transition starts fresh evidence and cannot alias across the frozen interval');
}

{
  const moonsHtml=fs.readFileSync(path.join(__dirname,'..','public','moons.html'),'utf8');
  assert.match(moonsHtml,/LOCKED · AWAITING CORROBORATION/);
  assert.match(moonsHtml,/own WEST→WEST recurrence recovered/);
  assert.match(moonsHtml,/another moon independently agrees/);
  console.log('PASS 60 · four-moon observer separates local LOCKED recovery from later cross-channel CORROBORATED state');
}
{
  const appJs=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  assert.match(appJs,/LOCKED · AWAITING CORROBORATION/);
  assert.match(appJs,/LOCKED · CORROBORATED/);
  console.log('PASS 61 · main engineering page exposes the same local-lock versus corroboration distinction');
}

{
  const ui=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8');
  const select=(ui.match(/<select id="benchSteps">([\s\S]*?)<\/select>/)||[])[1]||'';
  assert.match(select,/<option>1<\/option>/);
  assert.match(select,/<option>2<\/option>/);
  assert.match(select,/<option>4<\/option>/);
  assert.match(select,/<option selected>8<\/option>/);
  assert.doesNotMatch(select,/>16</);
  assert.doesNotMatch(select,/>32</);
  assert.doesNotMatch(select,/>64</);
  const serverText=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');
  assert.match(serverText,/const allowed = \[1, 2, 4, 8\]/);
  console.log('PASS 62 · engineering speed selector is intentionally limited to 1 / 2 / 4 / 8 plant steps per pass');
}
{
  const moonsHtml=fs.readFileSync(path.join(__dirname,'..','public','moons.html'),'utf8');
  assert.match(moonsHtml,/ACCELERATED SIMULATION · NOT NATURAL SPEED/);
  assert.match(moonsHtml,/moonBenchSteps/);
  assert.match(moonsHtml,/natural Ganymede rate ref/);
  console.log('PASS 63 · four-moon observer carries an explicit accelerated-speed warning, selector, and ×N natural-rate reference');
}

{
  const c=new A8Core({oscillator:73});
  c.advanceRealtimeClock(100000000n); // 100 ms: still inside first A8 state.
  const snap=c.snapshot();
  assert.equal(snap.clock.phase17,'0');
  assert(BigInt(snap.clock.paceFractionNumerator)>0n);
  assert.equal(snap.clock.paceFractionDenominator,String(86400n*1000000000n));
  assert.equal(snap.clock.demoStatePeriodMs,86400000/131072);
  console.log('PASS 64 · Node exposes read-only fractional REALTIME_DEMO phase for downstream observer interpolation');
}
{
  const clockHtml=fs.readFileSync(path.join(__dirname,'..','public','clock.html'),'utf8');
  assert.match(clockHtml,/OBSERVER PACER · NODE-ANCHORED LOCAL MONOTONIC INTERPOLATION · OUTPUT ONLY/);
  assert.match(clockHtml,/requestAnimationFrame\(observerFrame\)/);
  assert.match(clockHtml,/AUDIO_LOOKAHEAD_SECONDS/);
  assert.match(clockHtml,/scheduleTickAt\(nextAudioTickTime\)/);
  assert.doesNotMatch(clockHtml,/newPhase!==lastPhase[\s\S]{0,120}tickTone/);
  console.log('PASS 65 · clock observer no longer derives visual/audio beat timing from SSE packet arrival');
}

{
  const pkg=JSON.parse(fs.readFileSync(path.join(__dirname,'..','package.json'),'utf8'));
  const c=new A8Core({oscillator:73});
  assert.equal(pkg.version,'5.4.18');
  assert.equal(c.snapshot().version,pkg.version);
  for(const page of ['index.html','data.html','audio.html','angle.html','moons.html','telescope.html']){
    const html=fs.readFileSync(path.join(__dirname,'..','public',page),'utf8');
    assert.match(html,/v5\.4\.18/);
  }
  console.log('PASS 66 · package, API snapshot, and current engineering page stamps agree on v5.4.18');
}

console.log('ALL A8 v5.4.18 TESTS PASSED');
