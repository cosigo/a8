# Auspicious 8 · Canonical Live Baseline

This repository begins from the verified live A8 machine state sealed on
24 September 2026.

## Authority direction

LIVE VERIFIED MACHINE
→ CANONICAL SNAPSHOT
→ GIT

Git is a source/history repository. It must not be used to infer,
reconstruct, or overwrite live architecture without first comparing
against the current verified machine.

## Retired web artifacts

`ops/web-tombstones/a8-web-tombstones.tsv` is the explicit retired-web
policy.

Retirement is path-specific. No file, service, device, or subsystem is
retired merely because its name contains a word such as `ghost`,
`shadow`, or `arduino`.

A8 hardware identities named Ghost / Shadow / Arduino are unrelated to
web tombstones.

## Protected architecture

`ce.cosigo.io` is an intentional current surface. Its `index.html` and
`chief-engineer.html` files are preserved.

The active Telescope presentation remains sourced from the current
Telescope implementation captured under `protected/telescope/`.

## Baseline rule

Before committing or publishing a canonical tree, run:

    ./ops/verify-canonical-tree.sh

Retired web files must remain absent and required canonical files must
remain present.
