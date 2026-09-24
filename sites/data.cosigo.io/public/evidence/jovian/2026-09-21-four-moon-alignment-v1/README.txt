A8 · JOVIAN FOUR-MOON EPOCH-7 ALIGNMENT WITNESS
2026-09-21

SOURCE OBSERVATION
------------------
Two direct telescope screen recordings contain Jupiter and all four
Galilean moons in the same field.

User identification, left -> right:
GANYMEDE · IO · JUPITER · EUROPA · CALLISTO

Observed horizontal motion between the two witnesses:
all four moons move SCREEN-RIGHT.

The exact 10-second witness frames also contain the live physical Epoch-7
RAW and the Core20 civil day/phase, allowing the sky geometry and Core20
mapping to be checked from the same captured evidence.

WITNESS A
---------
Video                  : Kooha-2026-09-21-05-16-36.mkv
Frame                   : +10.000 s
Physical Epoch-7 RAW    : 9,636,120
Physical sequence       : 895,261
Displayed Core20        : Epoch 3 · Day 9 · Phase 61,742
Mapped model RAW        : 870,591,388

Jupiter-relative detector X, pixels:
  Ganymede  -260.573625
  Io         -54.259368
  Europa    +112.675023
  Callisto  +564.845735

Sealed coordinate-model A8 X:
  Ganymede   +92.182867
  Io         +18.916285
  Europa     -41.152515
  Callisto  -202.012960

WITNESS B
---------
Video                  : Kooha-2026-09-21-05-38-48.mkv
Frame                   : +10.000 s
Physical Epoch-7 RAW    : 9,676,599
Physical sequence       : 899,021
Displayed Core20        : Epoch 3 · Day 9 · Phase 63,762
Mapped model RAW        : 870,631,867

Jupiter-relative detector X, pixels:
  Ganymede  -255.771674
  Io         -46.013361
  Europa    +120.207921
  Callisto  +566.426316

Sealed coordinate-model A8 X:
  Ganymede   +90.734457
  Io         +16.011835
  Europa     -43.286207
  Callisto  -202.864951

CORE20 RESULT
-------------
Existing physical -> Core20 mapping:
  Witness A predicts Day 9 / Phase 61,742 exactly.
  Witness B predicts Day 9 / Phase 63,762 exactly.

CORE20 ALIGNMENT RESULT: PASS · EXACT BOTH WITNESSES.

No Core20 correction is made.

MOONS PAGE / MODEL RESULT
-------------------------
The qualified Epoch-7 -> Epoch-5 handoff maps the witness RAW values to:
  9,636,120 -> model RAW 870,591,388
  9,676,599 -> model RAW 870,631,867

Using the sealed coordinate recurrence carried by the coordinate model,
one common detector scale fits all eight moon positions:

  scale                 : 2.798002510 px / A8-X
  RMS residual          : 1.670634 px
  maximum |residual|    : 2.645732 px

It also predicts SCREEN-RIGHT motion for all four moons.

By contrast, the Sep-20 coordinate-fold path that subtracts the new
operational 1:2:4 periods directly into the older sealed sample RAW axis
produces:

  fitted scale           : 2.823021027 px / A8-X
  RMS residual           : 8.503606 px
  maximum |residual|     : 15.397490 px

The largest residual is Ganymede, about 15.4 pixels.

INTERPRETATION
--------------
This does NOT support changing the natural 1:2:4 period ruler.

It shows that an operational PERIOD ruler and an ABSOLUTE POSITION sample
axis are not interchangeable. The Sep-20 Jovian driver itself reported
absoluteMoonPhaseQualified=false. Therefore the operational period should
not silently become the absolute phase key used to index an older sealed
coordinate grid.

The evidence points to the coordinate-lookup layer, not Core20.

DO NOT CHANGE FROM THIS OBSERVATION
-----------------------------------
- Core20 phase
- Core20 rate
- physical Epoch-7 counter
- 1:2:4 Jovian natural ruler
- Arduino source
- model seed evidence

FILES
-----
observation.json      machine-readable measurements and residuals
core20-check.txt      exact physical -> Core20 proof
witness-early-10s.png exact witness frame A
witness-later-10s.png exact witness frame B
two source MKV files  original screen recordings
entry014.html         proposed Data page evidence card
install-entry014.sh   fail-closed Data page installer only
SHA256SUMS            packet checksums
