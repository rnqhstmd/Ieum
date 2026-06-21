# Trust Ledger — P5 후반 WS 인가 (WS-AUTH-02 + 03)

## Spec 리뷰 (spec-reviewer)
- AC 충족: AC-1~8 전부 ✅
  - AC-1/2 /me 200·401: UserMeIntegrationTest
  - AC-3 멤버 join-ack / AC-4 비멤버 close(4003)·no-userId close: server.test
  - AC-5 PgMembership isMember(member/nonmember/invalid): pgMembershipStore.int
  - AC-6 op created_by_id 태깅: pgOpStore.int(실 DB) + server.test(연결 userId append 전달)
  - AC-7 교차 room op 미영속(append 미호출): server.test
  - AC-8 웹 join userId / fetchCurrentUserId: relayClient.test + currentUser.test
- 설계 범위 이탈: 없음.
- 판정: **SPEC PASS** — [Must] M1~M4 4/4, [Should] S1~S3 3/3.

## 코드 품질 (quality-reviewer)
- **Critical: 0 / Important: 0**
  - PgMembershipStore pool error 핸들러 존재(슬라이스1 패턴 적용) — 프로세스 보호 OK.
  - join 비동기화(socketChain): join이 op보다 FIFO 선행 보장(connPage 설정) — 정합.
- **Minor**
  - userId fetch 레이스(아래 보안 LOW와 동일) — 주석화.
  - `getUserId` 게터 패턴으로 fetch/connect 타이밍 디커플 — 의도적.

## 통합 감사 (security-auditor)
- **CRITICAL: 0 / HIGH: 0**
- **MEDIUM: 1**
  - [RISK/MEDIUM] **trust-relay userId 미검증** — 클라가 join에 userId를 주장하고 서버는 이를 신뢰해 멤버십을 조회한다. 악의적 로컬 클라가 타 사용자의 userId를 사칭하면 그 사용자가 멤버인 page에 접근할 수 있다.
    - 현재 containment: relay 127.0.0.1 바인딩(BR-5) — 로컬 클라만 연결. 사용자가 선택한 trust-relay 모델(displayName 신뢰 중계와 동형).
    - **처리: 문서화** — 신원 위조 방지(세션 쿠키 검증/서명 토큰)는 명시적 out-of-scope. 후속 인증 강화 슬라이스에서 마감.
- **개선(슬라이스1 공백 마감)**
  - [RESOLVED] 교차 room op 영속화 인가 공백(슬라이스1 MEDIUM) → **connPage 게이트로 마감**(AC-7): op는 인가 합류 page로만 영속/전파.
- **LOW: 2**
  - [RISK/LOW] userId fetch 레이스 — /me fetch가 첫 WS connect보다 늦으면 게이트 활성 시 첫 join이 userId 없이 close(4003)될 수 있었음. **처리: 수정됨** — relayClient `ready`(userId fetch Promise) 도입으로 auto-join을 fetch 완료 후로 미룸(재연결도 동일). 게이트-온 첫 connect 누락 제거. relayClient.test 레이스 가드 추가.
  - [POLICY/LOW] WS-AUTH-04(멤버 제거→WS 강제종료) 미구현 — 멤버 제거 API(P7) 의존. **연기**.

## 종합
- 핵심 방어는 슬라이스1 패턴(pool 핸들러)으로 충족. trust-relay 미검증은 사용자가 선택한 모델의 본질적 한계로 문서화·후속 연기. CRITICAL/HIGH 0. 슬라이스1의 교차 room 영속화 공백을 이번에 마감.
