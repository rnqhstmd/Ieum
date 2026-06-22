# PR Context — P1 인증·권한 기반

## 비즈니스 맥락

**배경**: 이음(Ieum) 백엔드(Spring Boot + Spring Security OAuth2 + JPA/Flyway)는 스키마·엔티티만 완비되고 인증·권한 핵심 동작이 전부 미구현(스텁) 상태였다. P1은 walking skeleton 뼈대 — 로그인 → 사용자 식별 → 워크스페이스 소속 확인 → 역할 검증 — 을 완성하여 이후 모든 Phase(P2 페이지 CRUD, P5 WebSocket 인가, P7 초대)의 기반을 만든다.

**구현 요구사항 (P1 = context/auth/status.md 기준)**:
- Google OAuth 로그인 → User upsert(googleId) + 개인 워크스페이스(OWNER 멤버십) 자동 생성, /dashboard·callbackUrl 리다이렉트
- 보호 라우트: 미인증 시 /api/** → 401 JSON, 비-API → 302 /login
- 권한 헬퍼: requireWorkspaceMember / requireOwner / requirePageAccess (403/404)
- 세션 보안: HttpOnly·SameSite=Lax·Secure(env), 민감정보(토큰) 미저장
- 로그아웃(POST 전용), open-redirect 방어

**수용 기준**: AC-AUTH-01~06, AC-PERM-01~05, AC-SEC-01~03 (14건) — spec-reviewer SPEC PASS, product-owner 인수 ACCEPT.

## 검증
- 전체 52 테스트 통과 / 0 fail (clean build). Testcontainers(PostgreSQL) 실DB 통합 테스트 포함.
- 동시성 불변식: 6스레드 동시 개인WS 생성 시 V2 partial UNIQUE 인덱스로 count==1 보장 실증.
- PR 시 GitHub Actions(`.github/workflows/backend-tests.yml`)로 전체 테스트 자동 실행 + 결과 PR 코멘트.

## Audit Summary
- 1차 통합 감사: CRITICAL 2 · HIGH 3 · MEDIUM 8 → 수정/문서화
- 2차 재감사: 실제 미해소 CRITICAL/HIGH **0**
- 수정 완료: GET 로그아웃 차단(POST 전용), open-redirect 화이트리스트, 403/404 고정 메시지, OAuth 후처리 로깅, 죽은 스텁 제거, 세션쿠키 설정 단일화
- 문서화/수용: 세션 Secure는 운영 env(`SESSION_COOKIE_SECURE=true`) 책임, 컨트롤러 권한헬퍼 연결은 P2, callbackUrl OAuth state 전달은 P2 프론트
- 상세: `.dev/feat-p1-auth/trust-ledger.md`

## 범위 밖 (후속 Phase)
페이지 CRUD(P2) · 공유 워크스페이스/초대(P7) · WebSocket 인가(P5) · Viewer 역할(P8).
