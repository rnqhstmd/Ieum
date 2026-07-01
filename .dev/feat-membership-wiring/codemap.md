## 코드 맵: 멤버십·초대 라이브 배선 (슬라이스 1)

### 핵심 파일 (수정)
- apps/web/src/lib/invitations.ts → acceptInvitation 추가 (list/create/revoke 기존)
- apps/web/app/(auth)/invite/invite-content.tsx → accept/reject 배선(useState 상태 + 에러→상태 매핑)
- apps/web/components/members/MembersModal.tsx → 변경 액션 4종 배선 + reload 추출 + per-item 바인딩
- apps/web/components/sidebar/Sidebar.tsx → SHARED 워크스페이스 "멤버" 진입 트리거(→ /workspace/{wsId}/members)

### 참조 파일
- apps/web/src/lib/members.ts → updateMemberRole/removeMember/leaveWorkspace (기존)
- apps/web/src/lib/api.ts → apiPost/apiPatch/apiDelete, ApiError
- apps/web/components/members/MemberRow.tsx, InviteRow.tsx, PendingInviteRow.tsx → prop 시그니처(onChangeRole/onRemove/onInvite/onRevoke)
- apps/web/components/invite/InviteCard.tsx → state/onAccept/onReject prop
- apps/web/app/(app)/workspace/[wsId]/members/page.tsx → 모달 호스트 라우트(트리거 목적지)

### 백엔드 계약
- POST /api/invitations/accept {token} → 204 (404 무효/410 만료/409 이미처리/403 대상아님)
- POST/PATCH/DELETE workspaces/{id}/members·invitations (기존)
