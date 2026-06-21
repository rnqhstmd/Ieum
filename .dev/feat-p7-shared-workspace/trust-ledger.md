## Trust Ledger — P7 공유 워크스페이스 생성 (US-WS-02) 슬라이스 ①

### 통합 감사 (review)

- [POLICY/PASS] ownerId 신뢰 경계 — 안전
  - 근거: `WorkspaceController.createWorkspace`가 `currentUserService.requireCurrentUserId()`(서버측 세션/OAuth)로만 ownerId를 도출하고, 요청 본문은 `name`만 받는다. 클라이언트가 ownerId/role을 주입할 경로 없음 → IDOR/권한상승 불가.
  - 권고: 유지.

- [RISK/LOW] 워크스페이스 이름 문자 화이트리스트 없음
  - 근거: `normalizeName`은 길이(1~100)만 검증, 임의 문자(HTML/스크립트 포함) 저장 가능.
  - 권고: 저장 시점이 아니라 프론트 렌더 시 출력 인코딩으로 방어(React 기본 이스케이프). 본 슬라이스 범위 밖. 후속에서 필요 시 sanitize.

- [GAP/MEDIUM] 공유 워크스페이스 생성 rate-limit 부재
  - 근거: 인증 사용자가 무제한으로 SHARED 워크스페이스를 생성 가능(자원 증식).
  - 권고: PRD [Could] C1(개수 상한)로 명시적 연기됨. 후속 정책 슬라이스에서 처리.

- [ASSUMPTION/LOW] @RequestBody 누락 시 동작
  - 근거: body 미전송 시 Spring이 HttpMessageNotReadableException(400) 처리 → 컨트롤러 진입 전 차단(request null 아님). AC 범위 밖.
  - 권고: 별도 처리 불필요.

### 미충족 AC
- 없음 ([Must] 3/3, [Should] 1/1 충족).

### 종합
- CRITICAL 0 / HIGH 0 / MEDIUM 1(연기) / LOW 2. 핵심 방어(ownerId 신뢰 경계·이름 길이 상한) 충족. 차단 항목 없음 → phase-complete 진행.

### Cross-Review (PR #18 gemini + claude) 후속 처리
- [MEDIUM/RISK→FIXED] `createSharedWorkspace` 서비스 경계 null 가드
  - 발견: gemini 인라인(WorkspaceService.java:78) + claude cross-review. `currentUserId`/`request` null 시 NPE·DB 제약위반(500) 가능(서비스가 public API).
  - 조치: 진입부에서 둘 다 null → IllegalArgumentException(→400). 단위 테스트 `createSharedWorkspace_nullArgs_throwsAndSavesNothing`(never save) 추가. **반영**.
- [LOW/RISK→문서화·연기] `normalizeName`의 `String.length()`가 UTF-16 코드유닛 기준
  - 발견: claude cross-review. 이모지·astral 문자는 surrogate pair(2 code unit)로 카운트되어 "100자" 경계가 사용자 인지와 어긋남(한글/ASCII는 1:1 무영향).
  - 조치: MVP 허용, 연기. 후속에 `codePointCount` 기준 정밀화 검토.
