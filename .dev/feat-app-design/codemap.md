## 코드 맵: IEUM App(메인 앱 셸) 재디자인 (변형 A 시스템)

### 핵심 파일 — 사이드바 클러스터 (Batch A)
- apps/web/components/sidebar/AppShell.tsx → 레이아웃·모바일 드로어(햄버거/오버레이/슬라이드). 구조 유지, 토큰 정합
- apps/web/components/sidebar/Sidebar.tsx → aside 컨테이너. WS스위처+검색(신규)+트리+하단(새페이지/새WS)+계정. 로직 보존
- apps/web/components/sidebar/WorkspaceSwitcher.tsx → 현재 WS 헤더행 + 드롭다운(onSelect 보존)
- apps/web/components/sidebar/PageTreeNode.tsx → 트리 행 재스타일(expand/nav/rename/icon/archive/createChild 보존)
- apps/web/components/sidebar/NewPageButton.tsx → 새 페이지 pill (+ "새 워크스페이스" 텍스트 버튼은 Sidebar에 배치)
- apps/web/components/sidebar/AccountArea.tsx → 계정 행 + chevron

### 핵심 파일 — 에디터 클러스터 (Batch B)
- apps/web/components/editor/EditorContainer.tsx → 탑바(브레드크럼·저장·presence·공유) + 페이지헤더(이모지·제목·메타) + 본문 재구성. 훅/props 보존
- apps/web/components/editor/TitleEditor.tsx → contenteditable h1 크기만(40px)
- apps/web/components/editor/PresenceAvatars.tsx → 겹침 아바타(border-2 surface)
- apps/web/app/(app)/page/[pageId]/page.tsx → max-w 래퍼 제거(탑바 풀폭)
- apps/web/app/(app)/dashboard/page.tsx → gray-* → 토큰화

### 참조 파일
- apps/web/components/sidebar/PageTree.tsx → 트리 루트(필요 시 섹션 라벨)
- apps/web/components/editor/Editor.tsx → 블록 본문(미변경 — editor-ux 충돌 회피)
- apps/web/app/(app)/layout.tsx → AppShell 래핑(수정 불필요)
- apps/web/app/page.tsx → 랜딩(토큰/시스템 레퍼런스)

### 설정
- apps/web/tailwind.config.ts → fainter 토큰 추가 완료(오케스트레이터). 코더는 config 미수정, text-fainter 사용
- apps/web/app/globals.css → --c-* 토큰 정의
