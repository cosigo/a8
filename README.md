# Auspicious 8

Auspicious 8 engineering repository.

Live laboratory:

- https://lab.a8.cosigo.io
- https://a8.cosigo.io

## Current implementation

The canonical current implementation is A8 v5.4.20 / Core20.

`core20/`

Core18 / v5.4.18 is retained only as historical and rollback source:

`historical/core18-v5.4.18/`

## Core20 authority chain

Jupiter  
→ Io / Europa / Ganymede recurrence recovery  
→ recovered natural elapsed-time ruler  
→ Mintaka Earth axial-rotation witness  
→ Sol orbital-direction observer  
→ Mintaka–Sol relationship  
→ Terra Ship Slip  
→ recovered Sun-return recurrence  
→ exact 2^17 DAY_PHASE17  
→ 32 × 64 × 64 native A8 civil clock

The browser is downstream presentation only.

## Repository layout

- `core20/` — current canonical implementation
- `public-site/` — current public A8 site
- `historical/` — preserved historical source
- `ops/` — systemd, service wrapper and redacted Caddy reference
- `snapshot-meta/` — official checkpoint metadata
- `A8_CURRENT_STATE.md` — canonical operating checkpoint
- `RESTORE.md` — reconstruction procedure

## Disaster recovery

The full server disaster-recovery archive is intentionally not stored in GitHub.

Official snapshot:

`a8-disaster-recovery-20260827-020512Z.tar.gz`

SHA256:

`0a84511f537a1ebda8f98e6b8c3b3b04cd790b246e3f1975c65e1a70dcbf8bb5`
