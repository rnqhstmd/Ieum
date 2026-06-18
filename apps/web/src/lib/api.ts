/**
 * Spring REST API 호출용 fetch 래퍼
 *
 * 환경 변수:
 *   NEXT_PUBLIC_API_URL  — Spring Boot 서버 URL (기본값: http://localhost:8080)
 *
 * 특징:
 *   - credentials: 'include' 로 세션 쿠키를 자동 첨부
 *   - Content-Type: application/json 자동 설정
 *   - 4xx / 5xx 응답 시 Error throw
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';

/** 공통 fetch 옵션 */
const defaultHeaders: Record<string, string> = {
  'Content-Type': 'application/json',
};

/** HTTP 응답 에러 */
class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** 내부 공통 fetch 처리 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    credentials: 'include', // Spring Security 세션 쿠키 자동 첨부
    headers: {
      ...defaultHeaders,
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const message = await res.text().catch(() => res.statusText);
    throw new ApiError(res.status, message);
  }

  // 204 No Content 등 본문 없는 응답 처리
  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return res.json() as Promise<T>;
  }
  return undefined as unknown as T;
}

/** GET 요청 */
export async function apiGet<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'GET' });
}

/** POST 요청 */
export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

/** PUT 요청 */
export async function apiPut<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: 'PUT',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

/** DELETE 요청 */
export async function apiDelete<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'DELETE' });
}

export { ApiError };
