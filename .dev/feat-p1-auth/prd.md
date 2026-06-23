# PRD: P1 인증·권한 기반 (Auth Foundation)

> 스택 확정: 실제 구현체는 **Spring Boot + Spring Security OAuth2 + JPA/Flyway** (문서의 Auth.js/Prisma 아님).
> 세션은 Spring Security HTTP Session 쿠키(JSESSIONID), 프론트는 `credentials:'include'`로 :8080 호출.
> 수용 기준은 라이브러리 비종속 — 관찰 가능한 동작 기준.

## 배경

이음(Ieum) 백엔드는 Spring Boot + Spring Security OAuth2 + JPA/Flyway, 프론트는 Next.js. 스키마(V1__init.sql)·엔티티(User/Workspace/Membership)는 완비. 그러나 인증·권한 핵심 동작이 전부 미구현:
- `SecurityConfig.oauth2SuccessHandler()` 스텁 — User upsert + 개인 워크스페이스 자동생성 TODO
- `WorkspaceService.requireWorkspaceMember()/requireOwner()` — `UnsupportedOperationException` 스텁
- `ApiExceptionHandler` — 400/500만 처리, 401·403 핸들러 없음

**왜 P1이 먼저인가**: 인증·권한 없이는 어떤 API도 안전하게 노출 불가. P1은 walking skeleton 뼈대(로그인→사용자 식별→소속 확인→역할 검증)를 완성, 이후 모든 Phase의 기반.

## 목표
- Google OAuth 로그인 완성: 로그인 시 User + 개인 워크스페이스 자동 생성 후 대시보드 진입
- 보호 라우트: 미인증 시 /login 리다이렉트
- API 인가: 세션 없으면 401, 권한 없으면 403
- 권한 헬퍼: `requireWorkspaceMember` / `requirePageAccess` 재사용 가능
- 세션 보안: HttpOnly·Secure·SameSite, 민감정보 미저장

## 요구사항

### 기능 요구사항
- [Must] FR-1: Google OAuth 버튼 클릭 시 `/oauth2/authorization/google`이 Google 인증 URL로 302
- [Must] FR-2: OAuth 콜백 성공 시 `oauth2SuccessHandler`에서 User upsert (googleId=profile.sub 기준, 재로그인 시 name/image/email 갱신)
- [Must] FR-3: 최초 로그인 시 개인 워크스페이스(type=PERSONAL) 1개 자동 생성 + Membership(role=OWNER) 등록. 계정당 PERSONAL 1개 제한(앱 레이어)
- [Must] FR-4: 로그인 성공 후 `/dashboard` 리다이렉트, callbackUrl 있으면 그곳으로 복귀
- [Must] FR-5: 미인증 보호 경로(/dashboard, /workspace/**) 요청 시 /login 리다이렉트
- [Must] FR-6: 세션 없거나 만료된 상태로 /api/** 호출 시 HTTP 401 JSON (HTML 리다이렉트 아님)
- [Must] FR-7: `requireWorkspaceMember(userId, workspaceId[, requiredRole])` — Membership 조회, 없으면 403, requiredRole=OWNER인데 role≠OWNER이면 403, 통과 시 Membership 반환
- [Must] FR-8: `requirePageAccess(userId, pageId)` — pageId→workspaceId 조회 후 requireWorkspaceMember 위임
- [Should] FR-9: 로그아웃 시 세션 무효화 + /login 리다이렉트

### 비즈니스 규칙
- [Must] BR-1: User upsert 기준 키 = googleId(profile.sub). email 변경돼도 동일 googleId면 같은 User
- [Must] BR-2: 개인 워크스페이스 자동생성은 최초 1회만. 재로그인 시 이미 있으면 미생성
- [Must] BR-3: PERSONAL 워크스페이스는 삭제·이전 불가, 이름 변경만 허용
- [Must] BR-4: OWNER 전용 액션은 requireWorkspaceMember(..., requiredRole=OWNER) 통과 필수
- [Must] BR-5: User 저장 시 email/name/image/googleId 외 민감정보(액세스·리프레시 토큰) 미저장
- [Must] BR-6: 세션 쿠키 HttpOnly:true, Secure:true(HTTPS), SameSite:Lax
- [Should] BR-7: User upsert + 개인 워크스페이스 생성은 단일 트랜잭션 (WS 생성 실패 시 User 롤백)

### 품질 기대
- [Should] QE-1: OAuth 실패 시 /login?error=true로 안전 리다이렉트
- [Should] QE-2: 401/403 응답은 JSON(`{"code","message"}`)

## 수용 기준 (G-W-T)

**AC-AUTH-01: OAuth 진입점**
```
Given: 미인증 사용자, GOOGLE_CLIENT_ID/SECRET 설정됨
When:  GET /oauth2/authorization/google
Then:  HTTP 302, Location 헤더가 accounts.google.com 포함
```
**AC-AUTH-02: 최초 로그인 — User+개인WS 생성**
```
Given: googleId='G001' User가 DB에 없음
When:  OAuth 콜백 성공 (googleId='G001', email='a@test.com', name='홍길동')
Then:  users에 google_id='G001',email='a@test.com',name='홍길동' 1건 생성
       workspaces에 owner_id=userId, type='PERSONAL' 1건 생성
       memberships에 (userId, workspaceId, role='OWNER') 1건 생성
       HTTP 302, Location이 {FRONTEND_URL}/dashboard 포함
```
**AC-AUTH-03: 재로그인 — 재사용, 중복생성 방지**
```
Given: googleId='G001' User + 해당 PERSONAL 워크스페이스 이미 존재
When:  동일 계정(googleId='G001')으로 OAuth 콜백 재완료
Then:  users google_id='G001' 레코드 수 여전히 1
       workspaces owner_id=userId,type='PERSONAL' 수 여전히 1
       memberships 해당 조합 수 여전히 1
       HTTP 302, Location {FRONTEND_URL}/dashboard 포함
```
**AC-AUTH-04: 미인증 보호 라우트 리다이렉트**
```
Given: 세션 쿠키 없는 브라우저 요청
When:  GET /dashboard (또는 /workspace/임의UUID)
Then:  HTTP 302, Location 헤더가 /login 포함
```
**AC-AUTH-05: 무효 세션 API 호출 시 401**
```
Given: 세션 쿠키 없거나 유효하지 않음
When:  GET /api/workspaces (또는 임의 /api/** 보호 엔드포인트)
Then:  HTTP 401, Content-Type application/json, 바디에 code 또는 message 필드, 302 아님
```
**AC-AUTH-06: callbackUrl 복귀**
```
Given: 미인증 사용자가 /workspace/abc-123 시도 → /login 리다이렉트, callbackUrl 보존
When:  Google OAuth 로그인 성공
Then:  HTTP 302 Location이 /workspace/abc-123 포함 (/dashboard 아님)
```
**AC-PERM-01: requireWorkspaceMember 멤버 검증**
```
Given: userId='U001' 유효 세션, workspaceId='WS-X'에 해당 Membership 없음
When:  workspaceId='WS-X' 대상 보호 API 호출
Then:  HTTP 403, Content-Type application/json
```
**AC-PERM-02: requirePageAccess 위임**
```
Given: userId='U001' 유효 세션, pageId='PG-1'은 WS-X 소속, U001은 WS-X 멤버 아님
When:  GET /api/pages/PG-1
Then:  HTTP 403
```
**AC-PERM-03: OWNER 통과**
```
Given: U001이 WS-X에서 role='OWNER'
When:  requiredRole=OWNER API(예: DELETE /api/workspaces/WS-X)
Then:  권한 통과, 액션 실행 (HTTP 200 또는 204)
```
**AC-PERM-04: MEMBER의 OWNER 액션 시도 403**
```
Given: U002가 WS-X에서 role='MEMBER'
When:  requiredRole=OWNER API(DELETE /api/workspaces/WS-X)
Then:  HTTP 403, 액션 미실행(DB 변경 없음)
```
**AC-PERM-05: 비멤버 페이지 접근 403**
```
Given: U003 유효 세션, 어떤 워크스페이스에도 미소속
When:  임의 pageId 대상 페이지 API
Then:  HTTP 403
```
**AC-SEC-01: 세션 쿠키 보안 속성**
```
Given: HTTPS 환경(또는 Secure 활성 설정)
When:  OAuth 로그인 성공으로 세션 쿠키 발급
Then:  Set-Cookie에 HttpOnly, Secure, SameSite=Lax 포함
```
**AC-SEC-02: 세션 서명/위변조 방지**
```
Given: 유효한 세션 쿠키 발급됨
When:  세션 쿠키 값을 임의 변조하여 보호 API 호출
Then:  HTTP 401 (변조 세션 무효)
```
**AC-SEC-03: 민감정보 미저장**
```
Given: OAuth 로그인 성공
When:  users 테이블 해당 레코드 조회
Then:  컬럼이 id,email,name,image,google_id,created_at 만
       access_token/refresh_token/id_token 등 토큰 값 어느 컬럼에도 없음
```

## 범위 밖 (Out of Scope)
| 항목 | Phase |
|------|-------|
| 페이지 CRUD API | P2 |
| 공유 워크스페이스 생성·관리 | P2 |
| 이메일 초대 흐름 (INV-01~07) | P7 |
| WebSocket 연결 인가 (WS-AUTH) | P5 |
| Viewer 역할 | P8 |
| 계정 삭제·강제 로그아웃 | post-MVP |
| CRDT 편집 동기화 | P5+ |

## 구현 순서 권고 (walking skeleton)
1. OAuth 진입 확인 (/oauth2/authorization/google → Google 302)
2. User upsert (AC-AUTH-02/03, SEC-03) — successHandler에서 sub→googleId, findByGoogleId→INSERT/UPDATE, 토큰 미저장
3. 개인 워크스페이스 자동생성 (AC-AUTH-02, BR-2/7) — 동일 트랜잭션, existsByOwnerIdAndType 가드
4. 로그인 후 리다이렉트 + callbackUrl (AC-AUTH-04/06)
5. 보호 라우트 401/리다이렉트 (AC-AUTH-04/05) — ApiExceptionHandler에 AuthenticationEntryPoint(401 JSON)·AccessDeniedHandler(403) 추가, 브라우저=302 /login vs API=401 JSON 분기
6. requireWorkspaceMember (AC-PERM-01/03/04) — findByUserIdAndWorkspaceId, 없거나 role 불일치 시 403
7. requirePageAccess (AC-PERM-02/05) — pageId→workspaceId→위임
8. 세션 쿠키 보안 속성 (AC-SEC-01/02)

## 발견 사항 (코드 탐색)
- `ApiExceptionHandler`에 401/403 핸들러 없음 → AuthenticationEntryPoint·AccessDeniedHandler 커스터마이징 필요
- `WorkspaceService.requireWorkspaceMember`가 package-private → 다른 패키지(페이지 API)에서 호출하려면 접근범위 확대 또는 공통 헬퍼 분리 (구현 시 판단)
- `users` 스키마에 토큰 컬럼 없음 → AC-SEC-03 스키마상 충족, successHandler에서 미저장이 올바른 구현
- `workspaces.owner_id → users(id) ON DELETE CASCADE` 존재 (post-MVP 계정삭제 시 고려)
