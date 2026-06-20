// ─── P5 relay 엔트리포인트 ───────────────────────────────────────
import { createRelayServer } from './server.js';

const port = Number(process.env.PORT ?? 3001);

createRelayServer({ port })
  .then((server) => {
    // eslint-disable-next-line no-console
    console.log(`[ws-relay] listening on ws://localhost:${server.port}`);
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[ws-relay] failed to start', err);
    process.exit(1);
  });
