# IEUM 멤버 관리 + 초대 디자인 명세 — 변형 A (모달/바텀시트)

> 출처: claude.ai/design — IEUM Members.dc.html. 다크 시스템(surface #0a0a0a, deep #000, 헤어라인, 그림자 없음).
> **신규 기능 구현**(기존 프론트 UI 없음). 백엔드는 완비. 범위: **UI + 조회(GET) 배선**. 변경 액션(초대/역할/제거/취소)은 **API 클라이언트는 작성하되 모달 핸들러는 스텁(실제 호출·이메일 X)** — 후속에서 연결.

## 토큰
deep #000 / surface #0a0a0a / hover #16161b / hair #3a3a3f / hair-2 #242429 / hair-3 #1d1d22 / fill-a #26262b / fill-b #17171c
ink #f0f0fa / body #c8c8ce / dim #9a9aa0 / faint #6a6a70 / fainter #5a5a5f / label #4a4a50 / accent #6fd6e8 / error(danger) #c98b8b
- 토큰 클래스 사용(deep/surface/hover/hair{,-2,-3}/ink/body/dim/faint/fainter/accent/danger). `fainter` 토큰은 추가 완료. `fill-a/fill-b`는 미등록 → 필요 시 임의값 `bg-[#26262b]` 허용(드래그 핸들 등 극소수).
- 다크 고정. Pretendard.

## 백엔드 API 계약 (이미 존재)
- `GET /api/users/me` → `{ id, email, name, token }` (역할 판정용; token은 무시)
- `GET /api/workspaces/{wsId}/members` → `MembershipDto[]`: `{ membershipId, userId, userEmail, userName, role('OWNER'|'MEMBER'), joinedAt }`
- `PATCH /api/workspaces/{wsId}/members/{userId}/role` body `{ role }` (OWNER) — 클라이언트만 작성
- `DELETE /api/workspaces/{wsId}/members/{userId}` (OWNER) — 클라이언트만 작성
- `DELETE /api/workspaces/{wsId}/members/me` (나가기) — 클라이언트만 작성(선택)
- `GET /api/workspaces/{wsId}/invitations` → `InvitationDto[]`: `{ id, workspaceId, email, invitedById, role, status('PENDING'|'ACCEPTED'|'REVOKED'|'EXPIRED'), expiresAt, createdAt }`
- `POST /api/workspaces/{wsId}/invitations` body `{ email, role }` (OWNER, **실제 이메일 발송**) — 클라이언트만 작성
- `DELETE /api/workspaces/{wsId}/invitations/{invitationId}` (OWNER, PENDING) — 클라이언트만 작성

## 신규 파일

### lib (API 클라이언트 — 전부 작성·export, 패턴은 `lib/pages.ts`/`workspaces.ts` 참고)
- `apps/web/src/lib/users.ts`: `getCurrentUser(): Promise<CurrentUser>` — `apiGet('/api/users/me')` + zod parse.
- `apps/web/src/lib/members.ts`:
  - `listMembers(wsId): Promise<Membership[]>` — GET, zod parse. **(배선됨)**
  - `updateMemberRole(wsId, userId, role): Promise<Membership>` — PATCH. (작성만)
  - `removeMember(wsId, userId): Promise<void>` — DELETE. (작성만)
  - `leaveWorkspace(wsId): Promise<void>` — DELETE …/members/me. (작성만)
- `apps/web/src/lib/invitations.ts`:
  - `listInvitations(wsId): Promise<Invitation[]>` — GET, zod parse. **(배선됨)**
  - `createInvitation(wsId, { email, role }): Promise<Invitation>` — POST. (작성만)
  - `revokeInvitation(wsId, invitationId): Promise<void>` — DELETE. (작성만)

### types/schemas (확장)
- `apps/web/src/lib/types.ts` 추가: `MemberRole = 'OWNER'|'MEMBER'`, `InvitationStatus = 'PENDING'|'ACCEPTED'|'REVOKED'|'EXPIRED'`, `Membership`, `Invitation`, `CurrentUser`.
- `apps/web/src/lib/schemas.ts` 추가: `meSchema`, `membershipSchema`/`membershipListSchema`, `invitationSchema`/`invitationListSchema`(기존 zod 패턴 그대로).

### 컴포넌트
- `apps/web/components/members/MembersModal.tsx` (+ 필요 시 같은 폴더에 `MemberRow.tsx`/`InviteRow.tsx`/`PendingInviteRow.tsx`/`RoleBadge.tsx` 분리). `'use client'`.
  - props: `{ workspaceId: string; workspaceName?: string; onClose: () => void }`.
  - 마운트 시 `getCurrentUser` + `listMembers(wsId)` + (OWNER면) `listInvitations(wsId)` 병렬 조회. loading/error 상태 처리(헤어라인 톤).
  - **역할 판정**: members에서 `userId === me.id`인 멤버십의 role. `canManage = (myRole === 'OWNER')`.
- `apps/web/app/(app)/workspace/[wsId]/members/page.tsx` — 라우트(모달 호스트). `'use client'`로 wsId(useParams 또는 async params) 읽고 `<MembersModal workspaceId={wsId} onClose={() => router.back()} />` 렌더. 백드롭(`bg-black/60`) + 중앙 모달.

## 레이아웃 (디자인 1:1)

### 데스크탑 모달 (OWNER 뷰)
- 백드롭: `fixed inset-0 bg-black/60`, 클릭 시 onClose. 모달 중앙(`fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2`), width 580px, `bg-surface border border-hair rounded-[14px] overflow-hidden`.
- **헤더**(`flex items-center px-7 pt-6 pb-5 border-b border-hair-3`): 좌 제목 `멤버`(700/20px ink, ls -0.4) + 부제 `{워크스페이스명} · {멤버수}명`(400/13px faint). 우 닫기 X 아이콘(inline SVG `M6 6l12 12M18 6L6 18`, dim) → onClose.
- **초대 행(OWNER만)**(`px-7 py-5 border-b border-hair-3`): 라벨 `이메일로 초대`(600/11px uppercase ls1.6 fainter). 입력 줄(`flex gap-2.5`): 이메일 input(`flex-1 bg-deep border border-hair rounded-lg px-3.5 py-3 text-sm`, placeholder `name@company.com` fainter) + 역할 셀렉트(`멤버 ▾` 형태, bg-deep border-hair rounded-lg) + 초대 버튼(고스트 pill `border border-ink rounded-full px-[22px] py-3 text-[12px] font-bold ink`). **핸들러 스텁(no-op + TODO createInvitation)**.
- **멤버 목록**(`px-7 pt-3.5`): 각 행 `flex items-center gap-3 py-[13px] border-b border-hair-3`(마지막 행 border 없음):
  - 아바타 38px round(색상: 멤버별, 디자인은 presence 5색 순환 또는 이름 해시 → 실데이터엔 안정적 색 매핑; 간단히 userId/email 해시로 5색 중 선택, 글자 검정) + 이니셜(userName 첫 글자).
  - 이름(600/14.5px ink) + 본인이면 `(나)`(400/12px fainter). 이메일(400/12.5px faint).
  - 우측: 역할 뱃지 — OWNER: `Owner · 관리자`(600/10px uppercase, border border-hair rounded-full px-[11px] py-[5px] ink). MEMBER: `Member`(600/10px uppercase dim, 보더 없음). + (canManage이고 대상이 내가 아니면) `⋯` 점3개 버튼(inline SVG 3 circles) → 컨텍스트 메뉴 토글.
  - **컨텍스트 메뉴(OWNER만, 토글)**: `absolute right-0 top-[52px] w-[170px] bg-deep border border-hair rounded-[10px] p-1.5`. 항목 `역할 변경`(text-ink) / `내보내기`(text-danger). 각 `px-3 py-[9px] rounded-md hover:bg-hover`. **핸들러 스텁(no-op + TODO updateMemberRole/removeMember)**. 외부 클릭 시 닫기.
- **보류 중 초대(OWNER만)**(`px-7 pt-4 pb-6 border-t border-hair-3 mt-1.5`): 라벨 `보류 중 초대 · {PENDING 수}`(600/11px uppercase fainter). PENDING 상태만 렌더. 각 행 `flex items-center gap-3 py-2.5`:
  - dashed 아바타(34px round, `border border-dashed border-hair`, `@` fainter) + 이메일(500/14px body) + 메타(`초대됨 · {만료까지} 후 만료` 또는 `{n}일 후 만료`, 400/12px faint; expiresAt에서 D-day 계산) + 우측 `취소`(500/13px faint, underline underline-offset-3) **핸들러 스텁(no-op + TODO revokeInvitation)**.

### 데스크탑 모달 (MEMBER 뷰)
- 초대 행·⋯·컨텍스트 메뉴·보류 중 초대 **전부 숨김**. 멤버 목록은 읽기 전용(역할 뱃지만). 하단 안내: `멤버 초대와 역할 관리는 관리자(OWNER)만 할 수 있습니다.`(400/12.5px fainter).

### 모바일 (390) — 바텀시트
- 백드롭 + 하단 고정 시트(`fixed inset-x-0 bottom-0`, `bg-surface border-t border-hair rounded-t-[18px]`, 높이 ~85vh, flex-col). 상단 그랩 핸들(38×4 rounded-full `bg-fill-a`/임의값). 헤더(18px 제목) + 초대 행(OWNER, 역할 셀렉트 생략 가능—이메일+초대만) + 스크롤 목록 + 보류 중 초대. 닫기 X 또는 백드롭/시트 다운.
- 반응형: 한 컴포넌트에서 `sm:` 분기(모바일 바텀시트 ↔ 데스크탑 중앙 모달) 또는 모달 컨테이너 클래스 분기.

## 데이터 원칙
- 디자인 더미(지민/민지/준/도윤/이음 팀/newhire 등)는 **실제 API 데이터로 대체**. 멤버=listMembers, 보류초대=listInvitations(PENDING), 본인=getCurrentUser. 아바타 색은 안정적 해시 매핑(가짜 고정색 X).
- 멤버수 = members.length. 보류 수 = PENDING invitations 수.
- 미배선(변경 액션): 핸들러 스텁 — 실제 호출/이메일 발송 없음. TODO 주석으로 대응 클라이언트 함수 명시.

## 접근성
- 모달: `role="dialog" aria-modal="true" aria-label="멤버 관리"`. Escape로 onClose. 백드롭 클릭 onClose. 닫기 버튼 `aria-label="닫기"`.
- 컨텍스트 메뉴 토글 버튼 `aria-haspopup="menu" aria-expanded`. 메뉴 `role="menu"`, 항목 `role="menuitem"`. 외부 클릭 닫기.
- 장식 아이콘 aria-hidden. 스텁 버튼은 동작 없음을 주석/aria로 명확히(단 시각 유지).

## 검증
- `npx tsc --noEmit` clean. `next build`(가능 시) 보상 검증.
- 라이브 시각검증은 인증 게이트로 제한될 수 있음 — 가능하면 라우트 `/workspace/{wsId}/members`로 확인.
