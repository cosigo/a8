# A8 Five-Body Predictive Engine — Live Qualified 2026-09-13

## Status

The A8 five-body predictive layer is live-qualified against the physical
Epoch-5 counter.

Active prediction lanes:

- Io
- Europa
- Ganymede
- Mintaka
- Sol

Callisto remains a slower independent cross-check and is not one of the
five active prediction lanes in this version.

Core20 remained active throughout installation and qualification.
No Core20 restart was required.

## Architecture

Core20 remains the operating engine.

The five-body marker engine is a read-only prediction layer. It:

- reads the live physical Epoch-5 RAW counter;
- reads a sealed A8 operating seed;
- predicts future observable markers;
- does not write Core20;
- does not write the civil clock;
- does not change Core20 authority;
- does not require an ongoing external astronomy feed.

The prediction layer therefore acts as an instrument placed on top of
the existing physical system rather than as a replacement authority.

## One-shot preparation

External astronomy was used deliberately during a one-shot preparation
session to improve initial placement and model accuracy.

The preparation material included current astronomical reference data
such as JPL/Horizons and USNO orientation data. Those source quantities
were converted into A8 phase and Epoch-5 RAW relationships.

After conversion, the operating seed became autonomous.

External astronomy is not prohibited from future comparison or
observation. It may be used later as an independent witness to score
A8 predictions, but it is not an ongoing steering feed.

Historical Pulkovo Galilean-moon observations remain an independent
observational witness and are not required by the operating engine.

## Sealed operating seed

Schema:

`A8-FIVE-BODY-OPERATING-SEED-V2`

Physical source:

`SOURCE_EPOCH = 5`

Initial physical RAW anchor:

`850032359`

Source-packet seal:

`47649f287ff2e1aacaceb6ab52461cda8fd48b03ab9ba3aeb97a14571651c25a`

Operating-seed SHA256:

`77eb2c5029886ed5bd5261746fe02b95f16580b76b5fef9c3d645d2dc0bb08ad`

Marker-engine SHA256:

`d90419da93ed170843236938b6dadecd75d34e2cf8c5c02ee9274885d3534e5d`

## Prediction evidence

The existing hourly Core20 checkpoint now also freezes:

- the current physical Epoch-5 RAW state;
- the five-body prediction snapshot existing at that RAW;
- the exact prediction engine;
- the exact sealed V2 operating seed;
- SHA256 hashes for the checkpoint contents.

This establishes the evidence order:

1. A8 publishes or records a prediction.
2. The prediction is frozen before the event.
3. Nature produces the later observable result.
4. A witness RAW is recorded.
5. Residual = witnessed RAW - predicted RAW.
6. Residual history may improve future predictions.
7. Past predictions are never rewritten to match later observations.

## Operating philosophy

A8 remains Nature-first.

Natural recurrence and physical relationships establish the rulers.
The predictive system uses those rulers to state what should happen
next. Nature then supplies the result.

A8 is therefore presented as a predictive and falsifiable system rather
than claiming authority merely by declaration. Independent observers
are invited to test the predictions, record disagreements, measure
residuals, and challenge the model.

Authority, if earned, should emerge from repeated agreement with Nature
and independent consensus.

## Live-qualified files

- `ops/core20/five-body/a8-five-body-marker-engine.js`
- `ops/core20/five-body/a8-five-body-operating-seed-v2.json`
- `ops/core20/a8-core20-checkpoint`

The live operating installation remains authoritative over this Git
checkpoint. Git records the qualified state; it is not used to blindly
overwrite the live system.
