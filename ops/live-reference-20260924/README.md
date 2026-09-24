# A8 Sep-24 Current-Machine Recovery Reference

This tree was reconstructed from the frozen Sep-24 machine reference,
not copied from the running machine.

- Base Git commit: `0f7d80cbc3f259ed1ee678ac9f9bfb5a47390ef8`
- Frozen static reference SHA-256: `b48fce90fe0b1f684d39a6097f54e21741cab1939fc006e9ab3c39a05e91589e`
- Runtime reference: `/srv/backups/a8-runtime-reference-20260924T124913Z`
- Live machine was not modified during reconstruction.
- Historical, rollback, diagnostic and generated copies remain in the
  immutable filesystem seal unless explicitly selected.
- `/etc/a8-shadow-ghost.env` is represented only by a redacted
  `.env.example`.
- Caddy authentication credentials are removed from
  `Caddyfile.redacted`.
- Deployment symlinks are preserved as symlinks.

This snapshot intentionally preserves captured Sep-24 state,
including presentation/runtime-version discrepancies. It is a
recovery reference, not a silent cleanup pass.
