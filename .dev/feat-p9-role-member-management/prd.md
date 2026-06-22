# PRD: P9 — 역할·멤버 관리

> 확정일: 2026-06-22 · 브랜치: feat/p9-role-member-management · 모드: normal
> 결정사항: (1) WS 강제종료 = ws-relay HTTP admin 엔드포인트, (2) OWNER 2명+ 시 본인 강등 허용

## 배경

이음(Ieum)은 P8까지 초대 전 과정(생성·수락·철회·만료·메일)을 완료했다. 현재 공유 워크스페이스에 멤버를 합류시킬 수 있으나, 합류 이후의 멤버 관리 수단이 없다:

- OWNER가 기존 멤버의 역할을 바꾸거나 내보낼 수 없다 (`WorkspaceService`의 `listMembers`/`removeMember`/`updateMemberRole`가 모두 `UnsupportedOperationException` 스텁).
- 역할 변경·멤버 제거 엔드포인트에 OWNER 검증이 배선되지 않았다 (`currentUserId = null` 하드코딩).
- 멤버 제거 후에도 해당 사용자의 WebSocket 연결이 유지되어 실시간 협업 채널이 노출된다.
- MEMBER 페이지 편집 정책은 `requireWorkspaceMember`가 `PageService`에 이미 적용되어 충족되나, 회귀 방지 테스트가 없다.

P9는 위 공백을 닫아 역할·멤버 관리를 완성하고, 권한 매트릭스를 엔드포인트 수준에서 마감한다.

## 목표
- OWNER가 멤버 역할 변경·내보내기 가능.
- 마지막 OWNER 보호로 관리자 없는 워크스페이스 방지.
- 멤버 제거 즉시 WebSocket 강제종료로 실시간 채널 접근 차단.
- MEMBER의 OWNER 전용 액션 시도 403 차단.
- MEMBER 페이지 편집 회귀를 자동 테스트로 보증.

## 요구사항

### 기능 요구사항
- **[Must] FR-1**: OWNER·MEMBER는 멤버 목록 조회 가능. 비멤버 403.
- **[Must] FR-2**: OWNER는 역할을 MEMBER↔OWNER 변경 가능.
- **[Must] FR-3**: OWNER는 멤버 제거(Membership 삭제) 가능.
- **[Must] FR-4**: 멤버 제거 시 Spring backend가 ws-relay admin HTTP 엔드포인트를 호출해 해당 userId의 모든 WebSocket을 `close(4003,"removed")` 강제종료.
- **[Must] FR-5**: 역할변경·제거 엔드포인트는 OWNER 검증, 비OWNER 403.
- **[Must] FR-6**: MEMBER는 워크스페이스 내 모든 페이지 CRUD 가능 (회귀 방지).

### 비즈니스 규칙
- **[Must] BR-1 — 마지막 OWNER 역할 강등 금지**: OWNER가 정확히 1명일 때 그 OWNER를 MEMBER로 강등하면 400 "마지막 OWNER의 역할을 변경할 수 없습니다." OWNER 2명+ 시 본인 강등 허용 (BR-1이 유일 보호장치).
- **[Must] BR-2 — 마지막 OWNER 제거 금지**: OWNER 정확히 1명일 때 그 OWNER 제거 시 400 "마지막 OWNER를 제거할 수 없습니다." 단 BR-3이 선행.
- **[Must] BR-3 — 자기 자신 제거 금지**: OWNER가 자기 자신 제거 시 400 "자기 자신을 제거할 수 없습니다." BR-2보다 선행 평가.
- **[Must] BR-4 — 존재하지 않는 멤버 조작 시 404**: 역할변경/제거 대상 userId가 해당 워크스페이스 Membership 미보유 시 404.
- **[Must] BR-5 — PERSONAL 워크스페이스 제약**: PERSONAL은 단독 OWNER이므로 BR-1/BR-2·BR-3으로 자동 차단. 별도 예외 처리 없음.
- **[Must] BR-6 — WebSocket 강제종료 방식·실패 정책**:
  - 멤버 제거 트랜잭션 커밋 후 Spring이 `DELETE {WS_RELAY_ADMIN_URL}/admin/connections/{userId}` 호출.
  - ws-relay는 해당 userId의 모든 WebSocket에 `close(4003,"removed")` 전송 + 추적 Map에서 제거.
  - ws-relay admin URL은 환경변수(`WS_RELAY_ADMIN_URL`)로 외부화, localhost 전용.
  - admin 호출 실패(네트워크 오류·미기동)는 제거 트랜잭션을 롤백하지 않음 (best-effort). 실패는 로깅, 204 반환.
  - 대상 userId 연결이 없으면 ws-relay는 무동작 200/204 응답.

### 품질 기대
- **[Should] QE-1**: MEMBER의 OWNER 전용 액션 시도 시 403을 2초 이내 수신.
- **[Should] QE-2**: 제거된 멤버는 실시간 편집 전파 불가 (WebSocket 강제종료로 보증).

## 수용 기준 (22건, Given-When-Then)

### FR-1 — 멤버 목록 조회
- **AC-1** OWNER 목록 조회: Given 워크스페이스 W에 OWNER A·MEMBER B 존재, A 인증 / When A가 `GET /api/workspaces/{W}/members` / Then 200, 응답 배열에 userId·role·joinedAt 필드 객체 정확히 2개.
- **AC-2** MEMBER 목록 조회: Given OWNER A·MEMBER B, B 인증 / When B가 `GET .../members` / Then 200, 멤버 배열 2개.
- **AC-3** 비멤버 차단: Given OWNER A만 존재, 비멤버 C 인증 / When C가 `GET .../members` / Then 403.

### FR-2 / BR-1 / BR-4 — 역할 변경
- **AC-4** MEMBER→OWNER 승격: Given OWNER A·MEMBER B, A 인증 / When A가 `PATCH .../members/{B}/role` `{"role":"OWNER"}` / Then 200, 응답 role="OWNER", DB B role=OWNER.
- **AC-5** OWNER 2명 시 본인 강등 허용: Given OWNER A·OWNER B, A 인증 / When A가 `PATCH .../members/{A}/role` `{"role":"MEMBER"}` / Then 200, 응답 role="MEMBER", DB A role=MEMBER (OWNER B 남음, BR-1 미발동).
- **AC-6** OWNER 2명 시 타 OWNER 강등: Given OWNER A·OWNER B, A 인증 / When A가 `PATCH .../members/{B}/role` `{"role":"MEMBER"}` / Then 200, DB B role=MEMBER.
- **AC-7** 마지막 OWNER 강등 금지(BR-1): Given OWNER A만 존재, A 인증 / When A가 `PATCH .../members/{A}/role` `{"role":"MEMBER"}` / Then 400, 메시지 "마지막 OWNER의 역할을 변경할 수 없습니다" 포함, DB A role=OWNER 유지.
- **AC-8** 비멤버 역할변경 404(BR-4): Given OWNER A 존재·비멤버 X UUID / When A가 `PATCH .../members/{X}/role` `{"role":"MEMBER"}` / Then 404.

### FR-3 / BR-2 / BR-3 / BR-4 — 멤버 제거
- **AC-9** OWNER가 MEMBER 제거: Given OWNER A·MEMBER B, A 인증 / When A가 `DELETE .../members/{B}` / Then 204, DB B Membership 삭제.
- **AC-10** 자기 제거 금지(BR-3): Given OWNER A·MEMBER B, A 인증 / When A가 `DELETE .../members/{A}` / Then 400, 메시지 "자기 자신을 제거할 수 없습니다" 포함, A Membership 유지.
- **AC-11** 단독 OWNER 자기 제거 — BR-3 우선: Given OWNER A만 존재, A 인증 / When A가 `DELETE .../members/{A}` / Then 400, 메시지 "자기 자신을 제거할 수 없습니다" (BR-3이 BR-2보다 선행).
- **AC-12** OWNER 2명 중 1명 제거: Given OWNER A·OWNER B, A 인증 / When A가 `DELETE .../members/{B}` / Then 204, DB B 삭제 (BR-2 미발동).
- **AC-13** 비멤버 제거 404(BR-4): Given OWNER A 존재·비멤버 X UUID / When A가 `DELETE .../members/{X}` / Then 404, Membership 테이블 변경 없음.

### FR-4 / BR-6 — WebSocket 강제종료 (WS-AUTH-04)
- **AC-14** 제거 시 WebSocket 강제종료: Given MEMBER B가 페이지 P에 WebSocket 연결(ws-relay userId→소켓 Map에 B 존재), OWNER A 인증 / When A가 `DELETE .../members/{B}` → 204 / Then Spring이 `DELETE {WS_RELAY_ADMIN_URL}/admin/connections/{B}` 호출, ws-relay가 B의 WebSocket에 `close(4003,"removed")` 전송, 해당 소켓이 추적 Map에서 제거됨.
- **AC-15** 미연결 멤버 제거: Given B WebSocket 미연결, OWNER A 인증 / When A가 `DELETE .../members/{B}` / Then 204, Spring이 admin 호출, ws-relay가 연결 없음 확인 후 200/204, 오류 없이 204 반환.
- **AC-16** admin 호출 실패 best-effort: Given ws-relay admin 응답 불가(네트워크 오류), A가 B 제거 / When admin 호출 실패 / Then 204 반환(멤버십 이미 삭제 커밋), 서버 로그에 admin 실패 기록, B Membership 삭제 상태 유지(롤백 없음).

### FR-5 / PERM-03 / PERM-04 — OWNER 전용 액션 권한
- **AC-17** MEMBER 역할변경 시도 403: Given OWNER A·MEMBER B·MEMBER C, B 인증 / When B가 `PATCH .../members/{C}/role` `{"role":"OWNER"}` / Then 403, C role 변경 없음.
- **AC-18** MEMBER 제거 시도 403: Given OWNER A·MEMBER B·MEMBER C, B 인증 / When B가 `DELETE .../members/{C}` / Then 403, C Membership 유지.
- **AC-19** 비멤버 역할변경 403: Given OWNER A 존재, 비멤버 X 인증 / When X가 `PATCH .../members/{A}/role` `{"role":"MEMBER"}` / Then 403.

### FR-6 — MEMBER 페이지 편집 회귀 방지
- **AC-20** MEMBER 페이지 생성: Given OWNER A·MEMBER B, B 인증 / When B가 `POST /api/workspaces/{W}/pages` / Then 201, 페이지 DB 생성.
- **AC-21** MEMBER 페이지 편집: Given OWNER A·MEMBER B, 페이지 P∈W, B 인증 / When B가 `PATCH /api/pages/{P}` 내용 변경 / Then 200, 변경 DB 저장.
- **AC-22** 제거된 멤버 페이지 접근 차단: Given MEMBER B가 W에서 제거됨(B Membership 없음), 페이지 P∈W / When B가 `GET /api/pages/{P}` / Then 403.

## 제외 범위 (Out of Scope)
- OWNER/MEMBER 워크스페이스 나가기 → P10 (US-WS-04)
- 워크스페이스 삭제 권한 엔드포인트 → P10 (PERM-03 함께)
- Viewer 역할 → P11 / WebSocket 신원위조 방지 → P11 (WS-AUTH-01)
- 멤버 제거 프론트 실시간 UI 알림 → 백엔드 P9 범위 밖
- 멤버 목록 페이지네이션 → post-MVP

## 영향 범위
- backend `WorkspaceService`: 스텁 3개 본문 구현
- backend `WorkspaceController`: `currentUserId=null` → `currentUserService.requireCurrentUserId()` 교체 (3곳)
- ws-relay `server.ts`: `userId→Set<WebSocket>` 추적 추가 + `DELETE /admin/connections/{userId}` admin 엔드포인트 신규, admin 포트/바인드 외부화
- backend 환경변수 `WS_RELAY_ADMIN_URL` 추가
- 하위호환: `GET .../members`가 스텁→정상 동작 전환 (프론트 응답 포맷 확인 필요)
