'use strict';

const APP =
  '/srv/apps/a8_time_lab_v5_4_20_postseal_hw';

process.chdir(APP);

process.env.A8_SOL_RATE_HOLDOVER_PATH =
  '/var/lib/a8-core20/sol-rate-holdover.json';

const {
  createHardwareLabServer
} = require(
  APP +
  '/hardware/a8-postseal-hardware-lab-server.js'
);

const {
  allocateSourceRunGeneration
} = require(
  APP +
  '/hardware/a8-core20-source-run-generation.js'
);

const {
  OpposingClockDiscrepancy
} = require(
  APP +
  '/observer/a8-opposing-clock-discrepancy.js'
);

const {
  TerraShipSlipLifetimeLedger
} = require(
  APP +
  '/observer/a8-terra-ship-slip-lifetime-ledger.js'
);

const sourceRun =
  allocateSourceRunGeneration(
    '/var/lib/a8-core20/source-run-generation.json'
  );

const opposingClockDiscrepancy =
  new OpposingClockDiscrepancy({
    sourceRunGeneration:
      sourceRun.sourceRunGeneration,

    checkpointDirectory:
      '/var/lib/a8-core20/terra-ship-slip',
  });

const terraShipSlipLifetimeLedger =
  new TerraShipSlipLifetimeLedger({
    sourceRunGeneration:
      sourceRun.sourceRunGeneration,

    checkpointDirectory:
      '/var/lib/a8-core20/terra-ship-slip',

    inceptionPath:
      '/var/lib/a8-core20/terra-ship-slip/' +
      'run-1-epoch-3-inception.json',
  });

const {
  server,
  sealTerraShipSlipLifetime,
} = createHardwareLabServer({
  opposingClockDiscrepancy,
  terraShipSlipLifetimeLedger,
});

server.listen(
  18020,
  '127.0.0.1',
  () => {
    console.log(
      'A8 v5.4.20 CORE20 · systemd service · 127.0.0.1:18020'
    );
  }
);

function shutdown(signal) {
  console.log(`CORE20 ${signal} · shutting down cleanly`);

  try {
    const sealed =
      sealTerraShipSlipLifetime();

    if (sealed) {
      console.log(
        'TERRA SHIP SLIP · LIFETIME CHECKPOINT SEALED'
      );
    }
  } catch (err) {
    console.error(
      'TERRA SHIP SLIP · CLEAN SHUTDOWN SEAL FAILED ·',
      err && err.message
        ? err.message
        : String(err)
    );
  }

  server.close(() => {
    process.exit(0);
  });

  /*
   * Shutdown owns all remaining observer transports.
   * SSE clients must not hold the process open.
   */
  if (
    typeof server.closeAllConnections === 'function'
  ) {
    server.closeAllConnections();
  }

  setTimeout(() => {
    process.exit(1);
  }, 5000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
