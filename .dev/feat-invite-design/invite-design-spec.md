# IEUM 초대 수락(Invite) 디자인 명세 — 변형 A (상태 4종 카드)

> 출처: claude.ai/design — IEUM Invite.dc.html. 검정 캔버스(bg-deep) 중앙 카드. 그림자 없음, 오류는 미세 색만.
> **신규 화면**(기존 없음). 범위: **UI 4상태 + 수락 스텁**. 토큰 미리보기 GET이 백엔드에 없으므로 VALID는 제네릭 카피(가짜 워크스페이스명/초대자 금지). 수락/거절은 스텁(실제 POST X).
> 토큰은 main 기준(deep/hover/hair/ink/body/dim/faint/accent/ok/danger). `--c-error`→`text-danger`, `--c-ok`→`text-ok`. **fainter 불필요**(이 브랜치 미추가).

## 백엔드 계약 (참고, 이번엔 스텁)
- 초대 URL: `/invite?token=...` (쿼리 토큰).
- 수락: `POST /api/invitations/accept` body `{ token }`. 에러 매핑(후속 배선용): 404=유효하지 않음 / 410=만료 / 409=이미 처리됨 / 403=대상 아님 / 2xx=가입(멱등 이미멤버 포함).
- **토큰 미리보기 GET 없음** → VALID 상태에서 워크스페이스명·초대자·역할을 가져올 수 없다. 제네릭 카피 사용.

## 라우트
- `apps/web/app/(auth)/invite/page.tsx` (`'use client'` 또는 Suspense+클라이언트 분리). 앱 셸 밖 풀페이지(login과 동일 그룹).
- `useSearchParams()`로 `token`(필수) + `state`(선택, 미리보기 override) 읽기. **Next 15: useSearchParams는 `<Suspense>` 경계 필요** → 페이지 default export는 `<Suspense fallback={로딩카드}>`로 내부 클라이언트 컴포넌트를 감싼다.
- 초기 상태 결정: `state` 쿼리가 valid/expired/already/invalid 중 하나면 그걸로(미리보기/데모용). 없으면: `token`이 비어있으면 `invalid`, 아니면 `valid`.

## 컴포넌트
- `apps/web/components/invite/InviteCard.tsx` (presentational). props: `{ state: 'valid'|'expired'|'already'|'invalid'; onAccept?: () => void; onReject?: () => void }`.
  - 카드 컨테이너: `min-h-screen bg-deep flex items-center justify-center px-7 text-center`. 내부 `max-w-[380px] w-full`.
  - 상태별 렌더(아래). 다크 고정.

## 상태별 명세 (카드 내부, 중앙정렬)

### VALID (기본·수락)
- 워크스페이스 아바타: 64px(`sm` 데스크탑) / 60px(모바일) rounded(16px/15px), `bg-accent text-black`, 중앙 글자 — **워크스페이스명 미상이므로 제네릭**: `IEUM` 워드마크 대신 중립 마크. 권장: accent 사각형에 `이` 대신 일반 아이콘/이니셜 없이 **빈 accent 카드** 또는 작은 IEUM 로고 글리프. (가짜 팀명 금지) → 간단히 accent rounded square + 흰 점/로고 생략하고 글자 없이.
  - 실용안: `bg-accent` rounded-[16px] 64px 안에 검정 `＋`/체크 등 중립 글리프 또는 IEUM의 `I`. 가짜 팀 이니셜(이)은 쓰지 않는다.
- h1(700/26px sm, 23px 모바일, tracking -0.5, ink, mt-26): `워크스페이스에 초대되었습니다` (디자인의 "이음 팀 워크스페이스에"는 데이터 없어 제네릭).
- 초대자 줄: **데이터 없음 → 생략**. (디자인의 "준님이 멤버로 초대" 미표시; 가짜 이름 금지.)
- CTA `수락하고 참여`: 고스트 pill `inline-flex border border-ink rounded-full px-9 py-4 text-[14px] font-bold ink`, mt-34. onClick=onAccept(**스텁**).
- `초대 거절`: `text-faint text-[13px] font-medium underline underline-offset-[3px]`, mt-22, 버튼. onClick=onReject(**스텁**).

### EXPIRED (만료)
- 아이콘 64px round `border border-hair text-danger`, 안에 시계 SVG(inline: `<circle r=8.5><path M12 7.5V12l3.5 2>`), stroke-width 2.
- h1 `초대가 만료되었습니다`(동일 스타일).
- p(400/15px line1.65 dim, mt-16): `이 초대 링크는 7일이 지나 만료되었습니다. 관리자에게 새 초대를 요청하세요.`
- CTA `관리자에게 요청`: 보조 pill `border border-hair rounded-full px-8 py-4 text-[14px] font-bold text-body`, mt-34. (동작 없음/스텁 또는 mailto 생략 — 단순 버튼.)

### ALREADY (이미 멤버)
- 아이콘 64px round `border border-[#79e0a0](=ok) text-ok`, 체크 SVG(`<path M5 13l4 4L19 7>`).
- h1 `이미 멤버입니다`. p `회원님은 이미 이 워크스페이스의 멤버입니다. 바로 이동할 수 있습니다.`(dim).
- CTA `워크스페이스 열기`: 주 pill `border border-ink ... ink` → **링크 `/dashboard`**(`<a href="/dashboard">`).

### INVALID (유효하지 않은 토큰)
- 아이콘 64px round `border border-hair text-danger`, X SVG(`<path M6 6l12 12M18 6L6 18>`).
- h1 `유효하지 않은 초대`. p `이 링크가 올바르지 않거나 이미 취소되었습니다. 링크를 다시 확인해 주세요.`(dim).
- CTA `홈으로 가기`: 보조 pill `border border-hair ... text-body` → **링크 `/`**.

## 반응형 (모바일 390)
- 풀폭 카드(`w-full`), 패딩 28px. 아바타 60px, h1 23px, CTA `flex w-full`(풀폭) 또는 디자인대로. 데스크탑은 `inline-flex`. `sm:` 분기.

## 데이터 원칙
- 가짜 워크스페이스명/초대자명/역할 하드코딩 금지. VALID는 제네릭. EXPIRED/ALREADY/INVALID는 고정 안내 문구(상태 설명이므로 OK).
- 수락/거절/관리자요청은 **스텁**(no-op + TODO: POST accept + 에러→상태 매핑, 거절·요청 후속). ALREADY/INVALID의 이동 버튼만 실제 링크(/dashboard, /).

## 접근성
- 상태 아이콘 SVG `aria-hidden`. CTA는 버튼(스텁) 또는 의미있는 `<a>`(이동). 카드에 적절한 제목 구조(h1). 스텁 버튼은 동작 없음 명확히(주석).

## 검증
- `npx tsc --noEmit` clean. `next build` 보상 검증(라우트 `/invite`). 미리보기: `/invite?state=expired|already|invalid|valid`로 4상태 육안 확인 가능.
