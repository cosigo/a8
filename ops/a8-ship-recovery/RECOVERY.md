# A8 Ship Presentation Recovery

Qualified one-shot recovery control for the public Terra Ship Slip
presentation.

## Pinned Ship recovery point

Tag:

    ship-lifetime-recovery-2026-09-11

Commit:

    072269b7b06b2f2a568e218e3678b6f1bac6071f

Canonical tracked Ship file:

    sites/ship.cosigo.io/public/relationship.html

Pinned SHA-256:

    b5097154b582a00de96509263c3a9e624efadf54374ac60a16be26f87249f01f

## Runtime

Service:

    a8-ship-recovery.service

Listener:

    127.0.0.1:18022

Live target:

    /srv/sites/ship.cosigo.io/public/relationship.html

Installed engine:

    /opt/a8-ship-recovery/server.js

Persistent recovery state:

    /var/lib/a8-ship-recovery

## Qualified API contract

    GET  /api/ship-recovery/status
    GET  /api/ship-recovery/history
    POST /api/ship-recovery/arm
    POST /api/ship-recovery/apply

The API is exposed only inside the authenticated ce.cosigo.io
routing boundary.

## Safety contract

ARM is refused while the live Ship SHA-256 already equals the pinned
recovery SHA-256.

An ARM permit is bound to the exact live SHA-256 present at ARM time.

Any APPLY attempt consumes the permit.

APPLY refuses if the live file changed after ARM.

Before successful replacement, the current Ship presentation is copied
to recovery backup history.

The replacement is staged, SHA-256 verified, atomically renamed into
place, and SHA-256 verified again.

Recovery history records failed and successful APPLY attempts.

The recovery service does not modify:

    Core20
    /srv/apps
    Caddy configuration
    Terra Ship Slip lifetime state
    Git history

## Chief Engineer source policy

The live Chief Engineer page remains intentionally outside the top-level
sites Git tree.

Git stores only:

    chief-engineer-ship-recovery.patch.gz

That compressed patch records the exact recovery-panel change without
importing the entire private CE operating page into the presentation tree.

Decompressed patch SHA-256:

    0eb43c6c3a34abb40291b253cc813e6d23877e1a465abcf57df01503414c7d85

## Qualified hashes · 2026-09-11

Recovery server:

    e3fea6652634b14608c7f756944507fec7608f3faf97cf72522afb940aca2658

Systemd unit:

    db6d8ba8e5678c70e80a17cd550c85f8ea61ea106fd45c1a6a1f5f1a6b905c65

Live CE with recovery panel:

    da4ddddf2440a94cac3b836fb55647c471d07254729cb31954460c29f8dac1f2

Pinned Ship:

    b5097154b582a00de96509263c3a9e624efadf54374ac60a16be26f87249f01f
