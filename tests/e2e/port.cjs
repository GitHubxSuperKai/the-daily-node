// Free-port helper for scripts/verify.cjs.
//
// Listens on port 0 with no host, so the OS picks a port that is free on every
// interface -- the same bind server.js makes when it starts on PORT. The port is
// released before server.js binds it; that short window is an accepted risk.
const net = require('net');

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

module.exports = { getFreePort };
