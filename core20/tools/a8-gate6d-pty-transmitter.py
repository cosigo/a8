#!/usr/bin/env python3
"""
AUSPICIOUS 8 · POST-SEAL HARDWARE BRANCH
GATE 6D · PSEUDO-TERMINAL TRANSMITTER FIXTURE

This program represents the EXTERNAL HARDWARE SIDE of the test only.

It:
- creates a local PTY pair,
- prints the slave path for the receive-only A8 reader,
- transmits an explicit fixture from the PTY master side,
- uses ASCII bytes only,
- sends terminal EOT after the fixture so the read-only slave reaches EOF.

It receives no commands from the A8 reader and exposes no return protocol.
Any sleep/chunk behavior here is transport-fixture behavior only and is not
included in the Gate-6A defining measurement.
"""

import argparse
import os
import pty
import sys
import termios
import time


def positive_int(text):
    value = int(text)
    if value < 1:
        raise argparse.ArgumentTypeError("must be >= 1")
    return value


def nonnegative_int(text):
    value = int(text)
    if value < 0:
        raise argparse.ArgumentTypeError("must be >= 0")
    return value


def configure_slave_canonical_no_echo(slave_fd):
    attrs = termios.tcgetattr(slave_fd)

    # Keep canonical input so ASCII EOT at an empty line yields EOF to reader.
    attrs[3] |= termios.ICANON
    attrs[3] &= ~(termios.ECHO | termios.ECHONL)

    termios.tcsetattr(
        slave_fd,
        termios.TCSANOW,
        attrs,
    )


def main():
    parser = argparse.ArgumentParser(
        description="Gate-6D external PTY transmitter fixture"
    )

    parser.add_argument(
        "--fixture",
        required=True,
        help="explicit ASCII NDJSON fixture",
    )

    parser.add_argument(
        "--tx-chunk-bytes",
        type=positive_int,
        required=True,
    )

    parser.add_argument(
        "--delay-us",
        type=nonnegative_int,
        default=0,
    )

    parser.add_argument(
        "--startup-delay-ms",
        type=nonnegative_int,
        default=150,
    )

    args = parser.parse_args()

    with open(args.fixture, "rb") as handle:
        payload = handle.read()

    if not payload:
        raise RuntimeError("fixture is empty")

    if any(byte > 0x7F for byte in payload):
        raise RuntimeError("fixture must be ASCII")

    if not payload.endswith(b"\n"):
        raise RuntimeError("fixture must end with newline")

    master_fd, slave_fd = pty.openpty()

    try:
        configure_slave_canonical_no_echo(slave_fd)

        slave_path = os.ttyname(slave_fd)

        # Coordination output only. This is not measurement data.
        print(f"PTY={slave_path}", flush=True)

        if args.startup_delay_ms:
            time.sleep(args.startup_delay_ms / 1000.0)

        chunk = args.tx_chunk_bytes

        for offset in range(0, len(payload), chunk):
            os.write(
                master_fd,
                payload[offset:offset + chunk],
            )

            if args.delay_us:
                time.sleep(args.delay_us / 1_000_000.0)

        # In canonical mode, EOT at an empty line causes slave read EOF.
        os.write(master_fd, b"\x04")

        # Keep master open briefly so the reader consumes the queued EOF cleanly.
        time.sleep(0.05)

    finally:
        os.close(master_fd)
        os.close(slave_fd)

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"FIXTURE FAIL · {exc}", file=sys.stderr)
        raise
