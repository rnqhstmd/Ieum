# IEUM 로그인 디자인 명세 — 변형 A 연장 (컨스텔레이션 + 미니멀 로그인)

> 출처: claude.ai/design — IEUM Login.dc.html. 다크 캔버스, flat, no shadow.
> 토큰은 `apps/web/app/globals.css`(`--c-*`)와 `tailwind.config.ts`(ink/body/dim/faint/fainter/deep/hover/accent)에 **이미 적용됨(main 포함)**. Tailwind 토큰 클래스 우선, 정밀 px는 임의값(`text-[30px]`)으로.
> 컨스텔레이션은 `apps/web/components/landing/Constellation.tsx`를 **재사용**한다 (landing 브랜치 기반 스택). prop `opacity?:number` 보유.

## 색상 (참고용 실제값 — 토큰 매핑)
- bg deep `#000` = `bg-deep`, hover `#16161b` = `hover:bg-hover`
- text ink `#f0f0fa` = `text-ink`, body `#c8c8ce` = `text-body`, dim `#9a9aa0` = `text-dim`, fainter `#5a5a5f` = `text-fainter`
- accent `#6fd6e8` = `text-accent`
- 폰트: Pretendard (sans 기본)

## 기능 보존 (필수)
- 현재 `apps/web/app/(auth)/login/page.tsx`의 OAuth2 진입 동작을 **그대로 유지**한다:
  - `const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';`
  - CTA 링크 `href={\`${API_URL}/oauth2/authorization/google\`}`
- 디자인만 교체한다. 라우팅/엔드포인트 변경 금지.

## 레이아웃 (반응형 단일 페이지)
전체: `<main>` bg deep, min-h-screen, relative, overflow-hidden, flex 중앙정렬(items-center justify-center), text-center, text-ink. 좌우 패딩 모바일 28px / 데스크탑 32px.

### 배경
- `<Constellation opacity={0.4} />` — absolute inset-0 (컴포넌트 자체가 absolute). 콘텐츠는 `relative z-10`으로 위에.

### 중앙 콘텐츠 (relative z-10, 세로 스택, 중앙정렬)
1. **워드마크** `IEUM` — 800, 데스크탑 30px(letter-spacing 5px) / 모바일 26px(letter-spacing 4px), text-ink
2. **배지** `Real-time collaborative docs` (모바일 `Real-time docs`) — 600, 데스크탑 11px(ls 2.4px) / 모바일 10px(ls 2px), uppercase, **text-accent**, margin-top 데스크탑 18px / 모바일 14px
3. **카피** `함께 쓰는 문서, 하나의 워크스페이스.` — 400, 데스크탑 17px / 모바일 15px, line 1.6, text-body, margin 데스크탑 `22px 0 40px` / 모바일 `18px 0 32px`. 모바일은 `함께 쓰는 문서,<br>하나의 워크스페이스.`로 줄바꿈.
4. **CTA 고스트 pill** `Google로 로그인` — `<a href>`:
   - inline-flex(데스크탑) / flex(모바일 풀폭), align center, justify center, gap 11px
   - padding 데스크탑 `16px 28px` / 모바일 `16px 24px`
   - `border 1px solid text-ink`, `rounded-full`(border-radius 32px), 700/14px, text-ink, text-decoration none
   - hover: `bg-hover`
   - 왼쪽 G 배지: inline-flex, 18×18, rounded-full, bg `#f0f0fa`(=ink), color `#000`, 800/11px, 중앙정렬, 문자 `G`
5. **약관 caption** — 400, 데스크탑 12.5px / 모바일 12px, line 1.6, text-fainter, margin-top 데스크탑 34px / 모바일 28px, 데스크탑 max-width 320px:
   - `계속하면 이음의 <서비스 약관>과 <개인정보 처리방침>에 동의하게 됩니다.`
   - `서비스 약관`, `개인정보 처리방침` 두 구절은 `text-dim`(#9a9aa0) + underline + underline-offset 3px (현재는 페이지 미구현 → `<span>`로 표시, 링크 대상 없음. 시각만 유지)

## 구현 메모
- 단일 파일 `apps/web/app/(auth)/login/page.tsx` 재작성 + `Constellation` import 추가.
- 반응형은 Tailwind `sm:` 브레이크포인트로 한 마크업에서 처리(모바일 기본 → sm 이상 데스크탑 값). 모바일 `<br>`은 `sm:hidden`/`sm:inline` 토글 또는 `<br className="sm:hidden" />`로.
- 다크 고정(현재대로). 접근성: Constellation은 이미 `aria-hidden`. CTA는 명확한 링크. 장식용 G 배지는 `aria-hidden`.
- 기존 Google 멀티컬러 SVG는 디자인(원형 G 배지)으로 교체한다.
