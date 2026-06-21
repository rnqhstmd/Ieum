// ─── P5 relay 엔트리포인트 ───────────────────────────────────────
import { createRelayServer } from './server.js';
import { PgOpStore } from './pgOpStore.js';

const port = Number(process.env.PORT ?? 3001);
// op 영속화 연결 문자열(postgres:// 형식). Spring의 DATABASE_URL은 jdbc: 접두라 pg가
// 파싱 못 하므로 relay 전용 env를 쓴다. 미설정 시 InMemoryOpStore fallback(S3, 비영속).
const relayDbUrl = process.env.RELAY_DATABASE_URL;
const opStore = relayDbUrl ? new PgOpStore(relayDbUrl) : undefined;

createRelayServer({ port, opStore })
  .then((server) => {
    // eslint-disable-next-line no-console
    console.log(
      `[ws-relay] listening on ws://localhost:${server.port} (opStore: ${relayDbUrl ? 'postgres' : 'in-memory'})`,
    );

    // 종료 신호 시 정상 종료(소켓·서버 정리) — 개발 서버 재시작 시 포트 점유 방지.
    const shutdown = (signal: string) => {
      // eslint-disable-next-line no-console
      console.log(`[ws-relay] ${signal} received, shutting down`);
      server.close().finally(() => process.exit(0));
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[ws-relay] failed to start', err);
    process.exit(1);
  });
