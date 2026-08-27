(() => {
'use strict';
const $ = id => document.getElementById(id);
let state = null;
let faultTimer = {};

async function send(action, extra = {}) {
  const r = await fetch('/api/control', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({action, ...extra})
  });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || 'control failed');
  return j.state;
}

function clsForQuality(q) {
  if (q === 'HEALTHY' || q === 'QUALIFIED_3' || q === 'CORROBORATED_3_EARLY' || q === 'CORROBORATED_2' || q === 'CORROBORATED') return 'good';
  if (q === 'FAULT' || q === 'CONFLICT' || q === 'REJECTED') return 'bad';
  return 'warn';
}
function recoveryDisplay(m) {
  if (m.recovery === 'LOCKED' && m.quality === 'SINGLE_CURRENT') {
    return {text: 'LOCKED · AWAITING CORROBORATION', cls: 'good'};
  }
  if (m.recovery === 'LOCKED' && m.quality === 'CORROBORATED') {
    return {text: 'LOCKED · CORROBORATED', cls: 'good'};
  }
  return {
    text: m.recovery + (m.quality !== 'SEEKING' ? ' / ' + m.quality : ''),
    cls: clsForQuality(m.quality)
  };
}
function fmtSpan(v) { return v == null ? '—' : Number(v).toFixed(2); }
function fmtPct(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  const p = v * 100;
  return (p >= 0 ? '+' : '') + p.toFixed(4) + '%';
}

function setPill(el, text, cls='') {
  el.textContent = text;
  el.className = 'pill ' + cls;
}

function render(s) {
  state = s;
  setPill($('connection'), 'CORE CONNECTED', 'good');
  setPill($('runState'), s.running ? 'RUNNING' : 'PAUSED', s.running ? 'good' : '');
  $('rawCount').textContent = s.raw.count;
  $('rawOsc').textContent = s.raw.oscillator;
  $('rawDrift').textContent = s.raw.driftOver512 + ' / 512';
  $('naturalStep').textContent = s.raw.naturalStep;
  $('benchAdvance').textContent = `${s.bench.stepsPerPass} plant steps / pass`;
  $('benchRate').textContent = `≈${Math.round(s.bench.approximateNaturalGanymedeRateMultiple).toLocaleString()}× natural Ganymede rate ref`;
  $('obsState').textContent = s.observation;
  $('oscEpoch').textContent = s.raw.oscillatorEpoch;
  $('recalModeRead').textContent = s.recalibration.mode + (s.recalibration.manualArmed ? ' · ARMED' : '');

  if (document.activeElement !== $('oscillator')) $('oscillator').value = s.raw.oscillator;
  if (document.activeElement !== $('drift')) $('drift').value = s.raw.driftOver512;
  if (document.activeElement !== $('benchSteps')) $('benchSteps').value = String(s.benchSteps);
  if (document.activeElement !== $('authority')) $('authority').value = s.comparator.authority;
  if (document.activeElement !== $('earthSpan')) $('earthSpan').value = s.divider.earthDayRawSpan;
  if (document.activeElement !== $('recalibrationMode')) $('recalibrationMode').value = s.recalibration.mode;
  $('armManualCalibration').disabled = s.recalibration.mode !== 'MANUAL';
  $('observationBtn').textContent = s.observation === 'ACTIVE' ? 'BLOCK OBSERVATION' : 'RESTORE OBSERVATION';

  for (const id of ['io','eu','ga']) {
    const m = s.moons[id];
    const card = $('moon_'+id);
    card.classList.toggle('authority', m.authority);

    setPill($(id+'Authority'), m.authority ? 'AUTHORITY' : 'WITNESS', m.authority ? 'primary' : 'ghost');
    const recovery = $(id+'Recovery');
    const recoveryView = recoveryDisplay(m);
    recovery.textContent = recoveryView.text;
    recovery.className = 'big status ' + recoveryView.cls;

    $(id+'Span').textContent = fmtSpan(m.lockedSpan);
    $(id+'Norm').textContent = fmtSpan(m.normalizedSpan);
    $(id+'Quality').textContent = m.quality + (m.deviation == null ? '' : ' ' + fmtPct(m.deviation));
    $(id+'Fresh').textContent = m.freshness + (m.calibrationEpoch == null ? '' : ' · E' + m.calibrationEpoch);
    $(id+'Phase').textContent = m.phaseOctal;
    $(id+'Detail').textContent =
      `WEST ${m.observed.W} · EAST ${m.observed.E}\n` +
      `last observed span: ${fmtSpan(m.lastObservedSpan)}\n` +
      `last phase error: ${m.lastPhaseError == null ? '—' : m.lastPhaseError.toFixed(8)} cycles\n` +
      `equal-duration baseline: ${m.qualification.spanCount}/${m.qualification.targetSpans} spans · ${m.qualification.complete ? 'FULL' : (m.calibrationEpoch === s.raw.oscillatorEpoch ? 'EARLY' : 'BUILDING')}\n` +
      `window raw: ${m.qualification.windowRaw == null ? '—' : m.qualification.windowRaw}\n` +
      `${m.calibrationMessage}\n` +
      `plant A8 PHASE9: ${m.plant.phase9Octal} · ${m.plant.phase9Binary}\n` +
      `φ reference only: ${m.plant.ph.toFixed(6)}\n` +
      `fault injection: ${Number(m.faultInjectionPct).toFixed(2)}%`;

    if (document.activeElement !== $('fault_'+id)) {
      $('fault_'+id).value = String(m.faultInjectionPct);
      $('fault_'+id+'_out').textContent = Number(m.faultInjectionPct).toFixed(2)+'%';
    }
  }

  // Restored Chief Engineer plant-integrity instrument.
  const d = s.diagnostics;
  setPill(
    $('plantIntegrity'),
    d.innerIntegrityLabel,
    d.innerIntegrityState === 'nominal' ? 'good' : (d.innerIntegrityState === 'fault' ? 'bad' : 'warn')
  );
  $('laplaceResidual').textContent = Number(d.innerLaplaceResidual).toExponential(2) + ' cycles';
  $('callistoPsi').textContent = Number(s.secondary.callistoPsi).toFixed(6);

  if (document.activeElement !== $('chiefIoFault')) {
    $('chiefIoFault').value = String(s.moons.io.faultInjectionPct);
    const v = Number(s.moons.io.faultInjectionPct);
    $('chiefIoFaultOut').textContent =
      (v > 0 ? '+' : '') + v.toFixed(2) +
      (v === 0 ? '% · RATE COMMAND NORMAL' : '% · RATE FAULT ACTIVE');
  }

  if (document.activeElement !== $('chiefCallistoDetune')) {
    const v = Number(s.secondary.callistoDetunePct || 0);
    $('chiefCallistoDetune').value = String(v);
    $('chiefCallistoDetuneOut').textContent =
      (v > 0 ? '+' : '') + v.toFixed(2) +
      (v === 0 ? '% · IDEAL SECONDARY RATE' : '% · SECONDARY DETUNE ACTIVE');
  }

  if (d.innerIntegrityState === 'nominal') {
    $('plantIntegrityNote').innerHTML =
      '<b>Anchor check:</b> the inner Io–Europa–Ganymede relationship is nominal. ' +
      'This diagnostic is outside the recovery path; it checks the simulated plant rather than defining the clock.';
  } else if (d.innerIntegrityState === 'deviating') {
    $('plantIntegrityNote').innerHTML =
      '<b>Anchor check:</b> a moon rate/phase disturbance is present and separation is accumulating. ' +
      'A channel may still remain recovered while the three-moon consistency diagnostic is no longer nominal.';
  } else {
    $('plantIntegrityNote').innerHTML =
      '<b>Anchor check failed:</b> the inner relationship has departed by at least one 1/512 phase state ' +
      'in this idealized plant diagnostic. Recovery evidence remains visible; the wider anchor is flagged inconsistent.';
  }

  setPill($('compVerdict'), s.comparator.verdict,
    s.comparator.verdict.includes('AGREEMENT') ? 'good' :
    (s.comparator.verdict.includes('DEVIATION') || s.comparator.verdict.includes('CONFLICT') || s.comparator.verdict.includes('SPLIT')) ? 'bad' : 'warn');
  $('lockedCount').textContent = s.comparator.lockedCount + ' / 3';
  $('currentCount').textContent = s.comparator.currentCount + ' / 3';
  $('fullCount').textContent = s.comparator.fullQualifiedCount + ' / 3';
  $('compEpoch').textContent = s.comparator.oscillatorEpoch;
  $('epochRef').textContent = s.comparator.epochReference == null ? '—' : Number(s.comparator.epochReference).toFixed(2);
  $('liveMedian').textContent = s.comparator.liveMedian == null ? '—' : Number(s.comparator.liveMedian).toFixed(2);
  $('refMode').textContent = s.comparator.referenceMode;
  $('compSpread').textContent = s.comparator.spread == null ? '—' : (s.comparator.spread*100).toFixed(4)+'%';

  setPill($('dividerCalibration'), s.divider.calibration, clsForQuality(s.divider.calibration));
  $('dividerRaw').textContent = s.divider.rawInput;
  $('dividerAuthority').textContent = s.divider.authority.toUpperCase();
  $('dividerQuality').textContent = s.divider.authorityQuality;
  $('availableAuthorities').textContent = (s.divider.availableAuthorities || []).length
    ? s.divider.availableAuthorities.map(x => x.toUpperCase()).join(' · ')
    : '—';
  $('dividerOutput').textContent = s.divider.output;
  $('dividerRem').textContent = s.divider.remainder;
  $('dividerTicks').textContent = s.divider.totalTicks;
  $('clockPace').textContent = s.divider.clockPaceText;

  $('clockDecimal').textContent = s.clock.decimal;
  $('clockOctal').textContent = s.clock.octal;
  $('clockBinary').textContent = s.clock.binary.slice(0,5)+' '+s.clock.binary.slice(5,11)+' '+s.clock.binary.slice(11);
  $('clockPhase').textContent = s.clock.phase17;
  $('dayCount').textContent = s.clock.dayCount;
  $('lastAlign').textContent = s.clock.lastAlign
    ? `#${s.clock.lastAlign.eventSeq} · phase ${s.clock.lastAlign.phase17}`
    : 'NONE';

  const events = (s.recorder && s.recorder.events) || [];
  $('eventLog').textContent = events.length
    ? events.map(ev => {
        const details = ev.details && Object.keys(ev.details).length
          ? ' · ' + JSON.stringify(ev.details)
          : '';
        return `#${ev.seq} [${ev.type}] raw=${ev.rawCount} step=${ev.naturalStep} E${ev.oscillatorEpoch} phase=${ev.dayPhase17} · ${ev.message}${details}`;
      }).join('\n')
    : 'No events yet.';
}

document.querySelectorAll('[data-action]').forEach(btn => {
  btn.addEventListener('click', async () => {
    const action = btn.dataset.action;
    try {
      if (action === 'step') await send('step', {steps: Number($('benchSteps').value)});
      else await send(action);
    } catch (e) { alert(e.message); }
  });
});

let numericTimer = {};
function liveNumber(id, action) {
  const el = $(id);
  el.addEventListener('input', () => {
    clearTimeout(numericTimer[id]);
    numericTimer[id] = setTimeout(() => {
      if (el.value === '' || el.value === '-' || el.value === '+') return;
      send(action, {value:el.value}).catch(e=>alert(e.message));
    }, 120);
  });
}
liveNumber('oscillator', 'oscillator');
liveNumber('drift', 'drift');
$('benchSteps').addEventListener('change', () => send('benchSteps', {value:$('benchSteps').value}).catch(e=>alert(e.message)));
$('authority').addEventListener('change', () => send('authority', {source:$('authority').value}).catch(e=>alert(e.message)));
$('earthSpan').addEventListener('change', () => send('earthSpan', {value:$('earthSpan').value}).catch(e=>alert(e.message)));
$('observationBtn').addEventListener('click', () => {
  const blocked = state && state.observation === 'ACTIVE';
  send('observation', {blocked}).catch(e=>alert(e.message));
});
$('recalibrationMode').addEventListener('change', () => {
  send('recalibrationMode', {mode:$('recalibrationMode').value}).catch(e=>alert(e.message));
});
$('armManualCalibration').addEventListener('click', () => {
  send('armManualCalibration').catch(e=>alert(e.message));
});

for (const id of ['io','eu','ga']) {
  const input = $('fault_'+id);
  input.addEventListener('input', () => {
    $('fault_'+id+'_out').textContent = Number(input.value).toFixed(2)+'%';
    clearTimeout(faultTimer[id]);
    faultTimer[id] = setTimeout(() => {
      send('fault', {source:id, percent:Number(input.value)}).catch(e=>alert(e.message));
    }, 80);
  });
}

// Historical "DON'T TOUCH · CHIEF ENGINEER" Io dial.
// It is intentionally the SAME Node fault command as the Io channel slider.
$('chiefIoFault').addEventListener('input', () => {
  const v = Number($('chiefIoFault').value);
  $('chiefIoFaultOut').textContent =
    (v > 0 ? '+' : '') + v.toFixed(2) +
    (v === 0 ? '% · RATE COMMAND NORMAL' : '% · RATE FAULT ACTIVE');
  clearTimeout(faultTimer.chief_io);
  faultTimer.chief_io = setTimeout(() => {
    send('fault', {source:'io', percent:v}).catch(e=>alert(e.message));
  }, 80);
});

$('chiefCallistoDetune').addEventListener('input', () => {
  const v = Number($('chiefCallistoDetune').value);
  $('chiefCallistoDetuneOut').textContent =
    (v > 0 ? '+' : '') + v.toFixed(2) +
    (v === 0 ? '% · IDEAL SECONDARY RATE' : '% · SECONDARY DETUNE ACTIVE');
  clearTimeout(faultTimer.chief_ca);
  faultTimer.chief_ca = setTimeout(() => {
    send('callistoDetune', {percent:v}).catch(e=>alert(e.message));
  }, 80);
});


function localMsSinceMidnight() {
  const d = new Date();
  return d.getHours()*3600000 + d.getMinutes()*60000 + d.getSeconds()*1000 + d.getMilliseconds();
}

$('alignNow').addEventListener('click', async () => {
  try {
    await send('alignLocal', {
      msSinceMidnight: localMsSinceMidnight(),
      source: 'ENGINEERING LAB · ONE-SHOT LOCAL WALL CLOCK'
    });
  } catch (e) { alert(e.message); }
});

$('clearRecorder').addEventListener('click', () => send('clearEvents').catch(e=>alert(e.message)));

$('copyRecorder').addEventListener('click', async () => {
  const text = $('eventLog').textContent;
  try {
    await navigator.clipboard.writeText(text);
    $('copyRecorder').textContent = 'COPIED';
    setTimeout(() => $('copyRecorder').textContent = 'COPY RECORDER', 1000);
  } catch {
    alert('Clipboard unavailable. Select and copy the recorder text manually.');
  }
});

const ev = new EventSource('/events');
ev.onmessage = e => render(JSON.parse(e.data));
ev.onerror = () => setPill($('connection'), 'RECONNECTING', 'warn');

fetch('/api/state').then(r=>r.json()).then(render).catch(()=>{});
})();
