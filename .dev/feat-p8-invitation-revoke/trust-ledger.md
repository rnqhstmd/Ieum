## Trust Ledger — P8 후속① 초대 철회(REVOKE) + 목록 조회

### 통합 감사 (review, security-auditor)

집계: CRITICAL 0, HIGH 2, MEDIUM 3. + quality-reviewer Minor 2.
오케스트레이터 처리: 코드 변경 필요 0건(오탐 2 + 정책/문서 GAP 후속 3 + Minor 후속 2).

#### CRITICAL — 0건

#### HIGH

- **[POLICY/HIGH] InvitationDto의 invitedById·expiresAt 목록 응답 노출 — 정책 미확정**
  - 근거: `InvitationDto`(id/workspaceId/email/invitedById/role/status/expiresAt/createdAt). token은 미포함(유출 없음). 목록 조회가 invitedById(초대자 UUID)·expiresAt를 반환.
  - 평가: **이 슬라이스가 도입한 노출 아님**. InvitationDto는 createInvitation(PR #19)·acceptInvitation(PR #20)이 이미 반환하며, 설계 단계에서 "기존 InvitationDto 재사용"을 사용자가 승인. 엔드포인트는 OWNER 전용. 즉각적 노출 위험 낮음.
  - 처리: **후속(횡단 DTO 노출 정책)**. 목록 전용 축약 DTO 도입은 P9 역할·멤버 관리에서 DTO 정책과 함께 재검토.

- **[GAP/HIGH] 비OWNER·비멤버·워크스페이스 미존재가 모두 403으로 수렴 — PRD에 미존재 응답 정책 부재**
  - 근거: `AccessGuard.requireWorkspaceMember`가 멤버십 없으면 AccessDeniedException→403. 미존재 wsId도 동일 403.
  - 평가: 감사자도 "자원 은닉 측면에서 오히려 안전"으로 명시. 자원 존재 여부 비노출(의도된 동작). 실제 취약점 아닌 **문서화 GAP**.
  - 처리: **후속(PRD에 wsId 미존재 응답 코드 정책 명문화)**. 코드 변경 불필요.

#### MEDIUM

- **[FP/MEDIUM] listInvitations @Transactional(readOnly) 누락 주장 — 오탐**
  - 근거: 감사자는 diff만 보고 메서드에 어노테이션 없음을 지적.
  - 평가: **오탐**. `InvitationService` 클래스에 `@Transactional(readOnly = true)`(:44)가 선언되어 listInvitations가 readOnly 트랜잭션을 상속. 설계서에도 "readOnly 기본 사용"으로 명시.
  - 처리: 조치 불필요.

- **[FP/MEDIUM] 401이 500으로 떨어질 위험 — 이미 검증됨**
  - 근거: CurrentUserService.requireCurrentUserId() 예외 매핑 미확인 우려.
  - 평가: **이미 검증**. InvitationListIntegrationTest AC-4·InvitationRevokeIntegrationTest AC-12(미인증→401)가 통과. create/accept의 401 통합 테스트도 동일 패턴으로 통과 중. 미인증은 SecurityConfig 필터(JsonAuthenticationEntryPoint)가 컨트롤러 진입 전 401 처리.
  - 처리: 조치 불필요.

- **[GAP/MEDIUM] 동시 revoke 경쟁 — PRD 제외 범위**
  - 근거: findById→상태확인→setStatus→save read-modify-write. 동시 요청 시 둘 다 204 가능(최종 상태는 REVOKED로 무해).
  - 평가: PRD가 "낙관적 잠금 제외"를 명시. 현재 멱등 무해. 향후 revoke 후속 처리(알림·감사) 추가 시 @Version 재검토.
  - 처리: **후속(P8 동시성 하드닝 또는 알림 슬라이스에서)**.

#### Minor (quality-reviewer)

- Thread.sleep(10) 시간 의존 테스트(AC-2 정렬) — flaky 여지 미미. createdAt 명시 주입으로 sleep 제거 가능. 후속.
- InvitationRevokeIntegrationTest saveExpiredInvitation 헬퍼 분리 — saveInvitation 파라미터화로 통합 가능. 후속.

### 교차 검증 정합 (security-auditor 확인)
BR-1 requireOwner 선행 ✓ / BR-2 ConflictException 409(IllegalStateException 미사용, 500 회귀 없음) ✓ / BR-3 workspaceId 불일치 EntityNotFoundException 404(동일 메시지 은닉) ✓ / BR-4 revoke @Transactional ✓ / BR-5 requireCurrentUserId 배선 ✓ / BR-6 파생쿼리 정렬 ✓ / token 미노출 ✓.
