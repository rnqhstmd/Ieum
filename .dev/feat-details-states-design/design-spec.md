# IEUM Details(오버레이) + States(상태) 디자인 명세 — 변형 A

> 출처: claude.ai/design — IEUM Details.dc.html, IEUM States.dc.html. 마이크로 인터랙션·상태 카탈로그. 다크 시스템, 헤어라인, 그림자 없음, 오류는 미세 색만.
> **재사용 프레젠테이션 컴포넌트 + 쇼케이스 라우트**로 구현. 라이브 에디터/사이드바는 건드리지 않는다(app-design #35 · editor-ux 충돌 회피). 모든 액션은 스텁/로컬 콜백.
> 토큰: deep/surface/hover/hair{,-2,-3}/ink/body/dim/faint/**fainter**/label/accent/ok/warn/danger + **bg-fill-a/bg-fill-b**(추가 완료). 임의값 우회 금지. 다크 고정.

## 스킵 (중복 — 명시)
- **워크스페이스 스위처 드롭다운**: 이미 app-design #35의 `WorkspaceSwitcher`로 구현됨 → 중복 구현 안 함.
- **슬래시 블록 메뉴**: editor-ux 브랜치의 `BlockTypeMenu`로 구현됨 → 중복 안 함.
- (디자인의 이 2개는 PR 본문에 "기존/별도 PR로 커버"로 기록)

## 데이터 원칙
- 컴포넌트는 **prop 주도**(재사용). 컴포넌트 내부에 가짜 사람 이름/팀명 하드코딩 금지. 쇼케이스 라우트가 **샘플 prop**(데모용 텍스트)을 주입한다(갤러리이므로 샘플 OK).
- 모든 액션 콜백은 스텁(쇼케이스에서 no-op). 실제 백엔드 호출 없음.

## 접근성
- 모달/시트: `role="dialog" aria-modal`, Escape·백드롭 onClose. 메뉴: `role="menu"`/`menuitem`. 토스트: `role="status"`(또는 alert). 장식 SVG `aria-hidden`. 파괴적 액션은 text-danger.

---

# 클러스터 A — Details(오버레이) → `apps/web/components/overlays/`

### CommandPalette.tsx
- props: `{ onClose?: () => void; groups?: {label:string; items:{icon?:string; title:string; meta?:string; kbd?:string; onSelect?:()=>void}[]}[] }`.
- 디자인: 백드롭 위 상단 정렬 패널(`width 600px`, `bg-deep border border-hair rounded-[14px]`). 입력 행(돋보기 SVG + placeholder `페이지 이동, 사람 찾기, 명령 실행…`(dim) + `ESC` kbd[border-hair-2 rounded-4]). 결과: 그룹 라벨(600/10px uppercase ls1.4 label) + 항목 행(아이콘/이모지 + 제목(text-text) + meta(faint) + kbd `⏎`). 첫 항목 `bg-hover`(선택). 항목 그룹: `빠른 이동`(페이지) / `액션`(새 페이지 만들기·멤버 초대 — SVG 아이콘).
- 스텁: onSelect no-op.

### IconPicker.tsx
- props: `{ emojis?: string[]; selected?: string; onSelect?:(e:string)=>void; onRandom?:()=>void; onRemove?:()=>void }`. 기본 이모지 셋 제공.
- 디자인: `width 340px bg-deep border border-hair rounded-[12px] p-3`. 검색 행(돋보기 + `이모지 검색` dim, border-hair-2 rounded-8). 8열 그리드(`grid-cols-8 gap-0.5`), 각 셀 `aspect-square` 이모지 19px rounded-6, 첫 셀 `bg-hover`(선택). 하단(border-top hair-3): `랜덤` / `제거`(faint, 양끝). 스텁 콜백.

### ConfirmDialog.tsx
- props: `{ title:string; message?:string; confirmLabel?:string; cancelLabel?:string; destructive?:boolean; onConfirm?:()=>void; onCancel?:()=>void }`.
- 디자인: 백드롭(`bg-black/55`) 중앙 모달(`width 400px bg-deep border border-hair rounded-[14px] p-7`). h2(700/19px ink) + p(400/14px dim, mt-3) + 우정렬 버튼(`취소` pill[border-hair text-body] + confirm pill[`destructive`면 `border-danger text-danger`, 아니면 `border-ink text-ink`]). 재사용형(실제 onConfirm/onCancel 호출 — 쇼케이스에선 no-op 전달).

### AccountMenu.tsx
- props: `{ name?:string; email?:string; onSettings?; onToggleTheme?; onHelp?; onLogout?; theme?:'다크'|'라이트' }`.
- 디자인: `width 332px bg-deep border border-hair rounded-[12px] p-1.5` 메뉴: `설정`(기어 SVG) / `테마`(+ 우측 `다크` pill[border-hair-2 rounded-full]) / `도움말` / divider(hair-3) / `로그아웃`(text-danger, SVG). 각 행 `px-3 py-2.5 rounded-8 hover:bg-hover`, 아이콘 faint. (계정 행 자체는 AccountArea가 별도 — 메뉴 패널만.)

### MobileActionSheet.tsx
- props: `{ title?:string; icon?:string; actions:{icon?:ReactNode; label:string; destructive?:boolean; onClick?:()=>void}[]; onClose?:()=>void }`.
- 디자인: 하단 시트(`bg-deep border-t border-hair rounded-t-[18px] p-[12px_14px_20px]`). 그랩 핸들(38×4 `bg-fill-a`). 제목 행(이모지 + 제목 600/15px, border-b hair-3). 액션 행들(아이콘 + 라벨 500/15px, 파괴적은 text-danger). 하단 `닫기` pill(border-hair text-body). 백드롭 `bg-black/55`. 스텁.

### 쇼케이스: `apps/web/app/showcase/overlays/page.tsx`
- 각 오버레이를 라벨 붙은 **relative 프레임**(예: `relative h-[...] bg-surface border border-hair rounded`)에 "열린 상태"로 렌더(백드롭은 프레임 내 absolute로 스코프). 5개 나열. 샘플 prop 주입, 콜백 no-op.

---

# 클러스터 B — States(상태) → `apps/web/components/states/`

### EmptyState.tsx
- props: `{ title?:string; description?:string; ctaLabel?:string; onCreate?:()=>void }`. 기본 카피: `첫 페이지를 만들어 보세요` / `문서, 위키, 회의록 — 무엇이든 빈 페이지에서 시작합니다.` / `첫 페이지 만들기`.
- 디자인: 중앙정렬, dashed 아이콘(58px rounded-14 `border border-dashed border-hair text-fainter` + `+` SVG) + h2(700/22px ink, mt) + p(400/14px dim max-w-320) + CTA 고스트 pill(`border-ink text-ink` + `+` SVG). `onCreate`(쇼케이스 no-op 또는 `/dashboard`).

### LoadingSkeleton.tsx
- props: `{ }` (순수 시각). 2-pane: 좌 사이드바(200px `bg-deep border-r hair-2`) 스켈레톤 바들(`bg-fill-b` rounded, 다양 width) + 우 본문(아이콘 블록 `bg-fill-b` + 제목 바 `bg-hover` + 텍스트 바들 `bg-fill-b`). 디자인의 height/width/margin 반영. (애니메이션: `animate-pulse` 선택 적용 가능.)

### Forbidden403.tsx
- props: `{ onRequestAccess?:()=>void }`. 중앙정렬: `403`(700/13px ls3 fainter) + 아이콘(54px round border-hair text-dim, 금지 SVG `circle r8.5 + M6.5 6.5l11 11`) + h2 `접근 권한이 없습니다`(700/21px) + p(dim) + `접근 요청` pill(border-hair text-body). 스텁.

### ConnectionBanner.tsx
- props: `{ status:'offline'|'reconnected' }`.
- offline: 상단 배너(`bg-deep border-b hair`), amber 점(7px `bg-warn`) + `오프라인 — 변경사항을 저장하지 못했습니다.`(text-warn) + 우측 `재연결 중…`(dim underline).
- reconnected: 작은 배너(`bg-deep border border-hair-2 rounded-10 px-4 py-2.5`), green 점(`bg-ok`) + `다시 연결됨 · 모든 변경사항 저장됨`(text-ok).

### ErrorToast.tsx
- props: `{ message?:string; onRetry?:()=>void; onDismiss?:()=>void }`. 기본 `변경사항을 저장하지 못했습니다.`.
- 디자인: `bg-deep border border-hair rounded-12 px-4 py-3.5 w-[320px]`, danger 점(7px `bg-danger`) + 메시지(text-text flex-1) + `다시 시도`(700/12px text-danger 버튼). `role="status"`. 스텁 onRetry.

### ContextMenu.tsx
- props: `{ items:{icon?:ReactNode; label:string; destructive?:boolean; onClick?:()=>void}[]; onClose?:()=>void; style?:CSSProperties }`(위치는 consumer/style). 
- 디자인: `bg-deep border border-hair rounded-12 p-1.5`. 항목 `flex gap-2.5 px-3 py-2.25 rounded-7 hover:bg-hover font-medium 13px`, 아이콘 faint, 파괴적 text-danger + divider(`bg-fill-b`). 샘플 항목: 이름 변경/아이콘 변경/하위 페이지 추가 / (divider) / 아카이브(danger). `role="menu"`/`menuitem`. 스텁.

### 쇼케이스: `apps/web/app/showcase/states/page.tsx`
- 각 상태를 라벨 프레임에 렌더(EmptyState/LoadingSkeleton/Forbidden403/ConnectionBanner[offline+reconnected]/ErrorToast/ContextMenu). 샘플 prop, 콜백 no-op.

---

## 검증
- `npx tsc --noEmit` clean. `next build` 보상검증(`/showcase/overlays`, `/showcase/states`). 육안: 쇼케이스 라우트로 전 컴포넌트 확인.
