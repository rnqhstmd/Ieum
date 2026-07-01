# 자기점검 결과 — 로그인 화면 변형 A

## Critical: 0건 (자기점검 통과)

## Warning (반영 완료)
- `tailwind.config.ts`에 `fainter` 토큰 미등록 → 구현이 `text-[var(--c-fainter)]` 임의값으로 우회.
  - 조치: `tailwind.config.ts` colors에 `fainter: 'var(--c-fainter)'` 추가 + `login/page.tsx` caption 클래스를 `text-fainter`로 교체. 토큰 정합성 회복.

## QUESTION → 사용자 결정
- 추가 확인 사항 없음.

## AC 충족 (qa-manager 대조)
- 기능 보존: `API_URL` + OAuth2 href(`/oauth2/authorization/google`) 그대로 유지 ✓
- 디자인: 워드마크/배지/카피/고스트 pill+G배지/약관 caption, 명세 px·letter-spacing·margin 1:1 반영 ✓
- 반응형: `sm:` 단일 마크업 모바일(390)↔데스크탑(1280) ✓
- 토큰 정합성: ink/body/dim/accent/fainter 매핑 확인 ✓ (fainter는 본 작업에서 추가)
- 접근성: Constellation·G배지 aria-hidden, CTA 텍스트 링크 ✓
- 다크 고정 ✓ / 기존 Google 멀티컬러 SVG 제거 → G 배지 교체 ✓

## 검증
- type-check(`npx tsc --noEmit`): clean
- 시각 검증(Playwright): 별도 기록
