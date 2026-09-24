# A8 Machine Runtime Snapshot

This tree records the current operational A8 machine source captured for
the 24 September 2026 clean Git baseline.

Paths below this directory mirror their live filesystem locations.

Example:

    ops/runtime-root/usr/local/sbin/a8-primary-stream-cache.py

corresponds to:

    /usr/local/sbin/a8-primary-stream-cache.py

This is source/reference material. It is not an instruction to blindly
copy this tree over a live machine.

## Secrets

Actual `.env` files are deliberately excluded.

The `.env.example` files contain variable names only; all live values
were omitted.

## Generated state

Systemd `*.wants/` enablement symlinks are excluded. They are generated
machine state rather than source.

Runtime markers, Python bytecode caches and working backup files are
also excluded.

## Retired compatibility

The LM555 emergency feeder is retired and is not part of this clean
baseline.

The old `a8-ghost-guard` / `a8-ghost-tombstones.tsv` compatibility
pair is not canonical. Current retired-web policy is maintained under:

    ops/web-tombstones/

Ghost / Shadow / Arduino hardware identities are not web tombstones.
