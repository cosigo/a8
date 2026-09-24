'use strict';

/*
 * AUSPICIOUS 8 · POST-SEAL HARDWARE BRANCH
 * GATE 6C · LOCAL OS READ-ONLY DEVICE-PATH READER
 *
 * This layer may open a local OS path such as:
 *   /dev/ttyUSB0
 *   /dev/ttyACM0
 *
 * Gate 6C itself does not configure the UART and does not write to the device.
 * The path is opened by fs.createReadStream(... flags:'r' ...), so the reader
 * receives bytes only and forwards them into the unchanged Gate-6B adapter.
 *
 * Gate 6C still does NOT prove a physical Arduino/USB serial attachment.
 * The proof uses a local fixture path and multiple OS read-buffer sizes.
 *
 * Critical isolation:
 *   OS chunk size / device delivery cadence are transport details only.
 *   They never enter the Gate-6A defining event or its rawPulse arithmetic.
 *
 * Deliberately absent:
 *   - write-capable device descriptor
 *   - createWriteStream / writeFile / appendFile
 *   - serial-port configuration command
 *   - baud-derived time
 *   - host timestamps
 *   - outbound bytes
 *   - A8Core writes
 *   - oscillator/divider trim
 *   - clock/phase/authority writes
 */

const fs = require('fs');
const path = require('path');

const {
  PulseRigReceiveOnlyTransport,
} = require('./a8-pulse-rig-receive-only-transport');

const DEVICE_READER_SCHEMA =
  'A8-LOCAL-READ-ONLY-DEVICE-READER-V1';

function validateAbsoluteDevicePath(value) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('devicePath must be a non-empty string');
  }

  if (value.includes('\0')) {
    throw new Error('devicePath may not contain NUL');
  }

  if (!path.isAbsolute(value)) {
    throw new Error('devicePath must be absolute');
  }

  return value;
}

function validateChunkBytes(value) {
  if (
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > 65536
  ) {
    throw new Error(
      'chunkBytes must be an integer from 1 through 65536'
    );
  }

  return value;
}

async function readDevicePathReceiveOnly(
  devicePath,
  {
    chunkBytes = 64,
    transport =
      new PulseRigReceiveOnlyTransport(),
  } = {}
) {
  const validatedPath =
    validateAbsoluteDevicePath(devicePath);

  const validatedChunkBytes =
    validateChunkBytes(chunkBytes);

  if (
    !transport ||
    typeof transport.receiveChunk !== 'function' ||
    typeof transport.end !== 'function' ||
    typeof transport.snapshot !== 'function'
  ) {
    throw new Error(
      'transport must implement Gate-6B receiveChunk/end/snapshot'
    );
  }

  const stream = fs.createReadStream(
    validatedPath,
    {
      flags: 'r',
      encoding: null,
      autoClose: true,
      emitClose: true,
      highWaterMark: validatedChunkBytes,
    }
  );

  let osReadChunkCount = 0;
  let osReadByteCount = 0;

  for await (const chunk of stream) {
    osReadChunkCount += 1;
    osReadByteCount += chunk.length;

    transport.receiveChunk(chunk);
  }

  const transportSnapshot =
    transport.end();

  return {
    schema: DEVICE_READER_SCHEMA,
    role: 'LOCAL_OS_RECEIVE_ONLY_DEVICE_PATH_READER',
    mode: 'READ_ONLY_FILE_DESCRIPTOR',

    devicePath: validatedPath,

    osReadChunkCount,
    osReadByteCount,
    configuredChunkBytes:
      validatedChunkBytes,

    transport:
      transportSnapshot,

    osReadDiagnosticsAreAuthority: false,
    transportDiagnosticsAreAuthority: false,

    deviceOpenMode: 'READ_ONLY',

    configuresSerialDevice: false,
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

module.exports = {
  DEVICE_READER_SCHEMA,
  validateAbsoluteDevicePath,
  validateChunkBytes,
  readDevicePathReceiveOnly,
};
