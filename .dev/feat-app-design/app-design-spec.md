# IEUM App(메인 앱 셸) 디자인 명세 — 변형 A 시스템 연장

> 출처: claude.ai/design — IEUM App.dc.html. 2-pane(사이드바 + 에디터), 데스크탑 1440×900 + 모바일 390 드로어.
> 다크 시스템: 사이드바 bg `--c-deep`(#000), 에디터 bg `--c-surface`(#0a0a0a), 헤어라인 hair/hair-2/hair-3, presence 5색.
> 토큰은 `globals.css`(`--c-*`) + `tailwind.config.ts`(deep/surface/hover/hair{,-2,-3}/ink/body/dim/faint/label/accent/ok/warn/danger)에 **이미 적용됨(main 포함)**. Tailwind 토큰 클래스 우선, 정밀 px는 임의값(`text-[13.5px]`).

## 범위 (셸 중심) — 모든 기존 로직 보존
재스타일 대상: AppShell, Sidebar, WorkspaceSwitcher, PageTreeNode, NewPageButton, AccountArea / EditorContainer, TitleEditor, PresenceAvatars / page/[pageId]/page.tsx 래퍼, dashboard/page.tsx 토큰화.
**Editor.tsx 블록 내부(입력/IME/블록메뉴)는 손대지 않는다** (editor-ux 브랜치 충돌 회피). 블록 본문 타이포는 기존 렌더 유지.

## 데이터 원칙 (중요)
- 디자인의 더미(민지/준/도/지민/이음 팀/6명/3명 보는 중/⌘K 등)는 **실제 앱 데이터로 대체**한다:
  - 워크스페이스 이름·인원·아바타 → `listWorkspaces` 실제 값
  - 페이지 트리·아이콘·제목 → 실제 트리
  - presence 아바타·"N명 보는 중" → 실제 `presences` (self 제외 카운트)
  - 계정 → AccountArea 실제 props(미배선이면 기존 기본값 "내 계정")
- 미배선 장식 요소는 **중립 플레이스홀더**(가짜 사람 이름 금지):
  - 검색창: 비기능 시각 요소(`검색` + `⌘K` 표기). onClick 없음(또는 no-op). aria로 비활성 명시.
  - 공유 버튼: 비기능 시각 pill(추후 공유 모달). `type="button"`, 동작 없음.
  - 브레드크럼: 실제 페이지 제목만 표시(상위 경로 미배선 → 단일 세그먼트). 가짜 "미션 운영" 금지.
  - 페이지 헤더 이모지: 페이지 icon 있으면 사용, 없으면 기본 `📄`.
  - 편집 메타("마지막 편집 …"): 실제 데이터 없음 → **생략**하거나 저장상태 기반 중립 문구. 가짜 시간/이름 금지.

## 색상/토큰 매핑 (참고값)
deep #000 / surface #0a0a0a / hover #16161b / hair #3a3a3f / hair-2 #242429 / hair-3 #1d1d22
ink #f0f0fa / body #c8c8ce / dim #9a9aa0 / faint #6a6a70 / fainter #5a5a5f / label #4a4a50
accent #6fd6e8 / ok #79e0a0 / warn #e8c06f / presence cyan #6fd6e8·amber #e8c06f·green #79e0a0
> 참고: `fainter`/`fill-a`/`fill-b`는 tailwind에 미등록일 수 있음 → 필요 시 `tailwind.config.ts`에 `fainter: 'var(--c-fainter)'` 추가하고 `text-fainter` 사용(login 브랜치와 동일 조치). 임의값 `text-[var(--c-fainter)]`는 피한다.

---

## A. 사이드바 클러스터

### AppShell (레이아웃·드로어) — 기존 구조 유지, 시각 정합만
- 데스크탑: 고정 사이드바(static) + `main flex-1`. 모바일(md 미만): 상단바(햄버거 + `IEUM`) + 드로어 슬라이드 + 오버레이 `bg-black/55`. **이미 구현됨** — 클래스/보더만 디자인 토큰에 맞게 유지(border-hair-3, bg-deep). 모바일 상단바는 AppShell이 소유(에디터가 침범하지 않음).
- 사이드바 폭: 디자인 300px(데스크탑) / 드로어 312px. 기존 `w-[300px]` 유지.

### Sidebar 컨테이너
- `aside` bg-deep, `border-r border-hair-2`(현재 보더 없음 → 추가), padding `18px 14px 14px`, flex-col.
- 구성 순서: ① WorkspaceSwitcher ② **검색창(신규)** ③ 트리 스크롤 영역(섹션 라벨 포함) ④ 하단(새 페이지 pill + "새 워크스페이스" 텍스트) ⑤ AccountArea.
- **검색창(신규, 시각 전용)**: `flex items-center gap-9px`, padding `8px 10px`, `border border-hair-2 rounded-7px`, mt 6px. 좌측 돋보기 아이콘(inline SVG, currentColor, text-fainter) + `검색`(text-fainter 13px) + 우측 `⌘K` kbd(text-fainter 10px, border-hair-2 rounded-4 padding 3px5px). 비기능.
- 섹션 라벨(트리 영역): `개인` / `공유 · {워크스페이스명}` — 600/10px, uppercase, letter-spacing 1.6px, text-label, padding 0 10px.

### WorkspaceSwitcher — 현재 워크스페이스 헤더 + 드롭다운
- 디자인: 단일 "현재 워크스페이스" 행(28px rounded-7 accent 아바타 + 이름(600/14px ink) + 부제(`{type} 워크스페이스 · {멤버수}명` 또는 멤버수 미배선 시 `개인`/`공유`) (400/11px faint) + 우측 chevron SVG). 클릭 시 워크스페이스 목록 드롭다운(기존 onSelect 유지).
- 구현: 현재 선택 워크스페이스를 헤더 행으로 렌더, 클릭하면 나머지 목록을 드롭다운으로 펼침(로컬 useState open). 각 항목 클릭 → onSelect + 닫기. **멤버수 데이터 없으면 부제는 type(개인/공유)만**. chevron은 inline SVG(M6 9l6 6 6-6).
- hover bg-hover, rounded-7, cursor-pointer.

### PageTreeNode — 행 재스타일(로직 보존)
- 행: `flex items-center gap-7px`, padding `7px 10px`, rounded-8, 13.5px. 기본 text-body, 활성/부모 강조 text-ink. **활성 페이지(현재 라우트)**: bg-hover. depth 들여쓰기 `marginLeft: depth*16`(유지).
- 좌측: 자식 있으면 chevron(접힘 ▸ / 펼침 ▾를 inline SVG caret로: 펼침 `M6 9l6 6 6-6`, 접힘 `M9 6l6 6-6 6`; text-faint 10px, w-12px), 없으면 w-12px 스페이서.
- 아이콘(이모지) 14px → 제목(flex-1 truncate). hover 액션(현재 ✎/🗑/＋): 디자인은 `⋯`(점3개 SVG) + `+`. 기존 3버튼 액션 유지하되 시각은 faint→ink/danger hover, `opacity-0 group-hover:opacity-100` 유지. (액션 아이콘을 디자인의 `⋯`/`+` 스타일로 정리 가능하나 기능 3개는 유지.)
- 이모지/제목 인라인 편집(input) 로직 전부 유지.

### NewPageButton — 거의 일치
- `flex justify-center gap-8px`, padding 11px, `border border-hair rounded-full`(rounded-32), 600/12px ink, hover bg-hover. + 아이콘은 inline SVG(M12 5v14M5 12h14) 또는 기존 `＋` 유지. 기존과 거의 동일 — 미세 정합만.
- **"새 워크스페이스"(신규 텍스트 버튼)**: NewPageButton 아래, `text-center 500/12px text-faint`, padding 4px. 비기능(추후 워크스페이스 생성 모달). `type="button"` no-op. (Sidebar 하단 영역에 배치)

### AccountArea — 거의 일치 + chevron
- `flex items-center gap-9px`, padding `11px 8px 4px`, mt 10px, `border-t border-hair-3`. 30px round 아바타 bg #a99bff(유지) + 이름(600/13px ink) + 이메일(400/11px faint). 우측 chevron SVG(text-faint) 추가. 기존 props 유지.

---

## B. 에디터 클러스터

### page/[pageId]/page.tsx — 래퍼 조정
- 현재 `<div class="mx-auto max-w-3xl px-8 py-12">`가 EditorContainer를 감싸 탑바 풀폭을 막는다. → 래퍼를 제거하고 EditorContainer가 풀높이 레이아웃(탑바 풀폭 + 본문 중앙)을 직접 제어하도록 변경: `<EditorContainer key={pageId} pageId={pageId} />`만 두고, 바깥 패딩/센터링은 EditorContainer가 담당. (key·async params 유지)

### EditorContainer — 탑바 + 페이지 헤더 + 본문 재구성
풀높이 `flex flex-col min-w-0`(부모 main이 flex-1). 구성:
1. **에디터 탑바**: `flex items-center`, padding `20px 32px`, `border-b border-hair-3`.
   - 좌: 브레드크럼 — 실제 페이지 제목(400/13px). 단일 세그먼트(상위 미배선). text-body. (제목 없으면 "제목 없음" faint)
   - 우(`ml-auto flex items-center gap-18px`): `● 저장됨`(저장상태 라벨, ok 색일 때만 ● ok; STATUS_LABEL 유지) + PresenceAvatars(겹침) + `N명 보는 중`(presences 수, dim 12px; 0명이면 숨김) + **공유 pill**(비기능: `border border-ink rounded-full`, padding 9px18px, 700/11px uppercase ls .6px ink).
   - 기존 authError/restoreError 경고는 탑바 위 또는 본문 상단에 유지(역할 보존).
2. **에디터 본문**: `flex-1 overflow-auto`, padding-top 76px. 내부 `max-w-[744px] mx-auto px-12 relative`.
   - 페이지 헤더: 이모지(56px, 페이지 icon 또는 📄) + TitleEditor(아래) + 편집 메타(데이터 없으면 생략).
   - 그 아래 기존 `<Editor .../>` 블록(props 전부 그대로 전달, 내부 미변경).
- 모든 훅/props(useCrdtDocument, usePageTitle, useAutosave, onEnter/onBackspace/onSetType 등) 보존.

### TitleEditor — 크기만 디자인대로
- contenteditable h1 로직(단방향 반영·Enter 막기·placeholder) **그대로**. 클래스만: `text-[40px] font-bold tracking-[-1px] text-ink`(기존 text-3xl), placeholder "제목 없음" 유지(`empty:before`). margin은 헤더 레이아웃에 맞게 `mb-1`(메타 있으면 메타가 아래).

### PresenceAvatars — 겹침 스타일
- 디자인: 30px round 아바타가 `margin-left:-10px`로 겹치고 각 `border-2 border-surface`. 첫 아바타는 음수마진 없음. 색은 실제 `p.color`(유지), 이니셜(유지). role/aria 유지.
- 구현: 컨테이너 `flex items-center`, 각 아바타 `h-[30px] w-[30px] rounded-full border-2 border-surface`, 2번째부터 `-ml-[10px]`. text-black(디자인은 어두운 글자 on 밝은 색)·700/12px. (기존 text-white→디자인은 색 아바타에 검정 글자; 가독성 위해 text-black 권장.)

### dashboard/page.tsx — 토큰화(오프시스템 제거)
- 현재 `text-gray-900`/`text-gray-500`/흰 배경 → 다크 시스템으로: `p-8`, h1 `text-2xl font-semibold text-ink`, 설명 `text-sm text-dim`. (디자인에 대시보드 화면은 없으나 셸 일관성을 위해 토큰만 교체.)

---

## 반응형(모바일 390)
- 사이드바: AppShell 드로어로 처리(기존). 드로어 폭 312px, 동일 내용.
- 에디터 탑바: 모바일에서 브레드크럼 숨김(`hidden sm:block`), 우측은 저장상태 + presence(작은 26px) 정도만. 공유 pill은 `hidden sm:inline-flex`로 숨김 가능.
- 본문: padding 축소(`px-22px pt-30px`), 이모지 44px, 제목 30px(`text-[30px] sm:text-[40px]`).
- AppShell 모바일 상단바(햄버거+IEUM)는 유지 — 에디터 탑바와 중복되지 않게 에디터 탑바는 본문 영역 내에 둠.

## 접근성
- 추가 장식 SVG(chevron/검색 아이콘/공유 등) `aria-hidden`. 검색창·공유 등 비기능 요소는 `aria-disabled` 또는 버튼이지만 no-op 명시. 기존 aria(treeitem/aria-expanded/role=list 등) 보존.

## 검증
- `npx tsc --noEmit` clean. 라이브 dev 서버(/page/[id], /dashboard) 시각 확인. **`npm run build`(prod) 금지**(dev 서버 .next 클로버).
