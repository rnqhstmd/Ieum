# IEUM 랜딩 디자인 명세 — 변형 A (컨스텔레이션)

> 출처: claude.ai/design — IEUM Landing.dc.html (변형 A). 다크 캔버스, flat, no shadow.
> 토큰은 `apps/web/app/globals.css`(`--c-*`)와 `tailwind.config.ts`(ink/body/dim/faint/deep/surface/hover/hair/accent)에 **이미 적용됨**. 가능하면 Tailwind 토큰 클래스를 쓰고, 정밀 px 값은 인라인 style 또는 임의값(`text-[80px]`)으로.

## 색상 (참고용 실제값)
- bg: deep `#000`, surface `#0a0a0a`, hover `#16161b`
- hairline: hair `#3a3a3f`, hair-2 `#242429`, hair-3 `#1d1d22`
- text: ink `#f0f0fa`, body `#c8c8ce`, dim `#9a9aa0`, faint `#6a6a70`, fainter `#5a5a5f`
- fill: fill-a `#26262b`, fill-b `#17171c`
- accent `#6fd6e8`, presence 색: cyan `#6fd6e8` / amber `#e8c06f` / green `#79e0a0`
- 폰트: Pretendard (이미 sans 기본)

## 데스크탑 레이아웃 (전체 bg deep)

### nav — `padding: 22px 36px`, `border-bottom: 1px hair`, flex 양끝정렬
- 좌: `IEUM`(800/19px, letter-spacing 3px, ink) + 간격 44px + 메뉴(간격 28px) `Product` `Pricing` `Security` (각 600/12px, uppercase, letter-spacing 1.4px, dim)
- 우: `로그인` (500/14px, ink) — `/login` 링크

### hero — 중앙정렬, `padding: 132px 32px 150px`, `overflow:hidden`, relative
- 배경: 컨스텔레이션 SVG (아래) — absolute inset-0, opacity 0.55, pointer-events none, z-index 1
- 콘텐츠 (relative z-index 2, max-width 820px 중앙):
  - 배지: `Real-time collaborative docs` (600/12px, line 2, uppercase, letter-spacing 2.4px, **accent**)
  - h1: `생각을 잇다` (800/80px, line 1.0, letter-spacing -2px, ink, margin 18px 0 0)
  - p: `팀이 하나의 문서에서 동시에 쓰고, 페이지로 정리하고, 서로의 커서를 실시간으로 봅니다. 덮어쓰기 걱정 없이 모두에게 즉시 반영됩니다.` (400/18px, line 1.65, body, max-width 540px, margin 26px auto 38px)
  - CTA: `Google로 시작 →` — 고스트 pill: inline-flex, gap 9px, `padding 18px 28px`, `border 1px ink`, `border-radius 32px`, 700/13px, letter-spacing 0.4px, ink, `/login` 링크. hover 시 bg hover.

### band 01 — bg surface, `border-top 1px hair`, `padding 88px 32px`
- 컨테이너: max-width 1080px 중앙, flex gap 72px, align center, justify between
- 좌 (max-width 440px):
  - 라벨 `실시간 공동 편집` (600/12px, uppercase, letter-spacing 2px, faint)
  - h2 `같이, 실시간으로 편집` (800/42px, line 1.1, letter-spacing -1.4px, ink, margin 16px 0 0)
  - p `모두의 커서가 한 화면에 모입니다. 누가 무엇을 바꾸는지 글자 단위로 보이고, 변경은 즉시 모두에게 반영됩니다.` (400/16px, line 1.7, dim, margin 20px 0 0)
- 우 — 에디터 미리보기 카드: flex-none, width 480px, bg deep, `border 1px hair`, `border-radius 8px`, `padding 26px 28px`, relative
  - 텍스트 라인 4개 (height 9px, border-radius 2px):
    1. width 60%, bg fill-a, margin-bottom 16px
    2. width 92%, bg fill-b, margin-bottom 12px
    3. width 84%, bg fill-b, margin-bottom 12px
    4. width 70%, bg fill-b
  - presence 커서 2개 (absolute, 카드 기준):
    - `민지`: left 200px, top 40px — 세로바(width 2px, height 18px, bg `#6fd6e8`) + 라벨(top -16px, bg `#6fd6e8`, color #000, 700/9px, padding 3px 6px, radius 3px, white-space nowrap) `민지`
    - `준`: left 120px, top 88px — 동일 구조 색 `#e8c06f`, 라벨 `준`

### footer — bg deep, `border-top 1px hair`, `padding 56px 36px 34px`
- 상단: max-width 1080px 중앙, flex justify between gap 48px
  - 좌 (max-width 280px): `IEUM`(800/18px, letter-spacing 3px, ink) + `팀을 위한 실시간 협업 문서. 검정 캔버스 위에서, 조용하게.` (400/13px, line 1.6, faint, margin-top 12px)
  - 우: 3컬럼 (gap 64px). 각 헤더(600/11px, uppercase, letter-spacing 1.6px, fainter, margin-bottom 16px) + 항목(400/13px, line 2.1, body, `<br>` 구분):
    - `Product`: 기능 / 가격 / 변경 사항
    - `Company`: 소개 / 블로그 / 채용
    - `Resources`: 문서 / 보안 / 상태
- 하단: max-width 1080px 중앙, margin-top 36px, padding-top 22px, `border-top 1px hair-3`, flex justify between
  - `© 2026 IEUM. ALL SYSTEMS NOMINAL.` (400/12px, letter-spacing 0.6px, fainter)
  - `한국어 · 개인정보 · 약관` (400/12px, letter-spacing 0.6px, fainter)

## 모바일 (< 640px, 디자인 390px 기준)
- nav: `padding 18px 20px`, IEUM(800/17px, letter-spacing 2.5px) + 햄버거(세로 3줄, 각 width 22px height 2px bg ink, gap 4px)
- hero: `padding 64px 22px 72px`, 배지(11px) + h1 `생각을 잇다`(800/40px, letter-spacing -1.2px) + p(15px, line 1.6, max 300px) + CTA full-flex(max-width 260px 중앙)
- band: `padding 48px 22px`, 라벨 + h2(28px, letter-spacing -0.8px) + p(15px) + 에디터 카드(presence `민지` 1개만, left 150px top 34px)
- footer: `padding 32px 22px 28px`, IEUM(16px) + `© 2026 IEUM. ALL SYSTEMS NOMINAL.`(faint)

## 컨스텔레이션 SVG (별도 컴포넌트 `components/landing/Constellation.tsx` 권장)
- `<svg viewBox="0 0 120 80" preserveAspectRatio="xMidYMid slice">`, absolute inset-0, width/height 100%, opacity는 호출측에서(hero 0.55)
- 노드 17개 `(x, y, r?, color?)`:
  ```
  (16,18) (33,11) (50,24,1.5,#6fd6e8) (67,13) (85,22) (103,15)
  (11,45) (29,39) (48,51) (65,43,1.5,#e8c06f) (83,53) (104,45)
  (23,67) (43,73,1.4,#79e0a0) (61,64) (79,72) (98,65)
  ```
- 엣지 (노드 인덱스 쌍):
  ```
  [0,1][1,2][2,3][3,4][4,5]
  [0,6][1,7][2,8][3,9][4,10][5,11]
  [6,7][7,8][8,9][9,10][10,11]
  [6,12][7,13][8,14][9,14][10,15][11,16]
  [12,13][13,14][14,15][15,16]
  [7,2][8,13][9,15][2,9]
  ```
- 라인: `<line>` stroke `#26262b` (양 끝 중 컬러 노드가 있으면 `#3a3a3f`), strokeWidth 0.16
- 점: `<circle>` r = 노드 r ?? 0.85, fill = 노드 color ?? `#54545a`. 컬러 노드는 추가로 glow ring `<circle>` r=(r??1.4)+1.6, fill none, stroke=색, strokeWidth 0.14, opacity 0.5

## 구현 메모
- 현재 `apps/web/app/page.tsx`를 변형 A로 **재작성**한다 (기존 radial-gradient·BANDS·uppercase h1 제거).
- h1 `생각을 잇다`는 **uppercase 아님**(한글 그대로).
- 데스크탑/모바일은 Tailwind 반응형(`sm:`)으로 한 컴포넌트에서 처리.
- 라이트 테마 토큰도 정의돼 있으나 랜딩은 다크 고정(현재대로).
