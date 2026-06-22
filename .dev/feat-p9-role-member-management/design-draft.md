# 설계 초안: P9 — 역할·멤버 관리 (architect, 검토용)

## 설계 규모: 대형 (cross-service backend Spring ↔ ws-relay Node)

## 변경 범위

**신규 (backend):**
- `WsRelayAdminClient.java` — ws-relay disconnect 호출 인터페이스 + RestClient 구현
- (테스트) `WorkspaceServiceMemberTest.java`, `MemberManagementIntegrationTest.java`, `PageMemberRegressionIntegrationTest.java`

**신규 (ws-relay):**
- `apps/ws-relay/src/adminHttp.ts` — admin HTTP 라우팅(disconnect 핸들러)
- (테스트) `apps/ws-relay/tests/adminHttp.test.ts` (또는 server.test.ts 케이스 추가)

**수정 (backend):**
- `WorkspaceService.java:137-171` — 스텁 3개 본문 + WsRelayAdminClient 주입
- `WorkspaceController.java:83/95/109` — currentUserId=null → currentUserService.requireCurrentUserId() (3곳)
- `MembershipRepository.java` — `long countByWorkspaceIdAndRole(UUID, MemberRole)` 추가
- `application.yml` — `app.ws-relay.admin-url` env

**수정 (ws-relay):**
- `server.ts` — userId→Set<WebSocket> 추적, http.Server 위에 WebSocketServer, admin 라우팅, disconnectUser 노출
- `main.ts` — admin 활성화 옵션(env)

## 상세 설계

### 1. WsRelayAdminClient (신규) — 강제종료 추상화 (인터페이스 격리, mock 가능)
```
interface WsRelayAdminClient { void disconnectUser(UUID userId); }  // best-effort, 예외 미전파
@Component RestWsRelayAdminClient(RestClient.Builder, @Value("${app.ws-relay.admin-url:}"))
  // 비어있으면 no-op + log; DELETE {base}/admin/connections/{userId}, 예외 catch (ResendEmailClient 동형)
```
userId는 UUID 타입 강제(문자열 보간 금지, path traversal 방지).

### 2. listMembers — AC-1/2/3
requireWorkspaceMember(403) → findByWorkspaceId → userId 목록 findAllById 일괄(N+1 회피) → MembershipDto. 시그니처 무변경.

### 3. updateMemberRole — AC-4/5/6/7/8/17/19
순서: requireOwner(403) → request.role null방어(400) → findByUserIdAndWorkspaceId 없으면 EntityNotFoundException(404, AC-8) → BR-1[현재 OWNER && 요청 MEMBER && countByWorkspaceIdAndRole(ws,OWNER)==1 → IllegalArgumentException("마지막 OWNER의 역할을 변경할 수 없습니다") 400, AC-7] → setRole → save → MembershipDto. 동일역할 무변경은 카운트 검사 불필요. AC-4(승격) 카운트 무관.

### 4. removeMember — AC-9/10/11/12/13/14/15/16/18 (검증순서 AC-10/11 정합 핵심)
순서: requireOwner(403, AC-18) → **BR-3 자기제거**[currentUserId==targetUserId → IllegalArgumentException("자기 자신을 제거할 수 없습니다") 400, AC-10/11] (BR-2보다 먼저 → 단독OWNER 자기제거도 이 메시지, AC-11) → BR-4[findByUserIdAndWorkspaceId 없으면 EntityNotFoundException 404, AC-13] → BR-2[대상 OWNER && count==1 → IllegalArgumentException("마지막 OWNER를 제거할 수 없습니다") 400; 자기제거는 BR-3가 흡수, 방어적 유지] → delete(AC-9/12) → **커밋 후** wsRelayAdminClient.disconnectUser(targetUserId) (AC-14, best-effort: 실패해도 삭제유지 AC-16, 미연결 무해 AC-15). 시그니처 무변경.

### 5. MembershipRepository: `long countByWorkspaceIdAndRole(UUID workspaceId, MemberRole role)` (파생쿼리)

### 6. WorkspaceController 3곳: currentUserId=null → currentUserService.requireCurrentUserId() (listMyWorkspaces/createWorkspace가 이미 사용). GET 200/DELETE 204/PATCH 200. removeMember 항상 204.

### 7. ws-relay server.ts: userConnections: Map<string,Set<WebSocket>> 추가(join 게이트 통과 시 등록, close 시 제거). WebSocketServer({port}) → http.createServer(adminHandler)+WebSocketServer({server}), httpServer.listen(port,host). disconnectUser(userId):number(닫은 소켓 수). admin: DELETE /admin/connections/{userId} → close(4003,'removed')+정리, 대상없으면 204. 127.0.0.1 전용. 경로 정규식 /^\/admin\/connections\/([^/]+)$/.

### 8. ws-relay main.ts: admin 활성화/호스트 env. 동일포트면 추가 env 불필요.

### 9. application.yml: `app.ws-relay.admin-url: ${WS_RELAY_ADMIN_URL:}` (미설정 시 no-op).

## 구현 순서 (RGR)
1. countByWorkspaceIdAndRole (의존 없음)
2. WsRelayAdminClient + application.yml (의존 없음) → AC-16 토대
3. WorkspaceController 3곳 배선 (의존 없음) → AC-3/17/18/19 라우팅
4. listMembers (의존 없음) → AC-1/2/3
5. updateMemberRole (의존 1) → AC-4/5/6/7/8/17/19
6. removeMember DB삭제까지(admin 제외) (의존 1,2) → AC-9/10/11/12/13/18
7. ws-relay userId추적+http.Server전환+disconnectUser (ws-relay 단독) → AC-14 토대
8. ws-relay admin DELETE 라우팅+close(4003) (의존 7) → AC-14/15
9. removeMember afterCommit admin 호출 배선 (의존 2,6,8) → AC-14/15/16
10. MEMBER 페이지 편집 회귀 통합테스트 (의존 3) → AC-20/21/22
병렬 가능: {1,2,3,4,7} 무의존. 5←1, 6←1·2, 8←7, 9←2·6·8, 10←3.

## 미해결 — 확인 필요 4건 (오케스트레이터가 사용자에게 질의)
1. MembershipDto 6필드 유지 vs 축소
2. removeMember admin 호출 커밋 후 보장: afterCommit 콜백 vs 컨트롤러 분리
3. ws-relay admin 동일포트 공유 vs 별도 admin 포트
4. userId 추적: 게이트 활성 시만 vs 게이트 off도 join userId
