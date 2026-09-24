'use strict';

/*
 * AUSPICIOUS 8 · POST-SEAL HARDWARE BRANCH
 * GATE 6B · RECEIVE-ONLY SERIAL-SHAPED TRANSPORT ADAPTER
 *
 * Gate 6B deliberately does NOT open a real serial/USB device yet.
 *
 * It accepts arbitrary chunks of an ASCII byte stream shaped like a serial
 * receiver. Frames are newline-delimited JSON and must reduce exactly to the
 * Gate-6A external pulse-rig observation contract.
 *
 * Wire frame:
 *
 *   {"schema":"A8-EXTERNAL-PULSE-RIG-SAMPLE-V1",
 *    "source":"EXTERNAL_PULSE_RIG",
 *    "rig":"ARDUINO_A",
 *    "rawPulse":"1250"}\n
 *
 * Critical isolation rule:
 *   chunk boundaries and chunk arrival cadence are transport properties only.
 *   They never enter the defining event and cannot influence rawPulse math.
 *
 * Deliberately absent:
 *   - serialport / USB library
 *   - baud-derived time
 *   - host timestamps
 *   - seconds / A8 seconds
 *   - Hz
 *   - clock phase
 *   - divider ratio
 *   - outbound send/write/command path
 *   - oscillator/divider trim
 *   - A8Core writes
 */

const {
  ExternalPulseRigObserver,
} = require('./a8-external-pulse-rig-contract');

const TRANSPORT_SCHEMA =
  'A8-PULSE-RIG-RECEIVE-ONLY-TRANSPORT-V1';

const MAX_FRAME_BYTES = 512;

function validateAsciiChunk(chunk) {
  let buffer;

  if (Buffer.isBuffer(chunk)) {
    buffer = chunk;
  } else if (typeof chunk === 'string') {
    buffer = Buffer.from(chunk, 'utf8');
  } else {
    throw new Error(
      'receiveChunk accepts only Buffer or string input'
    );
  }

  for (const byte of buffer.values()) {
    if (byte > 0x7f) {
      throw new Error(
        'transport accepts ASCII bytes only'
      );
    }

    if (byte === 0x00) {
      throw new Error(
        'transport rejects NUL bytes'
      );
    }
  }

  return buffer;
}

class PulseRigReceiveOnlyTransport {
  constructor({
    observer = new ExternalPulseRigObserver(),
    maxFrameBytes = MAX_FRAME_BYTES,
  } = {}) {
    if (
      !observer ||
      typeof observer.observe !== 'function' ||
      typeof observer.snapshot !== 'function'
    ) {
      throw new Error(
        'observer must implement Gate-6A observe() and snapshot()'
      );
    }

    if (
      !Number.isSafeInteger(maxFrameBytes) ||
      maxFrameBytes < 64 ||
      maxFrameBytes > 4096
    ) {
      throw new Error(
        'maxFrameBytes must be an integer from 64 through 4096'
      );
    }

    this.observer = observer;
    this.maxFrameBytes = maxFrameBytes;

    this.pending = Buffer.alloc(0);

    this.receivedChunkCount = 0;
    this.receivedByteCount = 0;
    this.acceptedFrameCount = 0;
  }

  receiveChunk(chunk) {
    const incoming = validateAsciiChunk(chunk);

    this.receivedChunkCount += 1;
    this.receivedByteCount += incoming.length;

    this.pending = Buffer.concat([
      this.pending,
      incoming,
    ]);

    if (
      this.pending.length > this.maxFrameBytes &&
      this.pending.indexOf(0x0a) === -1
    ) {
      this.pending = Buffer.alloc(0);

      throw new Error(
        'unterminated transport frame exceeds maxFrameBytes'
      );
    }

    const accepted = [];

    while (true) {
      const newlineIndex = this.pending.indexOf(0x0a);

      if (newlineIndex < 0) {
        break;
      }

      const rawLine = this.pending.subarray(
        0,
        newlineIndex
      );

      this.pending = this.pending.subarray(
        newlineIndex + 1
      );

      let line = rawLine;

      if (
        line.length > 0 &&
        line[line.length - 1] === 0x0d
      ) {
        line = line.subarray(0, line.length - 1);
      }

      if (line.length === 0) {
        throw new Error(
          'empty transport frame is not allowed'
        );
      }

      if (line.length > this.maxFrameBytes) {
        throw new Error(
          'transport frame exceeds maxFrameBytes'
        );
      }

      let event;

      try {
        event = JSON.parse(
          line.toString('ascii')
        );
      } catch (err) {
        throw new Error(
          `invalid transport JSON frame: ${err.message}`
        );
      }

      const snapshot = this.observer.observe(event);

      this.acceptedFrameCount += 1;

      accepted.push(snapshot);
    }

    if (this.pending.length > this.maxFrameBytes) {
      this.pending = Buffer.alloc(0);

      throw new Error(
        'pending transport frame exceeds maxFrameBytes'
      );
    }

    return accepted;
  }

  end() {
    if (this.pending.length !== 0) {
      throw new Error(
        'transport ended with incomplete frame'
      );
    }

    return this.snapshot();
  }

  snapshot() {
    return {
      schema: TRANSPORT_SCHEMA,
      role: 'RECEIVE_ONLY_SERIAL_SHAPED_ADAPTER',
      mode: 'SIMULATED_BYTE_STREAM_ONLY',

      receivedChunkCount:
        this.receivedChunkCount,

      receivedByteCount:
        this.receivedByteCount,

      acceptedFrameCount:
        this.acceptedFrameCount,

      pendingByteCount:
        this.pending.length,

      gate6a:
        this.observer.snapshot(),

      transportDiagnosticsAreAuthority: false,

      usesRealSerialDevice: false,
      usesUsbDevice: false,
      usesNetworkTransport: false,

      sendsBytes: false,
      commandsHardware: false,

      writesA8Core: false,
      writesClock: false,
      writesOscillator: false,
      writesDivider: false,
      writesAuthority: false,

      usesHostTime: false,
      usesLegacyTime: false,
      usesFrequencyHz: false,
      usesBaudAsTime: false,

      acceptsTimestamp: false,
      acceptsClockPhase: false,
      acceptsDividerRatio: false,
    };
  }
}

module.exports = {
  TRANSPORT_SCHEMA,
  MAX_FRAME_BYTES,
  validateAsciiChunk,
  PulseRigReceiveOnlyTransport,
};
