## 코드 맵: IEUM 초대 수락(Invite) — 신규 화면 (UI 4상태 + 수락 스텁)

### 신규 파일 (구현 대상)
- apps/web/components/invite/InviteCard.tsx → 상태 4종(valid/expired/already/invalid) 카드 (presentational)
- apps/web/app/(auth)/invite/page.tsx → /invite 라우트. ?token/?state 읽기(Suspense+useSearchParams), 상태 결정, 스텁 핸들러

### 참조 파일 (패턴)
- apps/web/app/(auth)/login/page.tsx → 동일 그룹 풀페이지 + 고스트 pill + 토큰 클래스 레퍼런스
- apps/web/app/page.tsx → 랜딩(디자인 시스템 레퍼런스)
- apps/web/tailwind.config.ts → 토큰(ok/danger/faint/dim/body/ink/accent; fainter 미사용)
- backend invitation/InvitationController.java, InvitationService.java → 수락 계약(후속 배선 참고): POST /api/invitations/accept {token}, 404/410/409/403/2xx
