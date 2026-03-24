const keepAlive = setInterval(() => {
  // Keep the fixture reviewer process alive until the manager stops it.
}, 1_000);

function shutdown() {
  clearInterval(keepAlive);
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
