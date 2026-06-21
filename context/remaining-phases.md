# 남은 작업 — 도메인별 추가 Phase 계획

> 작성 기준: 2026-06-21. 각 도메인 `status.md`의 미반영(⬜) 항목을 전수 조사해 **도메인별 + 통합 슬라이스 순서**로 정리한다.
> 완료 현황: **P1~P6 완료**, **P7-①(공유 WS 생성, PR #18)·P7-②a(초대 생성, PR #19) 완료**. 아래는 그 이후 남은 전부.

---

## 1. 도메인별 남은 Phase

### 🔐 auth (인증·권한·초대) — `context/auth/status.md`
| Phase | 항목 | 내용 |
|-------|------|------|
| P7-②b | INV-02, INV-06 | 초대 수락: 토큰 검증→Membership 생성(트랜잭션·경쟁조건), 만료(410)·이미처리(409), 이메일 불일치 403 |
| P7-③ | INV-03, WS-AUTH-04 | 초대 철회(REVOKE, OWNER만) · 멤버 제거 시 해당 userId WebSocket 강제 종료 |
| P7-⑤ | INV-04, INV-07 | 초대 만료 처리(lazy 검사 + 일1회 스케줄러) · Resend 실 HTTP 발송 |
| P8 | PERM-06 | Viewer 역할 (post-MVP) |
| 하드닝 | WS-AUTH-01 | trust-relay 신원 위조 방지(서명/세션 검증) — 현재 userId 신뢰 중계 한계 |

### 🗂️ workspace (공유 워크스페이스·역할) — `context/workspace/status.md`
| Phase | 항목 | 내용 |
|-------|------|------|
| P7-②b | US-INV-02 | 초대 링크 합류: 고유 token·7일 만료, 로그인 시 즉시 Membership·미로그인 후처리, 상태 전이(PENDING→ACCEPTED\|REVOKED\|EXPIRED) |
| P7-③ | US-INV-03, US-INV-04, 멤버 제거 권한 | OWNER의 역할 변경(OWNER 부여)·멤버 내보내기·마지막 OWNER 보호 · 보류 초대 취소(REVOKED) · MEMBER의 멤버 제거 시도 403 |
| P7-④ | US-WS-04 | OWNER 워크스페이스 삭제(하위 페이지·멤버십 cascade) · MEMBER 나가기 · 마지막 OWNER 나가기 경고 |
| P7-권한 | MEMBER 페이지 편집 | MEMBER가 워크스페이스 내 모든 페이지 편집 가능(권한 매트릭스 마감) |

### 🤝 collaboration (실시간 협업) — `context/collaboration/status.md`
| Phase | 항목 | 내용 |
|-------|------|------|
| P8-① | US-CRDT-02 | 재접속 복원: 신규 접속 클라가 Snapshot + op replay로 초기화 |
| P8-① | 재접속 replay 통합테스트 | 50개 op→Snapshot→새 RGA에 Snapshot+이후 op replay→원본과 toText() 동일 |
| P9(검증) | e2e (Playwright) | 브라우저 2개 동시 편집 후 양쪽 텍스트 동일 확인 |

### 📝 page / editor — `context/page/status.md`
| Phase | 항목 | 내용 |
|-------|------|------|
| 후속 | US-EDIT (CRDT 구조편집) | P3 에디터(`Editor.tsx`)를 DocState에 완전 배선 — 구조편집(Enter/Backspace 블록 op) 전송·수렴(현재 인라인 타이핑만 라이브) |
| P8 | US-PAGE-05 (position) | 페이지 순서 드래그앤드롭 UI (post-MVP) |
| 비기능(P9) | 페이지 초기 로드 < 2초 | Playwright 타이밍 측정 |
| 비기능 | 키보드 탐색 | 블록 간 화살표 탐색 등 에디터 키보드 접근성 |

---

## 2. 통합 실행 순서 (슬라이스)

> 초대·역할은 auth+workspace를 가로지르므로, 도메인을 묶어 슬라이스 단위로 진행한다. 각 슬라이스는 gx-tdd 전체 파이프라인 1회 단위.

### P7 — 공유 워크스페이스·초대·역할 (진행 중)
- ✅ **P7-①** 공유 WS 생성 (US-WS-02) — PR #18
- ✅ **P7-②a** 초대 생성 (INV-01/05) — PR #19
- ⬜ **P7-②b** 초대 수락 — INV-02/06 + US-INV-02 (토큰 검증·만료·멱등·이메일 불일치·상태 전이)
- ⬜ **P7-③** 초대 철회·역할 관리 — INV-03/WS-AUTH-04 + US-INV-03/04 + 멤버 제거 권한 (REVOKE·역할 변경·내보내기·마지막 OWNER 보호·제거 시 WS 강제종료)
- ⬜ **P7-④** 워크스페이스 삭제·나가기 — US-WS-04 (OWNER cascade 삭제·MEMBER 나가기·마지막 OWNER 경고)
- ⬜ **P7-⑤** 초대 메일 실발송·만료 — INV-07(Resend HTTP)·INV-04(만료 스케줄러) + cross-review 연기분(@TransactionalEventListener AFTER_COMMIT 분리·초대 URL @Value)
- ⬜ **P7-권한 마감** — MEMBER 페이지 편집 허용 + PERM-03/04 전 엔드포인트 충족 확인

### P8 — post-MVP (재접속 복원·고급 기능)
- ⬜ **P8-①** 재접속 CRDT 복원 — US-CRDT-02 (Snapshot + op replay) + replay 통합테스트
- ⬜ **P8-②** Viewer 역할 — PERM-06
- ⬜ **P8-③** 페이지 순서 DnD — US-PAGE-05 (position)

### P9 — 검증·하드닝 (횡단)
- ⬜ **e2e (Playwright)** — 2-브라우저 동시편집 수렴 + 페이지 초기 로드 <2초 측정 (풀스택 구동 필요)
- ⬜ **에디터 CRDT 구조편집 수렴** — Enter/Backspace 블록 op 전송·수렴
- ⬜ **키보드 탐색** — 블록 간 화살표 등 접근성
- ⬜ **WS 신원 위조 방지** — WS-AUTH-01 (trust-relay 한계: 서명/세션 검증 도입)

---

## 3. 권장 진행 순서
1. **P7-②b ~ ④** (초대 수락 → 철회·역할 → 삭제·나가기): MVP 협업 핵심. 각각 백엔드 스텁 채우기 + 인증 배선.
2. **P7-⑤** (실발송·만료): 외부 연동(Resend)·스케줄러·트랜잭션 분리. cross-review 연기분(@TransactionalEventListener·URL @Value) 동반 처리.
3. **P9 e2e**: P7 협업 기능이 충분히 쌓인 뒤 풀스택 e2e로 일괄 검증(초기로드<2s 포함).
4. **P8** (재접속 복원·Viewer·DnD): post-MVP, 우선순위 후순위.

> 스캐폴드 참고: workspace/invitation 도메인은 대부분 스텁이 깔려 있어 슬라이스 = "스텁 본문 채우기 + 인증/권한/예외 배선"이다(메모리 `ieum-p7-scaffold`).
