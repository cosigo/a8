'use strict';

const APP =
  '/srv/apps/a8_time_lab_v5_4_20_postseal_hw';

process.chdir(APP);

const {
  createHardwareLabServer
} = require(
  APP +
  '/hardware/a8-postseal-hardware-lab-server.js'
);

const {
  server
} = createHardwareLabServer();

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

  server.close(() => {
    process.exit(0);
  });

  setTimeout(() => {
    process.exit(1);
  }, 5000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
