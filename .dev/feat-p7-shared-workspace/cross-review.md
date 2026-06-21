# Cross-Review 결과

- advisor: claude (orchestrator-direct) + PR #18 gemini-code-assist 통합
- 브랜치: feat/p7-shared-workspace (base: main)
- DEV_DIR: .dev/feat-p7-shared-workspace
- 대상: PR #18 (commit a08b820), CI 95 tests ✅ 0 fail

## AC 충족 매트릭스

| AC | 충족 | 근거 |
|----|------|------|
| AC-1: SHARED 생성 + OWNER 멤버십 | O | WorkspaceService.createSharedWorkspace + WorkspaceServiceTest.createSharedWorkspace_savesSharedWorkspaceAndOwnerMembership |
| AC-2: 이름 1/100 경계 | O | normalizeName + ..._nameBoundary_1and100_ok |
| AC-3: 빈/공백/101 거부 무저장 | O | normalizeName throw + ..._invalidName_throwsAndSavesNothing (never save) |
| AC-4: POST 201 + OWNER membership DB | O | WorkspaceController 인증 배선 + WorkspaceCreateIntegrationTest.member_create_returns201 |
| AC-5: 빈 이름 400 INVALID_ARGUMENT | O | ApiExceptionHandler + ..._invalidName_returns400 |
| AC-6: 미인증 401 미생성 | O | SecurityConfig + ..._unauthenticated_returns401 |

[Must] 3/3 충족, [Should] 1/1 충족(S1 trim). CI 통과(95 tests, 0 fail).

## 설계 범위 이탈
- 이탈 없음. design.md "변경 범위"(WorkspaceService·WorkspaceController + 단위/통합 테스트 2)와 일치. `context/workspace/status.md`는 phase-complete Step 3 표준 status 갱신(docs 커밋 a08b820)으로 정당.

## 신규 위험 (trust-ledger에 없는 항목)

### MEDIUM
- [RISK] WorkspaceService.java:75 createSharedWorkspace — 서비스 경계 null 가드 부재 (PR #18 gemini와 일치)
  - 근거: `createSharedWorkspace`는 public 서비스 API. 현재 유일 호출자(컨트롤러)는 `requireCurrentUserId()`로 non-null·@RequestBody로 non-null request를 보장하나, 후속 슬라이스(역할/초대 흐름)·테스트가 직접 호출 시 `request`=null→`request.name()` NPE, `currentUserId`=null→save 시 DataIntegrityViolation→500.
  - 권고: 진입부에서 `currentUserId`/`request` null → IllegalArgumentException(→400)로 명시 검증. trust-ledger의 "@RequestBody 누락(LOW)"보다 넓은 범위(서비스 계약).

### LOW (Info)
- [RISK] WorkspaceService normalizeName — `String.length()`는 UTF-16 코드유닛 기준
  - 근거: 이모지·astral 평면 문자는 surrogate pair(2 code unit)로 카운트되어 "100자" 경계가 사용자 인지와 어긋남(예: 이모지 50개=length 100). 한글/ASCII는 1:1이라 무영향.
  - 권고: MVP 허용. 후속에 코드포인트 기준(`codePointCount`)으로 정밀화 검토. 문서화.

## 총평
- 강점: ownerId 신뢰 경계(세션 도출) 견고, AC 전건 충족 + CI green, 기존 패턴(ensurePersonalWorkspace) 미러로 일관성.
- 합산: Critical 0, MEDIUM 1, LOW 1.
- 권고: MEDIUM(서비스 null 가드)은 핵심 방어로 즉시 반영 권장, LOW(length 코드유닛)는 문서화/연기.

## 처리 결과 (사용자 선택: 핵심 방어 수정 + 나머지 문서화)
- MEDIUM 서비스 null 가드: **수정됨** (commit 2f1a8fd, 단위 테스트 +1, clean build 96 tests/0 fail).
- LOW length UTF-16: **문서화/연기** (trust-ledger 기록, 후속 codePointCount 검토).
