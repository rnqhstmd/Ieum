# PR 컨텍스트: P7 공유 워크스페이스 생성 (US-WS-02) — 슬라이스 ①

## 배경
이음은 지금까지 로그인 시 자동 생성되는 PERSONAL 워크스페이스만 존재했다. 팀 협업의 출발점인 SHARED(공유) 워크스페이스를 사용자가 직접 만들 수 없어, 그 위에서 성립하는 초대·역할 관리·멤버 제거(P7 전체)가 막혀 있었다. 본 PR은 P7의 **선행 조건**인 공유 워크스페이스 생성을 구현한다.

코드베이스에는 P7 스캐폴드(컨트롤러/서비스 시그니처/DTO/리포지토리)가 이미 깔려 있었으나, 서비스 본문이 `UnsupportedOperationException("TODO(Phase 1)")` 스텁이고 컨트롤러가 인증 컨텍스트를 `currentUserId = null`로 미배선한 상태였다. 본 PR은 **해당 스텁을 실제 동작으로 채우고 인증을 배선**한다.

## 요구사항 (US-WS-02)
- [Must] 인증된 사용자가 이름을 지정해 SHARED 워크스페이스를 생성하고, 생성자에게 OWNER 멤버십이 자동 부여된다.
- [Must] 워크스페이스 이름은 1자 이상 100자 이하. 위반 시 400.
- [Must] 생성 엔드포인트는 인증을 요구하며 요청자 신원을 서버측 세션에서 추출한다(ownerId 위조 불가).
- [Should] 이름 앞뒤 공백 제거 후 검증·저장(공백만=빈 이름 거부).

## 범위
- 구현: `WorkspaceService.createSharedWorkspace` 본문 + `normalizeName` 검증, `WorkspaceController.createWorkspace` 인증 배선.
- 테스트: 서비스 단위 3건(생성·이름 경계·검증실패) + REST 통합 3건(201/400/401).
- 범위 밖(후속 P7 슬라이스): 초대·역할 변경·멤버 제거·WS 삭제·이메일 발송·프론트 UI.

## Audit Summary
- 총 4건 (CRITICAL: 0, HIGH: 0, MEDIUM: 1, LOW: 2 + PASS 1)
- [PASS] ownerId 신뢰 경계 — 세션(`requireCurrentUserId`)에서만 도출, 요청 본문은 name만 → 위조/권한상승 불가
- [MEDIUM] 공유 WS 생성 rate-limit 부재 — PRD [Could] C1로 명시적 연기
- [LOW] 이름 문자 화이트리스트 없음 — 프론트 출력 인코딩 책임(React 기본 이스케이프)
- [LOW] @RequestBody 누락 시 Spring 400 선처리 — 별도 처리 불필요
