import { describe, it, expect, afterEach, vi } from 'vitest';
import http from 'node:http';
import { createAdminServer } from '../src/adminServer.js';

// T6 / AC-14,15: createAdminServer — 별도 HTTP 서버, DELETE /admin/connections/{userId}
// AC-SEC-1: 잘못된 퍼센트 인코딩(%GG) → 400 (URIError 방어)
// AC-SEC-2: 비-UUID userId → 400 (형식 검증)

const VALID_UUID = '11111111-1111-1111-1111-111111111111';

/** http.request로 raw 경로를 직접 전송하고 statusCode를 반환한다.
 *  fetch는 URL을 정규화하므로 %GG 같은 잘못된 퍼센트 인코딩을 테스트할 수 없다. */
function rawDelete(port: number, rawPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', port, path: rawPath, method: 'DELETE' },
      (res) => resolve(res.statusCode ?? 0),
    );
    req.on('error', reject);
    req.end();
  });
}

let server: { port: number; close: () => Promise<void> } | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

describe('adminServer (T6)', () => {
  // ── 기존 정상 케이스: userId를 유효 UUID로 갱신 ──────────────────────────
  // GREEN 단계에서 UUID 형식 검증이 추가되면 'u1' 같은 비-UUID가 400이 되어 깨짐.
  // 미리 유효 UUID로 픽스처를 맞춰둔다.

  it('AC-14: DELETE /admin/connections/{userId} → disconnectUser(userId) 호출 + 204 응답', async () => {
    const disconnectUser = vi.fn().mockReturnValue(1);
    server = await createAdminServer({ port: 0, disconnectUser });

    const url = `http://127.0.0.1:${server.port}/admin/connections/${VALID_UUID}`;
    const res = await fetch(url, { method: 'DELETE' });

    expect(res.status).toBe(204);
    expect(disconnectUser).toHaveBeenCalledTimes(1);
    expect(disconnectUser).toHaveBeenCalledWith(VALID_UUID);
  });

  it('AC-15: disconnectUser가 0을 반환해도(미연결) 204 응답', async () => {
    const disconnectUser = vi.fn().mockReturnValue(0);
    server = await createAdminServer({ port: 0, disconnectUser });

    const url = `http://127.0.0.1:${server.port}/admin/connections/${VALID_UUID}`;
    const res = await fetch(url, { method: 'DELETE' });

    expect(res.status).toBe(204);
    expect(disconnectUser).toHaveBeenCalledWith(VALID_UUID);
  });

  it('DELETE 외 메서드(GET) → 404', async () => {
    const disconnectUser = vi.fn().mockReturnValue(0);
    server = await createAdminServer({ port: 0, disconnectUser });

    const url = `http://127.0.0.1:${server.port}/admin/connections/${VALID_UUID}`;
    const res = await fetch(url, { method: 'GET' });

    expect(res.status).toBe(404);
    expect(disconnectUser).not.toHaveBeenCalled();
  });

  it('알 수 없는 경로 → 404', async () => {
    const disconnectUser = vi.fn().mockReturnValue(0);
    server = await createAdminServer({ port: 0, disconnectUser });

    const url = `http://127.0.0.1:${server.port}/unknown/path`;
    const res = await fetch(url, { method: 'DELETE' });

    expect(res.status).toBe(404);
    expect(disconnectUser).not.toHaveBeenCalled();
  });

  // ── 보안 감사 H2: 입력 검증 부재 ──────────────────────────────────────────

  it('AC-SEC-1: 잘못된 퍼센트 인코딩(%GG) → 400, disconnectUser 미호출', async () => {
    // fetch는 URL을 정규화하므로 http.request로 raw 경로를 직접 전송한다.
    // 현재 구현: decodeURIComponent가 try/catch 없이 호출 → URIError throw → 서버 크래시 또는 500
    // 기대: 400 반환, disconnectUser 호출 없음
    const disconnectUser = vi.fn().mockReturnValue(0);
    server = await createAdminServer({ port: 0, disconnectUser });

    const status = await rawDelete(server.port, '/admin/connections/%GG');

    expect(status).toBe(400);
    expect(disconnectUser).not.toHaveBeenCalled();
  });

  it('AC-SEC-2: 비-UUID userId("not-a-uuid") → 400, disconnectUser 미호출', async () => {
    // 현재 구현: UUID 형식 검증 없음 → disconnectUser("not-a-uuid") 호출 후 204 반환
    // 기대: 400 반환, disconnectUser 호출 없음
    const disconnectUser = vi.fn().mockReturnValue(0);
    server = await createAdminServer({ port: 0, disconnectUser });

    const url = `http://127.0.0.1:${server.port}/admin/connections/not-a-uuid`;
    const res = await fetch(url, { method: 'DELETE' });

    expect(res.status).toBe(400);
    expect(disconnectUser).not.toHaveBeenCalled();
  });
});
