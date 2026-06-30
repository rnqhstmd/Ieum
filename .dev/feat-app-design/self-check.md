# 자기점검 결과 — 앱 셸 재디자인(셸 중심)

## Critical: 0건 (자기점검 통과)

## Warning (반영/판단)
- [반영] W1 "N명 보는 중" self 포함 → `EditorContainer`에서 `localClientId`로 self 제외(`viewers`), 아바타·카운트 모두 self 제외로 통일.
- [반영] W3 워크스페이스 1개일 때 `aria-haspopup="menu"`가 빈 메뉴(접근성 회귀) → `hasOthers`로 aria/onClick/chevron 조건부 제거.
- [반영·Info] presence 아바타 모바일 26px → `h-[26px] sm:h-[30px]` 반응형.
- [분리·후속] W2 페이지 헤더 이모지 항상 `📄`: 회귀 아님(기존엔 이모지 없음)·디자인도 📄. 실 icon 배선은 `usePageTitle`(범위 외) 수정 필요하며, **자동저장 시 icon을 null로 덮어쓰는 기존 버그**와 얽혀 디자인 PR에서 분리. 후속 과제로 보고.

## QUESTION → 사용자 결정 (보고)
- presence가 릴레이에서 self 에코백되는지(사실확인). self 제외 필터는 에코백 여부와 무관하게 안전(idempotent)하여 선반영함.

## 발견된 기존 버그 (범위 외, 보고)
- `apps/web/src/lib/editor/usePageTitle.ts`: `saveTitle`이 제목 PATCH 시 `icon: null`을 함께 보내 **자동저장마다 페이지 아이콘을 null로 덮어씀**(데이터 손실). 이번 디자인으로 이모지가 부각되며 가시성↑. 별도 수정 권장.

## AC 충족 (qa-manager 대조)
- 로직 보존: CRDT 훅·Editor props·authError/restoreError(role·testid·retry)·autosave testid·Sidebar CRUD·WorkspaceSwitcher onSelect·PageTreeNode 편집·TitleEditor contenteditable 전수 보존 ✓ (회귀 0)
- 레이아웃: page 래퍼 제거 + EditorContainer h-full flex-col, AppShell main flex-1 중복 스크롤 없음 ✓
- 디자인: 사이드바(스위처+드롭다운·검색·섹션라벨·새WS·트리행·계정 chevron) / 에디터(탑바·presence 겹침·공유·40px 제목) ✓
- 데이터 원칙: 가짜 이름/시간/수 없음, 실데이터 또는 중립 플레이스홀더 ✓
- 토큰: fainter 등록·text-fainter, error→danger, dashboard gray→토큰 ✓
- 접근성: 장식 aria-hidden, 비기능 aria-disabled, 기존 aria 보존 ✓

## 검증
- type-check(`npx tsc --noEmit`): clean
- 라이브 시각검증: 불가(dev 서버 다운 + Playwright 미연결 + 앱 셸 인증 게이트). 사용자 풀스택(+dev 로그인) 기동 시 가능.
