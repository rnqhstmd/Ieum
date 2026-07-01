# 자기점검 결과 — Details/States 컴포넌트 라이브 배선 (슬라이스 2)

## Critical (반영)
- [반영] Sidebar 아카이브 ConfirmDialog 백드롭이 사이드바 영역만 덮음 → AppShell 래퍼의 `md:translate-x-0`(transform)·모바일 `fixed`가 fixed 자손까지 가두는 문제. **createPortal로 document.body에 렌더**(fixed inset-0 z-50 래퍼)해 transform 컨테이닝 블록 탈출. confirmArchiveId 초기 null이라 SSR/하이드레이션 안전. (qa 제안의 단순 fixed 래퍼는 transform에 여전히 갇혀 부족 → 포털로 해결.)

## Warning (반영)
- [반영] `lib/auth.ts`와 `lib/auth/` 공존 → `auth/logout.ts`로 이동(디렉토리 합류). AccountArea import + AccountArea.test mock/import 경로 갱신. 향후 auth/index.ts 충돌 위험 제거.
- [반영] dashboard 빈 워크스페이스 시 CTA no-op → `defaultWs` 없으면 "워크스페이스가 없습니다" 표시(EmptyState/CTA 미노출).

## QUESTION (해소)
- listWorkspaces 빈 배열 가능성: 가입 시 PERSONAL 워크스페이스 보장이라 사실상 불가하나, 방어적으로 폴백 처리(Warning 반영).

## AC 충족 (qa-manager 대조)
- A-1 ContextMenu(우클릭, 4항목, 외부클릭/Escape, hover 유지) ✓ / A-2 IconPicker(onSelect→setIcon·onRemove→빈값·random) ✓
- A-3 ConfirmDialog: Sidebar 아카이브(포털, 취소 미실행/확인 실행+재조회) ✓ / MembersModal 내보내기(#39 mutation·reload 분리 유지) ✓
- B-1 loading.tsx→LoadingSkeleton ✓ / B-2 dashboard EmptyState→createPage(parentPageId null·position 0)→navigate, 401→login, 빈WS 폴백 ✓
- B-3 logout(POST /api/auth/logout 204) + AccountMenu(실데이터·로그아웃→/login·테마 토글 data-theme+localStorage·설정/도움말 스텁) ✓
- 로직 보존(트리 CRUD·stale 가드·멤버 트리거·#39 배선) + 접근성(role/aria/Escape) ✓

## 검증
- type-check clean / vitest 241 통과 / next build 통과
