# Cross-Review 결과

- advisor: claude (qa-manager + security-auditor, cross-review 미션)
- 브랜치: feat/p6-presence (base: main)
- DEV_DIR: .dev/feat-p6-presence
- 실행: 2026-06-21

## AC 충족 매트릭스

| AC | 충족 | 근거 |
|----|------|------|
| AC-1 join broadcast(발신자 제외) | O | room.ts peer 루프(join 전 peers) + room.presence.test AC-1 |
| AC-2 신규 탭 roster(건수=기존) | O | room.ts roster 루프 + room.presence.test AC-2 |
| AC-3 disconnect→presence-leave+roomSize | O | room.ts leave Dispatch[] + inMemoryRelay close deliver(M1) + room.presence/convergence test |
| AC-4 클라 목록 추가 | O | usePresence.applyPresenceUpdate + relayClient 라우팅 + usePresence/relayClient test |
| AC-5 클라 목록 제거 | O | usePresence.applyPresenceLeave + PresenceAvatars test |
| AC-6 색상 슬롯 할당/반환 | O | room.ts assignColor + leave slots.delete + room.presence.test(9명+ modulo 포함) |
| AC-7 단독 접속 self만 | O | room.ts peers=[] broadcast 0 + room.presence.test AC-7 |
| AC-8 displayName fallback | O | room.ts resolveDisplayName(room별 anon) + 길이상한 + 정규식 검증 |
| AC-9 op 흐름 무영향 | O | useCrdtDocument usePresence 분리 + presence.convergence.test AC-9 |

**[Must] 9/9 충족.**

## 설계 범위 이탈
**이탈 없음.** 범위 외 4개 파일(context/collaboration/{architecture,glossary,status}.md, useCrdtDocument.test.tsx) 전부 문서 동기화(living doc) 또는 기존 테스트 보강으로 정당. 스코프 변경·비승인 기능 추가 없음.

## trust-ledger 신선도 (수정 주장 교차 확인 — security-auditor)
**8건 전부 코드 반영 확인 — 허위 완료 없음.**
- S2(MAX_DISPLAY_NAME=64 + !Array.isArray) ✓ protocol.ts:57,98,102 + 테스트 2건
- S3(color `/^#[0-9A-Fa-f]{6}$/`) ✓ web protocol.ts:98 + 테스트
- S4(9명+ modulo 테스트) ✓ room.presence.test.ts:1119
- Q1(assignColor modulo 주석) ✓ room.ts:145
- S1(half-open 수용) ✓ architecture/status.md 문서화
- Q2(PresenceInfo 복제 의도) ✓ 양 protocol.ts 대칭 복제 주석
- S5(useEffect deps 안정성 주석) ✓ useCrdtDocument.ts + useCallback[] 확인
- S6(initialOf 다중# — S2로 완화) ✓ 수용

## 정책/보안 정합 (security-auditor)
BR-1~6 전건 정합(비영속·신뢰중계·clientId 서버부여·익명 fallback·색상 서버할당·self 포함). 설계 보안 약속(proto 가드 일관·color 서버할당·join-ack[0] 불변식·AC-9 op 분리·M1 close deliver 순서) 전건 정합.

## 신규 위험 (trust-ledger에 없는 것만)

### Warning / MEDIUM
- **CR-1 [GAP] anonCounter 재입장 번호 재사용·무한증가** (room.ts:125-128) — `anonCounters.delete(pageId)`가 room.size===0일 때만 실행. (a) room이 완전히 빈 뒤 재입장하면 "익명 #1" 재시작→다른 두 탭에 동일 번호 가능, (b) room이 안 비면 "익명 #N"이 단조 증가. PRD BR-4는 "비어있지 않은 문자열"만 요구하므로 스펙 위반 아님(설계 "room별 단조" 의도와 일치). 권고: 동작을 설계/주석에 명시 또는 후속에서 리셋/감소 정책 검토. walking skeleton 수용 가능.

### Info
- **CR-2 [GAP] presence.convergence.test AC-3 roomSize 감소는 단위테스트에서만 검증** (presence.convergence.test.ts) — 통합 테스트는 presence-leave 전달만 확인. roomSize=1 단정은 room.presence.test에서 커버. 통합 구조상 roomSize 미노출이라 수용. 주석 명시 권고.
- **CR-3 [ASSUMPTION] displayNameFromSiteId 4자 추출 충돌 확률** (useCrdtDocument.ts) — siteId 앞 4자만 사용해 우연한 동일 displayName 가능. BR-7(다중탭 동일이름 허용)으로 스펙 위반 아님. 8자 사용 시 충돌 감소(후속).

## 총평
- 강점: 설계 인터페이스(순수 RoomRegistry Dispatch·usePresence 분리·join-ack 불변식·in-memory relay 검증)가 코드에 충실 반영. AC 9/9, 범위 이탈 0, trust-ledger 8건 허위 완료 없음, BR/보안 약속 전건 정합.
- 합산: **신규 Critical 0 / HIGH 0 / Warning(MEDIUM) 1 / Info 2**. 머지 차단 사유 없음.
- 권고: CR-1(anonCounter)는 walking skeleton 수용 — 동작 주석/문서화 수준. 나머지는 테스트 주석/후속.

## 처리 결과 (사용자: 주석/문서화만)
- **CR-1 주석**: room.ts resolveDisplayName — anonCounter room별 단조·room 비움 시 리셋 동작 명시.
- **CR-2 주석**: presence.convergence.test — roomSize 단정은 단위 테스트가 커버함 명시.
- **CR-3 주석**: useCrdtDocument displayNameFromSiteId — 4자 충돌은 BR-7로 무해(실 인증 시 대체) 명시.
- 코드 동작 변경 없음. 재검증: ws-relay 33/33, web 116/116. 커밋 af73f51 → PR #11.
