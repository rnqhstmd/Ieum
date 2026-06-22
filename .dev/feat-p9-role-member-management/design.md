# 설계서: P9 — 역할·멤버 관리 (확정)

> 확정일: 2026-06-22 · 규모: 대형 (cross-service backend Spring ↔ ws-relay Node)
> 반영 결정: BR-2 방어적(도달불가), BR-1 주어=대상 현재 role, disconnect=@Transactional 내부 직접호출(afterCommit 폐기), userId 추적=게이트 활성 시만, MembershipDto 6필드 유지, 컨트롤러 배선=서비스와 동일 묶음, ws-relay **별도 admin 포트**(기존 WS 무수정), 회귀 게이트 명시

## 변경 범위

**신규 (backend):**
- `workspace/WsRelayAdminClient.java` — disconnect 인터페이스
- `workspace/RestWsRelayAdminClient.java` — RestClient 구현 (예외 흡수 내장)
- (테스트) `WorkspaceServiceMemberTest.java`(단위), `MemberManagementIntegrationTest.java`(통합), `PageMemberRegressionIntegrationTest.java`(통합)

**신규 (ws-relay):**
- `apps/ws-relay/src/adminServer.ts` — 별도 admin http.Server (`DELETE /admin/connections/{userId}` + lifecycle)
- (테스트) `apps/ws-relay/tests/adminServer.test.ts`

**수정 (backend):**
- `WorkspaceService.java:137-171` — 스텁 3개 본문 + `AccessGuard`·`WsRelayAdminClient` 주입
- `WorkspaceController.java:83/95/109` — `currentUserId=null` → `currentUserService.requireCurrentUserId()` (서비스 구현과 동일 묶음 머지)
- `MembershipRepository.java` — `long countByWorkspaceIdAndRole(UUID, MemberRole)` 추가
- `application.yml` — `app.ws-relay.admin-url` env

**수정 (ws-relay):**
- `server.ts` — `userConnections: Map<string,Set<WebSocket>>` 추적 추가 (listening/port/close 경로 **무수정**, 등록/해제 로직만 삽입), `disconnectUser` 노출
- `main.ts` — admin 서버 활성화 (env `ADMIN_PORT`)

## 적용 컨벤션
- DTO: `record`(응답/요청). MembershipDto 기존 6필드(membershipId/userId/userEmail/userName/role/joinedAt) 유지.
- 서비스: `@Service @RequiredArgsConstructor @Transactional(readOnly=true)`, 쓰기만 `@Transactional`. 생성자 주입. 진입부 null 방어 `IllegalArgumentException`.
- 권한: `AccessGuard.requireOwner`(비OWNER 403), `requireWorkspaceMember`(비멤버 403).
- 예외→HTTP: AccessDeniedException 403 / EntityNotFoundException 404 / IllegalArgumentException 400 / ConflictException 409.
- best-effort 외부호출 정본: `InvitationService.createInvitation`(:107-115)·`ResendEmailClient` — `@Transactional` 내부 직접 호출, **예외 흡수는 클라이언트 구현체 내부**. `RestClient.Builder` 주입(RestClientConfig 5s/10s).
- 테스트: 단위 `@ExtendWith(MockitoExtension)`+`@Mock/@InjectMocks`+`assertThatThrownBy`/`ArgumentCaptor`/`verify`; 통합 `AbstractIntegrationTest`+`@AutoConfigureMockMvc`+`asUser(GOOGLE_ID)`+jsonPath/DB. `@DisplayName` 한국어 AC. vitest `port:0`.

## 상세 설계

### 1. WsRelayAdminClient (인터페이스) + RestWsRelayAdminClient (구현)
```
interface WsRelayAdminClient { void disconnectUser(UUID userId); }  // best-effort, 예외 미전파
@Component RestWsRelayAdminClient(RestClient.Builder, @Value("${app.ws-relay.admin-url:}") adminBaseUrl)
  // 빈값 → no-op + log.info; DELETE {adminBaseUrl}/admin/connections/{userId}; 응답코드 무관 로깅, 모든 예외 catch 후 정상 반환
```
userId는 UUID 타입 강제(문자열 보간 금지, path traversal 방어). 예외 흡수가 구현체 내부 → 호출측 try/catch 불필요, AC-16 자동충족.

### 2. listMembers — AC-1/2/3
requireWorkspaceMember(403) → findByWorkspaceId → userId 목록 `userRepository.findAllById` 일괄(N+1 회피) → Map(userId→User) → MembershipDto 6필드 변환. 시그니처 무변경. WorkspaceService 생성자에 AccessGuard 주입 추가. User 미존재 시 email/name null 허용.

### 3. updateMemberRole — AC-4/5/6/7/8/17/19
순서: requireOwner(403, AC-17/19) → request/role null방어(400) → findByUserIdAndWorkspaceId 없으면 EntityNotFoundException(404, AC-8) → **BR-1**[`대상.role==OWNER && request.role()==MEMBER && countByWorkspaceIdAndRole(ws,OWNER)==1` → IllegalArgumentException("마지막 OWNER의 역할을 변경할 수 없습니다") 400, AC-7; count==2면 통과 AC-5] → setRole → save → MembershipDto. AC-4(승격)·동일역할 무변경은 카운트 무관. **BR-1 주어 = 대상 멤버의 현재 role**.

### 4. removeMember — AC-9/10/11/12/13/14/15/16/18
순서: requireOwner(403, AC-18) → **BR-3 자기제거**[currentUserId==targetUserId → IllegalArgumentException("자기 자신을 제거할 수 없습니다") 400, BR-2보다 선행, AC-10/11] → **BR-4**[findByUserIdAndWorkspaceId 없으면 EntityNotFoundException 404, AC-13; 이 시점 target≠current 보장] → **BR-2(방어적·도달불가)**[`대상.role==OWNER && count==1` → IllegalArgumentException("마지막 OWNER를 제거할 수 없습니다") 400; **현 순서상 도달 불가**(단독 OWNER 제거=자기제거→BR-3 흡수), 미래 대비 가드만, **발동 테스트 미작성**] → delete(AC-9/12) → **delete 직후 같은 @Transactional 메서드에서 `wsRelayAdminClient.disconnectUser(targetUserId)` 직접 호출**(AC-14; 클라가 예외 흡수→롤백 없음 AC-16; 미연결 무해 AC-15). 시그니처 무변경.

### 5. MembershipRepository: `long countByWorkspaceIdAndRole(UUID workspaceId, MemberRole role)` (파생쿼리)

### 6. WorkspaceController 3곳: `currentUserId=null` → `currentUserService.requireCurrentUserId()` (line 35/45 패턴). GET 200/DELETE 204/PATCH 200. **서비스 구현과 동일 묶음만 머지**(스텁 500 중간상태 방지, 단독 머지 금지).

### 7. ws-relay server.ts — userId 추적 (WS 서버 경로 무수정)
- `userConnections: Map<string,Set<WebSocket>>` 추가.
- 등록: `membershipGate` 통과로 `connUserId` 설정 시점(:99)에 `userConnections.get(connUserId).add(socket)` (**게이트 활성 시만**, WS-AUTH 신원 일관).
- 해제: `socket.on('close')`(:130)에서 Set에서 제거, 빈 Set이면 키 삭제.
- `disconnectUser(userId): number` 노출 — Set 전수 `close(4003,'removed')` + 정리, 닫은 수 반환.
- **`WebSocketServer({port})` 생성·listening·port·close 경로는 변경 금지** → 기존 server.test.ts 회귀 0. 다중 탭 → Set 전수 close.

### 8. ws-relay adminServer.ts (신규) — 별도 admin http.Server
```
createAdminServer({ port: ADMIN_PORT, host?: '127.0.0.1', disconnectUser: (userId)=>number }): Promise<{ port; close(): Promise<void> }>
```
- 기존 WS와 독립된 별도 http.Server를 127.0.0.1:ADMIN_PORT 기동. `DELETE /admin/connections/{userId}` → `disconnectUser` 호출(동일 프로세스, userConnections Map 공유) → 204. 대상 없으면 무동작 204. 그 외 메서드/경로 404. 경로 정규식 `/^\/admin\/connections\/([^/]+)$/`.
- `RelayServer.close()`가 ws close + admin http.Server close 모두 수행(누수 0). close 시그니처 `Promise<void>` 유지.
- WS_RELAY_ADMIN_URL은 이 admin 포트를 가리킴.

### 9. main.ts: `ADMIN_PORT` env 읽어 admin 서버 활성화. SIGTERM/SIGINT에서 ws+admin 모두 close.

### 10. application.yml: `app.ws-relay.admin-url: ${WS_RELAY_ADMIN_URL:}` (미설정 시 no-op).

### 11. MEMBER 페이지 회귀 — AC-20/21/22
PageService는 이미 requireWorkspaceMember 적용(소스 변경 없음). 통합 테스트만 신규: MEMBER 생성 201·편집 200, 제거된 멤버 접근 403.

## 구현 순서 (RGR)
1. [Must] countByWorkspaceIdAndRole (의존 없음)
2. [Must] WsRelayAdminClient+RestWsRelayAdminClient+application.yml (의존 없음) → AC-16 토대
3. [Must] listMembers + Controller GET 배선(동일 묶음) (의존 없음) → AC-1/2/3
4. [Must] updateMemberRole + Controller PATCH 배선(동일 묶음) (의존 1) → AC-4/5/6/7/8/17/19
5. [Must] removeMember DB삭제까지(disconnect 제외) + Controller DELETE 배선(동일 묶음) (의존 1,2) — BR-3→BR-4→BR-2(방어적, 발동테스트 없음), AC-12는 BR-2 미발동만 → AC-9/10/11/12/13/18
6. [Must] ws-relay userConnections 추적+disconnectUser (기존 WS 무수정) (의존 없음) → AC-14 토대
7. [Must] ws-relay 별도 admin http.Server(adminServer.ts)+DELETE 라우팅+lifecycle (의존 6) → AC-14/15
8. [Must] removeMember에 disconnectUser 직접 호출 배선 (의존 2,5,7) — 통합테스트는 membershipStore 주입(게이트 on) → AC-14/15/16
9. [Should] MEMBER 페이지 편집 회귀 통합테스트 (의존 3) → AC-20/21/22

병렬 가능: {1,2,6} 무의존. 4←1, 5←1·2, 7←6, 8←2·5·7, 9←3. 컨트롤러 배선은 병렬 집합 제외(서비스 동일 묶음).

**회귀 게이트(ws-relay 6/7 완료 기준 verify):** 기존 server.test.ts 전수 통과(listening/port/close/maxConnections 회귀 0), room.test.ts 전수 통과, admin http.Server close 누수 0.

---

## Testability 평가 (test-architect)

### Score: 8/10 — ✅ TESTABILITY PASS

### 컴포넌트별 테스트 전략 (red-writer 격리 지침)
- **listMembers (AC-1/2/3)**: 단위 `@Mock AccessGuard/MembershipRepository/UserRepository`, 403=`thenThrow(AccessDeniedException)`+`assertThatThrownBy`. 통합 `asUser`로 OWNER/MEMBER/비멤버 3주체 + jsonPath size 2·필드.
- **updateMemberRole (AC-4/5/6/7/8/17/19)**: 단위 — BR-1 분기 `countByWorkspaceIdAndRole thenReturn(1L)→예외 / (2L)→통과`, `ArgumentCaptor`/`verify(save)`/`never()`. 통합 OWNER 2명 vs 단독 픽스처.
- **removeMember (AC-9~16/18)**: DB삭제 경로 단위(검증순서 분기, `verify(delete)`/`never()`). **disconnect 직접 호출이라 단위 `verify(wsRelayAdminClient).disconnectUser(target)` 가능**(afterCommit 폐기 효과). AC-16=mock 정상반환→204. 통합 AC-14는 **membershipStore 주입(게이트 on)** 모드.
- **WsRelayAdminClient/RestWsRelayAdminClient (AC-14/15/16)**: 인터페이스 격리 `@Mock`. 구현체는 **MockRestServiceServer**(ResendEmailClientTest 1:1) — DELETE/URL/UUID보간/`withServerError()` 예외미전파/빈URL no-op.
- **ws-relay disconnectUser/adminServer (AC-14/15)**: 단위 vitest — `userConnections` Map + fake socket(`{close: vi.fn(), readyState}`)로 close(4003) 검증, 미연결 0 반환. 통합 port:0 실서버 join→admin DELETE→client close 4003 수신.
- **Controller 배선 (AC-17/18/19)**: 통합 전용(MockMvc+oauth2Login). 401 회귀 포함.
- **countByWorkspaceIdAndRole**: 서비스 단위에서 `@Mock` stub, BR-1/2 통합서 실카운트.
- **MEMBER 페이지 회귀 (AC-20/21/22)**: 통합 전용(순수 회귀, AC-22는 removeMember 결합).

### 비차단 권고 (반영 완료)
- disconnect를 afterCommit→**@Transactional 내부 직접 호출**로 변경 → 단위 verify 가능 (결정 #3 반영).
- ws-relay는 **별도 admin 포트**로 기존 WS 서버 무수정 → http.Server 전환 회귀 제거 (결정 #7 반영). 기존 server.test.ts 전수 재실행을 회귀 게이트로 (결정 #8).
