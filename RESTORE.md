# A8 Restore Guide

## Restore Core20

Canonical destination:

`/srv/apps/a8_time_lab_v5_4_20_postseal_hw`

Public site:

`/srv/sites/a8.cosigo.io/public`

Service wrapper:

`/usr/local/lib/a8-core20-service.js`

Systemd unit:

`/etc/systemd/system/a8-core20.service`

## Important

Do not automatically restore or enable Core18.

`a8-time-lab.service` must remain disabled unless performing an explicit
historical rollback investigation.

Port `8018` should remain unused.

## Restore sequence

Copy `core20/` to the canonical Core20 path.

Copy `public-site/` to the public site path.

Restore the Core20 wrapper and systemd service from `ops/`.

Use `ops/Caddyfile.redacted` as a routing reference only. Authentication
material must be installed locally and must never be committed.

Then:

    sudo systemctl daemon-reload
    sudo systemctl enable --now a8-core20.service

Validate and reload Caddy:

    sudo caddy validate --config /etc/caddy/Caddyfile
    sudo systemctl reload caddy

## Health proof

    systemctl is-active a8-core20.service

    sudo ss -ltnp | grep ':18020'

    curl -sS http://127.0.0.1:18020/api/core20/clock

Expected:

`CORE20_CLOCK_RUNNING`

Core18 verification:

    systemctl is-active a8-time-lab.service || true
    systemctl is-enabled a8-time-lab.service || true
    sudo ss -ltnp | grep ':8018' || echo '8018 absent'

Expected:

- inactive
- disabled
- 8018 absent
