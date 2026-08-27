AUSPICIOUS 8 TIME LAB v5.4.18
UNIFIED NODE CORE + OBSERVER UI


V5.4.18 OBSERVER CADENCE CORRECTION
----------------------------------
User recording exposed a presentation defect: the Node clock retained the correct
long-term rate, but the browser clock hand and audible tick were being triggered by
SSE packet arrival. Network/browser delivery jitter therefore sounded and looked like
clock instability.

This build changes only the downstream observer path:
  - Node remains the sole owner of DAY_PHASE17.
  - Recovery, 8:4:2 qualification, comparator, divider, replay, and telescope math
    are unchanged.
  - The Node snapshot now exports the read-only fractional remainder of the existing
    REALTIME_DEMO pacer so an observer can locate itself within the current A8 state.
  - clock.html uses local performance.now() only to interpolate presentation between
    Node anchors. Packet arrival no longer advances the visible beat.
  - audible A8-second ticks use a Web Audio look-ahead queue at exactly
    86400 / 131072 = 0.6591796875 conventional seconds per A8 state.
  - ordinary SSE jitter is ignored as a tempo source; direct controls and material
    phase divergences re-anchor the observer to Node.

Boundary:
  Browser interpolation and Web Audio are OUTPUT ONLY. They cannot modify recovery,
  oscillator, divider, or clock state. Closing the page leaves the Node core running.

PURPOSE
-------
This version removes authoritative time/recovery state from browser tabs.

One Node process owns:
  - one arbitrary raw oscillator / BigInt pulse counter
  - one shared simulated Jovian plant
  - three independent WEST→WEST recovery channels
  - Io ×4 / Europa ×2 / Ganymede ×1 comparator
  - selected calibration authority and qualification interlock
  - provisional Earth-day divider
  - 17-bit 32 / 64 / 64 A8 clock

The browser is an observer/control panel only.

NO NPM INSTALL IS REQUIRED.
Node.js v20 is sufficient.

START
-----
From this folder:

  node tests/run-tests.js

Do not proceed if any test fails.

Then:

  node server.js

Open:

  http://127.0.0.1:8000/

Optional different port:

  PORT=8001 node server.js

SAFETY / MIGRATION RULE
-----------------------
legacy/ contains byte-for-byte copies of:
  io_eng_v0.6.20.html
  euro_eng_v0.6.20.html
  gany_eng_v0.6.20.html

Their SHA-256 values are recorded in legacy/SHA256SUMS.json.
Do not edit those specimens.

V5 PORTING RULES
----------------
Preserved from v0.6.20:
  1. Raw oscillator count is arbitrary.
  2. Recovery math consumes observed apparent position and raw pulse count.
  3. WEST/EAST is detected from three successive apparent-position samples.
  4. First complete WEST→WEST span establishes initial lock.
  5. AUTO replacement uses a clean fresh WEST→WEST span.
  6. Oscillator changes invalidate partly completed calibration spans.
  7. Io ×4, Europa ×2, Ganymede ×1 normalize to the common G-equivalent scale.
  8. Disagreement is evidence and is never averaged back into the defining path.
  9. Callisto remains secondary and does not define the inner 1:2:4 recovery.

NEW IN V5
---------
- One shared raw counter instead of one counter per browser page.
- One unified Node authority instead of BroadcastChannel timing between tabs.
- Generalized lab fault injection for Io, Europa, or Ganymede.
- Comparator semantics:
    one locked channel  -> UNVERIFIED
    two agreeing       -> HEALTHY
    two disagreeing    -> CONFLICT (cannot identify which is wrong)
    three channels     -> median diagnostic can expose an outlier
- Divider status no longer uses ambiguous "SYNCED":
    QUALIFIED
    UNVERIFIED
    HOLDOVER
    REJECTED / UNQUALIFIED
- If the selected authority becomes a comparator FAULT/CONFLICT after a previously
  valid state, the divider reports HOLDOVER while raw pulses and clock state continue.
- Switching to a healthy authority does not erase the faulty channel's evidence.

IMPORTANT: EARTH-DAY DIVIDER
----------------------------
The v5 Earth-day raw span remains a PROVISIONAL LABORATORY INPUT.
Default = 131072 raw pulses only to make the wiring visible.

This is not a claim that one physical Earth day naturally equals 131072 arbitrary
oscillator pulses. The eventual Earth-rotation observation/recovery layer must supply
the real raw-pulse span.

DETERMINISTIC TESTS
-------------------
Test 1:
  oscillator 73
  Io       = 74,752 raw ticks
  Europa   = 149,504 raw ticks
  Ganymede = 299,008 raw ticks
  4I = 2E = G = 299,008

Test 2:
  oscillator 73 → 146 without reset
  native raw spans double
  normalized structure survives

Test 3:
  blackout
  drift changes
  old calibration survives
  observation restore permits fresh clean recalibration

Test 4:
  Ganymede selected and healthy
  inject +1% Ganymede rate fault
  after observational evidence accumulates:
    Ganymede = FAULT
    Io/Europa = HEALTHY
    divider = HOLDOVER
  switch authority to Io:
    divider = QUALIFIED
    Ganymede fault evidence remains

Test 5:
  unselected Ganymede fault does not corrupt healthy selected Io authority

FILES
-----
server.js             Node HTTP/SSE server and scheduler
core/a8-core.js       authoritative simulation/recovery/comparator/divider/clock
public/index.html     observer/control interface
public/app.js         UI and HTTP/SSE wiring
public/style.css      UI styles
tests/run-tests.js    deterministic non-browser acceptance tests
legacy/               immutable v0.6.20 reference specimens

ARCHITECTURE
------------
                  ONE NODE CORE
                       |
                ONE RAW COUNTER
                       |
            +----------+----------+
            |          |          |
           IO       EUROPA     GANYMEDE
            |          |          |
            +------ COMPARATOR ----+
                       |
              CALIBRATION AUTHORITY
                       |
                   QUALIFIER
                       |
                    DIVIDER
                       |
                 17-BIT CLOCK
                       |
                HTTP / SSE OUTPUT
                       |
                    BROWSER

Browser closure, tab switching, throttling, rendering, or refresh must not stop or
reset the core.


V5.1 CALIBRATION-EPOCH CORRECTION
---------------------------------
Live testing exposed a transitional false-fault condition during common oscillator
drift changes. Io, Europa, and Ganymede reacquire at different speeds. v5.0 could
therefore compare a fresh Io/Europa span against an older Ganymede span and briefly
label Ganymede FAULT.

v5.1 assigns an oscillator epoch to every common oscillator/drift setting.
Only recovered spans from the CURRENT epoch may be compared.

On any oscillator or drift change:
  - oscillator epoch increments
  - existing spans are retained for holdover
  - all prior spans become RECALIBRATING / stale for comparison
  - divider enters HOLDOVER if it had a prior qualified calibration
  - Io/Europa/Ganymede reacquire independently
  - current-epoch channels may cross-check one another
  - old-epoch evidence is never called a moon fault
  - once all three are current and agree, divider returns QUALIFIED

This preserves the distinction:
  COMMON OSCILLATOR CHANGE = RECALIBRATION
  ONE-MOON PERTURBATION    = POSSIBLE NATURAL-CHANNEL FAULT

UI:
  oscillator and drift numeric controls now apply live while typing (debounced);
  Enter is no longer required.


V5.2 CORRELATED-FAULT / MAJORITY CORRECTION
-------------------------------------------
Live testing exposed a second comparator limitation:

  Europa +0.25%
  Ganymede +0.25%
  Io nominal

A simple median makes Europa/Ganymede the majority and can falsely label Io as the
outlier. v5.2 removes that interpretation.

RULE:
  The live median is diagnostic only and never defines truth.

When all three CURRENT channels first agree in a given oscillator epoch, v5.2 freezes
that three-channel consensus as the QUALIFIED EPOCH BASELINE.

Later same-epoch behavior is judged against that frozen reference:
  - one channel shifts -> SINGLE-CHANNEL DEVIATION
  - two channels shift together -> TWO-CHANNEL CORRELATED DEVIATION
  - healthy minority cannot be outvoted merely by a 2-of-3 majority
  - selected shifted authority -> divider HOLDOVER

If the machine has no prior qualified baseline and starts in a 2-v-1 split:
  - no channel is declared correct
  - all current channels are marked CONFLICT
  - verdict = UNRESOLVED
  - divider cannot become QUALIFIED

This does not claim the frozen baseline is Nature forever. It is same-oscillator-epoch
historical evidence for fault isolation. A common oscillator change creates a new epoch
and requires a new three-channel baseline.


V5.2.1 UI CONTROL REFINEMENT
----------------------------
Plant steps / scheduler pass now offers binary-granular control:

  1 · 2 · 4 · 8 · 16 · 32 · 64

Default remains 32.

This changes only simulation execution granularity/speed. It does not alter raw
oscillator mathematics, moon recurrence, recovery, comparator, divider, or clock logic.


V5.3 NORMAL CLOCK PACE
----------------------
Live testing confirmed the intended disturbance semantics:
  - moon rate-fault injection affects only the adjusted moon
  - Delta drift changes the one common raw oscillator, therefore all three moon
    recovery channels must recalibrate

The accelerated Jovian simulation is intentionally kept fast so locks and fault tests
can be observed in seconds.

The visible 17-bit clock is now decoupled from that acceleration:
  - Jovian plant / raw divider: accelerated engineering test bench
  - visible A8 clock: NORMAL DEMO PACE
  - 131072 A8 states per conventional 86400-second Earth day
  - one A8 second is therefore about 0.6591796875 conventional seconds

Implementation uses Node's monotonic elapsed-time counter (process.hrtime.bigint()) only
to pace the development display. No wall-clock date/time value enters Jovian recovery.
This is explicitly NOT the final native clock definition. The future Earth-rotation
recovery layer must replace the demo pacer.

The raw divider still accumulates accelerated test ticks separately so its engineering
behavior remains observable.


V5.4 STAGED RECOVERY / AUTHORITY
--------------------------------
A common oscillator change no longer behaves as an all-or-none global lock.

Expected sequence:
  1. all previous-epoch spans become RECALIBRATING
  2. Io completes a fresh recurrence first
  3. Europa completes next
  4. Ganymede completes last

Evidence strength:
  1 current selected channel:
      SINGLE-CHANNEL REFRESH
      usable by the selected authority, awaiting cross-check

  2 current agreeing channels:
      CORROBORATED · 2 CHANNELS
      usable with independent cross-check

  3 current agreeing channels:
      FULLY VERIFIED · 3 CHANNELS
      freezes the qualified same-epoch baseline

If the currently selected authority is still stale, the divider remains HOLDOVER even
when another fresh channel exists. The UI exposes fresh available authorities, but the
core does NOT silently auto-switch. This preserves fault/recovery evidence and operator
intent.

Two current channels that disagree are CONFLICT and force HOLDOVER. A two-channel
majority never establishes the frozen epoch baseline; only three-channel agreement does.


V5.4.1 CHECKPOINT — CLOCK OBSERVER + ALIGN + FLIGHT RECORDER
------------------------------------------------------------
1. Original v3.7 clock face restored at:
     http://127.0.0.1:8000/clock.html

   The analog face, decimal/octal representations, converter, alarm, and original
   32/64/64 geometry remain. Node now owns DAY_PHASE17. The browser no longer owns
   authoritative timing state.

2. ONE-SHOT ALIGN:
   Samples local computer wall-clock phase once and writes only DAY_PHASE17.
   It does NOT change:
     raw oscillator/counter
     oscillator epoch
     Io/Europa/Ganymede recovered spans
     comparator baseline
     selected authority
     divider calibration

   After the phase kick, the visible A8 clock continues on the normal demo pacer.

3. FLIGHT RECORDER:
   Engineering page records control and state transitions using:
     event sequence
     raw count
     plant step
     oscillator epoch
     DAY_PHASE17
     selected authority
     exact comparator/quality details

   This is intended to catch brief, hard-to-reproduce CONFLICT states.
   The recorder deliberately does not need conventional timestamps.

4. v5.4 is preserved separately. v5.4.1 is a checkpoint extension, not an overwrite.


V5.4.2 FOUR-MOON VISUALIZATION RESTORE
--------------------------------------
This checkpoint restores a direct visible moon-motion page at:

  /moons.html

Purpose:
  - one page only
  - Io, Europa, Ganymede, and Callisto together
  - keep WEST / EAST labels
  - keep color distinction between front and back passes
  - let the user re-visualize reacquisition timing after common oscillator changes

Implementation notes:
  - the page is a pure observer of the current Node core state
  - Io/Europa/Ganymede use the live plant state already present in the core
  - Callisto is exposed through secondary.callistoPlant
  - no moon page owns any timing or recovery logic
  - the original separate legacy engine pages remain preserved under /legacy


V5.4.3 FOUR-MOON VISUAL FIDELITY CORRECTION
-------------------------------------------
No Jovian plant physics or recovery timing was changed.

The /moons.html observer now matches the original v0.6.20 visual rules:
  - exact horizontal mapping: left = (x + 1) * 50 percent
  - x=-1 reaches WEST endpoint exactly
  - x=+1 reaches EAST endpoint exactly
  - no CSS left-position interpolation/smoothing
  - FRONT/BACK uses cos(2*pi*phase) >= 0 exactly as v0.6.20
  - recovery evidence displays the actual calibrationMessage, including
    "1/2 WEST CAPTURED", instead of only a coarse freshness label

Deterministic staged-recovery check at oscillator 73, after Δ 0 -> 4:
  common change step: 7169
  Io CURRENT:          8961
  Europa CURRENT:     11265
  Ganymede CURRENT:   15361

Therefore Io and Europa do not reacquire simultaneously in the core. Any prior
appearance of simultaneous reacquisition was a visualization/status-resolution issue.


V5.4.4 EQUAL-DURATION-BASELINE QUALIFICATION — 8 : 4 : 2
------------------------------------------------
Primary change:
  Io       FULL qualification = 8 complete WEST→WEST spans
  Europa   FULL qualification = 4 complete WEST→WEST spans
  Ganymede FULL qualification = 2 complete WEST→WEST spans

Reason:
  because the native recurrence relation is approximately 1:2:4,
  these span counts cover the same physical observation duration.

At nominal oscillator 73:
  Io       8 x  74,752 = 598,016 raw pulses
  Europa   4 x 149,504 = 598,016 raw pulses
  Ganymede 2 x 299,008 = 598,016 raw pulses

Important:
  FULL qualification is not the same thing as first recovery.

  After ONE clean WEST→WEST recurrence:
    - a channel becomes CURRENT / EARLY RECOVERED
    - if explicitly selected, it may refresh the recovered scale
    - a second channel may corroborate it
    - three early channels may corroborate provisionally

  The frozen oscillator-epoch baseline is established only after:
    - Io reaches 8/8
    - Europa reaches 4/4
    - Ganymede reaches 2/2
    - all three normalized recurrence estimates agree within tolerance

Measurement:
  lockedSpan is refined as the average over the current equal-duration-baseline
  WEST window. Once full, the window rolls at its target width.

This preserves the v5.4 fault-tolerance architecture while making FULL
qualification compare equal-duration evidence instead of equal cycle counts.


V5.4.5 ORIGINAL INSTRUMENT RESTORATION
--------------------------------------
Restored two instruments that were lost during Node consolidation.

1. AUDIBLE BINARY OSCILLATOR
   URL:
     /audio.html

   Restored from the original a8_audible_oscillator.html:
     - 512 browser-Hz bench anchor
     - binary octave ladder 16..32768 Hz
     - direct frequency entry
     - divide-by-two / multiply-by-two
     - sine / triangle / square / sawtooth
     - volume + STOP

   It remains downstream browser audio only. Browser Hz never enters the
   Jovian recovery path or defines A8 time.

2. DON'T TOUCH · CHIEF ENGINEER
   Restored on the main engineering page as a collapsible warning panel:
     - Chief Engineer's Io orbital-rate fault dial
     - cumulative unwrapped inner Laplace residual
     - INNER SYSTEM NOMINAL / DEVIATING / FAULT
     - Callisto envelope diagnostic

   The Chief dial sends the SAME Node Io fault action as the Io channel's
   engineering fault slider. There is one Io plant, not a second browser copy.

No moon plant equations, 8:4:2 qualification logic, comparator behavior,
clock pacing, or one-shot ALIGN behavior were changed.


V5.4.6 REPRESENTATION-HIERARCHY CONSOLIDATION
----------------------------------------------
This checkpoint consolidates v5.4.5 and corrects a foundational presentation leak.

PRIMARY JOVIAN PHASE REPRESENTATION:
  A8 PHASE9
  9-bit register / 512 states
  000_8 -> 777_8

SECONDARY ENGINEERING REFERENCE:
  normalized continuous simulator coordinate phi
  0.000000 <= phi < 1.000000

Changes:
  - every simulated plantState exposes phase9, phase9Octal, phase9Binary
  - /moons.html promotes A8 PLANT PHASE9 to the dominant phase metric
  - normalized decimal phi and normalized x are visually subordinate references
  - main engineering cards are explicitly labeled A8 RECOVERED PHASE9
  - engineering detail lists A8 plant PHASE9 before phi reference
  - no plant physics, turn detection, recovery, 8:4:2 qualification, comparator,
    Chief Engineer diagnostics, audio bench, clock pacing, or ALIGN logic changed

FOUNDATIONAL RULE:
  Mathematical normalized coordinates may remain available for engineering,
  but where an A8 ruler exists they must not visually or conceptually supersede
  the native A8 representation.


V5.4.7 A8 FREQUENCY TRAINER
---------------------------
The restored browser-audio page has been converted from a conventional Hz
generator into a native A8 frequency trainer.

GOVERNING PRINCIPLE:
  The physical oscillation does not change. The measurement ruler changes.

PRIMARY FREQUENCY DISPLAY:
  cycles per A8 second

CURRENT DEVELOPMENT TRANSLATION:
  1 A8 second = 675/1024 conventional seconds

Therefore:
  conventional browser Hz = A8 frequency * 1024/675
  A8 frequency = conventional Hz * 675/1024

Examples:
  256 cycles/A8s -> about 388.361481 conventional Hz
  512 cycles/A8s -> about 776.722963 conventional Hz
  1024 cycles/A8s -> about 1553.445926 conventional Hz

The binary ladder buttons now carry native A8 values. Halve/double operates
on the A8 frequency before conversion to browser Hz. Conventional Hz is shown
smaller as a secondary implementation/reference value and can be hidden in
trainer mode.

High theoretical A8 ladder values remain conceptually visible but are marked
hardware-limited when the translated browser frequency is at or above the
current audio context's Nyquist limit.

No Jovian recovery, 8:4:2 qualification, clock, phase, Chief Engineer, or
oscillator architecture changed in v5.4.7.


A8 OCTAVE TRAINING NOTE
-----------------------
A musical octave is the physical frequency ratio 2:1.

The A8 frequency ladder is octave-friendly by structure:
  256 A8 -> 512 A8 -> 1024 A8
is:
  one octave down -> anchor -> one octave up

The trainer labels each native A8 ladder button with its octave displacement
from the 512-A8 anchor. This does not claim that Nature is binary; the physical
fact is the 2:1 acoustic ratio. A8 represents that ratio cleanly through native
doubling and halving.


V5.4.8 OBSERVATION DATA BRIDGE
------------------------------
Adds a READ-ONLY bridge to observational source data stored beside the time lab.

Default:
  ~/programs/a8_time_lab_v5_4_8/
  ~/programs/a8_data/

Override:
  A8_DATA_DIR=/some/path node server.js

Page:
  /data.html

Read-only API:
  GET /api/data/inventory
  GET /api/data/inspect?path=<relative-path>
  GET /api/data/replay-schema

Tools:
  node tools/a8-data-audit.js [data-directory]
  tools/fetch-observatory-data.sh [data-directory]

The bridge is deliberately NOT connected to defining A8 recovery yet.

Replay separation:
  conventional source timestamps -> replay envelope only
  published orbital periods      -> never injected as recovered spans
  photometric brightness         -> never relabeled apparent x without reduction
  original observatory files     -> never overwritten by the lab

Terminology:
  "EQUAL-BASELINE" is clarified to "EQUAL-DURATION BASELINE".
  Io 8, Europa 4, and Ganymede 2 recurrences cover matched durations but begin
  from each moon's own independently observed landmark; simultaneous WEST starts
  or finishes are not required.


V5.4.9 A8 ANGLE TRANSLATION WALL
--------------------------------
Adds a reusable exact translation layer between conventional angular source
data and native A8 angle representation.

Exact scales:
  legacy degrees -> A8 angle units : multiply 64/45
  A8 angle units -> legacy degrees : multiply 45/64

Full turn:
  360 legacy degrees = 512 A8 angle units = 1000₈, wrapping to 000₈.

IMPORTANT:
  The 512-unit circle is NOT a 512-position precision ceiling.
  Fractional octal digits are retained below each whole A8 angular unit.
  Observatory precision is not rounded into one of 512 bins.

New page:
  /angle.html

New read-only/reference API:
  GET /api/angle/from-legacy-degrees?degrees=<value>&octalDigits=<0..18>
  GET /api/angle/to-legacy-degrees?a8=<value>
  GET /api/angle/shared-scale-facts

Native presentation is octal-first. Decimal A8 values are secondary reference.

SHARED 45/64 SCALE
------------------
The following exact scale independently appears in both current A8 angle and
minute subdivisions:

  1 A8 angle unit = 45/64 legacy degree
  1 A8 minute     = 45/64 legacy minute

Therefore the inverse translation in both cases is ×64/45.

Also:
  1 A8 hour = 45 legacy minutes.

This is documented as an architectural consequence of the selected A8 circle
and A8 day subdivisions, not as proof that Nature uses a numeral system.

DATA BRIDGE
-----------
The Data Bridge now includes:
  - a wallflower instruction placard,
  - a visible 360 -> 512 translation wall,
  - live exact degree -> A8 angle conversion,
  - an explicit NO 0–511 ROUNDING rule.

The observatory replay adapter remains NOT CONNECTED to defining recovery in
v5.4.9. This checkpoint establishes the conversion machinery first.


V5.4.10 CIRCLE GEOMETRY / PI PROOFS
-----------------------------------
Pi remains the same dimensionless constant:
  pi = circumference / diameter

Decimal spelling:
  3.141592653589793...

Octal spelling:
  3.11037552421026430215..._8

A8 full turn:
  1000_8 = 512 A8 angle units

General A8 arc:
  s = (theta/512) * 2*pi*r

Radius:
  r = (512*s)/(2*pi*theta)
    = (256*s)/(pi*theta)

Native landmarks:
  1000_8 = 512 full turn  -> r = C/(2*pi)
   400_8 = 256 half turn  -> r = s/pi
   200_8 = 128 quarter    -> r = 2s/pi

Unchanged geometry:
  C = 2*pi*r
  D = 2*r
  A = pi*r^2


V5.4.11 REAL OBSERVATION REPLAY INGRESS
---------------------------------------
The bridge can now drive the existing recovery engine from verified .a8obs
streams.

Defining core input:
  rawPulse + moon + signed Jupiter-relative displacement x

Important simplification:
  x does NOT need to be normalized to -1..+1.
  x does NOT need to be converted into 512 A8 angle units.
  The three-sample WEST/EAST reversal detector only requires a repeatable
  signed Jupiter-relative east-west displacement. Pixel offset, arcsecond
  offset, or another physically verified linear apparent-position coordinate
  can therefore be fed directly.

.a8obs JSON-lines example:
  {"schema":"a8obs-v1","rawPulse":"100","moon":"io","x":-15.2,"visible":true}

API:
  GET  /api/replay/status
  POST /api/replay/load     {"path":"normalized/night.a8obs"}
  POST /api/replay/start
  POST /api/replay/step     {"count":64}
  POST /api/replay/run
  POST /api/replay/restart

Replay START:
  - stops the hidden plant
  - clears plant recovery evidence
  - preserves the replay file's record order
  - requires nondecreasing rawPulse
  - passes only rawPulse, moon, x, visibility into the recovery channel

No source UTC, published orbital period, RA/Dec, degrees, or ephemeris values
enter RecoveryChannel.detect().

NORMALIZER
----------
For already physically reduced observations:
  node tools/a8obs-normalize.js input.csv normalized/output.a8obs

Required columns:
  rawPulse,moon,x

PULKOVO SCHEMA AUDIT
--------------------
  node tools/pulkovo-schema-audit.js path/to/satsdat.dat

The known Pulkovo satsdat files contain direct topocentric satellite RA/Dec,
but not a clean Jupiter-relative x field. Their companion Jupiter coordinates
are not admitted to the defining path where the catalogue documentation says
they were obtained with jovicentric ephemerides. The audit tool makes that gate
explicit rather than silently manufacturing x.


V5.4.13 FAKE TELESCOPE / FUTURE REAL CCD ADAPTER
-------------------------------------------------
New page: /telescope.html

The fake telescope and a future real CCD observer use the SAME CSV contract:
  frameId,rawPulse,moon,jupiterX,moonX,visible,uncertaintyX

Defining reduction only:
  x = moonX - jupiterX

No 360->512 conversion is required by WEST/EAST detection. Telescope drift cancels because moon position is measured relative to Jupiter in each frame.

CLI:
  node tools/fake-telescope.js generate OUTPUT.csv [frames] [noisePx] [gapEvery]
  node tools/fake-telescope.js convert INPUT.csv OUTPUT.a8obs

Real-data workflow:
  preserve original CCD frames + counter log
  create CSV using the same headers
  convert CSV to separate .a8obs normalized output
  feed .a8obs into Lab 11 REAL_OBSERVATION_REPLAY

Also removes stale Data Bridge wording that said replay was not yet connected.


V5.4.13 IRREGULAR OBSERVATORY VISIBILITY / LAB 11 EXPERIMENT 4
-------------------------------------------------------------
Purpose: replace the artificial fixed gapEvery=N pattern with reproducible observing
blocks separated by irregular missing-data blocks. This models the first approximation
of daylight, horizon loss, clouds, poor seeing, and equipment interruption without
pretending those causes are themselves part of the Jovian defining ruler.

Frozen in this build:
- RecoveryChannel WEST/EAST detector logic
- Io:Europa:Ganymede 8:4:2 qualification
- 1:2:4 normalization
- A8 comparator tolerance (1/512)
- replay defining input contract

New CLI:
  node tools/fake-telescope.js generate-irregular OUTPUT.csv [frames] [noisePx] [weatherSeed]

Default Experiment 4 visibility model:
- 4000 frame groups
- observing blocks: 20..80 frame groups
- ordinary blocked blocks: 15..120 frame groups
- 1/8 chance that a gap block is long: 150..400 frame groups
- deterministic weatherSeed 808
- raw counter step remains 25 and continues during blocked intervals
- blocked records carry visible=false; x is not fabricated into the detector

This experiment is diagnostic. It is NOT tuned to force QUALIFIED_3. Depending on which
true extrema remain observable, the unchanged core may qualify, hold over, or reject.
That outcome is evidence about observability/recovery behavior, not a reason to loosen
tolerance automatically.


V5.4.17 ENGINEERING-LAB MAINTENANCE / FEATURE RESTORATION
---------------------------------------------------------
This is a controlled maintenance build. Primary recovery mathematics, 8:4:2
equal-duration qualification, Io×4 / Europa×2 / Ganymede×1 normalization, and
A8_TOL = 1/512 remain unchanged.

Restored / repaired:
  - MANUAL/AUTO recalibration selector and ARM MANUAL RECALIBRATION lab control.
    AUTO remains the default. MANUAL freezes an established calibration until armed;
    arming captures one fresh WEST→WEST span independently on each primary channel.
  - Callisto secondary detuning control in the Chief Engineer lab panel. It preserves
    instantaneous phase, changes future Callisto rate only, and never enters primary
    Io–Europa–Ganymede recovery/authority.
  - Plant-step perspective: steps/pass, observer resolution = 1 plant step, and an
    approximate ×N natural-Ganymede-rate reference restored as non-defining bench UI.
  - Replay wording: START / RESTART REPLAY explicitly remains in replay mode.
  - Explicit EXIT REPLAY → SIMULATED PLANT control.
  - Data Bridge INSPECT panel moved above the archive list; clicking INSPECT scrolls
    to visible feedback. Engine-ready .a8obs inspection populates Relative .a8obs path
    but never auto-LOADs it.
  - Default A8 data-root resolution now searches the lab's immediate sibling directory
    first, so ~/programs/a8_time_lab_* finds ~/programs/A8-data without requiring
    A8_DATA_DIR when that sibling exists.

Acceptance: 59 deterministic tests pass.


V5.4.17 VISUAL RECOVERY-STATE CLARIFICATION
-------------------------------------------
UI-only correction; defining recovery/comparator math is unchanged.

- A sole recovered primary channel now displays `LOCKED · AWAITING CORROBORATION`
  immediately when its own WEST→WEST span closes. In a normal clean startup this is Io.
- When a second independent primary channel agrees, the display changes to
  `CORROBORATED` / `LOCKED · CORROBORATED` even if the first moon is physically mid-pass.
- The four-moon page now explicitly distinguishes local recovery from later cross-channel
  corroboration so color changes cannot be mistaken for simultaneous turn events.
- No change to RecoveryChannel.detect(), 1:2:4 normalization, 8:4:2 qualification,
  source modes, authority rules, or A8_TOL = 1/512.


v5.4.17 UI speed clarification:
- Bench default reduced to 8 plant steps/pass.
- Selectable display advance is limited to 1 / 2 / 4 / 8.
- Four-moon view now shows a prominent ACCELERATED SIMULATION warning and live ×N natural Ganymede-rate reference.
- Recovery math, observation resolution, normalization, qualification and tolerance are unchanged.


V5.4.17 A8 CLOCK TERMINOLOGY CORRECTION
--------------------------------------
UI/presentation only. No recovery, comparator, normalization, qualification or tolerance changes.
- Bare Hour/Minute/Second labels on A8 clock controls are replaced by explicit A8 HOUR / A8 MINUTE / A8 SECOND.
- Decimal comfort hierarchy: 1/32 DAY, 1/64 A8 HOUR, 1/64 A8 MINUTE.
- Native octal hierarchy: 1/40₈ DAY, 1/100₈ A8 HOUR, 1/100₈ A8 MINUTE.
- Face and input labels switch with numeral notation.
