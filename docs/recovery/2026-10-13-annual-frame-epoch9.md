# A8 Annual Frame · Epoch-9 C/D Recovery

## October 13, 2026 · Historical recovery evidence

**Record only. NOT deployable configuration.**

The Epoch-8 A/B physical carrier stopped advancing. The separate
C/D Core21 carrier continued and supplied a native elapsed-state
witness for recovering the Annual Frame's omitted progression.

The original September 22 Sol equinox remains sealed at `600₈`.
The original annual rate remains unchanged:

- Full turn: 512 A8 angular states
- Annual recurrence: 47,874,048 native A8 states
- Annual angle per native state: 1/93504

## Epoch handoff

- Epoch-8 last accepted physical RAW: 60,515,120
- Epoch-9 physical RAW anchor: 5,986,133
- Inherited annual angle: 25105611496265/61382664384
- No cross-epoch RAW subtraction or pulse reconstruction

## C/D native witness

- First frozen A/B checkpoint: day 28, phase 110153
- Corresponding C/D checkpoint: day 28, phase 114696
- C/D elapsedWholeStates: 1,340,177
- Previous A/B-minus-C/D observed offset: +18 native states
- Estimated C/D stop coordinate: 1,335,616 elapsed states
- C/D before-rebirth checkpoint: 1,629,626 elapsed states
- C/D after-rebirth checkpoint: 1,635,093 elapsed states

## Conditional reconstruction

- Lower native displacement: 294,010
- Upper native displacement: 299,477
- Lower candidate anchor angle: 412.146015309973
- Midpoint candidate anchor angle: 412.175249353436
- Upper candidate anchor angle: 412.204483396900
- Applied midpoint correction: **197829/62336 A8 angular states**
- Corrected exact Epoch-9 anchor: **50600829996907/122765328768**
- Recovered annual register: **634₈**

The bounds depend on the estimated start alignment. The exact
Epoch-8 RAW-to-C/D boundary and exact rebirth C/D state were not
simultaneously observed; the midpoint is not a physical observation.

## Runtime verification

Activation output recorded:

- Live annual angle: 412.832978739415 A8
- Register: 634₈
- `PHYSICAL_RAW_HOLDOVER_ACTIVE`
- `UNQUALIFIED_EPOCH9_HOLDOVER`

Subsequent public Sol, Ship and Date API checks agreed on register
634₈ with sequentially advancing continuous angles.

Absolute solar phase remains **unqualified**. This reconstruction
does not change Core20, Core21, rate, sealed Sol evidence or calendar.

## Evidence integrity

- C/D candidate SHA256:
  `83b32a09b27ed00f018020db7539bc817bbfe176cb02f3da0a190cda7fcafaae`
- Activated certificate SHA256:
  `2f4d84d934de76c9693793f0ee8eb1ddba3e199a3795822758939fda645d79b0`
- Live Annual Frame server SHA256:
  `4a2da0714ecc069f172ae8502f495d187d987a0b6ecd7c8fbd5cc8fbc39ae7f2`
- Rollback certificate:
  `/etc/a8-annual-frame/active-carrier.json.before-cd-recovery-20261013T140739Z`

This document is historical evidence, not an instruction to load
or replace a runtime certificate.
