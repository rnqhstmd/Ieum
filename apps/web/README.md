# @ieum/web

이음 프론트엔드 (Next.js 15 App Router).

인증·API·DB는 모두 Spring Boot 백엔드(`:8080`)가 담당합니다.
이 앱은 순수 프론트엔드로, 백엔드 REST API와 WebSocket에 연결합니다.

## 아키텍처 요약

```
브라우저 (Next.js :3000)
  └─ 로그인: <a href="http://localhost:8080/oauth2/authorization/google">
  └─ REST API: src/lib/api.ts  → Spring Boot :8080
  └─ WebSocket: src/lib/ws.ts  → Spring Boot :8080/ws/pages/{pageId}
```

- **로그인**: Spring Security OAuth2 경유 Google 로그인. 백엔드가 Google 인가 흐름을 처리하고 세션 쿠키를 발급.
- **API 호출**: `credentials: 'include'` 로 세션 쿠키를 자동 첨부.
- **실시간**: WebSocket으로 페이지별 협업 연결 (Phase 2 구현 예정).

## 실행

### 1. 백엔드 먼저 실행 (Spring Boot :8080)

백엔드 서버가 먼저 실행되어야 로그인·API가 동작합니다.

### 2. 환경 변수 설정

```bash
cp apps/web/.env.local.example apps/web/.env.local
# 필요 시 값 수정
```

### 3. 프론트엔드 실행

```bash
# 모노레포 루트에서
pnpm install

# 개발 서버 (포트 3000)
pnpm --filter @ieum/web dev

# 프로덕션 빌드
pnpm --filter @ieum/web build

# 타입 검사
pnpm --filter @ieum/web typecheck
```

## 환경 변수

`apps/web/.env.local.example` 참조.

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `NEXT_PUBLIC_API_URL` | Spring Boot REST API URL | `http://localhost:8080` |
| `NEXT_PUBLIC_WS_URL` | Spring Boot WebSocket URL | `ws://localhost:8080` |

## 주요 파일

| 경로 | 설명 |
|------|------|
| `src/lib/api.ts` | Spring REST API fetch 래퍼 (apiGet/apiPost/apiPut/apiDelete) |
| `src/lib/ws.ts` | WebSocket 연결 헬퍼 (connectPage) |
| `app/(auth)/login/page.tsx` | 로그인 페이지 — 백엔드 OAuth2 엔드포인트로 이동 |
| `app/(app)/dashboard/page.tsx` | 대시보드 (Phase 1: 백엔드 API 연동 예정) |
