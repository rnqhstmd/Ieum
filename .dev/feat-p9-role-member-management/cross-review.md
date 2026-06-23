# Cross-Review 결과

- advisor: claude (qa-manager + security-auditor, cross-review 미션)
- 브랜치: feat/p9-role-member-management (base: main)
- DEV_DIR: .dev/feat-p9-role-member-management
- 실행: 2026-06-23 · PR #25 리뷰 동반 확인

## AC 충족 매트릭스
- [Must] 22건 중 **21건 O, 1건 부분(AC-22)**. AC-22는 동작(403)·코드경로 동일하나 픽스처가 "제거된 멤버"가 아닌 "처음부터 비멤버(OUTSIDER)"로 표현 — 실질 버그 아님.

## 설계 범위 이탈
이탈 없음. (disconnectUser.test.ts/adminWiring.test.ts는 설계 §Testability T5/T6 대응. .gitignore·context·.dev는 코드 무영향.)

## 신규 위험 (trust-ledger 기존 항목 제외)

### Warning
1. **[GAP] ws-relay 재-join 시 stale userConnections 매핑** — `apps/ws-relay/src/server.ts` join 처리(~107행). 동일 소켓이 다른 userId로 재-join하면 이전 connUserId Set에서 소켓이 제거되지 않음 → (a) 메모리 누수, (b) **잘못된 강제종료**(이전 userId 제거 시 현재 다른 userId를 서비스 중인 소켓을 close). **gemini-code-assist 인라인(server.ts:107)과 동일 지적.** → 수정 권장.
2. **[POLICY] adminServer 런타임 error 핸들러 부재** — `apps/ws-relay/src/adminServer.ts`. `server.on('error', reject)`는 listen 단계만 처리. listen 성공 후 런타임 오류 이벤트 미처리 시 Node uncaughtException → 프로세스 종료. (127.0.0.1 전용이라 빈도 낮음) → 1줄 핸들러 추가 권장.
3. **[GAP] AC-5/6/12 통합 커버리지 부재** — `countByWorkspaceIdAndRole` 파생쿼리가 단위(mock)로만 검증됨. OWNER 2명(count=2, BR-1/BR-2 미발동) 실DB 통합 검증 없음 → 쿼리 오타/방언 차이 미검출 위험. → 2-owner 통합 테스트 보완 권장.

### Info
4. [GAP] updateMemberRole 동일역할 재설정 시 불필요 DB write(멱등성 정책 미명시) — 문서화 또는 무변경 skip.
5. [품질] updateMemberRole의 단건 사용자 조회를 findAllById+stream+Map로 처리 — `findById(targetUserId).orElse(null)`로 단순화. **gemini 인라인(WorkspaceService:219)과 동일.**
6. AC-22 @DisplayName에 "OUTSIDER=제거된 멤버 동일경로" 부연 / disconnectUser.test setTimeout 30ms(기존 Minor) / CLOSING 소켓·Node 단일스레드(분석상 안전) — 무액션.

## PR #25 리뷰 동반 확인
- 상태: OPEN · MERGEABLE · reviewDecision 없음(정식 승인/변경요청 전) · draft 아님
- CI 체크: **전부 통과** — Backend Test Results 199 ✅(24s) / Gradle Testcontainers ✅(1m15s) / pnpm typecheck+test+build ✅(1m5s)
- gemini-code-assist 리뷰(COMMENTED): 인라인 2건(medium)
  - WorkspaceService.java:219 — findAllById→findById 단순화 (위 Info 5와 동일)
  - server.ts:107 — 재-join stale 매핑 메모리누수+잘못된 강제종료 (위 Warning 1과 동일)

## 총평
- 강점: BR-3→BR-4→BR-2 순서·ws-relay 별도 admin포트 분리가 코드·테스트에 일관 반영. CI 그린.
- 합산: Critical 0, Warning 3, Info 3. cross-review와 gemini가 **server.ts 재-join 버그**(Warning 1)와 **findById 단순화**(Info 5)를 공통 지적 → 신뢰도 높음.
- 권고: 머지 전 Warning 1(재-join 버그) 수정 필수, Warning 2(error 핸들러)·Warning 3(통합 커버리지)·Info 5(단순화) 동반 권장.

## 처리 결과 (2026-06-23, 사용자: 핵심 4건 수정)
- ✅ Warning 1 (재-join stale 매핑): server.ts join 처리에서 connUserId 변경 시 이전 userId Set에서 소켓 제거. RGR(RED 재-join 테스트→GREEN). gemini server.ts:107 해소.
- ✅ Warning 2 (adminServer 런타임 error): listen 후 reject 리스너 제거 + 런타임 error 로깅 핸들러 등록.
- ✅ Warning 3 (AC-5/6/12 통합 커버리지): MemberManagementIntegrationTest에 2-owner 픽스처 + AC-5/6/12 통합 케이스 추가(count=2 실DB 검증).
- ✅ Info 5 (findById 단순화): updateMemberRole 단건 조회 findAllById+Map → findById. gemini WorkspaceService:219 해소.
- ⏭️ Info 4/6 (멱등 write·AC-22 @DisplayName·setTimeout): 비차단, 후속/문서화 대상.
- 검증: backend 202 pass + ws-relay 76 pass, 0 fail. verify 재게이트 통과.
