# 인증·권한 구현 추적

## 범례

| 마크 | 의미 |
|------|------|
| ✅ 반영됨 | 코드 구현 완료 |
| ⬜ 미반영 | 정책/설계만 확정, 구현 전 |

---

## Phase 매핑

> 이 매핑은 requirements 구현 phase 계획 기준: 로그인·User upsert·세션·권한 컨텍스트·보호 라우트·로그아웃 → **P1**, WebSocket 연결 인가 → **P5**, 초대 흐름 → **P7**.

---

## 요구사항 추적

### US-AUTH-01 ~ US-AUTH-03 수용 기준 (02-prd.md §1)

| 항목 ID | 설명 | 상태 | Phase | 비고 |
|---------|------|------|-------|------|
| AC-AUTH-01 | Google OAuth 버튼 클릭 시 Google 계정 선택 화면으로 이동 | ⬜ | P1 | Auth.js GoogleProvider 설정 필요 |
| AC-AUTH-02 | 최초 로그인 시 User 레코드 자동 생성 + 개인 워크스페이스 자동 생성 | ⬜ | P1 | `signIn` 콜백 + `ensurePersonalWorkspace` 구현 필요 |
| AC-AUTH-03 | 재로그인 시 기존 User 레코드 재사용 (googleId 기준 upsert) | ⬜ | P1 | `prisma.user.upsert({ where: { googleId } })` 구현 필요 |
| AC-AUTH-04 | 로그아웃 후 보호된 경로 접근 시 `/login`으로 리다이렉트 | ⬜ | P1 | `middleware.ts` Edge 미들웨어 구현 필요 |
| AC-AUTH-05 | 유효하지 않거나 만료된 세션으로 API 호출 시 401 반환 | ⬜ | P1 | Route Handler 내 `auth()` 이중 검증 구현 필요 |
| AC-AUTH-06 | 로그인 성공 후 이전에 접근하려던 페이지로 복귀 (callbackUrl 처리) | ⬜ | P1 | Auth.js 기본 지원, 설정 확인 필요 |

### 권한 모델 (08-auth-and-permissions.md §3~4)

| 항목 ID | 설명 | 상태 | Phase | 비고 |
|---------|------|------|-------|------|
| PERM-01 | `requireWorkspaceMember` 헬퍼 구현 (세션→소속→역할 3단계 검증) | ⬜ | P1 | Route Handler 공통 유틸 |
| PERM-02 | `requirePageAccess` 헬퍼 구현 (pageId→workspaceId 조회 후 위임) | ⬜ | P1 | 페이지 관련 Route Handler 전용 |
| PERM-03 | OWNER 전용 액션(멤버 초대·제거·역할 변경·워크스페이스 삭제)에 OWNER 검증 적용 | ⬜ | P1 | `requiredRole: 'OWNER'` 전달 |
| PERM-04 | MEMBER가 OWNER 전용 액션 시도 시 403 반환 | ⬜ | P1 | PERM-03 구현 후 자동 충족 |
| PERM-05 | 워크스페이스 비멤버의 페이지 접근 시 403 반환 | ⬜ | P1 | PERM-02 구현 후 자동 충족 |
| PERM-06 | Viewer 역할 구현 | ⬜ | P8 | post-MVP, 현재 설계 범위 외 |

### WebSocket 인가 (08-auth-and-permissions.md §4-2)

| 항목 ID | 설명 | 상태 | Phase | 비고 |
|---------|------|------|-------|------|
| WS-AUTH-01 | WebSocket 연결 시 JWT 추출·검증 (`AUTH_SECRET` 공유) | ⬜ | P5 | 실시간 서버 구현 필요 |
| WS-AUTH-02 | 연결 시 pageId → workspaceId → Membership 확인, 실패 시 ws.close(4003) | ⬜ | P5 | 실시간 서버 구현 필요 |
| WS-AUTH-03 | 메시지 수신 시 서버가 연결 컨텍스트의 userId를 op에 태깅 (siteId는 세션 UUID, 신원 비교에 미사용) | ⬜ | P5 | 실시간 서버 구현 필요 |
| WS-AUTH-04 | 멤버 제거 API 호출 시 해당 userId의 WebSocket 연결 강제 종료 | ⬜ | P5 | 멤버 제거 API + 실시간 서버 연동 필요 |
| WS-AUTH-05 | WebSocket 메시지 크기 상한 설정 (64KB 초과 시 연결 종료) | ⬜ | P5 | 실시간 서버 구현 필요 |

### 초대 흐름 (08-auth-and-permissions.md §5, 02-prd.md §7)

| 항목 ID | 설명 | 상태 | Phase | 비고 |
|---------|------|------|-------|------|
| INV-01 | OWNER의 이메일 기반 초대 생성 (256-bit token, 7일 만료) | ⬜ | P7 | `POST /api/workspaces/:id/invitations` |
| INV-02 | 초대 수락: 토큰 검증 → Membership 생성 (트랜잭션, 경쟁 조건 방지) | ⬜ | P7 | `POST /api/invitations/accept` |
| INV-03 | 초대 취소(REVOKE): OWNER만 가능 | ⬜ | P7 | `DELETE /api/workspaces/:id/invitations/:invId` |
| INV-04 | 초대 만료 처리: lazy(수락 시 expiresAt 검사) + 스케줄러(일 1회) | ⬜ | P7 | 스케줄러 구현은 별도 |
| INV-05 | 이미 멤버인 이메일로 초대 시 409 반환 | ⬜ | P7 | INV-01 구현 내 포함 |
| INV-06 | 초대 이메일과 다른 계정으로 수락 시도 시 403 반환 | ⬜ | P7 | INV-02 구현 내 포함 |
| INV-07 | 초대 이메일 발송 (초대 링크 포함) | ✅ | P7 | Resend 연동으로 MVP 발송 (확정). 발송 실패 시 초대는 PENDING 유지, OWNER가 링크 수동 전달 가능 (fallback) |

### 세션 보안 (08-auth-and-permissions.md §6-5)

| 항목 ID | 설명 | 상태 | Phase | 비고 |
|---------|------|------|-------|------|
| SEC-01 | 세션 쿠키 `HttpOnly: true`, `Secure: true`, `SameSite: lax` 설정 | ⬜ | P1 | Auth.js 설정 |
| SEC-02 | JWT 서명 `HS256` + `AUTH_SECRET` (32바이트 이상) | ⬜ | P1 | Auth.js 설정 + 환경변수 |
| SEC-03 | Google OAuth에서 수신한 email·googleId 외 민감 정보 미저장 | ⬜ | P1 | User upsert 구현 시 확인 |
