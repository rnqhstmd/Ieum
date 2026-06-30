## 코드 맵: IEUM 멤버 관리 + 초대 (신규 기능, UI + 조회 배선)

### 신규 파일 (구현 대상)
- apps/web/src/lib/users.ts → getCurrentUser() GET /api/users/me
- apps/web/src/lib/members.ts → listMembers(배선)/updateMemberRole/removeMember/leaveWorkspace(작성만)
- apps/web/src/lib/invitations.ts → listInvitations(배선)/createInvitation/revokeInvitation(작성만)
- apps/web/components/members/MembersModal.tsx → 멤버 관리 모달(+ 필요 시 MemberRow/InviteRow/PendingInviteRow/RoleBadge 분리)
- apps/web/app/(app)/workspace/[wsId]/members/page.tsx → 모달 호스트 라우트

### 확장 파일
- apps/web/src/lib/types.ts → MemberRole/InvitationStatus/Membership/Invitation/CurrentUser 추가
- apps/web/src/lib/schemas.ts → meSchema/membershipSchema/invitationSchema(+ list) 추가
- apps/web/tailwind.config.ts → fainter 토큰 추가 완료(오케스트레이터)

### 참조 파일 (패턴/계약)
- apps/web/src/lib/api.ts → apiGet/Post/Patch/Delete + ApiError (fetch 래퍼)
- apps/web/src/lib/pages.ts, workspaces.ts → 클라이언트 함수 + zod parse 패턴
- backend WorkspaceController.java / InvitationController.java → 엔드포인트
- backend dto/MembershipDto·InvitationDto / MemberRole·InvitationStatus / CreateInvitationRequest·UpdateMemberRoleRequest → 응답·요청 형상
- backend user/UserController.java → MeResponse{id,email,name,token}
