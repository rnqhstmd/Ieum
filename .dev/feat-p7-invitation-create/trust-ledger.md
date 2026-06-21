## Trust Ledger — P7 슬라이스 ②a 초대 생성 (INV-01/05)

### 통합 감사 (review)

- [POLICY/PASS] invitedById 신뢰 경계 — 안전
  - 근거: `InvitationController.createInvitation`이 `currentUserService.requireCurrentUserId()`(세션)로만 invitedById 도출, 요청 본문은 email·role만. 위조 불가.
  - 권고: 유지.

- [POLICY/PASS] OWNER 권한 강제 (PERM-03/04)
  - 근거: `accessGuard.requireOwner(currentUserId, wsId)` 선검증 → MEMBER/비멤버 403. INV-05로 이미멤버 이메일 409.
  - 권고: 유지.

- [RISK/MEDIUM] 초대 토큰 평문 저장
  - 근거: `Invitation.token`이 DB에 평문 저장(unique). DB 유출 시 토큰 노출 → 무단 수락 가능. (단, 토큰은 이메일로도 평문 전달되는 bearer 시크릿)
  - 권고: 후속에 토큰 해시 저장(수락 시 해시 비교) 검토. MVP 범위에서는 평문 유지(status.md 확정). 문서화.

- [RISK/MEDIUM] 서비스 경계 request null 가드 부재 (슬라이스 ① 동일 패턴)
  - 근거: `createInvitation`의 `request`가 null이면 `request.email()` NPE→500. 컨트롤러 경로(@RequestBody)는 non-null 보장이나 서비스 직접 호출 시 노출. (currentUserId null은 requireOwner가 403으로 선처리)
  - 권고: 슬라이스 ① cross-review와 동일하게 진입부 null 가드 검토. cross-review에서 핵심 방어로 반영 예정.

- [RISK/LOW] 409 응답이 이메일의 멤버 여부를 노출
  - 근거: 이미멤버 이메일 초대 시 409 → 해당 이메일이 멤버임을 노출. 단 OWNER 전용 액션이라 OWNER는 멤버 목록을 이미 조회 가능.
  - 권고: 영향 미미. 유지.

- [RISK/LOW] 이메일 형식 미검증
  - 근거: `normalizeEmail`은 비어있음만 검증(형식 X). 잘못된 문자열도 초대 생성 가능.
  - 권고: 실제 메일 발송(Phase 4) 시 형식 검증. MVP 허용. 문서화.

### 미충족 AC
- 없음 ([Must] 5/5, [Should] 1/1 충족).

### 종합
- CRITICAL 0 / HIGH 0 / MEDIUM 2(토큰 평문·request null) / LOW 2. 핵심 방어(invitedById 신뢰경계·OWNER 강제·INV-05·강한 토큰) 충족. 차단 항목 없음 → phase-complete 진행.

### Cross-Review (PR #19 gemini + claude) 후속 처리
- [MEDIUM/RISK→FIXED] createInvitation request null 가드
  - 발견: gemini 인라인(:78) + claude cross-review(슬라이스 ① 동일 패턴). request null → request.email() NPE→500.
  - 조치: 진입부 `if (request == null) throw IllegalArgumentException`(→400). 단위 `createInvitation_nullRequest_throwsAndSavesNothing`(never save) 추가. **반영**(clean build 107 tests).
- [HIGH/RISK→문서화·Phase4] @Transactional 내 외부 메일 호출
  - 발견: gemini 인라인(:106). 실 HTTP 발송 시 커넥션 풀 점유 안티패턴.
  - 조치: 현재 메일 no-op(실측 0)·실발송(INV-07)이 Phase4 연기 → Phase4에서 `@TransactionalEventListener(AFTER_COMMIT)` 분리(+@Async)로 함께 처리. 연기.
- [MEDIUM/RISK→문서화·Phase4] 초대 URL 하드코딩
  - 발견: gemini 인라인(:52). 환경별 도메인 대응 불가.
  - 조치: application.yml + @Value 분리. 실발송과 결부되어 Phase4에서 함께 처리. 연기.
