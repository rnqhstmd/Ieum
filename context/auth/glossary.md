# 인증·권한 용어 사전

| 용어 | 설명 |
|------|------|
| Google OAuth | Google이 제공하는 OAuth 2.0 기반 인증 프로토콜. Ieum의 유일한 로그인 수단. `/api/auth/signin/google` → Google 계정 선택 → `/api/auth/callback/google` 흐름으로 처리됨 |
| Auth.js (NextAuth v5) | Next.js 전용 인증 라이브러리. Google Provider, Prisma Adapter, JWT 세션 전략을 통합 관리. `auth.ts`에 설정 |
| googleId | Google OAuth `profile.sub` 값. User 테이블의 UNIQUE 필드. 재로그인 시 User upsert의 기준 키 |
| JWT Session | 세션을 서버 DB 대신 HTTP-only 암호화 쿠키에 저장하는 전략. `strategy: 'jwt'`. 매 요청 DB 조회 없이 쿠키 복호화로 검증. maxAge 30일 |
| DB Session | 세션을 DB의 Session 테이블에 저장하는 전략. Ieum MVP에서는 채택하지 않음 (JWT Session 선택) |
| AUTH_SECRET | JWT 서명에 사용하는 32바이트 이상 무작위 문자열. `HS256` 알고리즘. Next.js 서버와 WebSocket 실시간 서버가 공유하여 WebSocket 인가에도 사용 |
| callbackUrl | 로그인 전 접근하려던 URL. 로그인 성공 후 해당 페이지로 돌아가기 위해 Auth.js가 처리 |
| 미들웨어 (Edge) | `middleware.ts`. Next.js Edge Runtime에서 실행. 보호 라우트에 대한 미인증 요청을 `/login`으로 redirect. `api/auth/*`는 제외 |
| 개인 소유자 | `Workspace.type = PERSONAL`의 유일한 접근자. Membership 테이블에 `role = OWNER`로 저장. 최초 로그인 시 자동 생성 |
| OWNER | 공유 워크스페이스(`SHARED`)의 관리자 역할. 워크스페이스 수정·삭제, 멤버 초대·제거·역할 변경 권한 보유. 워크스페이스에 최소 1명 필수 |
| MEMBER | 공유 워크스페이스에 초대받은 협업자 역할. 페이지 열람·편집 가능. 워크스페이스 구조 변경·멤버 관리 불가 |
| Viewer | 읽기 전용 역할. MVP에서는 구현하지 않음 (post-MVP 로드맵) |
| Membership | User와 Workspace의 N:M 관계 테이블. `(userId, workspaceId)` 복합 UNIQUE 제약. `role` 필드로 OWNER/MEMBER 구분 |
| 권한 매트릭스 | 역할(개인 소유자/OWNER/MEMBER)별로 각 액션(워크스페이스·페이지·초대 리소스)의 허용 여부를 정리한 표. 08-auth-and-permissions.md §3-2 참조 |
| requireWorkspaceMember | Route Handler 공통 권한 검사 헬퍼. `userId + workspaceId`로 Membership 조회 → 없으면 403. `requiredRole: 'OWNER'` 전달 시 역할 추가 검증 |
| requirePageAccess | Route Handler 페이지 접근 검사 헬퍼. `pageId → workspaceId` 조회 후 `requireWorkspaceMember` 위임 |
| Account | Auth.js Prisma Adapter 표준 테이블. Google access/refresh token 저장. 커스텀 변경 없이 공식 어댑터 DDL 사용 |
| Session | Auth.js Prisma Adapter 표준 테이블. DB Session 전략에서 사용. Ieum MVP에서는 JWT Session이므로 실질적으로 미사용이나 스키마에 포함 |
| VerificationToken | Auth.js Prisma Adapter 표준 테이블. 이메일 인증 토큰용. Ieum MVP에서는 미사용, 스키마에만 포함 |
| Invitation | 이메일 기반 워크스페이스 초대 레코드. 256-bit 무작위 token, 7일 만료(`expiresAt`). 상태: `PENDING → ACCEPTED \| REVOKED \| EXPIRED` |
| PENDING | 초대 생성 후 아직 수락·취소·만료되지 않은 상태 |
| ACCEPTED | 초대받은 사용자가 링크 클릭 후 Membership이 생성된 상태. 재사용 불가 |
| REVOKED | OWNER가 명시적으로 취소한 초대 상태 |
| EXPIRED | `expiresAt` 경과 후 처리된 상태. lazy 처리(수락 시 검사) + 스케줄러(일 1회) 병행 |
| siteId | CRDT op의 세션/탭별 UUID 식별자(≠userId). 같은 사용자가 여러 탭을 열면 탭마다 별도의 siteId를 가짐. 신원 판단에 사용하지 않으며 서버는 연결 인증의 userId를 op에 태깅하여 기록 |
| ForbiddenError | 권한 없음(403)을 나타내는 서버 오류 클래스. `requireWorkspaceMember` 헬퍼에서 throw |
| ws.close(4001) | WebSocket 종료 코드. JWT 검증 실패(미인증) 시 사용 |
| ws.close(4003) | WebSocket 종료 코드. Membership 없음(미인가) 또는 멤버 제거로 인한 강제 종료 시 사용 |
| SameSite=lax | 세션 쿠키의 CSRF 방어 설정. Auth.js 내장 CSRF 토큰과 병행 적용 |
