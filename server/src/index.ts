import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { closeWorker, initWorker } from './mediasoup.js';
import { handleConnection } from './signaling.js';

const PORT = Number(process.env.PORT ?? 3001);

function parseRoomId(reqUrl: string | undefined): string | null {
  if (!reqUrl) return null;
  const url = new URL(reqUrl, 'http://localhost');
  const roomId = url.searchParams.get('roomId');
  if (!roomId) return null;
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(roomId)) return null;
  return roomId;
}

async function main() {
  await initWorker();

  const httpServer = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('GPN signaling server\n');
  });

  const wss = new WebSocketServer({ server: httpServer });
  wss.on('connection', (socket, req) => {
    const roomId = parseRoomId(req.url);
    if (!roomId) {
      socket.close(4400, 'missing or invalid roomId');
      return;
    }
    handleConnection(socket, roomId).catch((err) => {
      console.error('[server] handleConnection error:', err);
      socket.close(1011, 'internal error');
    });
  });

  httpServer.listen(PORT, () => {
    console.log(`[server] WebSocket listening on ws://localhost:${PORT}`);
  });

  // Graceful shutdown: on a deploy/restart systemd sends SIGTERM. Close client
  // sockets, stop accepting connections, and tear down the mediasoup worker so
  // we exit cleanly instead of being SIGKILLed after the stop timeout.
  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[server] ${signal} received, shutting down`);
    for (const client of wss.clients) client.close(1001, 'server shutting down');
    wss.close();
    httpServer.close(() => {
      closeWorker();
      process.exit(0);
    });
    // Failsafe: don't hang forever if something refuses to close.
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('[server] fatal:', err);
  process.exit(1);
});
