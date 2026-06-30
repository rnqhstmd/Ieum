# 자기점검 결과 — 멤버 관리+초대 (신규, UI+조회 배선)

## Critical: 0건 (자기점검 통과)

## Warning (반영)
- [반영] 모바일 바텀시트 border: `border` → `border-t … sm:border`(모바일 상단만, 데스크탑 전체).
- [반영] InviteRow 모바일 역할 select 숨김 → MEMBER 고정 잠재 버그: TODO 주석 추가(createInvitation 연결 시 모바일 역할 선택 수단 제공).

## Info (반영/판단)
- [반영] PendingInviteRow 취소 버튼 `aria-label="{email} 초대 취소"` 추가.
- [보류] MembersModal useEffect router eslint-disable: router는 Next 안정 참조라 동작 무해 → 유지.

## QUESTION (해소)
- Jackson Instant 직렬화: 기존 DTO(WorkspaceDto.createdAt, Page createdAt/updatedAt)가 이미 `z.string()`으로 정상 동작 중 → Spring Boot 기본 ISO 8601 string 직렬화 확인됨. 추가 조치 불필요.

## AC 충족 (qa-manager 대조)
- API 계약 정합: MembershipDto(6)/InvitationDto(8)/MeResponse(4) 필드 + MemberRole/InvitationStatus enum + 엔드포인트 경로·method 전부 1:1 일치 ✓
- 범위 경계: getCurrentUser/listMembers/listInvitations만 실호출, 변경 4종은 모달에서 import·호출 0 (스텁 + TODO) ✓
- 역할 판정: userId===me.id → canManage=OWNER, 본인 행 ⋯ 제외 ✓
- 상태: loading/error/401→login, OWNER 아닐 때 listInvitations 미호출 ✓
- 접근성: dialog/aria-modal/aria-label·Escape·백드롭, 컨텍스트 메뉴 haspopup/menu/menuitem+외부클릭, 장식 aria-hidden ✓
- 데이터 원칙: 실데이터 + avatarColor 해시(가짜 고정색 X), race 방지 active 플래그 ✓

## 검증
- type-check: clean
- next build: 별도 기록(전 라우트 + 신규 /workspace/[wsId]/members)
