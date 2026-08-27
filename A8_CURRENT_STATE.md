# Auspicious 8 — Canonical Operating State

Checkpoint: 2026-08-27 UTC

## Canonical implementation

A8 v5.4.20 / Core20

Server tree:

`/srv/apps/a8_time_lab_v5_4_20_postseal_hw`

Service:

`a8-core20.service`

Listener:

`127.0.0.1:18020`

## Core18 retirement

A8 v5.4.18 / Core18 is historical only.

`a8-time-lab.service` is:

- inactive
- disabled

Port `8018` is retired.

A server reboot confirmed that Core18 does not return.

## Public Core20 transport

- `GET /api/core20/clock`
- `GET /api/core20/edges`
- `POST /api/core20/connect`

Native audio ditty:

- `GET /api/core20/ditty/state`
- `GET /api/core20/ditty/score`
- `GET /api/core20/ditty/events`
- `POST /api/core20/ditty/start`
- `POST /api/core20/ditty/reset`

## Clock authority chain

Jupiter  
→ Io / Europa / Ganymede  
→ recovered natural elapsed-time ruler  
→ Mintaka  
→ Sol  
→ Terra Ship Slip  
→ recovered Sun return  
→ exact 2^17 DAY_PHASE17  
→ 32 × 64 × 64 A8 clock

## Audio

Native pitch is expressed as cycles per A8 second.

Core20 establishes native note boundaries.

WebAudio is downstream speaker/DAC translation only.

The current player preserves oscillator phase between native note changes and
uses only a short DAC-side retune ramp to suppress click/pop artifacts.

## Official disaster-recovery snapshot

`a8-disaster-recovery-20260827-020512Z.tar.gz`

SHA256:

`0a84511f537a1ebda8f98e6b8c3b3b04cd790b246e3f1975c65e1a70dcbf8bb5`
