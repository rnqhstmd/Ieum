# Cross-Review 결과

- advisor: claude (qa-manager + security-auditor, cross-review 미션)
- 브랜치: feat/p10-workspace-delete-leave (base: main)
- DEV_DIR: .dev/feat-p10-workspace-delete-leave
- 실행: 2026-06-23 · PR #26 리뷰 동반 확인

## AC 충족 매트릭스
- [Must] **16/16 O** (qa-manager). 코드+테스트(단위 14·통합 20)로 전부 충족. BR-7 검증 순서·예외 타입·disconnect best-effort·cascade(archived 포함) 실증 일관.

## 설계 범위 이탈
이탈 없음. (context/·.dev/ 산출물은 검증 제외. 소스 2 + 테스트 2 = 설계 명시 파일.)

## 신규 위험 (trust-ledger 기존 항목 제외)

### Warning
1. **[GAP] requireOwner stub 누락 — PERSONAL 삭제 단위 테스트** — `WorkspaceLifecycleServiceTest` `deleteWorkspace_personalWorkspace_*`. trust-ledger MEDIUM-4("requireOwner 반환 stub 명시화 ✅")가 성공 케이스(`deleteWorkspace_ownerShard`)에만 반영되고 PERSONAL 케이스엔 미반영 → **기록-코드 불일치**. 기능 동작은 정상(Mockito 기본 null 반환, 서비스가 반환값 미사용). qa-manager+security 공통 지적. → 수정 권장(stub 추가로 일관).

### Info
2. **[GAP] AC-15 통합테스트 ArgumentCaptor 미적용** — `WorkspaceDeleteLeaveIntegrationTest` `owner_deleteWorkspace_disconnectsAllMembers`가 `times(2)`만 검증, 대상 userId 집합 미검증. 설계 보강권고 3은 통합에도 ArgumentCaptor 권고(단위엔 적용됨). → 통합에 captor 추가 권장.
3. **[GAP] AC-13 통합테스트 DB 반영 단언 누락** — rename 통합테스트가 응답 DTO `name`만 검증, `workspaceRepository.findById().getName()` DB 단언 없음. 설계 Testability "DB 반영" 명시. 서비스가 save() 하므로 실버그 아님. → DB 단언 1행 추가 권장.
4. **[품질] 미사용 import 2건** — `WorkspaceLifecycleServiceTest:21` `java.util.stream.Collectors`, `WorkspaceDeleteLeaveIntegrationTest:31` `static org.mockito.Mockito.never`. **gemini 인라인과 동일.** → 제거 권장.
5. **[품질] 통합테스트 ObjectMapper `new` 직접 생성** — `@Autowired` 권장. **gemini 인라인 + quality-reviewer Minor와 동일.** → 선택 정리.

### 무액션(문서화)
- **[security HIGH → 기각] disconnect 예외 비롤백 단위 케이스 미구현** — best-effort는 `RestWsRelayAdminClient`(try/catch(Exception)+log.warn, Javadoc 계약)가 보장하고 P9 `RestWsRelayAdminClientTest`(3건)가 5xx 미전파 검증. 서비스 무 try/catch는 의도(P9 removeMember 일관). 설계 보강권고 4("서비스 단위 throw→커밋")는 부정확(서비스는 흡수하지 않음). **실제 결함 아님.**
- **[gemini-1 → 유지] renameWorkspace `save()` 불필요(dirty checking)** — P9 `updateMemberRole`도 명시 save() 사용(컨벤션). 단위테스트가 `verify(save)`. 제거 시 P9 분기+테스트 수정 필요 → **컨벤션 일관성 위해 유지.**
- **[ASSUMPTION 낮음] AC-9 PERSONAL+비멤버 미검증** — AC-10/11과 동일 경로(멤버십 우선 404). 독립 위험 낮음. 무액션.
- **[RISK 낮음] AccessGuard.requireOwner 내부 미Read** — 통합 AC-2/3/4가 실DB로 실증. 무액션.

## PR #26 리뷰 동반 확인
- 상태: OPEN · MERGEABLE · reviewDecision 없음(정식 승인/변경요청 전)
- CI: **전부 통과** — Backend Test Results ✅ / Gradle Testcontainers ✅(1m11s) / pnpm typecheck+test+build ✅(1m5s)
- gemini-code-assist(COMMENTED): 인라인 4건(medium)
  - WorkspaceService:129 — rename save() 불필요 (위 무액션, P9 일관 유지)
  - WorkspaceDeleteLeaveIntegrationTest:52 — ObjectMapper @Autowired (위 Info 5)
  - WorkspaceLifecycleServiceTest:21 — 미사용 import Collectors (위 Info 4)
  - WorkspaceDeleteLeaveIntegrationTest:31 — 미사용 import Mockito.never (위 Info 4)

## 총평
- 강점: AC 16/16, 검증 순서·예외·cascade 실증 일관. cross-review와 gemini가 **미사용 import**(Info 4)와 **ObjectMapper**(Info 5)를 공통 지적 → 신뢰도 높음. CI 그린.
- 합산: Critical 0, Warning 1, Info 4 (+ 무액션 4).
- 권고: 머지 전 차단 항목 없음. Warning 1(stub 일관)·Info 2~4(테스트 강화·import 정리) 동반 수정 권장. gemini-1/HIGH는 의도/컨벤션상 유지.

## 처리 결과 (2026-06-23, 사용자: 5건 전부 수정)
- ✅ Warning 1 (requireOwner stub): PERSONAL 삭제 단위 테스트에 `when(requireOwner).thenReturn` 추가 → ledger 일관.
- ✅ Info 2 (AC-15 captor): 통합테스트를 `ArgumentCaptor`로 전환, disconnect userId 집합 == {ownerId, memberId} 단언.
- ✅ Info 3 (AC-13 DB 단언): rename 통합테스트에 `findById().getName()` DB 반영 단언 추가.
- ✅ Info 4 (미사용 import): `Collectors`(Lifecycle:21)·`Mockito.never`(Integration:31) 제거. gemini 인라인 2건 해소.
- ⛔ Info 5 (ObjectMapper @Autowired): **적용 시도 → 전체 통합테스트 20건 실패**(`NoSuchBeanDefinitionException: ObjectMapper`). 테스트 컨텍스트(AbstractIntegrationTest)에 ObjectMapper 빈 없음 — P9도 `new ObjectMapper()` 사용. **gemini-2/quality Minor 제안은 이 셋업에서 부적절 → 되돌림 + 코드 주석으로 사유 명시.**
- 검증: backend 236 pass(0 fail) + 단위 14 + 통합 20. verify 재게이트 통과.
- 무액션 유지: gemini-1(rename save() — P9 컨벤션), security HIGH(disconnect — client 계층 best-effort), ASSUMPTION/RISK(통합 커버).
