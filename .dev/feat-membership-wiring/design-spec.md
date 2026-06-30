# 슬라이스 1 — 멤버십·초대 라이브 배선 (A1+A2)

> 디자인 PR(#36 멤버, #37 초대)에서 스텁으로 둔 변경 액션을 **실제 백엔드에 배선**한다. 백엔드·API 클라이언트·컴포넌트는 이미 main에 존재. 이번 슬라이스는 **핸들러 연결 + 부족한 클라이언트(acceptInvitation) 추가 + 사이드바 진입 트리거**.
> ⚠️ 실제 side-effect: 초대 생성=이메일 발송, 멤버 제거/역할변경=DB 변경. 의도된 동작이다.

## A2 — 초대 수락 배선

### lib/invitations.ts — `acceptInvitation` 추가
- `export async function acceptInvitation(token: string): Promise<void>` → `apiPost('/api/invitations/accept', { token })`. 204 No Content(본문 없음)이므로 반환 void. (apiPost는 본문 없는 응답을 undefined로 처리함.)

### invite-content.tsx — accept/reject 배선
- 상태를 `useState<InviteState>`로 전환(초기값 = 기존 `resolveState(stateParam, token)`). accept 에러 시 setState로 상태 전환.
- `submitting` 로컬 플래그(중복 클릭 방지) 추가.
- `handleAccept`: token 없으면 무동작. `await acceptInvitation(token)` →
  - 성공: `router.push('/dashboard')`.
  - `ApiError` 분기(상태 매핑): 404→`'invalid'` / 410→`'expired'` / 409→`'already'` / 403→`'invalid'`(대상 아님) / 그 외→`'invalid'`. setState로 카드 전환.
- `handleReject`: `router.push('/')` (백엔드 거절 엔드포인트 없음 — 홈으로 이동).
- `InviteCard`에 `submitting`을 전달할 필요는 없으면 생략 가능(단순 disable은 선택). 최소 변경 우선.
- `useRouter` import 추가. Suspense 경계 구조는 유지(page.tsx 무변경).

## A1 — 멤버 관리 변경 액션 배선 + 트리거

### MembersModal.tsx — 핸들러 배선
- 마운트 조회 로직을 **재사용 가능한 `reload()`** 로 추출(getCurrentUser는 1회면 충분하니 members/invitations 재조회 함수로). 변경 액션 후 목록을 다시 불러와 UI 갱신.
- 변경 액션(각각 try/catch, 실패 시 간단한 에러 표시 또는 alert; 성공 시 reload):
  - `handleInvite(email, role)` → `createInvitation(workspaceId, { email, role })` → invitations 재조회. (InviteRow는 `onInvite(email, role)` 시그니처)
  - `handleChangeRole(member)` → `updateMemberRole(workspaceId, member.userId, member.role === 'OWNER' ? 'MEMBER' : 'OWNER')` → members 재조회. closeMenu.
  - `handleRemove(member)` → `window.confirm('이 멤버를 내보낼까요?')` 승인 시 `removeMember(workspaceId, member.userId)` → members 재조회. closeMenu. (파괴적)
  - `handleRevoke(invitation)` → `revokeInvitation(workspaceId, invitation.id)` → invitations 재조회.
- per-item 바인딩: `MemberRow`에 `onChangeRole={() => handleChangeRole(member)}`, `onRemove={() => handleRemove(member)}`; `PendingInviteRow`에 `onRevoke={() => handleRevoke(inv)}`. (MemberRow/PendingInviteRow의 prop 시그니처는 `() => void` 유지 — 모달에서 클로저로 타깃 주입.)
- 클라이언트 import 추가: `createInvitation, revokeInvitation` (from invitations), `updateMemberRole, removeMember` (from members).
- 401 처리는 기존 reload에서 유지(→/login). 변경 액션 실패도 401이면 /login.

### 사이드바 진입 트리거 (Sidebar.tsx)
- 공유(SHARED) 워크스페이스일 때만 "멤버" 진입 버튼을 추가한다(개인 워크스페이스는 멤버 관리 무의미). 현재 선택 워크스페이스(`selectedWsId` + `workspaces`에서 type 확인).
- 위치: 하단 영역(NewPageButton 근처 또는 AccountArea 위). 클릭 → `router.push('/workspace/${selectedWsId}/members')`.
- 디자인 시스템 톤 유지(text-faint/13px, 아이콘 선택). 기존 사이드바 로직(목록/트리/CRUD) 불변.

## 데이터 원칙·범위
- 실제 데이터/실제 mutation. 가짜 데이터 없음.
- 변경 액션 실패 시 사용자에게 알림(간단). 성공 시 목록 재조회로 즉시 반영.
- MembersModal/InviteCard의 디자인·접근성(role/aria) 유지.

## 검증
- `npx tsc --noEmit` clean. 기존 테스트 통과(`npx vitest run`). `next build` 보상검증.
- 멤버/초대 관련 기존 테스트가 있으면 깨지지 않게(스텁→배선이 시그니처를 바꾸면 테스트 갱신).
