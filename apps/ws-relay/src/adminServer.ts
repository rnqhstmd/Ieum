// ─── P5 relay admin HTTP 서버 (T6 / AC-14,15) ────────────────────
// DELETE /admin/connections/{userId} → disconnectUser(userId) 호출 → 204
// 그 외 메서드·경로 → 404

import http from 'node:http';

const PATH_RE = /^\/admin\/connections\/([^/]+)$/;

export async function createAdminServer(opts: {
  port: number;
  host?: string;
  disconnectUser: (userId: string) => number;
}): Promise<{ port: number; close: () => Promise<void> }> {
  const host = opts.host ?? '127.0.0.1';

  const server = http.createServer((req, res) => {
    const match = PATH_RE.exec(req.url ?? '');
    if (req.method === 'DELETE' && match) {
      let userId: string;
      try {
        userId = decodeURIComponent(match[1]!);
      } catch {
        res.writeHead(400);
        res.end();
        return;
      }
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!UUID_RE.test(userId)) {
        res.writeHead(400);
        res.end();
        return;
      }
      opts.disconnectUser(userId);
      res.writeHead(204);
      res.end();
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(opts.port, host, () => {
      // listen 성공 후: reject 리스너 제거, 런타임 오류 로깅 핸들러로 교체
      server.off('error', reject);
      server.on('error', (err) => {
        console.error('[adminServer] runtime error', err);
      });
      const addr = server.address();
      const port = typeof addr === 'object' && addr !== null ? addr.port : opts.port;
      resolve({
        port,
        close: () => new Promise<void>((res, rej) => server.close((err) => (err ? rej(err) : res()))),
      });
    });
  });
}
