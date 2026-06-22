# 워크스페이스 구현 추적

## 범례

| 기호 | 의미 |
|------|------|
| ✅ | 반영됨 (구현 완료) |
| ⬜ | 미반영 (구현 전) |

---

## Phase 매핑

> 이 매핑은 구현 phase 계획 기준: 개인 워크스페이스 자동생성·사이드바 목록/전환 → **P2**, 공유 워크스페이스 생성·초대 생성 → **P7**, 초대 수락·취소(상태 전이) → **P8**, 역할 변경·멤버 관리·권한 매트릭스 마감 → **P9**, 워크스페이스 삭제·나가기 → **P10**.
>
> 옛 중첩 표기(`P7-③` 등)는 폐기하고 평면 연속 번호(P8~P10)를 쓴다. 묶음 정의는 [`../remaining-phases.md`](../remaining-phases.md) 참조.

---

## 요구사항 추적

### PRD §2 — 워크스페이스 (US-WS-01 ~ US-WS-04)

| 항목 | 사용자 스토리 | 핵심 수용 기준 | 상태 | Phase | 비고 |
|------|--------------|---------------|------|-------|------|
| US-WS-01 | 로그인 시 개인 워크스페이스 자동 존재 | 최초 로그인 시 `type=PERSONAL` 워크스페이스 1개 자동 생성 | ✅ | P1 | OAuth2 로그인 성공 시 `WorkspaceService.ensurePersonalWorkspace` 자동 생성 (PR #3) |
| US-WS-01 | 〃 | 개인 워크스페이스 추가 생성·삭제 불가 (1인 1개 고정) | ✅ | P1 | `ensurePersonalWorkspace` 멱등(기존 반환), PERSONAL 생성·삭제 불가 정책 (PR #3) |
| US-WS-02 | 새 공유 워크스페이스 생성 | 생성 시 생성자에게 OWNER Membership 자동 생성 | ✅ | P7 | `WorkspaceService.createSharedWorkspace` SHARED 저장+생성자 OWNER 멤버십 자동, `POST /api/workspaces` 인증 배선(`requireCurrentUserId`) (PR #18) |
| US-WS-02 | 〃 | 워크스페이스 이름 1자 이상 100자 이하 | ✅ | P7 | `normalizeName` trim 후 1~100자 검증, 위반 시 IllegalArgumentException→400 (PR #18) |
| US-WS-03 | 사이드바에서 워크스페이스 목록 확인·전환 | 사이드바에 개인·공유 워크스페이스 목록 표시 | ✅ | P2 | 목록 API 백엔드(PR #4) + 프론트 `WorkspaceSwitcher` 목록/전환 UI (PR #5). 공유 WS 생성은 P7 |
| US-WS-04 | OWNER로서 공유 워크스페이스 삭제 | OWNER만 삭제 가능; 삭제 시 하위 페이지·멤버십 함께 삭제 | ⬜ | P10 | |
| US-WS-04 | 〃 | MEMBER는 나가기 가능 (Membership 삭제); 마지막 OWNER 나가기 시 경고 | ⬜ | P10 | |

### PRD §7 — 초대 및 역할 관리 (US-INV-01 ~ US-INV-04)

| 항목 | 사용자 스토리 | 핵심 수용 기준 | 상태 | Phase | 비고 |
|------|--------------|---------------|------|-------|------|
| US-INV-01 | OWNER가 이메일로 팀원 초대 | OWNER가 이메일 입력해 Invitation 생성; 초대 이메일 발송 (MVP: Resend) | ✅ | P7 | `createInvitation` PENDING 저장 + 메일 발송 배선(PR #19). 실제 Resend HTTP POST 발송(messageId 로깅·실패 fallback) (PR #23) |
| US-INV-01 | 〃 | 이미 멤버인 이메일 초대 시 에러 메시지 반환 | ✅ | P7 | INV-05 — 409 CONFLICT (PR #19) |
| US-INV-02 | 초대 링크 클릭해 워크스페이스 합류 | 초대 링크는 고유 token 포함, 7일 후 만료 (expiresAt) | ✅ | P8 | `acceptInvitation` 토큰 검증·만료 우선 410(EXPIRED 전이)·멱등. 만료 lazy+스케줄러(일1회) (PR #20, #22) |
| US-INV-02 | 〃 | 로그인 상태면 즉시 Membership 생성; 미로그인이면 로그인 후 처리 | ✅ | P8 | 인증 사용자 본인 수락 시 Membership(role 승계) 생성, 이메일 불일치 403. 미인증 401 (PR #20) |
| US-INV-02 | 〃 | 초대 상태: `PENDING → ACCEPTED \| REVOKED \| EXPIRED` | ✅ | P8 | 수락→ACCEPTED(PR #20)·철회→REVOKED(PR #21)·만료→EXPIRED(lazy+스케줄러 PR #20,#22) 전이 완비 |
| US-INV-03 | OWNER가 MEMBER 역할 변경·내보내기 | OWNER가 MEMBER에게 OWNER 역할 부여 가능 | ⬜ | P9 | |
| US-INV-03 | 〃 | OWNER가 MEMBER를 내보낼 수 있음 (Membership 삭제) | ⬜ | P9 | |
| US-INV-03 | 〃 | 마지막 OWNER는 역할 변경·나가기 불가 | ⬜ | P9 | |
| US-INV-04 | OWNER가 보류 중 초대 취소 | OWNER가 PENDING 초대를 REVOKED로 변경 가능 | ✅ | P8 | `revokeInvitation` OWNER 검증→존재(404)→워크스페이스 일치(404 은닉)→PENDING 검증(비PENDING 409)→REVOKED 전이. 목록 조회 동반 (PR #21) |

### 권한 매트릭스 (08-auth-and-permissions.md §3)

| 항목 | 수용 기준 | 상태 | Phase | 비고 |
|------|-----------|------|-------|------|
| 비멤버 접근 차단 | 워크스페이스 비멤버의 페이지 접근 시 403 반환 | ✅ | P2 | `requireWorkspaceMember`를 `PageService.createPage`/`getPageTree`에 적용 → 비멤버 403 (PR #4). auth `PERM-05`와 동일 항목 — 정합화. 단건/편집 엔드포인트 적용은 P5/P7 |
| MEMBER 페이지 편집 | MEMBER는 워크스페이스 내 모든 페이지 편집 가능 | ⬜ | P9 | |
| 초대 생성 권한 | MEMBER의 초대 생성 시도 → 403 | ✅ | P7 | `accessGuard.requireOwner` → 비OWNER 403 (PR #19) |
| 멤버 제거 권한 | MEMBER의 다른 멤버 제거 시도 → 403 | ⬜ | P9 | |

---

## 구현 Phase 맵

| Phase | 내용 | 관련 항목 |
|-------|------|-----------|
| P2 | 개인 워크스페이스 자동 생성, 사이드바 목록/전환 | US-WS-01, US-WS-03(개인) |
| P7 | 공유 워크스페이스 생성, 초대 생성 | US-WS-02, US-INV-01 |
| P8 | 초대 수락·취소(상태 전이) | US-INV-02, US-INV-04 |
| P9 | 역할 변경·멤버 내보내기, 권한 매트릭스 마감 | US-INV-03, MEMBER 편집·제거 권한 |
| P10 | 워크스페이스 삭제·나가기 | US-WS-04 |
