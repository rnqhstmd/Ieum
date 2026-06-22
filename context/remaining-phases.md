# 남은 작업 — 평면 Phase 계획 (P8~P11)

> 작성 기준: 2026-06-22. 각 도메인 `status.md`의 미반영(⬜) 항목을 전수 조사해 **평면 연속 번호(P8~P11) 묶음**으로 정리한다.
> 완료 현황: **P1~P7 완료** — P7은 공유 WS 생성(PR #18)·초대 생성(INV-01/05/07, PR #19)까지. 아래 P8~P11이 남은 전부.
>
> **넘버링 원칙**: 기존 `P7-②b`·`P8-①` 같은 중첩 표기를 폐기하고, 남은 작업을 **P8부터 평면 연속 번호**로 매긴다. 각 Phase는 도메인을 가로지르는 묶음이며, 내부적으로 gx-tdd 슬라이스를 더 잘게 나눠 진행할 수 있다(번호는 그대로 유지).

---

## 완료 (P1~P7)

| Phase | 내용 | PR |
|-------|------|-----|
| P1 | Google OAuth 로그인·세션·권한 컨텍스트·개인 WS 자동생성 | #3 |
| P2 | 페이지 CRUD·중첩 트리·사이드바·아카이브 | #4, #5, #7 |
| P3 | 블록 에디터·자동저장·블록 타입(h1~3/p/li) | #8 |
| P4 / P4b | RGA CRDT 코어 · 2-level 블록 RGA | #6, #9 |
| P5 | WS relay·op 영속화·WS 멤버십 인가 | #10, #14, #15 |
| P6 | Presence 아바타·라이브 커서 | #11, #12, #13 |
| P7 | 공유 WS 생성 · 초대 생성(INV-01/05/07) | #18, #19 |

---

## P8 — 초대 전 과정 (수락·철회·만료·메일)

> 초대 라이프사이클의 나머지 전이. `InvitationService`의 `acceptInvitation`/`revokeInvitation` 스텁 본문 채우기 + 만료·실발송.

| 도메인 | 항목 ID | 내용 |
|--------|---------|------|
| auth | INV-02 | 초대 수락: 토큰 검증 → Membership 생성(단일 트랜잭션·경쟁조건 방지), `PENDING` 아니면 409, 만료 410 |
| auth | INV-06 | 초대 이메일 ≠ 수락 계정 → 403 (INV-02 구현 내 포함) |
| auth | INV-03 | 초대 철회(REVOKE): OWNER만, `PENDING`만 철회 가능 |
| auth | INV-04 | 초대 만료 처리: lazy(수락 시 `expiresAt` 검사) + 일 1회 스케줄러 |
| auth | INV-07 (하드닝) | Resend 실 HTTP 발송 (현재는 fallback 발송만 — `@TransactionalEventListener` AFTER_COMMIT 분리·초대 URL `@Value`) |
| workspace | US-INV-02 | 초대 링크 합류: 고유 token·7일 만료, 로그인 시 즉시 Membership·미로그인 후처리, 상태 전이 `PENDING→ACCEPTED\|REVOKED\|EXPIRED` |
| workspace | US-INV-04 | 보류 중 초대 취소: OWNER가 `PENDING`→`REVOKED` |

## P9 — 역할·멤버 관리 (역할 변경·내보내기·권한 마감)

> OWNER 전용 멤버 액션 + 권한 매트릭스 엔드포인트 적용.

| 도메인 | 항목 ID | 내용 |
|--------|---------|------|
| workspace | US-INV-03 | OWNER의 MEMBER 역할 변경(OWNER 부여)·멤버 내보내기(Membership 삭제)·마지막 OWNER 보호 |
| auth | WS-AUTH-04 | 멤버 제거 API 호출 시 해당 userId의 WebSocket 연결 강제 종료 |
| auth | PERM-03 | OWNER 전용 액션(역할 변경·멤버 제거·WS 삭제) 엔드포인트에 `requireOwner` 적용 |
| auth | PERM-04 | MEMBER가 OWNER 전용 액션 시도 시 403 |
| workspace | MEMBER 페이지 편집 | MEMBER가 워크스페이스 내 모든 페이지 편집 가능(권한 매트릭스 마감) |
| workspace | 멤버 제거 권한 | MEMBER의 다른 멤버 제거 시도 → 403 |

## P10 — WS 관리·협업 복원 (삭제·나가기·재접속)

> 워크스페이스 수명주기 마감 + CRDT 재접속 복원.

| 도메인 | 항목 ID | 내용 |
|--------|---------|------|
| workspace | US-WS-04 | OWNER 워크스페이스 삭제(하위 페이지·멤버십 cascade) · MEMBER 나가기 · 마지막 OWNER 나가기 경고 |
| collaboration | US-CRDT-02 | 재접속 복원: 신규 접속 클라가 Snapshot + op replay로 초기화 |
| collaboration | 재접속 replay 통합테스트 | 50개 op → Snapshot → 새 RGA에 Snapshot+이후 op replay → 원본과 `toText()` 동일 |

## P11 — 검증·하드닝·post-MVP (e2e·구조편집·접근성·WS 보안)

> 풀스택 e2e + 에디터 CRDT 구조편집 + 접근성 + 보안 하드닝 + post-MVP 잔여.

| 도메인 | 항목 ID | 내용 |
|--------|---------|------|
| collaboration | e2e (Playwright) | 브라우저 2개 동시 편집 후 양쪽 텍스트 동일 확인 (풀스택 구동) |
| page | US-EDIT (CRDT 구조편집) | `Editor.tsx`를 DocState에 완전 배선 — 구조편집(Enter/Backspace 블록 op) 전송·수렴 (현재 인라인 타이핑만 라이브) |
| page | 초기 로드 < 2초 | Playwright 타이밍 측정 |
| page | 키보드 탐색 | 블록 간 화살표 탐색 등 에디터 키보드 접근성 |
| auth | WS-AUTH-01 | trust-relay 신원 위조 방지(서명/세션 검증) — 현재 userId 신뢰 중계 한계 |
| auth | PERM-06 | Viewer 역할 (post-MVP) |
| page | US-PAGE-05 (position) | 페이지 순서 드래그앤드롭 UI (post-MVP) |

---

## 옛 표기 → 새 평면 번호 매핑

각 도메인 `status.md`의 Phase 컬럼도 아래 기준으로 동기화한다(완료 ✅ 항목의 과거 Phase 표기는 git/PR 기록 보존을 위해 유지).

| 옛 중첩 표기 | 새 번호 |
|-------------|---------|
| P7-②b (초대 수락) | **P8** |
| P7-③ 중 초대 철회 | **P8** |
| P7-⑤ (만료·실발송) | **P8** |
| P7-③ 중 역할·멤버 관리 | **P9** |
| P7-권한 마감 | **P9** |
| P7-④ (WS 삭제·나가기) | **P10** |
| P8-① (재접속 복원) | **P10** |
| P8-② (Viewer) | **P11** |
| P8-③ (페이지 DnD) | **P11** |
| P9 (e2e·구조편집·접근성·WS 보안) | **P11** |

---

## 권장 진행 순서

1. **P8** (초대 전 과정): MVP 협업 핵심. accept/revoke 스텁 본문 + 만료·실발송. 외부 연동(Resend)·스케줄러·트랜잭션 분리 동반.
2. **P9** (역할·멤버 관리): OWNER 액션 + 권한 매트릭스 엔드포인트 마감.
3. **P10** (WS 삭제·나가기 + 재접속 복원): 워크스페이스 수명주기 + CRDT replay.
4. **P11** (검증·하드닝·post-MVP): P8~P10이 쌓인 뒤 풀스택 e2e 일괄 검증, 이후 보안 하드닝·post-MVP.

> 스캐폴드 참고: workspace/invitation 도메인은 대부분 스텁이 깔려 있어 슬라이스 = "스텁 본문 채우기 + 인증/권한/예외 배선"이다(메모리 `ieum-p7-scaffold`).
