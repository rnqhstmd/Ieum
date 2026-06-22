# 코드 맵: P9 — 역할·멤버 관리 (역할 변경·내보내기·권한 마감 + WS 강제종료)

## 핵심 파일 (구현 대상)
- `backend/src/main/java/com/ieum/workspace/WorkspaceService.java:137-171` → listMembers/removeMember/updateMemberRole **스텁(UnsupportedOperationException)** — P9 핵심 구현 대상
- `backend/src/main/java/com/ieum/workspace/WorkspaceController.java:81/91/104` → GET/DELETE/PATCH `.../members` 엔드포인트 스캐폴드 (currentUserId=null TODO → currentUserService 주입 필요)
- `apps/ws-relay/src/server.ts:45,130-134` → 연결 추적 `sockets: Map<clientId,WebSocket>`, close 처리. **userId 연결 추적 + admin disconnect 신규 필요(WS-AUTH-04)**
- `apps/ws-relay/src/membershipStore.ts:1-22` / `pgMembershipStore.ts:1-40` → 멤버십 검사 포트(isMember), join 시에만 검사

## 참조 파일 (이미 존재, 재사용)
- `backend/src/main/java/com/ieum/common/security/AccessGuard.java:22-41` → requireWorkspaceMember / requireOwner(33-35) / requirePageAccess — **requireOwner 재사용**
- `backend/src/main/java/com/ieum/workspace/Membership.java:1-43` → 엔티티 (userId+workspaceId 유니크, role, joinedAt)
- `backend/src/main/java/com/ieum/workspace/MemberRole.java:1-9` → enum OWNER/MEMBER
- `backend/src/main/java/com/ieum/workspace/MembershipRepository.java:1-19` → findByUserIdAndWorkspaceId, findByWorkspaceId
- `backend/src/main/java/com/ieum/workspace/Workspace.java:1-39` → 엔티티 (type PERSONAL/SHARED, ownerId)
- `backend/src/main/java/com/ieum/common/ApiExceptionHandler.java:1-75` → AccessDeniedException→403, EntityNotFoundException→404, IllegalArgumentException→400, ConflictException→409, GoneException→410
- `backend/src/main/java/com/ieum/page/PageService.java:45-145` → 페이지 CRUD에 requireWorkspaceMember 적용 → **MEMBER 편집 이미 가능(권한 매트릭스 충족)**

## 패턴 정본 (architect 탐색 추가)
- `backend/.../common/email/ResendEmailClient.java` → best-effort HTTP 클라이언트 정본(RestClient.Builder 주입 + try/catch 로깅). **WsRelayAdminClient 참조 템플릿**
- `backend/.../config/RestClientConfig.java` → RestClient.Builder bean(타임아웃 5s/10s) — admin 호출도 재사용
- `backend/.../common/security/CurrentUserService.java:20` → requireCurrentUserId() — 컨트롤러 배선 대상
- `backend/.../invitation/InvitationService.java:85-118` / `InvitationController.java:30-72` → requireOwner + best-effort 외부호출 + 204 반환 정본
- `apps/ws-relay/src/protocol.ts:8-16` → JoinMsg.userId(선택) — userId 추적은 게이트 활성(connUserId 설정) 시에만
- `apps/ws-relay/src/index.ts` → barrel export(ws 의존 어댑터 제외)
- `backend/src/main/resources/application.yml:40-46` → app.* env 외부화 패턴 ${VAR:default}

## 설정/통지 채널
- `backend` → `apps/ws-relay` 멤버 제거 통지 채널 **신규 필요** (HTTP admin 엔드포인트 또는 메시지) — removeMember 후 해당 userId 연결 close(WS-AUTH-04)
- ws-relay URL 외부화(@Value/config) 필요

## 테스트 (스타일 참조)
- `backend/src/test/java/com/ieum/common/security/AccessGuardTest.java:1-196` → 단위(@ExtendWith(MockitoExtension), assertThatThrownBy)
- `backend/src/test/java/com/ieum/workspace/WorkspaceServiceTest.java` → 단위(@Mock/@InjectMocks, ArgumentCaptor, thenAnswer)
- `backend/src/test/java/com/ieum/workspace/WorkspaceCreateIntegrationTest.java` → 통합(@AutoConfigureMockMvc, AbstractIntegrationTest 상속, asUser(GOOGLE_ID), jsonPath + DB 검증)
- `backend/src/test/java/com/ieum/support/AbstractIntegrationTest.java` → 통합 베이스
- `apps/ws-relay/tests/server.test.ts` / `room.test.ts` / `membershipStore.test.ts` → vitest (port:0 실서버 기동, Promise 메시지 대기)
